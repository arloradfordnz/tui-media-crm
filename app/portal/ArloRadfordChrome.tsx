import Image from 'next/image'
import { brandIdentity } from '@/lib/brand'
import './arlo-radford.css'

/**
 * The header and footer of arloradford.nz, for the pages an Arlo Radford
 * client sees (portal, sign-in, proposal). Styles in ./arlo-radford.css, all
 * scoped under `.ar-theme`, which the page root carries.
 */

const AR = brandIdentity('arlo_radford')

export function ArHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="ar-header">
      <a className="ar-header-brand" href={AR.websiteUrl}>
        <Image src={AR.logo.onLight} alt={AR.displayName} width={AR.logo.width} height={AR.logo.height} priority />
      </a>
      {children && <nav className="ar-header-nav" aria-label="Account">{children}</nav>}
    </header>
  )
}

export function ArFooter() {
  return (
    <footer className="ar-footer">
      <Image className="ar-footer-logo" src={AR.logo.onDark} alt={AR.displayName} width={AR.logo.width} height={AR.logo.height} />
      <nav className="ar-footer-nav" aria-label="Footer">
        <a href={AR.websiteUrl}>{AR.website}</a>
        <a href="https://www.instagram.com/arloradford">Instagram</a>
        <a href={`mailto:${AR.contactEmail}`}>{AR.contactEmail}</a>
      </nav>
      <div className="ar-footer-meta">
        <span>© {new Date().getFullYear()} Arlo Radford</span>
        <span>Nelson, New Zealand</span>
      </div>
    </footer>
  )
}

/** The site's arrow, as on its "Check my availability" links. */
export function ArArrow() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2.25 9.75 9.75 2.25M2.25 2.25h7.5v7.5" />
    </svg>
  )
}
