/**
 * Xero OAuth 2.0 + API helpers.
 *
 * Tokens live in `connected_accounts` (platform='xero'):
 *   - account_id   = Xero tenantId (the connected org's id)
 *   - account_name = Xero org name
 *   - access_token = current bearer token (30-min TTL)
 *   - refresh_token = long-lived rotating refresh token (60-day window)
 *   - expires_at   = when access_token expires
 *   - meta         = { tenantType, shortCode } from the connections endpoint
 *
 * Refresh tokens rotate on every use — we always upsert the new pair.
 */

import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Xero apps registered after 2 March 2026 can only request the new granular
// scopes — the old broad `accounting.transactions.read` / `.reports.read`
// names are rejected with `unauthorized_client / Invalid scope for client`.
// Identity scopes (openid) are still required when requesting offline_access
// so we receive a refresh_token in the token response.
export const XERO_SCOPES = [
  'openid',
  'offline_access',
  'accounting.invoices',          // full read + write for invoices
  'accounting.contacts.read',     // read contacts to pick invoice recipients
  'accounting.settings',          // read + write for items/products
  'accounting.reports.profitandloss.read',
  'accounting.reports.banksummary.read',
  'accounting.banktransactions.read',
].join(' ')

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

function basicAuthHeader(): string {
  const id = process.env.XERO_CLIENT_ID!
  const secret = process.env.XERO_CLIENT_SECRET!
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
    scope: XERO_SCOPES,
    state,
  })
  return `${XERO_AUTH_URL}?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
  })
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Xero token exchange failed (${res.status}): ${text}`)
  }
  return (await res.json()) as TokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Xero token refresh failed (${res.status}): ${text}`)
  }
  return (await res.json()) as TokenResponse
}

type Connection = {
  id: string
  tenantId: string
  tenantType: string
  tenantName: string
  shortCode?: string
}

export async function listConnections(accessToken: string): Promise<Connection[]> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Xero connections lookup failed (${res.status}): ${text}`)
  }
  return (await res.json()) as Connection[]
}

type StoredAccount = {
  id: string
  account_id: string | null
  account_name: string | null
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  meta: Record<string, unknown> | null
}

// Module-level account cache — getValidXeroAccount is called by every Xero
// helper, so a summary+transactions page load was doing two Supabase reads
// and could race two token refreshes. Reuse the account while its access
// token still has >2 minutes of life. A null result (not connected) is never
// cached so reconnecting takes effect immediately.
let accountCache: { account: StoredAccount; validUntil: number } | null = null
let accountInflight: Promise<StoredAccount | null> | null = null

/** Returns the first connected Xero org, refreshing tokens if needed. */
export async function getValidXeroAccount(): Promise<StoredAccount | null> {
  if (accountCache && Date.now() < accountCache.validUntil) return accountCache.account
  // Collapse concurrent callers into one lookup/refresh
  if (accountInflight) return accountInflight
  accountInflight = fetchValidXeroAccount()
    .then((account) => {
      if (account?.expires_at) {
        accountCache = { account, validUntil: new Date(account.expires_at).getTime() - 2 * 60_000 }
      }
      return account
    })
    .finally(() => { accountInflight = null })
  return accountInflight
}

async function fetchValidXeroAccount(): Promise<StoredAccount | null> {
  const supabase = serviceClient()
  const { data } = await supabase
    .from('connected_accounts')
    .select('id, account_id, account_name, access_token, refresh_token, expires_at, meta')
    .eq('platform', 'xero')
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const account = data as StoredAccount
  const expiresAt = account.expires_at ? new Date(account.expires_at) : null
  // Refresh if expired or within 60 seconds of expiry
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 60_000

  if (needsRefresh && account.refresh_token) {
    try {
      const tok = await refreshAccessToken(account.refresh_token)
      const newExpires = new Date(Date.now() + tok.expires_in * 1000).toISOString()
      await supabase
        .from('connected_accounts')
        .update({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
          expires_at: newExpires,
          token_type: tok.token_type,
          scope: tok.scope,
        })
        .eq('id', account.id)

      account.access_token = tok.access_token
      account.refresh_token = tok.refresh_token
      account.expires_at = newExpires
    } catch (err) {
      // Refresh failed — if the current access token is still within its
      // validity window, keep using it. Only surface the error if we have
      // no usable token at all (i.e. it's already expired).
      const stillValid = expiresAt && expiresAt.getTime() > Date.now()
      if (!stillValid) {
        console.error('[Xero] Token refresh failed and access token is expired:', err)
        return null
      }
      console.warn('[Xero] Token refresh failed but access token still valid, proceeding:', err)
    }
  }

  return account
}

// ─── Errors that say what actually went wrong ────────────────────────────────
// Every write helper here used to be `catch { return null }`, and the tool
// layer turned that null into "Xero may not be connected or may require
// updated permissions." That sentence was wrong every time it mattered: the
// real answer was sitting in a 400 body Xero had already sent us. A single
// operator debugging their own CRM needs the actual message, so the body is
// carried on the error and unpacked for display.

