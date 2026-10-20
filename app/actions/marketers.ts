'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, getAuthUser } from '@/lib/supabase-admin'
import { emailPortalPasswordLink } from '@/lib/portal-setup-link'

export type MarketerResult = { ok: true; email?: string } | { ok: false; error: string }

/**
 * Create (or re-send) the marketer's login and email them a link to choose a
 * password. Admin only: getAuthUser() is null for clients and marketers too.
 */
export async function inviteMarketer(_prev: MarketerResult | undefined, formData: FormData): Promise<MarketerResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()
  if (!email || !email.includes('@')) return { ok: false, error: 'Enter an email address.' }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: 'Supabase is not configured.' }
  if (!(await getAuthUser())) return { ok: false, error: 'Not signed in.' }

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email)

  // Never repurpose an admin or client login by re-inviting its address.
  if (existing && existing.app_metadata?.role !== 'marketer') {
    return { ok: false, error: 'That email already belongs to another account.' }
  }

  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: 'marketer' },
      user_metadata: { name },
    })
    if (error) return { ok: false, error: error.message }
  }

  const sent = await emailPortalPasswordLink(admin, {
    email,
    name: name || (existing?.user_metadata?.name as string | undefined) || '',
    kind: 'setup',
    audience: 'marketer',
  })
  if (!sent.ok) return sent

  revalidatePath('/dashboard/settings')
  return { ok: true, email }
}

/** Remove the marketer's login entirely. */
export async function removeMarketer(userId: string): Promise<MarketerResult> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: 'Supabase is not configured.' }
  if (!(await getAuthUser())) return { ok: false, error: 'Not signed in.' }

  // The id comes from the browser, so confirm it really is a marketer before
  // deleting — this must never be a way to delete an admin or a client.
  const { data } = await admin.auth.admin.getUserById(userId)
  if (data?.user?.app_metadata?.role !== 'marketer') return { ok: false, error: 'Not a marketing login.' }

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/settings')
  return { ok: true }
}
