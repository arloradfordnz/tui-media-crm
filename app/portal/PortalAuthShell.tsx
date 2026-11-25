import Image from 'next/image'
import { brandIdentity } from '@/lib/brand'
import { ArFooter, ArHeader } from './ArloRadfordChrome'

/**
 * The framing shared by the portal's login and password-setup pages.
 *
 * These pages come before anyone is signed in, so the brand comes from the
 * link: emails to an Arlo Radford client add `?brand=arlo_radford`
 * (lib/portal-setup-link.ts, portalAuthHref). No param is Tui Media, as before.
 */
export default function PortalAuthShell({
  title,
  intro,
  brand,
  children,
}: {
  title: string
  intro: string
  brand?: string | null
  children: React.ReactNode
}) {
  const id = brandIdentity(brand)

  // Arlo Radford: arloradford.nz's paper page, header and footer.
  if (id.brand === 'arlo_radford') {
    return (
      <div className="ar-theme">
        <ArHeader />
        <main className="ar-auth">
          <div className="ar-auth-inner animate-fade-in">
            <div className="ar-auth-head">
              <h1 className="ar-h2">{accentLast(title)}</h1>
              <p className="ar-body">{intro}</p>
            </div>
            {children}
            <p className="ar-auth-help">
              Need a hand? <a href={`mailto:${id.contactEmail}`}>{id.contactEmail}</a>
            </p>
          </div>
        </main>
        <ArFooter />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex justify-center mb-12">
          {id.brand === 'tui_media' ? (
            /* The bird mark from tuimedia.nz (its navbar logo). */
            <Image src="/tui-bird.webp" alt="Tui Media" width={43} height={72} priority />
          ) : (
            /* The arloradford.nz wordmark, in the same 72px-tall slot. */
            <div className="flex items-center" style={{ height: 72 }}>
              <Image className="logo-light" src={id.logo.onLight} alt={id.displayName} width={180} height={26} priority />
              <Image className="logo-dark" src={id.logo.onDark} alt={id.displayName} width={180} height={26} priority />
            </div>
          )}
        </div>

        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>{intro}</p>

        {children}

        <p className="text-center text-xs mt-12" style={{ color: 'var(--text-tertiary)' }}>
          Need a hand? <a href={`mailto:${id.contactEmail}`} style={{ color: 'var(--text-secondary)' }}>{id.contactEmail}</a>
        </p>
      </div>
    </div>
  )
}

/** The site's heading habit: the last word in italic ("Sign <em>in</em>"). */
function accentLast(text: string) {
  const at = text.lastIndexOf(' ')
  if (at < 0) return <em>{text}</em>
  return <>{text.slice(0, at + 1)}<em>{text.slice(at + 1)}</em></>
}
