import { createServerSupabaseClient, getVerifiedUser } from '@/lib/supabase'
import SettingsForm from './SettingsForm'
import RetainerInvoiceSettings from './RetainerInvoiceSettings'
import PortalNotificationSettings from './PortalNotificationSettings'
import IcloudCalendarSettings from './IcloudCalendarSettings'
import IcloudPushSettings from './IcloudPushSettings'
import MemorySettings from './MemorySettings'
import MarketerSettings, { type MarketerRow } from './MarketerSettings'
import { listMemories } from '@/lib/ai-memory'
import { createAdminClient } from '@/lib/supabase-admin'
import { getCaldavConfig, STATUS_KEY } from '@/lib/icloud-push'
import { APP_VERSION } from '@/lib/version'
import { getAppSetting } from '@/app/actions/settings'
import { getAdminIps, getRequestIp } from '@/lib/admin-ip'
import Link from 'next/link'
import { Users, CalendarDays, Wallet, FileText, TrendingUp } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()

  // The identity joins the Promise.all rather than gating it: the dashboard
  // layout has already resolved it for this request, so it costs nothing here.
  const [user, retainerInvoiceDay, adminIps, requestIp, icloudUrl, memories] = await Promise.all([
    getVerifiedUser(),
    getAppSetting('retainer_invoice_day'),
    getAdminIps(),
    getRequestIp(),
    getAppSetting('icloud_calendar_url'),
    listMemories(supabase).catch(() => null),
  ])

  // The password never leaves the server: the card is told only whether one is
  // saved. Status is what the last push did, so a failure is visible.
  const admin = createAdminClient()
  const [caldav, pushStatus] = admin
    ? await Promise.all([
        getCaldavConfig(admin),
        admin.from('kv_cache').select('value').eq('key', STATUS_KEY).maybeSingle(),
      ])
    : [null, null]

  const { data: authList } = admin ? await admin.auth.admin.listUsers({ perPage: 1000 }) : { data: null }
  const marketers: MarketerRow[] = (authList?.users ?? [])
    .filter((u) => u.app_metadata?.role === 'marketer')
    .map((u) => ({
      id: u.id,
      email: u.email ?? '',
      name: (u.user_metadata?.name as string | undefined) ?? '',
      lastSignInAt: u.last_sign_in_at ?? null,
    }))

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      {/* Mobile navigation.
          The bottom tab bar carries the five daily destinations; Clients,
          Calendar, Money and Documents are lookups that used to live behind a
          drawer. With the drawer gone, this is their way in on a phone. Hidden
          from 769px up, where the sidebar is pinned open and already lists
          them. */}
      <nav className="settings-mobile-nav" aria-label="Sections">
        {[
          { href: '/dashboard/clients', label: 'Clients', icon: Users },
          { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
          { href: '/dashboard/money', label: 'Money', icon: Wallet },
          { href: '/dashboard/finance', label: 'Finance', icon: TrendingUp },
          { href: '/dashboard/documents', label: 'Documents', icon: FileText },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="settings-nav-tile">
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Profile */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="label">Name</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{user?.user_metadata?.name || '—'}</p>
          </div>
          <div>
            <p className="label">Email</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{user?.email || '—'}</p>
          </div>
        </div>
      </div>

      {/* Tui's long-term memory */}
      <MemorySettings memories={memories} />

      {/* Marketing login */}
      <MarketerSettings marketers={marketers} />

      {/* Change Password */}
      <SettingsForm email={user?.email} />

      {/* Retainer Invoice Day */}
      <RetainerInvoiceSettings currentDay={retainerInvoiceDay ? parseInt(retainerInvoiceDay, 10) : 1} />

      {/* iPhone calendar */}
      <IcloudCalendarSettings currentUrl={icloudUrl ?? ''} />
      <IcloudPushSettings
        appleId={caldav?.user ?? ''}
        connected={!!caldav?.user && !!caldav?.password}
        calendars={caldav?.calendars ?? []}
        calendarUrl={caldav?.calendarUrl ?? ''}
        status={(pushStatus?.data?.value as { at: string; ok: boolean; error?: string; created?: number; updated?: number; removed?: number; remaining?: number } | undefined) ?? null}
      />

      {/* Portal self-view */}
      <PortalNotificationSettings currentIps={adminIps} requestIp={requestIp} />

      {/* App Info */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>App Info</h2>
        <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p>
            Tui Media Operating System{' '}
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              v{APP_VERSION}
            </span>
          </p>
          <p>Next.js + Supabase + Tailwind CSS</p>
        </div>
      </div>
    </div>
  )
}
