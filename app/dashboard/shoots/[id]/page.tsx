import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Phone, Mail, Clock, Briefcase } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getShootPack } from '@/lib/shoot-pack'
import ShotList from './ShotList'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shoot pack' }

// Everything for one shoot on one page, for the evening before and the
// morning of (lib/shoot-pack.ts). Linked from Today the day before.

function dayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '')
}

function time(t: string | null): string | null {
  if (!t) return null
  const [h, min] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return min ? `${hour}:${String(min).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

export default async function ShootPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const pack = await getShootPack(supabase, id)
  if (!pack) notFound()

  const start = time(pack.startTime)
  const end = time(pack.endTime)
  const when = [dayLabel(pack.day), start && end ? `${start} to ${end}` : start ? `from ${start}` : end ? `until ${end}` : null].filter(Boolean).join(', ')
  const openTasks = pack.job?.tasks.filter((t) => !t.completed && (t.phase === 'preshoot' || t.phase === 'shootday' || t.phase === 'film')) ?? []

  return (
    <div className="space-y-6">
      <Link href="/dashboard/calendar" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Calendar
      </Link>

      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{pack.client?.name ?? pack.title}</h1>
          <p className="page-subtitle">{pack.job?.name ?? pack.title}</p>
        </div>
      </div>

      <section className="card shoot-card">
        <ul className="shoot-facts">
          <li><Clock className="w-4 h-4" /> <span>{when}</span></li>
          {pack.address && (
            <li>
              <MapPin className="w-4 h-4" />
              <a href={`https://maps.apple.com/?q=${encodeURIComponent(pack.address)}`}>{pack.address}</a>
            </li>
          )}
          {pack.client?.contact && (
            <li>
              <Phone className="w-4 h-4" />
              <span>
                {pack.client.contact}
                {pack.client.phone && <> · <a href={`tel:${pack.client.phone.replace(/\s+/g, '')}`}>{pack.client.phone}</a></>}
              </span>
            </li>
          )}
          {pack.client?.email && (
            <li><Mail className="w-4 h-4" /> <a href={`mailto:${pack.client.email}`}>{pack.client.email}</a></li>
          )}
          {pack.job && (
            <li><Briefcase className="w-4 h-4" /> <Link href={`/dashboard/jobs/${pack.job.id}`}>Open the job</Link></li>
          )}
        </ul>
        {pack.eventNotes && pack.eventNotes !== pack.address && <p className="shoot-notes">{pack.eventNotes}</p>}
      </section>

      <ShotList eventId={pack.eventId} initial={pack.shotList} />

      {pack.job && pack.job.deliverables.length > 0 && (
        <section className="card shoot-card">
          <h2 className="section-heading">Making</h2>
          <ul className="shoot-list">
            {pack.job.deliverables.map((d, i) => <li key={i}>{d.title}{d.description ? `: ${d.description}` : ''}</li>)}
          </ul>
        </section>
      )}

      {(pack.job?.notes || pack.client?.notes) && (
        <section className="card shoot-card">
          <h2 className="section-heading">Brief</h2>
          {pack.job?.notes && <p className="shoot-notes">{pack.job.notes}</p>}
          {pack.client?.notes && (
            <details>
              <summary className="lead-sub lead-collapsed">Client notes</summary>
              <p className="shoot-notes">{pack.client.notes}</p>
            </details>
          )}
        </section>
      )}

      {pack.emails.length > 0 && (
        <section className="card shoot-card">
          <h2 className="section-heading">Lately from {pack.client?.name}</h2>
          <ul className="shoot-list">
            {pack.emails.map((e, i) => (
              <li key={i}>
                {e.heading}
                <span className="lead-sub"> · {new Date(e.receivedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openTasks.length > 0 && (
        <section className="card shoot-card">
          <h2 className="section-heading">Still to tick</h2>
          <ul className="shoot-list">
            {openTasks.map((t, i) => <li key={i}>{t.title}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
