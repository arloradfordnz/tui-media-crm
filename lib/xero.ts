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

import { createClient } from '@supabase/supabase-js'

export const XERO_SCOPES = [
  'offline_access',
  'accounting.reports.read',
  'accounting.transactions.read',
  'accounting.settings.read',
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

/** Returns the first connected Xero org, refreshing tokens if needed. */
export async function getValidXeroAccount(): Promise<StoredAccount | null> {
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
  }

  return account
}

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
    throw new Error(`Xero ${path} failed (${res.status}): ${text}`)
  }
  return (await res.json()) as T
}

export type XeroSummary = {
  org_name: string | null
  bank_balance_nzd: number | null
  outstanding_invoices_nzd: number
  outstanding_invoice_count: number
  overdue_invoices_nzd: number
  overdue_invoice_count: number
  revenue_this_month_nzd: number | null
  net_profit_this_month_nzd: number | null
}

/**
 * Pull a tight financial snapshot for the daily health report. Returns null
 * if no Xero account is connected.
 */
export async function fetchXeroSummary(): Promise<XeroSummary | null> {
  const account = await getValidXeroAccount()
  if (!account || !account.account_id) return null

  const accessToken = account.access_token
  const tenantId = account.account_id

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const toDate = now.toISOString().slice(0, 10)
  const todayISO = toDate

  const [invoicesRes, bankSummaryRes, plRes] = await Promise.allSettled([
    xeroGet<{ Invoices?: Array<{ AmountDue: number; DueDate?: string; Status: string; Type: string }> }>(
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
      `/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`,
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
      if (inv.DueDate && inv.DueDate.slice(0, 10) < todayISO) {
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
  }

  return {
    org_name: account.account_name,
    bank_balance_nzd: bankBalance,
    outstanding_invoices_nzd: Math.round(outstandingTotal),
    outstanding_invoice_count: outstandingCount,
    overdue_invoices_nzd: Math.round(overdueTotal),
    overdue_invoice_count: overdueCount,
    revenue_this_month_nzd: revenueMonth == null ? null : Math.round(revenueMonth),
    net_profit_this_month_nzd: netProfitMonth == null ? null : Math.round(netProfitMonth),
  }
}
