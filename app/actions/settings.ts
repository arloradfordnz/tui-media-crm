'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, getVerifiedUser } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { ICLOUD_URL_SETTING, syncIcloudCalendar } from '@/lib/icloud-calendar'
import {
  SECRET_USER, SECRET_PASSWORD, SETTING_CALENDAR_URL, SETTING_CALENDAR_NAME, SETTING_CALENDARS,
  getCaldavConfig, listCalendars, runPushAndRecord,
} from '@/lib/icloud-push'

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

// ── iPhone calendar ──────────────────────────────────────────────────────────
// The iCloud public-calendar link. Saving it syncs straight away so the answer
// to "did that work?" is a number rather than a wait; an empty value switches
// the sync off and takes the mirrored events back off the calendar.
export async function saveIcloudCalendar(prevState: { error?: string; success?: string } | undefined, formData: FormData) {
  const url = ((formData.get('icloudUrl') as string) || '').trim()
  if (!(await getVerifiedUser())) return { error: 'Not authenticated.' }

  if (url) {
    let host = ''
    try { host = new URL(url.replace(/^webcals?:\/\//i, 'https://')).hostname } catch { /* falls through */ }
    if (!/^(webcals?|https):\/\//i.test(url) || !/(^|\.)icloud\.com$/.test(host)) {
      return { error: 'That should be the Public Calendar link from the iPhone, starting webcal:// and on icloud.com.' }
    }
  }

  const saved = await saveAppSetting(ICLOUD_URL_SETTING, url)
  if ('error' in saved && saved.error) return { error: saved.error }

  const admin = createAdminClient()
  if (!admin) return { error: 'Saved, but the server cannot sync right now.' }
  try {
    const r = await syncIcloudCalendar(admin)
    revalidatePath('/dashboard/calendar')
    revalidatePath('/dashboard')
    if (!url) return { success: 'Switched off. iPhone events removed from the calendar.' }
    return { success: `Synced. ${r ? r.added + r.updated : 0} events from your phone are on the calendar.` }
  } catch (err) {
    return { error: `Saved, but iCloud would not hand the calendar over: ${err instanceof Error ? err.message : 'unknown error'}. Check Public Calendar is still switched on.` }
  }
}

// ── CRM → iPhone ─────────────────────────────────────────────────────────────
// One form, three intents. Step one stores the Apple ID and app-specific
// password and lists the account's calendars; step two picks the work
// calendar and starts writing to it; 'disconnect' takes everything that was
// written back off the phone and forgets the credentials.
export async function saveIcloudPush(prevState: { error?: string; success?: string } | undefined, formData: FormData) {
  if (!(await getVerifiedUser())) return { error: 'Not authenticated.' }
  const admin = createAdminClient()
  if (!admin) return { error: 'The server cannot reach the database right now.' }

  const intent = (formData.get('intent') as string) || 'save'
  const now = new Date().toISOString()
  const setSecret = (key: string, value: string) => admin.from('integration_secrets').upsert({ key, value, updated_at: now })
  const setSetting = (key: string, value: string) => admin.from('app_settings').upsert({ key, value, updated_at: now })
  const finish = () => { revalidatePath('/dashboard/settings'); revalidatePath('/dashboard/calendar') }

  if (intent === 'disconnect') {
    await runPushAndRecord(admin, { removeAll: true })
    await admin.from('integration_secrets').delete().in('key', [SECRET_USER, SECRET_PASSWORD])
    await admin.from('app_settings').delete().in('key', [SETTING_CALENDAR_URL, SETTING_CALENDAR_NAME, SETTING_CALENDARS])
    await admin.from('icloud_push').delete().neq('event_id', '00000000-0000-0000-0000-000000000000')
    finish()
    return { success: 'Disconnected. CRM events were taken off the phone calendar.' }
  }

  const user = ((formData.get('appleId') as string) || '').trim()
  // Apple shows the app-specific password in dashed groups; the dashes are
  // cosmetic and both forms work, so strip nothing but whitespace.
  const password = ((formData.get('appPassword') as string) || '').replace(/\s+/g, '')
  const calendarUrl = ((formData.get('calendarUrl') as string) || '').trim()
  const current = await getCaldavConfig(admin)

  // New or changed credentials: prove them, and refresh the calendar list.
  if (password || (user && user !== current.user)) {
    if (!user || !password) return { error: 'Enter both the Apple ID and the app-specific password.' }
    try {
      const calendars = await listCalendars(user, password)
      if (calendars.length === 0) return { error: 'Logged in, but that account has no calendars.' }
      await setSecret(SECRET_USER, user)
      await setSecret(SECRET_PASSWORD, password)
      await setSetting(SETTING_CALENDARS, JSON.stringify(calendars))
      finish()
      return { success: 'Connected. Now choose your work calendar below and save.' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not connect to iCloud.' }
    }
  }

  if (!current.user || !current.password) return { error: 'Enter the Apple ID and app-specific password first.' }
  const choice = current.calendars.find((c) => c.url === calendarUrl)
  if (!choice) return { error: 'Choose a calendar.' }

  await setSetting(SETTING_CALENDAR_URL, choice.url)
  await setSetting(SETTING_CALENDAR_NAME, choice.name)
  const r = await runPushAndRecord(admin)
  finish()
  if (!r) return { error: 'Saved, but the first write to iCloud failed. The reason is shown on this card.' }
  const more = r.remaining ? ` ${r.remaining} more will follow over the next few minutes.` : ''
  return { success: `Writing to "${choice.name}". ${r.created} events added to the phone calendar.${more}` }
}