export class XeroApiError extends Error {
  status: number
  body: string
  constructor(message: string, status: number, body: string) {
    super(message)
    this.name = 'XeroApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Pulls the human half out of a Xero failure. A ValidationException buries the
 * useful line under Elements[].ValidationErrors[].Message — for example
 * "EXCLUSIVE is not a valid value for LineAmountTypes", which is what an
 * invoice against a non-GST-registered org gets back.
 */
export function friendlyXeroError(err: unknown): string {
  if (!(err instanceof XeroApiError)) {
    return err instanceof Error ? err.message : String(err ?? 'Unknown Xero error')
  }
  if (err.status === 401) return 'Xero rejected the token. Reconnect Xero from Settings.'
  if (err.status === 403) return 'Xero says this app is not allowed to do that. The connection probably needs reauthorising with invoice write access.'
  try {
    const body = JSON.parse(err.body) as {
      Message?: string
      Elements?: Array<{
        ValidationErrors?: Array<{ Message?: string }>
        LineItems?: Array<{ ValidationErrors?: Array<{ Message?: string }> }>
      }>
    }
    const messages: string[] = []
    for (const el of body.Elements ?? []) {
      for (const v of el.ValidationErrors ?? []) if (v.Message) messages.push(v.Message)
      for (const li of el.LineItems ?? []) for (const v of li.ValidationErrors ?? []) if (v.Message) messages.push(v.Message)
    }
    if (messages.length > 0) return messages.join('; ')
    if (body.Message) return body.Message
  } catch { /* body was not JSON */ }
  return `Xero returned ${err.status}.`
}

/** A write that either produced something or has a reason it did not. */
export type XeroWriteResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Authenticated GET against the Xero accounting API for a specific tenant. */
async function xeroGet<T>(path: string, accessToken: string, tenantId: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${XERO_API_BASE}${path}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new XeroApiError(`Xero ${path} failed (${res.status}): ${text}`, res.status, text)
  }
  return (await res.json()) as T
}

/** Authenticated POST/PUT against the Xero accounting API. */
async function xeroPost<T>(
  path: string,
  body: unknown,
  accessToken: string,
  tenantId: string,
  method = 'POST',
): Promise<T> {
  const url = path.startsWith('http') ? path : `${XERO_API_BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new XeroApiError(`Xero ${method} ${path} failed (${res.status}): ${text}`, res.status, text)
  }
  // 204 No Content (the Email endpoint) has no body to parse.
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  return (await res.json()) as T
}

// ─── Stale-while-revalidate cache for dashboard-facing fetches ───────────────
// Xero round trips take seconds; pages should never block on them twice.
// Fresh (< TTL): serve cached. Stale: serve cached instantly, refresh in the
// background. Empty: block once. Errors never evict a previous good result.
//
// ── Two tiers, because one of them barely existed in production ────────────
// This was a Map in module scope and nothing else, which is a cache per lambda
// INSTANCE. Vercel starts instances, freezes them between requests and throws
// them away constantly, so in production most requests arrived at an empty Map
// and took the "cold: block once" path — the seconds-long one this cache is
// here to avoid. It worked beautifully in local dev, where there is one
// long-lived process, and hardly ever where it mattered.
//
// L1 is still that Map: free, and the right answer for repeat reads inside a
// single request. L2 is a row in kv_cache, which every instance can see and
// which survives instance recycling and deploys. A cold instance now finds a
// warm value instead of nothing.
//
// L2 is strictly best-effort. Every path through it is wrapped so that a
// missing table, a revoked key or a down database degrades to exactly the old
// behaviour rather than taking the page down with it.

const SWR_TTL = 2 * 60 * 1000

type SwrEntry<T> = { at: number; data: T }
const swrStore = new Map<string, SwrEntry<unknown>>()
const swrInflight = new Map<string, Promise<unknown>>()

const L2_PREFIX = 'xero:'

async function l2Read<T>(key: string): Promise<SwrEntry<T> | null> {
  try {
    const { data, error } = await serviceClient()
      .from('kv_cache')
      .select('value, updated_at')
      .eq('key', L2_PREFIX + key)
      .maybeSingle()
    if (error || !data?.value) return null
    return { at: Date.parse(data.updated_at as string), data: data.value as T }
  } catch {
    return null
  }
}

async function l2Write<T>(key: string, data: T): Promise<void> {
  try {
    await serviceClient()
      .from('kv_cache')
      .upsert(
        { key: L2_PREFIX + key, value: data as unknown, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
  } catch {
    // A cache that cannot be written is still a cache that can be read.
  }
}

// Hand background work to the runtime rather than letting the instance freeze
// mid-promise. `after` keeps the function alive until the callback settles, so
// "revalidate in the background" actually revalidates; a bare floating promise
// was liable to be suspended the moment the response flushed. Outside a
// request scope (a script, a test) `after` throws, and the floating promise is
// the right fallback there.
function runAfterResponse(work: () => Promise<unknown>): void {
  try {
    after(work)
  } catch {
    void work()
  }
}

async function swrCached<T>(key: string, fn: () => Promise<T | null>): Promise<T | null> {
  const refresh = () => {
    if (!swrInflight.has(key)) {
      const p = fn()
        .then(async (data) => {
          if (data != null) {
            swrStore.set(key, { at: Date.now(), data })
            await l2Write(key, data)
          }
          return data
        })
        .catch((err) => {
          console.error(`[Xero] ${key} refresh failed:`, err)
          return null
        })
        .finally(() => { swrInflight.delete(key) })
      swrInflight.set(key, p)
    }
    return swrInflight.get(key) as Promise<T | null>
  }

  // L1 — this instance's own memory.
  const hot = swrStore.get(key) as SwrEntry<T> | undefined
  if (hot && Date.now() - hot.at < SWR_TTL) return hot.data

  // L2 — shared, and the tier a cold instance actually hits.
  const warm = await l2Read<T>(key)
  if (warm && Number.isFinite(warm.at)) {
    swrStore.set(key, warm)
    if (Date.now() - warm.at < SWR_TTL) return warm.data
    runAfterResponse(refresh)
    return warm.data
  }

  // L1 stale and L2 had nothing: still better to serve the stale value than to
  // make someone wait on Xero for it.
  if (hot) {
    runAfterResponse(refresh)
    return hot.data
  }

  return refresh() // genuinely cold: block once
}

export type XeroSummary = {
  org_name: string | null
  bank_balance_nzd: number | null
  outstanding_invoices_nzd: number
  outstanding_invoice_count: number
  overdue_invoices_nzd: number
  overdue_invoice_count: number
  revenue_this_month_nzd: number | null
  revenue_last_month_nzd: number | null
  net_profit_this_month_nzd: number | null
}

/**
 * Pull a tight financial snapshot for the daily health report. Returns null
 * if no Xero account is connected.
 *
 * ── Cash basis, deliberately ──────────────────────────────────────────────
 * The P&L calls below pass paymentsOnly=true, the same as the monthly chart
 * in fetchMonthlyPnlChunk. Without it Xero answers on an ACCRUAL basis, which
 * books an invoice as income the day it is APPROVED rather than the day it is
 * paid — so the weekly briefing was reporting invoices that Finance was, on
 * the same screen, still listing as AUTHORISED and owed. One number said the
 * money had been made and the other said it had not arrived, and both were
 * reading the same Xero.
 *
 * Cash basis is also the honest answer for a sole operator: what he has been
 * paid is the figure that decides whether he can spend anything. What has been
 * invoiced and not paid already has its own two figures here, outstanding and
 * overdue, and that is where it belongs.
 */
export async function fetchXeroSummary(): Promise<XeroSummary | null> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return null

  const accessToken = account.access_token
  const tenantId = account.account_id

  const now = new Date()
  const nzDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const todayISO = nzDate(now)
  const [nzYear, nzMonth] = todayISO.split('-').map(Number)
  const fromDate = new Date(nzYear, nzMonth - 1, 1).toISOString().slice(0, 10)
  const toDate = todayISO

  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)
  const lastMonthFromDate = lastMonthStart.toISOString().slice(0, 10)
  const lastMonthToDate = lastMonthEnd.toISOString().slice(0, 10)

  const [invoicesRes, bankSummaryRes, plRes, plLastMonthRes] = await Promise.allSettled([
    xeroGet<{ Invoices?: Array<{ AmountDue: number; DueDate?: string; DueDateString?: string; Status: string; Type: string }> }>(
      `/Invoices?Statuses=AUTHORISED&page=1&pageSize=200`,
      accessToken,
      tenantId,
    ),
    xeroGet<{ Reports?: Array<{ Rows?: Array<{ Cells?: Array<{ Value?: string }>; Rows?: Array<{ Cells?: Array<{ Value?: string }> }> }> }> }>(
      `/Reports/BankSummary`,
      accessToken,
      tenantId,
    ),
    xeroGet<{ Reports?: Array<{ Rows?: Array<{ Title?: string; RowType?: string; Rows?: Array<{ Cells?: Array<{ Value?: string }>; RowType?: string }> }> }> }>(
      `/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}&paymentsOnly=true`,
      accessToken,
      tenantId,
    ),
    xeroGet<{ Reports?: Array<{ Rows?: Array<{ Title?: string; RowType?: string; Rows?: Array<{ Cells?: Array<{ Value?: string }>; RowType?: string }> }> }> }>(
      `/Reports/ProfitAndLoss?fromDate=${lastMonthFromDate}&toDate=${lastMonthToDate}&paymentsOnly=true`,
      accessToken,
      tenantId,
    ),
  ])

  // Outstanding + overdue invoices (AR only)
  let outstandingTotal = 0
  let outstandingCount = 0
  let overdueTotal = 0
  let overdueCount = 0
  if (invoicesRes.status === 'fulfilled') {
    for (const inv of invoicesRes.value.Invoices ?? []) {
      // Type ACCREC = sales invoices (money owed to us)
      if (inv.Type !== 'ACCREC') continue
      const due = inv.AmountDue ?? 0
      if (due <= 0) continue
      outstandingTotal += due
      outstandingCount += 1
      // Xero JSON returns DueDate as /Date(ms)/ — DueDateString is always YYYY-MM-DD
      const dueDateStr = inv.DueDateString ?? (inv.DueDate ? parseXeroDate(inv.DueDate) : null)
      if (dueDateStr && dueDateStr < todayISO) {
        overdueTotal += due
        overdueCount += 1
      }
    }
  }

  // Bank balance — sum the closing balance row across accounts in the BankSummary report.
  // Report shape varies by org so we walk rows looking for the totals row.
  let bankBalance: number | null = null
  if (bankSummaryRes.status === 'fulfilled') {
    const rows = bankSummaryRes.value.Reports?.[0]?.Rows ?? []
    for (const section of rows) {
      const subRows = section.Rows ?? []
      for (const r of subRows) {
        const cells = r.Cells ?? []
        // The summary row has a "Total" first cell; closing balance is the last numeric cell.
        const firstVal = cells[0]?.Value ?? ''
        if (/total/i.test(firstVal) || /closing/i.test(firstVal)) {
          const last = cells[cells.length - 1]?.Value
          const n = last ? parseFloat(last.replace(/,/g, '')) : NaN
          if (!Number.isNaN(n)) {
            bankBalance = (bankBalance ?? 0) + n
          }
        }
      }
    }
  }

  // P&L — find Total Income and Net Profit rows
  let revenueMonth: number | null = null
  let netProfitMonth: number | null = null
  if (plRes.status === 'fulfilled') {
    const rows = plRes.value.Reports?.[0]?.Rows ?? []
    const findRow = (label: RegExp): number | null => {
      for (const section of rows) {
        if (section.RowType === 'Section') {
          for (const r of section.Rows ?? []) {
            const firstVal = r.Cells?.[0]?.Value ?? ''
            if (label.test(firstVal)) {
              const last = r.Cells?.[r.Cells.length - 1]?.Value
              const n = last ? parseFloat(last.replace(/,/g, '')) : NaN
              if (!Number.isNaN(n)) return n
            }
          }
        }
        // Some sections have a SummaryRow at the top level
        const summaryVal = section.Rows?.find((sr) => sr.RowType === 'SummaryRow')
        if (summaryVal) {
          const firstVal = summaryVal.Cells?.[0]?.Value ?? ''
          if (label.test(firstVal)) {
            const last = summaryVal.Cells?.[summaryVal.Cells.length - 1]?.Value
            const n = last ? parseFloat(last.replace(/,/g, '')) : NaN
            if (!Number.isNaN(n)) return n
          }
        }
      }
      return null
    }
    revenueMonth = findRow(/^Total\s+Income$/i) ?? findRow(/^Income$/i)
    netProfitMonth = findRow(/^Net\s+Profit$/i)
    // On cash basis Xero omits the Income section entirely in a month where
    // nothing has been PAID yet, so a missing row means zero rather than
    // unknown. Without this a month with invoices out but none paid renders
    // identically to Xero not being connected at all.
    if (revenueMonth == null && rows.length > 0) revenueMonth = 0
  }

  let revenueLastMonth: number | null = null
  if (plLastMonthRes.status === 'fulfilled') {
    const rows = plLastMonthRes.value.Reports?.[0]?.Rows ?? []
    const findRowLast = (label: RegExp): number | null => {
      for (const section of rows) {
        if (section.RowType === 'Section') {
          for (const r of section.Rows ?? []) {
            const firstVal = r.Cells?.[0]?.Value ?? ''
            if (label.test(firstVal)) {
              const last = r.Cells?.[r.Cells.length - 1]?.Value
              const n = last ? parseFloat(last.replace(/,/g, '')) : NaN
              if (!Number.isNaN(n)) return n
            }
          }
        }
        const summaryVal = section.Rows?.find((sr) => sr.RowType === 'SummaryRow')
        if (summaryVal) {
          const firstVal = summaryVal.Cells?.[0]?.Value ?? ''
          if (label.test(firstVal)) {
            const last = summaryVal.Cells?.[summaryVal.Cells.length - 1]?.Value
            const n = last ? parseFloat(last.replace(/,/g, '')) : NaN
            if (!Number.isNaN(n)) return n
          }
        }
      }
      return null
    }
    revenueLastMonth = findRowLast(/^Total\s+Income$/i) ?? findRowLast(/^Income$/i)
    if (revenueLastMonth == null && rows.length > 0) revenueLastMonth = 0
  }

  return {
    org_name: account.account_name,
    bank_balance_nzd: bankBalance,
    outstanding_invoices_nzd: Math.round(outstandingTotal),
    outstanding_invoice_count: outstandingCount,
    overdue_invoices_nzd: Math.round(overdueTotal),
    overdue_invoice_count: overdueCount,
    revenue_this_month_nzd: revenueMonth == null ? null : Math.round(revenueMonth),
    revenue_last_month_nzd: revenueLastMonth == null ? null : Math.round(revenueLastMonth),
    net_profit_this_month_nzd: netProfitMonth == null ? null : Math.round(netProfitMonth),
  }
}

/** Cached fetchXeroSummary — serves within 2 min instantly, stale-while-revalidate after. */
export function fetchXeroSummaryCached(): Promise<XeroSummary | null> {
  return swrCached('summary', fetchXeroSummary)
}

/** Cached fetchOutstandingInvoices — same stale-while-revalidate treatment, so
 *  the Money page does not pay a token refresh plus a REST round trip on every
 *  visit. */
export function fetchOutstandingInvoicesCached(): Promise<XeroCreatedInvoice[]> {
  return swrCached('outstanding-invoices', fetchOutstandingInvoices).then((r) => r ?? [])
}

// ── Monthly profit and loss ───────────────────────────────────────────────────
//
// Money in and money out, per month, as Xero itself reports them.
//
// The Finance chart used to build these from raw transactions: every ACCPAY
// invoice plus every SPEND bank transaction. That is not what "expenses"
// means. Checked against Xero's own cash-basis P&L for 1 Jan to 6 Sep 2026,
// it reported $21,314 of spending against a real figure of $4,148 — five times
// over — because a SPEND line in the bank feed is any money leaving the
// account, including transfers, drawings and personal spending that is coded
// to a non-expense account or not coded at all. Xero excludes those from the
// P&L. We were counting them.
//
// One report call replaces up to eight hundred transaction rows, and the
// numbers agree with the accountant's.
// The shape Xero's report endpoints return: sections of rows of cells, with a
// Header row carrying the column dates.
type XeroReportRow = {
  RowType?: string
  Title?: string
  Cells?: Array<{ Value?: string }>
  Rows?: XeroReportRow[]
}
type XeroReport = { Rows?: XeroReportRow[] }

export type MonthlyPnl = {
  /** 'YYYY-MM' */
  month: string
  /** 'Aug' */
  label: string
  income: number
  expenses: number
}

/** YYYY-MM-DD in the machine's own timezone, not shifted into UTC. */
function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Xero column headers arrive as "Sep-26", "Sep 2026" or "30 Sep 2026". */
function parseColumnMonth(raw: string): string | null {
  const m = raw.toLowerCase().match(/([a-z]{3})[a-z]*[\s-]+(\d{2,4})/)
  if (!m) return null
  const idx = MONTH_ABBR.indexOf(m[1])
  if (idx === -1) return null
  const yearRaw = parseInt(m[2], 10)
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
  return `${year}-${String(idx + 1).padStart(2, '0')}`
}

function num(raw: string | undefined): number {
  if (!raw) return 0
  const n = parseFloat(raw.replace(/,/g, ''))
  return Number.isNaN(n) ? 0 : n
}

// Xero caps `periods` at 11, so one call returns at most twelve columns. Longer
// spans are stitched from several calls, each anchored a year earlier.
export async function fetchMonthlyPnl(months = 12): Promise<MonthlyPnl[] | null> {
  if (months <= 12) return fetchMonthlyPnlChunk(months, 0)

  const chunks: MonthlyPnl[][] = []
  for (let offset = 0; offset < months; offset += 12) {
    const chunk = await fetchMonthlyPnlChunk(Math.min(12, months - offset), offset)
    // A failed chunk means an incomplete history, and a chart with a hole in
    // the middle is worse than a shorter one. Keep what came back contiguously
    // from the present and stop.
    if (!chunk) break
    chunks.push(chunk)
  }
  if (chunks.length === 0) return null

  const merged = new Map<string, MonthlyPnl>()
  for (const chunk of chunks) for (const m of chunk) merged.set(m.month, m)
  return [...merged.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/** One report call: `months` columns ending `monthsBack` months before now. */
async function fetchMonthlyPnlChunk(months: number, monthsBack: number): Promise<MonthlyPnl[] | null> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return null

  // fromDate..toDate defines ONE period; periods + timeframe then repeat that
  // period backwards. So the base period has to be a single month.
  //
  // Passing a twelve-month span here instead was the trap: Xero honoured it and
  // returned twelve OVERLAPPING twelve-month windows, each offset by a month,
  // which reads as a cumulative running total. The chart showed money in
  // climbing to $83k over six months against a real figure of $15k, and the
  // line only ever went up because each column contained the one before it.
  // The base period must be a WHOLE calendar month. Xero repeats the base
  // period's LENGTH backwards, so ending it at today (1-5 Sept, five days)
  // made every comparative a five-day window too: August came back as $100
  // against its real $1,300, because it was only reporting 1-5 August.
  const now = new Date()
  const anchor = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  // Formatted in LOCAL time. toISOString() converts local midnight to UTC,
  // which in NZ (+12) rolls back a day: 1 Sept became 31 Aug and 30 Sept
  // became 29 Sept, so Xero reported thirty-day windows straddling two months
  // instead of calendar months, and anything dated on a 30th or 31st landed in
  // the wrong bucket.
  const fromDate = localISODate(from)
  const toDate = localISODate(to)

  try {
    // paymentsOnly=true is cash basis: money that actually moved, which is what
    // the page says it is showing. periods counts the ADDITIONAL columns beside
    // the main one, hence months - 1.
    const res = await xeroGet<{ Reports?: XeroReport[] }>(
      `/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}&periods=${months - 1}&timeframe=MONTH&paymentsOnly=true&standardLayout=true`,
      account.access_token,
      account.account_id,
    )

    const rows = res.Reports?.[0]?.Rows ?? []

    // Column order is not guaranteed, so read the header and map by month
    // rather than trusting position.
    const header = rows.find((r) => r.RowType === 'Header')
    const columns = (header?.Cells ?? []).slice(1).map((c) => parseColumnMonth(c.Value ?? ''))
    if (columns.length === 0) return null

    const seriesFor = (label: RegExp): number[] => {
      for (const section of rows) {
        for (const r of section.Rows ?? []) {
          const first = r.Cells?.[0]?.Value ?? ''
          if (label.test(first)) return (r.Cells ?? []).slice(1).map((c) => num(c.Value))
        }
      }
      return []
    }

    const income = seriesFor(/^Total\s+Income$/i)
    // Xero names this row differently depending on the chart of accounts, and
    // an org with cost of sales splits it out separately.
    const expenses = seriesFor(/^Total\s+(Operating\s+)?Expenses$/i)
    const costOfSales = seriesFor(/^Total\s+Cost\s+of\s+Sales$/i)

    const out: MonthlyPnl[] = []
    columns.forEach((month, i) => {
      if (!month) return
      const idx = parseInt(month.slice(5), 10) - 1
      out.push({
        month,
        label: new Date(2000, idx, 1).toLocaleString('en-NZ', { month: 'short' }),
        income: Math.round((income[i] ?? 0) * 100) / 100,
        // Cost of sales is money out too, and can be negative in Xero when a
        // credit lands, so it is added rather than assumed positive.
        expenses: Math.round(((expenses[i] ?? 0) + (costOfSales[i] ?? 0)) * 100) / 100,
      })
    })

    out.sort((a, b) => a.month.localeCompare(b.month))
    return out
  } catch (err) {
    console.error('[Xero] monthly P&L failed:', err)
    return null
  }
}

/** Cached monthly P&L — same stale-while-revalidate treatment as the rest. */
export function fetchMonthlyPnlCached(months = 12): Promise<MonthlyPnl[] | null> {
  return swrCached(`monthly-pnl-${months}`, () => fetchMonthlyPnl(months))
}

export type XeroTransaction = {
  id: string
  date: string          // ISO date YYYY-MM-DD
  type: 'in' | 'out'
  description: string   // contact name or invoice number
  reference: string | null
  status: string
  amount: number        // always positive
  currency: string
}

type RawInvoice = {
  InvoiceID: string
  Type: string
  Status: string
  Date?: string
  DueDateString?: string
  DateString?: string
  FullyPaidOnDate?: string  // set by Xero when invoice status = PAID
  Contact?: { ContactID?: string; Name?: string }
  InvoiceNumber?: string
  Reference?: string
  Total?: number
  AmountPaid?: number
  AmountDue?: number
  CurrencyCode?: string
}

type RawBankTx = {
  BankTransactionID: string
  Type: string
  Status: string
  Date?: string
  DateString?: string
  Contact?: { Name?: string }
  Reference?: string
  Total?: number
  CurrencyCode?: string
}

function parseXeroDate(raw: string): string {
  const msMatch = raw.match(/\/Date\((\d+)/)
  if (msMatch) return new Date(parseInt(msMatch[1])).toISOString().slice(0, 10)
  if (raw.length > 10) return raw.slice(0, 10)
  return raw
}

async function fetchInvoiceTransactions(
  accessToken: string,
  tenantId: string,
): Promise<XeroTransaction[]> {
  const results: XeroTransaction[] = []
  for (let page = 1; page <= 4; page++) {
    let pageData: RawInvoice[]
    try {
      const res = await xeroGet<{ Invoices?: RawInvoice[] }>(
        `/Invoices?Statuses=PAID,AUTHORISED&page=${page}&pageSize=200&order=Date+DESC`,
        accessToken,
        tenantId,
      )
      pageData = res.Invoices ?? []
    } catch {
      break
    }
    if (pageData.length === 0) break
    for (const inv of pageData) {
      const amount = inv.Total ?? 0
      if (amount === 0) continue
      results.push({
        id: inv.InvoiceID,
        date: parseXeroDate(
          inv.Status === 'PAID' && inv.FullyPaidOnDate
            ? inv.FullyPaidOnDate
            : (inv.DateString ?? inv.Date ?? '')
        ),
        type: inv.Type === 'ACCREC' ? 'in' : 'out',
        description: inv.Contact?.Name ?? inv.InvoiceNumber ?? 'Unknown',
        reference: inv.Reference ?? inv.InvoiceNumber ?? null,
        status: inv.Status,
        amount: Math.round(amount * 100) / 100,
        currency: inv.CurrencyCode ?? 'NZD',
      })
    }
    if (pageData.length < 200) break
  }
  return results
}

/**
 * Fetch Spend Money bank transactions — the most common way solo operators
 * record expenses in Xero (vs formal bills / ACCPAY invoices).
 * Requires the accounting.banktransactions.read scope (added post-March 2026).
 * Falls back gracefully if the scope is missing.
 */
async function fetchBankTransactions(
  accessToken: string,
  tenantId: string,
): Promise<XeroTransaction[]> {
  const results: XeroTransaction[] = []
  for (let page = 1; page <= 4; page++) {
    let pageData: RawBankTx[]
    try {
      const res = await xeroGet<{ BankTransactions?: RawBankTx[] }>(
        `/BankTransactions?Type=SPEND&page=${page}&pageSize=200&order=Date+DESC`,
        accessToken,
        tenantId,
      )
      pageData = res.BankTransactions ?? []
    } catch {
      break
    }
    if (pageData.length === 0) break
    for (const tx of pageData) {
      if (tx.Status === 'DELETED') continue
      const amount = tx.Total ?? 0
      if (amount === 0) continue
      results.push({
        id: tx.BankTransactionID,
        date: parseXeroDate(tx.DateString ?? tx.Date ?? ''),
        type: 'out',
        description: tx.Contact?.Name ?? 'Bank payment',
        reference: tx.Reference ?? null,
        // Bank transactions that are AUTHORISED represent settled payments
        status: 'PAID',
        amount: Math.round(amount * 100) / 100,
        currency: tx.CurrencyCode ?? 'NZD',
      })
    }
    if (pageData.length < 200) break
  }
  return results
}

/**
 * Fetch all cashflow transactions: sales invoices, supplier bills, and
 * Spend Money bank transactions. Returns combined + date-sorted list.
 */
export async function fetchXeroTransactions(): Promise<XeroTransaction[] | null> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return null

  const accessToken = account.access_token
  const tenantId = account.account_id

  const [invoices, bankTxs] = await Promise.allSettled([
    fetchInvoiceTransactions(accessToken, tenantId),
    fetchBankTransactions(accessToken, tenantId),
  ])

  // A half-failure must not be cached as a whole answer. Both legs feed one
  // list, so if either throws the result is a silently incomplete set of
  // transactions — and swrCached would store it as the new truth, making
  // months of spending vanish until the TTL expired. Returning null instead
  // leaves the last good value in place.
  if (invoices.status === 'rejected' || bankTxs.status === 'rejected') {
    console.error('[Xero] transactions partially failed, keeping previous data:', {
      invoices: invoices.status === 'rejected' ? invoices.reason : 'ok',
      bankTxs: bankTxs.status === 'rejected' ? bankTxs.reason : 'ok',
    })
    return null
  }

  const results: XeroTransaction[] = [...invoices.value, ...bankTxs.value]

  results.sort((a, b) => b.date.localeCompare(a.date))
  return results
}

/** Cached fetchXeroTransactions — serves within 2 min instantly, stale-while-revalidate after. */
export function fetchXeroTransactionsCached(): Promise<XeroTransaction[] | null> {
  return swrCached('transactions', fetchXeroTransactions)
}

// ─── Paid invoice totals (lifetime value) ────────────────────────────────────

export type PaidContactTotal = {
  contactId: string | null
  name: string
  total: number          // sum of AmountPaid across PAID ACCREC invoices
}

/**
 * Sum every PAID sales invoice per Xero contact. Used to sync each CRM
 * client's lifetime value from money actually received, not quotes.
 */
export async function fetchPaidInvoiceTotals(): Promise<PaidContactTotal[] | null> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return null

  const byKey = new Map<string, PaidContactTotal>()
  for (let page = 1; page <= 10; page++) {
    let pageData: RawInvoice[]
    try {
      const res = await xeroGet<{ Invoices?: RawInvoice[] }>(
        `/Invoices?Statuses=PAID&page=${page}&pageSize=200&order=Date+DESC`,
        account.access_token,
        account.account_id,
      )
      pageData = res.Invoices ?? []
    } catch {
      break
    }
    if (pageData.length === 0) break
    for (const inv of pageData) {
      if (inv.Type !== 'ACCREC') continue
      const name = inv.Contact?.Name?.trim()
      if (!name) continue
      const paid = inv.AmountPaid ?? inv.Total ?? 0
      if (paid <= 0) continue
      const key = inv.Contact?.ContactID || name.toLowerCase().replace(/\s+/g, ' ')
      const existing = byKey.get(key)
      if (existing) existing.total += paid
      else byKey.set(key, { contactId: inv.Contact?.ContactID ?? null, name, total: paid })
    }
    if (pageData.length < 200) break
  }
  return [...byKey.values()]
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export type XeroContact = {
  ContactID: string
  Name: string
  EmailAddress?: string
  IsCustomer: boolean
  IsSupplier: boolean
}

export async function fetchXeroContacts(search?: string): Promise<XeroContact[] | null> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return null

  const params = new URLSearchParams({ pageSize: '100', order: 'Name ASC' })
  if (search) params.set('searchTerm', search)
  const path = `/Contacts?${params.toString()}`

  try {
    const res = await xeroGet<{ Contacts?: XeroContact[] }>(path, account.access_token, account.account_id)
    return res.Contacts ?? []
  } catch {
    return null
  }
}

// ─── Invoice creation + management ───────────────────────────────────────────

export type XeroInvoiceLineItem = {
  Description: string
  UnitAmount: number
  Quantity?: number
  AccountCode?: string  // e.g. "200" for Sales
  TaxType?: string      // e.g. "OUTPUT2" for GST on income in NZ
}

export type XeroInvoiceCreateInput = {
  contactId: string
  contactName: string   // for display / fallback
  date: string          // YYYY-MM-DD
  dueDate: string       // YYYY-MM-DD
  lineItems: XeroInvoiceLineItem[]
  reference?: string
  status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED'
}

export type XeroCreatedInvoice = {
  InvoiceID: string
  InvoiceNumber: string
  Status: string
  Total: number
  /** Pre-tax total. Present on reads — used to preserve the line amount when
   *  an edit only touches the description. */
  SubTotal?: number
  AmountDue: number
  DateString?: string
  DueDateString?: string
  /** Present on reads; Xero returns it inline on the invoice. */
  Contact?: { ContactID?: string; Name?: string; EmailAddress?: string }
}

// ─── GST, or the absence of it ───────────────────────────────────────────────
// Tui Media is not GST registered (Organisation.SalesTaxBasis is "NONE"), and
// Xero enforces that on the way in: an ACCREC invoice posted with
// LineAmountTypes "Exclusive" and TaxType "OUTPUT2" comes back 400 with
// "EXCLUSIVE is not a valid value for LineAmountTypes". Both of those were
// hardcoded here, so EVERY invoice Tui tried to raise failed, and the swallowed
// error made it look like a broken connection.
//
// It is read off the org rather than hardcoded the other way, because the day
// the business crosses the GST threshold this has to flip on its own — a second
// silent breakage a year from now is not an improvement on the first.

type XeroTaxProfile = { lineAmountTypes: 'Exclusive' | 'NoTax'; salesTaxType: string; gstRegistered: boolean }

// Cached for the life of the instance: an org's GST registration changes once
// a decade, and this sits in front of every invoice write.
let taxProfileCache: XeroTaxProfile | null = null

export async function getXeroTaxProfile(): Promise<XeroTaxProfile> {
  if (taxProfileCache) return taxProfileCache
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) throw new Error('Xero is not connected.')

  const res = await xeroGet<{ Organisations?: Array<{ SalesTaxBasis?: string }> }>(
    '/Organisation',
    account.access_token,
    account.account_id,
  )
  const basis = (res.Organisations?.[0]?.SalesTaxBasis ?? '').toUpperCase()
  const gstRegistered = basis !== '' && basis !== 'NONE'
  taxProfileCache = gstRegistered
    ? { lineAmountTypes: 'Exclusive', salesTaxType: 'OUTPUT2', gstRegistered: true }
    : { lineAmountTypes: 'NoTax', salesTaxType: 'NONE', gstRegistered: false }
  return taxProfileCache
}

export async function createXeroInvoice(input: XeroInvoiceCreateInput): Promise<XeroWriteResult<XeroCreatedInvoice>> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return { ok: false, error: 'Xero is not connected. Reconnect it from Settings.' }

  try {
    const tax = await getXeroTaxProfile()

    const payload = {
      Type: 'ACCREC',
      Contact: { ContactID: input.contactId },
      Date: input.date,
      DueDate: input.dueDate,
      Status: input.status ?? 'DRAFT',
      LineAmountTypes: tax.lineAmountTypes,
      Reference: input.reference ?? '',
      LineItems: input.lineItems.map((li) => ({
        Description: li.Description,
        UnitAmount: li.UnitAmount,
        Quantity: li.Quantity ?? 1,
        AccountCode: li.AccountCode ?? '200',
        TaxType: li.TaxType ?? tax.salesTaxType,
      })),
    }

    const res = await xeroPost<{ Invoices?: XeroCreatedInvoice[] }>(
      '/Invoices',
      { Invoices: [payload] },
      account.access_token,
      account.account_id,
    )
    const invoice = res.Invoices?.[0]
    if (!invoice?.InvoiceID) return { ok: false, error: 'Xero accepted the request but returned no invoice.' }
    return { ok: true, data: invoice }
  } catch (err) {
    return { ok: false, error: friendlyXeroError(err) }
  }
}

export async function approveXeroInvoice(invoiceId: string): Promise<XeroWriteResult<XeroCreatedInvoice>> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return { ok: false, error: 'Xero is not connected. Reconnect it from Settings.' }

  try {
    const res = await xeroPost<{ Invoices?: XeroCreatedInvoice[] }>(
      `/Invoices/${invoiceId}`,
      { Status: 'AUTHORISED' },
      account.access_token,
      account.account_id,
      'POST',
    )
    const invoice = res.Invoices?.[0]
    if (!invoice?.InvoiceID) return { ok: false, error: 'Xero accepted the request but returned no invoice.' }
    return { ok: true, data: invoice }
  } catch (err) {
    return { ok: false, error: friendlyXeroError(err) }
  }
}

/**
 * Emails an invoice to the contact, from Xero, using the org's own invoice
 * template and reply-to address. Xero only sends AUTHORISED invoices and only
 * to a contact that has an email address, so both are checked here to give a
 * reason rather than a bare 400.
 *
 * There is no attachment or body to pass: POST /Invoices/{id}/Email takes an
 * empty payload and returns 204.
 */
export async function emailXeroInvoice(invoiceId: string): Promise<XeroWriteResult<{ sentTo: string; number: string }>> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return { ok: false, error: 'Xero is not connected. Reconnect it from Settings.' }

  const invoice = await getXeroInvoice(invoiceId)
  if (!invoice) return { ok: false, error: 'That invoice is not in Xero.' }
  if (invoice.Status !== 'AUTHORISED') {
    return { ok: false, error: `Invoice ${invoice.InvoiceNumber} is ${invoice.Status}. It has to be approved before Xero will send it.` }
  }

  const email = invoice.Contact?.EmailAddress?.trim()
  if (!email) {
    return { ok: false, error: `${invoice.Contact?.Name ?? 'That contact'} has no email address in Xero, so there is nowhere to send it.` }
  }

  try {
    await xeroPost(
      `/Invoices/${invoiceId}/Email`,
      {},
      account.access_token,
      account.account_id,
      'POST',
    )
    return { ok: true, data: { sentTo: email, number: invoice.InvoiceNumber } }
  } catch (err) {
    return { ok: false, error: friendlyXeroError(err) }
  }
}

/**
 * Voids an AUTHORISED invoice. Xero does not support un-voiding — this is
 * permanent. Fails (returns false) if the invoice has payments/credit notes
 * allocated to it; those must be removed in Xero first.
 */
export async function voidXeroInvoice(invoiceId: string): Promise<XeroWriteResult<true>> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return { ok: false, error: 'Xero is not connected. Reconnect it from Settings.' }

  try {
    await xeroPost(
      `/Invoices/${invoiceId}`,
      { Status: 'VOIDED' },
      account.access_token,
      account.account_id,
      'POST',
    )
    return { ok: true, data: true }
  } catch (err) {
    return { ok: false, error: friendlyXeroError(err) }
  }
}

/**
 * Deletes a DRAFT or SUBMITTED invoice (Xero's actual "delete" — it only
 * applies to unapproved invoices; anything AUTHORISED must be voided
 * instead, never hard-deleted, for accounting-trail integrity).
 */
export async function deleteXeroInvoice(invoiceId: string): Promise<XeroWriteResult<true>> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return { ok: false, error: 'Xero is not connected. Reconnect it from Settings.' }

  try {
    await xeroPost(
      `/Invoices/${invoiceId}`,
      { Status: 'DELETED' },
      account.access_token,
      account.account_id,
      'POST',
    )
    return { ok: true, data: true }
  } catch (err) {
    return { ok: false, error: friendlyXeroError(err) }
  }
}

export type XeroInvoicePayment = {
  PaymentID: string
  Date: string
  Amount: number
  Reference?: string
}

/** Full invoice detail including its Payments array — needed to void/delete an invoice that has partial payments allocated. */
export async function getXeroInvoice(invoiceId: string): Promise<(XeroCreatedInvoice & { Payments?: XeroInvoicePayment[] }) | null> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return null

  try {
    const res = await xeroGet<{ Invoices?: (XeroCreatedInvoice & { Payments?: XeroInvoicePayment[] })[] }>(
      `/Invoices/${invoiceId}`,
      account.access_token,
      account.account_id,
    )
    return res.Invoices?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * Removes a payment so its invoice becomes voidable/deletable again. PERMANENT
 * — this also un-reconciles the underlying bank transaction if it was matched,
 * so the money doesn't disappear, it just needs re-matching in Xero afterward.
 */
export async function deleteXeroPayment(paymentId: string): Promise<XeroWriteResult<true>> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return { ok: false, error: 'Xero is not connected. Reconnect it from Settings.' }

  try {
    await xeroPost(
      `/Payments/${paymentId}`,
      { Status: 'DELETED' },
      account.access_token,
      account.account_id,
      'POST',
    )
    return { ok: true, data: true }
  } catch (err) {
    return { ok: false, error: friendlyXeroError(err) }
  }
}

/** Updates line items/date/reference on an invoice that's still DRAFT (not yet sent). */
export async function updateXeroInvoice(invoiceId: string, updates: {
  description?: string
  amount?: number
  dueDate?: string
  reference?: string
}): Promise<XeroWriteResult<XeroCreatedInvoice>> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return { ok: false, error: 'Xero is not connected. Reconnect it from Settings.' }

  try {
    // Same GST trap as createXeroInvoice: a hardcoded OUTPUT2 line is rejected
    // outright on a non-GST-registered org.
    const tax = await getXeroTaxProfile()

    // No InvoiceID in the body — the URL already identifies the invoice, and
    // this function is routinely called with the human InvoiceNumber
    // ("INV-0170") rather than the GUID, which the URL path accepts but the
    // body's InvoiceID field does not: Xero rejected it with "Error
    // converting value \"INV-0170\" to type 'System.Guid'".
    const payload: Record<string, unknown> = {}
    if (updates.dueDate) payload.DueDate = updates.dueDate
    if (updates.reference !== undefined) payload.Reference = updates.reference
    if (updates.description !== undefined || updates.amount !== undefined) {
      // A PUT to Invoices/{id} replaces the whole LineItems array, not just
      // the fields named — so editing only the description with no amount in
      // `updates` dropped UnitAmount from the payload entirely (undefined is
      // not serialised) and Xero refused it as mandatory-but-missing. Read the
      // invoice's current line back when the amount isn't part of this edit,
      // so "just change the description" doesn't also have to know the price.
      const currentAmount = updates.amount ?? await (async () => {
        const existing = await getXeroInvoice(invoiceId)
        return existing?.SubTotal ?? existing?.Total ?? 0
      })()
      payload.LineAmountTypes = tax.lineAmountTypes
      payload.LineItems = [{
        Description: updates.description ?? 'Services',
        UnitAmount: currentAmount,
        Quantity: 1,
        AccountCode: '200',
        TaxType: tax.salesTaxType,
      }]
    }

    const res = await xeroPost<{ Invoices?: XeroCreatedInvoice[] }>(
      `/Invoices/${invoiceId}`,
      payload,
      account.access_token,
      account.account_id,
      'POST',
    )
    const invoice = res.Invoices?.[0]
    if (!invoice?.InvoiceID) return { ok: false, error: 'Xero accepted the request but returned no invoice.' }
    return { ok: true, data: invoice }
  } catch (err) {
    return { ok: false, error: friendlyXeroError(err) }
  }
}

/** List outstanding ACCREC invoices (not yet paid). */
export async function fetchOutstandingInvoices(): Promise<XeroCreatedInvoice[]> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return []

  try {
    const res = await xeroGet<{ Invoices?: XeroCreatedInvoice[] }>(
      '/Invoices?Statuses=DRAFT,SUBMITTED,AUTHORISED&Type=ACCREC&page=1&pageSize=50&order=Date+DESC',
      account.access_token,
      account.account_id,
    )
    return res.Invoices ?? []
  } catch {
    return []
  }
}
