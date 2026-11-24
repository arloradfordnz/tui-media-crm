import { after } from 'next/server'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { getLeads, syncLeads, nzToday, type Lead, type LeadStage } from '@/lib/leads'
import LeadActions from './LeadActions'
import RefreshLeads from './RefreshLeads'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leads' }

// Who to answer, who to nudge, who to leave. Built from the hello@tuimedia.nz
// lead folders and the pitches in Sent (lib/leads.ts). The page renders from
// the table and reads the mailbox in the background when it is over an hour
// old, so opening it never waits on IMAP; Check mail reads it now.

const SHOWN = 25
const TEMP_ORDER = { warm: 0, cold: 1, pitched: 2 } as const

function ago(iso: string | null, today: string): string {
  if (!iso) return ''
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 60) return `${days} days ago`
  return `${Math.round(days / 30)} months ago`
}

function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function LeadRowView({ lead, today }: { lead: Lead; today: string }) {
  const theyWroteLast = (lead.last_in_at ?? '') > (lead.last_out_at ?? '')
  const lastLine = theyWroteLast
    ? `They wrote ${ago(lead.last_in_at, today)}`
    : lead.last_out_at
      ? `${lead.temperature === 'pitched' && lead.messages_out === 1 ? 'Pitched' : 'You wrote'} ${ago(lead.last_out_at, today)}${lead.messages_out > 1 ? ` · ${lead.messages_out} emails sent` : ''}`
      : `They wrote ${ago(lead.last_in_at, today)}`
  return (
    <div className="lead-row">
      <div className="lead-main">
        <p className="lead-title">
          {lead.client_id ? <Link href={`/dashboard/clients/${lead.client_id}`}>{lead.label}</Link> : lead.label}
          <span className={`badge badge-sm ${lead.temperature === 'warm' ? 'badge-warning' : lead.temperature === 'cold' ? 'badge-accent' : 'badge-muted'}`}>
            {lead.temperature === 'pitched' ? 'Pitched' : lead.temperature === 'warm' ? 'Warm' : 'Cold'}
          </span>
        </p>
        <p className="lead-sub">
          {lead.name && lead.name !== lead.label ? `${lead.name} · ` : ''}{lead.email}
        </p>
        <p className="lead-sub">
          {lead.last_subject ? `“${lead.last_subject}” · ` : ''}{lastLine}
          {lead.stage === 'later' && lead.dueOn ? ` · back ${shortDate(lead.dueOn)}` : ''}
        </p>
        {lead.note && <p className="lead-sub">{lead.note}</p>}
      </div>
      <LeadActions
        id={lead.id}
        email={lead.email}
        subject={lead.last_subject}
        initialDraft={lead.nudge_draft}
        reply={lead.stage === 'reply'}
        dropped={lead.stage === 'dropped'}
      />
    </div>
  )
}

function Section({ title, hint, leads, today, open = true }: { title: string; hint: string; leads: Lead[]; today: string; open?: boolean }) {
  if (leads.length === 0) return null
  const first = leads.slice(0, SHOWN)
  const rest = leads.slice(SHOWN)
  const body = (
    <div className="card-flush lead-list">
      {first.map((l) => <LeadRowView key={l.id} lead={l} today={today} />)}
      {rest.length > 0 && (
        <details className="lead-more">
          <summary className="btn-ghost">Show {rest.length} more</summary>
          {rest.map((l) => <LeadRowView key={l.id} lead={l} today={today} />)}
        </details>
      )}
    </div>
  )
  return (
    <section className="lead-section">
      {open ? (
        <>
          <div className="section-head">
            <h2 className="section-heading">{title}</h2>
            <span className="section-head-meta">{leads.length} · {hint}</span>
          </div>
          {body}
        </>
      ) : (
        <details>
          <summary className="section-head lead-collapsed">
            <h2 className="section-heading">{title}</h2>
            <span className="section-head-meta">{leads.length} · {hint}</span>
          </summary>
          {body}
        </details>
      )}
    </section>
  )
}

export default async function LeadsPage() {
  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const today = nzToday(now)
  const leads = await getLeads(supabase, now)

  // Read the mailbox after the response when it is over an hour old.
  after(async () => {
    const admin = createAdminClient()
    if (admin) await syncLeads(admin).catch(() => null)
  })

  const by = (stage: LeadStage) => leads.filter((l) => l.stage === stage)
  const reply = by('reply').sort((a, b) => (a.last_in_at ?? '').localeCompare(b.last_in_at ?? ''))
  const nudge = by('nudge').sort((a, b) =>
    TEMP_ORDER[a.temperature] - TEMP_ORDER[b.temperature] || (b.last_out_at ?? '').localeCompare(a.last_out_at ?? ''))
  const later = by('later').sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''))
  const quiet = by('quiet')
  const dropped = by('dropped')

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">
            {leads.length === 0
              ? 'Nothing read from the mailbox yet.'
              : `${reply.length} to reply to, ${nudge.length} due a nudge.`}
          </p>
        </div>
        <RefreshLeads />
      </div>

      {leads.length === 0 ? (
        <div className="empty-state card">
          <Inbox className="w-10 h-10 empty-icon" />
          <p className="empty-title">No leads yet</p>
          <p className="empty-description">
            Check mail reads the 02 Leads folders and the pitches in Sent from hello@tuimedia.nz.
          </p>
        </div>
      ) : (
        <div className="dash-stack">
          <Section title="Reply" hint="they wrote last" leads={reply} today={today} />
          <Section title="Nudge" hint={`a week or more since you wrote, warm first`} leads={nudge} today={today} />
          <Section title="Later" hint="back on the date shown" leads={later} today={today} />
          <Section title="Gone quiet" hint="three emails with no reply, or nothing for 3 months" leads={quiet} today={today} open={false} />
          <Section title="Dropped" hint="won't come back on their own" leads={dropped} today={today} open={false} />
        </div>
      )}
    </div>
  )
}
