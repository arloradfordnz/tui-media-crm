'use client'

import { useState, useTransition } from 'react'
import { UserPlus, Check } from 'lucide-react'
import { inviteClientToPortal } from '@/app/actions/client-accounts'
import { useToast } from '@/components/Toast'

/**
 * Sends a client their portal account setup email.
 *
 * Doubles as the re-send: the action reuses an existing account rather than
 * making a second one, so pressing this again just issues a fresh link — which
 * is what Arlo will want when someone lets the 24-hour one lapse.
 */
export default function PortalAccountButton({
  clientId,
  invitedAt,
  hasEmail,
}: {
  clientId: string
  invitedAt: string | null
  hasEmail: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const push = useToast()

  if (!hasEmail) return null

  function onClick() {
    startTransition(async () => {
      const result = await inviteClientToPortal(clientId)
      if (result.ok) {
        setSent(true)
        push({ tone: 'success', title: 'Account setup email sent', detail: result.email })
      } else {
        push({ tone: 'error', title: 'Could not send the setup email', detail: result.error })
      }
    })
  }

  const label = sent
    ? 'Setup email sent'
    : invitedAt
      ? 'Resend account setup'
      : 'Send account setup'

  return (
    <button onClick={onClick} disabled={pending} className="btn-secondary btn-sm">
      {sent ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
      {pending ? 'Sending…' : label}
    </button>
  )
}
