'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { UserPlus, Check } from 'lucide-react'
import { inviteClientToPortal } from '@/app/actions/client-accounts'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/format'

/**
 * Sends a client their portal account setup email.
 *
 * Doubles as the re-send: the action reuses an existing account rather than
 * making a second one, so pressing this again just issues a fresh link — which
 * is what Arlo will want when someone lets theirs lapse.
 *
 * `notice` arrives from createClient's redirect (?portal=sent|failed), which
 * sends the login automatically: this turns it into the toast, then drops the
 * param so a refresh does not say it again.
 */
export default function PortalAccountButton({
  clientId,
  invitedAt,
  hasEmail,
  notice,
  email,
}: {
  clientId: string
  invitedAt: string | null
  hasEmail: boolean
  notice?: 'sent' | 'failed' | null
  email?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(notice === 'sent')
  const push = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const announced = useRef(false)

  useEffect(() => {
    if (!notice || announced.current) return
    announced.current = true
    if (notice === 'sent') {
      push({ tone: 'success', title: 'Portal login sent', detail: email ?? undefined })
    } else {
      push({ tone: 'error', title: 'Client saved, but the portal login didn’t send', detail: 'Press Send account setup to try again.' })
    }
    router.replace(pathname, { scroll: false })
  }, [notice, email, push, router, pathname])

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

/**
 * One line under the client's email saying where their portal login is up to,
 * so whether it arrived is on the record instead of a guess. Setting a
 * password signs the client in, so a sign-in date means the email got through
 * and was used.
 */
export function PortalStatus({ email, invitedAt, signedInAt }: { email: string | null; invitedAt: string | null; signedInAt: string | null }) {
  if (!email) return null
  const text = signedInAt
    ? `Portal set up · last signed in ${formatDate(signedInAt)}`
    : invitedAt
      ? `Portal login sent ${formatDate(invitedAt)} · not set up yet`
      : 'No portal login sent yet'
  return (
    <p className="text-xs mt-1.5" style={{ color: signedInAt ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{text}</p>
  )
}
