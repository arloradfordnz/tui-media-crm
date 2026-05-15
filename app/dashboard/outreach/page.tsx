import { createServerSupabaseClient } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'
import { Send } from 'lucide-react'
import Link from 'next/link'
import OutreachActions from './OutreachActions'

type Draft = {
  id: string
  created_at: string
  details: string
  client_id: string | null
  clients: { id: string; name: string; contact_person: string | null } | null
}

export function parseDraft(details: string) {
  // New format: SUBJECT: ...\n\nTO: ...\n\nBODY:\n...
  const subjectMatch = details.match(/^SUBJECT:\s*(.+)/m)
  const toMatch = details.match(/^TO:\s*(.+)/m)
  const bodyMatch = details.match(/BODY:\n([\s\S]+)$/)
  if (subjectMatch) {
    return {
      subject: subjectMatch[1].trim(),
      to: toMatch?.[1]?.trim() ?? '',
      body: bodyMatch?.[1]?.trim() ?? '',
    }
  }
  // Legacy format: "Kotare drafted pitch email. ... Subject: XYZ"
  const legacySubject = details.match(/Subject:\s*(.+)/i)
  return {
    subject: legacySubject?.[1]?.trim() ?? '',
    to: '',
    body: '',
  }
}

export default async function OutreachDraftsPage() {
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('activities')
    .select('id, created_at, details, client_id, clients(id, name, contact_person)')
    .in('action', ['outreach_draft', 'draft_email'])
    .order('created_at', { ascending: false })
    .limit(100)

  const drafts = (data ?? []) as unknown as Draft[]

  const parsed = drafts.map((d) => ({
    ...d,
    parsed: parseDraft(d.details ?? ''),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Outreach Drafts</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Pitch emails drafted by Kōtare — review and send.
          </p>
        </div>
        {parsed.length > 0 && (
          <OutreachActions drafts={parsed.map((d) => d.parsed)} mode="all" />
        )}
      </div>

      {parsed.length === 0 ? (
        <div className="empty-state card">
          <Send className="w-10 h-10 empty-icon" />
          <p className="empty-title">No drafts yet</p>
          <p className="empty-description">Kōtare will add outreach drafts here each morning.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {parsed.map((draft) => (
            <div key={draft.id} className="card space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {draft.clients ? (
                      <Link
                        href={`/dashboard/clients/${draft.clients.id}`}
                        className="font-semibold text-base hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        {draft.clients.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                        Unknown prospect
                      </span>
                    )}
                    {draft.clients?.contact_person && (
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        · {draft.clients.contact_person}
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>To: </span>
                    {draft.parsed.to || <span style={{ color: 'var(--text-tertiary)' }}>email not found</span>}
                  </p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {draft.parsed.subject}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                    {formatDateTime(draft.created_at)}
                  </span>
                  <OutreachActions drafts={[draft.parsed]} mode="single" />
                </div>
              </div>

              {/* Email body */}
              <div
                className="rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed"
                style={{
                  background: 'var(--bg-elevated)',
                  color: draft.parsed.body ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                  fontFamily: 'inherit',
                  borderLeft: '2px solid var(--accent)',
                  paddingLeft: '1rem',
                  fontStyle: draft.parsed.body ? 'normal' : 'italic',
                }}
              >
                {draft.parsed.body || 'Full email not stored — draft was saved to Apple Mail directly. Future drafts will show the full email here.'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
