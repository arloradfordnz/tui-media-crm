import { createServerSupabaseClient } from '@/lib/supabase'
import SettingsForm from './SettingsForm'
import EmailTemplatesForm from './EmailTemplatesForm'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: templates } = await supabase
    .from('email_templates')
    .select('*')
    .order('type')

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Settings</h1>

      {/* Profile */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Profile</h2>
        <div className="grid grid-cols-2 gap-4">
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

      {/* Email Templates */}
      <EmailTemplatesForm templates={templates || []} />

      {/* App Info */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>App Info</h2>
        <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p>Tui Media Operating System v2.0</p>
          <p>Next.js + Supabase + Tailwind CSS</p>
        </div>
      </div>
    </div>
  )
}
