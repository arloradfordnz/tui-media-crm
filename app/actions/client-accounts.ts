'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, getAuthUser } from '@/lib/supabase-admin'
import { sendPortalLogin } from '@/lib/send-to-client'

export type InviteResult = { ok: true; email: string } | { ok: false; error: string }

/**
 * Create (or re-send) a portal account for a client and email them a link to
 * set their password.
 *
 * The account is created here rather than by the client signing themselves up.
 * There is no public sign-up: an account only exists because Arlo made one for
 * a client he already has, which means there is no route by which a stranger
 * can get an authenticated session at all.
 */
export async function inviteClientToPortal(clientId: string): Promise<InviteResult> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: 'Supabase is not configured.' }

  // getAuthUser() returns null for client accounts as well as for signed-out
  // callers, so this is also what stops a client inviting anyone.
  const user = await getAuthUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const result = await sendPortalLogin(admin, clientId, 'setup')
  if (!result.ok) return result

  revalidatePath(`/dashboard/clients/${clientId}`)
  return { ok: true, email: result.email }
}
