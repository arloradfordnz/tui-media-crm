'use server'

import { createServerSupabaseClient } from '@/lib/supabase'

export async function changePassword(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!currentPassword || !newPassword) return { error: 'All fields are required.' }
  if (newPassword !== confirmPassword) return { error: 'New passwords do not match.' }
  if (newPassword.length < 8) return { error: 'Password must be at least 8 characters.' }

  const supabase = await createServerSupabaseClient()

  // Re-authenticate to verify current password
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'Not authenticated.' }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
  if (signInError) return { error: 'Current password is incorrect.' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }

  return { success: true }
}

export async function saveEmailTemplate(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const type = formData.get('type') as string
  const subject = formData.get('subject') as string
  const body = formData.get('body') as string

  if (!type || !subject || !body) return { error: 'All fields are required.' }

  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('email_templates')
    .upsert({ type, subject, body, updated_at: new Date().toISOString() }, { onConflict: 'type' })

  if (error) return { error: error.message }

  return { success: true }
}
