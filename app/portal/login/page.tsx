import PortalAuthShell from '../PortalAuthShell'
import PortalLoginForm from './PortalLoginForm'

export const metadata = { title: 'Sign in — Tui Media' }

const MESSAGES: Record<string, string> = {
  expired: 'That setup link has expired or was already used. Sign in below, or email us for a fresh one.',
  link: 'That link was incomplete. Sign in below, or email us for a fresh one.',
}

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const notice = error ? MESSAGES[error] ?? null : null

  return (
    <PortalAuthShell title="Sign in" intro="Access your projects, files and paperwork.">
      <PortalLoginForm notice={notice} />
    </PortalAuthShell>
  )
}
