import PortalAuthShell from '../PortalAuthShell'
import ForgotPasswordForm from './ForgotPasswordForm'

export const metadata = { title: 'Reset your password — Tui Media' }

export default function PortalForgotPage() {
  return (
    <PortalAuthShell
      title="Reset your password"
      intro="Enter the email you sign in with and we’ll send a link to choose a new password."
    >
      <ForgotPasswordForm />
    </PortalAuthShell>
  )
}
