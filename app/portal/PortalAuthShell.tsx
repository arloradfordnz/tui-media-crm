import Image from 'next/image'

/** The framing shared by the portal's login and password-setup pages. */
export default function PortalAuthShell({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex justify-center mb-12">
          <Image className="logo-light" src="/Primary_Black.svg" alt="Tui Media" width={180} height={37} priority />
          <Image className="logo-dark" src="/Primary_White.svg" alt="Tui Media" width={180} height={37} priority />
        </div>

        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>{intro}</p>

        {children}

        <p className="text-center text-xs mt-12" style={{ color: 'var(--text-tertiary)' }}>
          Need a hand? <a href="mailto:hello@tuimedia.nz" style={{ color: 'var(--text-secondary)' }}>hello@tuimedia.nz</a>
        </p>
      </div>
    </div>
  )
}
