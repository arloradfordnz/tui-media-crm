/**
 * Which name a client sees.
 *
 * Arlo is one sole trader with two trading names: Tui Media (social content
 * and events) and Arlo Radford (weddings, testimonials, brand films,
 * commercial). Legally it is one party, and every invoice comes from the Tui
 * Media Xero account, so only what the client SEES changes: names, logos,
 * sign-offs and the contract's party line.
 *
 * `clients.brand` holds the client's brand; `jobs.brand` can override it for
 * one job's documents. Anything unknown or null falls back to Tui Media, so a
 * Tui Media client sees exactly what they saw before this file existed.
 *
 * Pure data, no imports: safe in server code, client components and react-pdf.
 */

export type Brand = 'tui_media' | 'arlo_radford'

export const DEFAULT_BRAND: Brand = 'tui_media'

export type BrandIdentity = {
  brand: Brand
  /** "Tui Media" / "Arlo Radford" — headings, page titles, alt text. */
  displayName: string
  /** For tight spots: "Tui Media" / "Arlo". */
  shortName: string
  /** The name in the From: header. The sending address never changes. */
  senderName: string
  /** Sign-off under a client email: "Ngā mihi," then the name. */
  signoff: string
  signatureName: string
  /**
   * The line under Arlo's printed name on a signed document. Null where it
   * would only repeat the name (Arlo Radford under Arlo Radford).
   */
  signatureLine: string | null
  /** Who the contract is between, on Arlo's side. */
  partyLine: string
  website: string
  websiteUrl: string
  /** Where a client should email. Same inbox for both for now. */
  contactEmail: string
  /** Logos, paths under public/. `onDark` is the light ink version. */
  logo: {
    onDark: string
    onLight: string
    /** Intrinsic size of the PNG / SVG, for width/height attributes. */
    width: number
    height: number
    /** The small square mark (app icon, monogram). */
    mark: string
  }
  /** The greeting at the top of a client email or portal page. */
  greeting: (name?: string | null) => string
  /**
   * One plain line wherever invoices or payment come up. Null for Tui Media,
   * whose clients already see the name on the invoice.
   */
  invoiceNote: string | null
  /** The GST line under a price. Arlo is not GST registered under either name. */
  gstNote: string
}

const TUI_MEDIA: BrandIdentity = {
  brand: 'tui_media',
  displayName: 'Tui Media',
  shortName: 'Tui Media',
  senderName: 'Tui Media',
  signoff: 'Ngā mihi,',
  signatureName: 'Arlo Radford',
  signatureLine: 'Tui Media',
  partyLine: 'Arlo Radford trading as Tui Media',
  website: 'www.tuimedia.nz',
  websiteUrl: 'https://tuimedia.nz',
  contactEmail: 'hello@tuimedia.nz',
  logo: {
    onDark: '/Primary_White.png',
    onLight: '/Primary_Black.svg',
    width: 1280,
    height: 265,
    mark: '/Logomark_White.png',
  },
  greeting: (name) => (name ? `Hi ${name},` : 'Kia ora,'),
  invoiceNote: null,
  gstNote: 'Tui Media is not GST registered, so no GST is added.',
}

const ARLO_RADFORD: BrandIdentity = {
  brand: 'arlo_radford',
  displayName: 'Arlo Radford',
  shortName: 'Arlo',
  senderName: 'Arlo Radford',
  signoff: 'Ngā mihi,',
  signatureName: 'Arlo',
  signatureLine: null,
  partyLine: 'Arlo Radford',
  website: 'arloradford.nz',
  websiteUrl: 'https://arloradford.nz',
  contactEmail: 'hello@tuimedia.nz',
  logo: {
    onDark: '/brand/arlo-radford/arlo-radford-light.png',
    onLight: '/brand/arlo-radford/arlo-radford.png',
    width: 982,
    height: 142,
    mark: '/brand/arlo-radford/monogram-512.png',
  },
  greeting: (name) => (name ? `Kia ora ${name},` : 'Kia ora,'),
  invoiceNote: 'Invoices are issued by Tui Media, my business name for invoicing.',
  gstNote: "I'm not GST registered, so no GST is added.",
}

export function normalizeBrand(brand: string | null | undefined): Brand {
  if (brand === 'arlo_radford' || brand === 'personal') return 'arlo_radford'
  return DEFAULT_BRAND
}

export function brandIdentity(brand: string | null | undefined): BrandIdentity {
  return normalizeBrand(brand) === 'arlo_radford' ? ARLO_RADFORD : TUI_MEDIA
}

/** For a job's documents: the job's brand if it has one, else the client's. */
export function resolveBrand(jobBrand: string | null | undefined, clientBrand: string | null | undefined): Brand {
  return normalizeBrand(jobBrand || clientBrand)
}

/**
 * The contract party line, exported on its own for the contract rewrite
 * (fixed terms plus a one-page project sheet), which owns
 * lib/contract-drafting.ts.
 */
export function contractPartyLine(brand: string | null | undefined): string {
  return brandIdentity(brand).partyLine
}

/**
 * A portal sign-in page link that keeps the brand. Those pages come before a
 * session, so the link is the only thing that knows. Tui Media links are left
 * exactly as they were.
 */
export function portalAuthHref(path: string, brand: string | null | undefined): string {
  if (normalizeBrand(brand) === DEFAULT_BRAND) return path
  return `${path}${path.includes('?') ? '&' : '?'}brand=${normalizeBrand(brand)}`
}

/** Page title suffix: "Sign in — Tui Media" stays; Arlo Radford gets a middot. */
export function brandTitle(title: string, brand: string | null | undefined): string {
  const id = brandIdentity(brand)
  return id.brand === DEFAULT_BRAND ? `${title} — ${id.displayName}` : `${title} · ${id.displayName}`
}
