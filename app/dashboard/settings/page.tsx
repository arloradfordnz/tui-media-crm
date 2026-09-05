import { createServerSupabaseClient } from '@/lib/supabase'
import SettingsForm from './SettingsForm'
import EmailTemplatesForm from './EmailTemplatesForm'
import RetainerInvoiceSettings from './RetainerInvoiceSettings'
import { APP_VERSION } from '@/lib/version'
import { getAppSetting } from '@/app/actions/settings'
import Link from 'next/link'
import { Users, CalendarDays, Wallet, FileText } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [templates, retainerInvoiceDay] = await Promise.all([
    supabase.from('email_templates').select('id, type, subject, body, updated_at').order('type'),
    getAppSetting('retainer_invoice_day'),
  ])

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
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
          { href: '/dashboard/finance', label: 'Money', icon: Wallet },
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
