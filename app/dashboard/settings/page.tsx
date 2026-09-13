import { createServerSupabaseClient, getVerifiedUser } from '@/lib/supabase'
import SettingsForm from './SettingsForm'
import EmailTemplatesForm from './EmailTemplatesForm'
import RetainerInvoiceSettings from './RetainerInvoiceSettings'
import PortalNotificationSettings from './PortalNotificationSettings'
import { APP_VERSION } from '@/lib/version'
import { getAppSetting } from '@/app/actions/settings'
import { getAdminIps, getRequestIp } from '@/lib/admin-ip'
import Link from 'next/link'
import { Users, CalendarDays, Wallet, FileText, TrendingUp } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()

  // The identity joins the Promise.all rather than gating it: the dashboard
  // layout has already resolved it for this request, so it costs nothing here.
  const [user, templates, retainerInvoiceDay, adminIps, requestIp] = await Promise.all([
    getVerifiedUser(),
    supabase.from('email_templates').select('id, type, subject, body, updated_at').order('type'),
    getAppSetting('retainer_invoice_day'),
    getAdminIps(),
    getRequestIp(),
  ])

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

      {/* Change Password */}
      <SettingsForm />

      {/* Retainer Invoice Day */}
      <RetainerInvoiceSettings currentDay={retainerInvoiceDay ? parseInt(retainerInvoiceDay, 10) : 1} />

      {/* Portal self-view */}
      <PortalNotificationSettings currentIps={adminIps} requestIp={requestIp} />

      {/* Email Templates */}
      <EmailTemplatesForm templates={templates.data || []} />

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
