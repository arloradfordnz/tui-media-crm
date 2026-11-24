// Who the client legally is, for the contract's parties clause.
//
// Arlo used to be asked "exact legal name?" and "company or sole trader?" as two
// typed questions, which meant leaving the CRM to search the Companies Register
// mid-contract. Now the contract popup asks the register itself, in the
// background while he answers the earlier questions (components/AskSheet.tsx
// fetches /api/clients/[id]/legal-lookup), and the question becomes a
// confirmation: tap the company it found, or the sole trader line when there is
// no company by that name.
//
// The source is the public Companies Office search page. It has no API key and
// no JSON, so this reads the result rows out of the HTML: registered name,
// company number, NZBN, status, entity type and registered office. A sole
// trader is never on that register, so "no matching company" is the signal for
// a sole trader, named as "Full Name trading as Business" from the contact.

export type CompanyMatch = {
  /** As written in a contract: "Johnson Residential Limited". */
  name: string
  /** As on the register: "JOHNSON RESIDENTIAL LIMITED". */
  registeredName: string
  number: string
  nzbn: string | null
  status: string
  entityType: string
  address: string | null
}

export type LegalLookupOption = {
  /** Starts "Company:" or "Sole trader:", so the answer says both things. */
  label: string
  detail?: string
}

export type LegalLookup = {
  options: LegalLookupOption[]
  /** The best company match, when one is confident. */
  company: CompanyMatch | null
  /** What happened, for the popup's hint line. */
  note: string
}

const SEARCH_URL = 'https://app.companiesoffice.govt.nz/companies/app/ui/pages/companies/search'
const LOCAL = /\b(nelson|tasman|richmond|motueka|stoke|mapua|wakefield|brightwater|takaka|golden bay|blenheim|marlborough)\b/i
const KEEP_UPPER = new Set(['NZ', 'NZL', 'TV', 'HR', 'IT', 'PR', 'NZBN', 'UK', 'USA', 'SUP', 'BBQ', '4X4'])

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

/** "JOHNSON RESIDENTIAL LIMITED" → "Johnson Residential Limited". */
export function titleCaseCompany(upper: string): string {
  return upper.split(' ').map((w) => {
    if (KEEP_UPPER.has(w.replace(/[^A-Z0-9]/g, ''))) return w
    return w.toLowerCase().replace(/(^|[(\-/&'.])([a-z])/g, (_, p, c) => p + c.toUpperCase())
  }).join(' ')
}

const core = (s: string) => s
  .toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(limited|ltd|nz|new zealand|the|company|co)\b/g, '')
  .replace(/[^a-z0-9]/g, '')

export function parseCompanySearch(html: string): CompanyMatch[] {
  const out: CompanyMatch[] = []
  const rowRe = /<span class="entityName">([^<]+)<\/span>\s*<span class="entityInfo">([\s\S]*?)<span class="entityType">([^<]*)<\/span>\s*<\/span>\s*<\/a>\s*<\/span>\s*<br>\s*<div\s*>([\s\S]*?)<\/div>/g
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(html))) {
    const registeredName = decode(m[1])
    const info = decode(m[2])
    const number = info.match(/^\((\d+)\)/)?.[1] ?? ''
    const nzbn = info.match(/NZBN:\s*(\d+)/)?.[1] ?? null
    const status = decode(info.replace(/^\(\d+\)\s*(\(NZBN:\s*\d+\))?/, ''))
    out.push({
      registeredName,
      name: titleCaseCompany(registeredName),
      number,
      nzbn,
      status,
      entityType: decode(m[3]),
      address: decode(m[4]) || null,
    })
  }
  return out
}

async function searchRegister(term: string): Promise<CompanyMatch[]> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(term)}&type=entities&mode=standard`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Companies Office search failed (${res.status})`)
  return parseCompanySearch(await res.text())
}

/** Only a first and last name will do for a sole trader in a contract. */
function fullName(person: string | null | undefined): string | null {
  const name = (person ?? '').replace(/\s*\(.*?\)\s*/g, ' ').split(/[,/]| - /)[0].trim()
  return name.split(/\s+/).length >= 2 ? name : null
}

export async function lookupLegalEntity(client: {
  name: string
  contact_person?: string | null
  location?: string | null
}): Promise<LegalLookup> {
  const who = client.name.trim()
  const owner = fullName(client.contact_person)
  const soleTrader: LegalLookupOption = owner
    ? { label: `Sole trader: ${owner} trading as ${who}`, detail: `${owner} signs personally` }
    : { label: `Sole trader trading as ${who}`, detail: "Type the owner's full name" }

  let rows: CompanyMatch[] = []
  try {
    rows = await searchRegister(who)
    // "Moana NZ SUP" finds nothing, "Moana" might: one wider try on the
    // distinctive first word, judged by the same match rules below.
    if (rows.length === 0) {
      const first = who.split(/\s+/)[0]
      if (first && first.length >= 4 && first.toLowerCase() !== who.toLowerCase()) rows = await searchRegister(first)
    }
  } catch (err) {
    return {
      options: [soleTrader],
      company: null,
      note: `Couldn't reach the Companies Register (${err instanceof Error ? err.message : 'error'}). Type the legal name.`,
    }
  }

  const target = core(who)
  const live = rows.filter((r) => /registered/i.test(r.status) && !/removed|struck|liquidation/i.test(r.status))
  const score = (r: CompanyMatch) => {
    const c = core(r.registeredName)
    let s = c === target ? 100 : c.startsWith(target) || target.startsWith(c) ? 60 : c.includes(target) ? 40 : 0
    if (s && r.address && client.location && r.address.toLowerCase().includes(client.location.toLowerCase().split(',')[0].trim())) s += 10
    if (s && r.address && LOCAL.test(r.address)) s += 5
    return s
  }
  const ranked = live.map((r) => ({ r, s: score(r) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  const company = ranked[0] && ranked[0].s >= 100 ? ranked[0].r : null

  const companyOption = (r: CompanyMatch): LegalLookupOption => ({
    label: `Company: ${r.name}`,
    detail: [`No. ${r.number}`, r.nzbn && `NZBN ${r.nzbn}`, r.address?.split(',').slice(-3, -1).join(',').trim()].filter(Boolean).join(' · '),
  })

  if (company) {
    return {
      options: [companyOption(company), ...ranked.slice(1, 2).map((x) => companyOption(x.r)), soleTrader],
      company,
      note: `Found on the Companies Register.`,
    }
  }
  if (ranked.length > 0) {
    return {
      options: [...ranked.slice(0, 2).map((x) => companyOption(x.r)), soleTrader],
      company: null,
      note: `No exact match on the Companies Register. These are the closest.`,
    }
  }
  return {
    options: [soleTrader],
    company: null,
    note: `No company called ${who} on the Companies Register, so they look like a sole trader.`,
  }
}
