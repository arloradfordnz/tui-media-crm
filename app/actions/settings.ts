'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, getVerifiedUser } from '@/lib/supabase'

export async function changePassword(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!currentPassword || !newPassword) return { error: 'All fields are required.' }
  if (newPassword !== confirmPassword) return { error: 'New passwords do not match.' }
  if (newPassword.length < 8) return { error: 'Password must be at least 8 characters.' }

  const supabase = await createServerSupabaseClient()

  // Re-authenticate to verify current password. Only the address is read
  // here, so the request-cached identity is the right one to use — the
  // signInWithPassword below is what actually proves the old password.
  const user = await getVerifiedUser()
  if (!user?.email) return { error: 'Not authenticated.' }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
  if (signInError) return { error: 'Current password is incorrect.' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }

  return { success: true }
}

export async function saveAppSetting(key: string, value: string) {
  const supabase = await createServerSupabaseClient()
  if (!(await getVerifiedUser())) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function getAppSetting(key: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}

export async function saveRetainerInvoiceDay(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const dayRaw = formData.get('retainerInvoiceDay') as string
  const day = parseInt(dayRaw, 10)
  if (!day || day < 1 || day > 28) return { error: 'Please enter a day between 1 and 28.' }
  return saveAppSetting('retainer_invoice_day', String(day))
}

export async function saveEmailTemplate(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const type = formData.get('type') as string
  const subject = formData.get('subject') as string
  const body = formData.get('body') as string

  if (!type || !subject || !body) return { error: 'All fields are required.' }

  const supabase = await createServerSupabaseClient()
  if (!(await getVerifiedUser())) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('email_templates')
    .upsert({ type, subject, body, updated_at: new Date().toISOString() }, { onConflict: 'type' })

  if (error) return { error: error.message }

  return { success: true }
}

// ── Portal self-view ─────────────────────────────────────────────────────────
// Which IPs count as "Arlo, not a client" when someone opens a portal link.
// See lib/admin-ip.ts — this is the allow-list it reads, and it lives in the
// database rather than only in ADMIN_IPS so it can be changed without a deploy.
export async function saveAdminIps(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const raw = (formData.get('adminIps') as string) || ''
  const ips = [...new Set(
    raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  )]
  // Deliberately permissive: IPv6, IPv4 and CGNAT addresses all show up here
  // and a strict pattern would reject a real one. An address that never
  // matches simply never suppresses anything.
  const bad = ips.find((ip) => ip.length > 45 || /[^0-9a-fA-F:.]/.test(ip))
  if (bad) return { error: `"${bad}" doesn't look like an IP address.` }
  return saveAppSetting('admin_ips', ips.join(','))
}
