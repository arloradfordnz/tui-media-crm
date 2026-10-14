'use client'

import { useActionState, useState } from 'react'
import { createEvent, deleteEvent, updateEventLinks } from '@/app/actions/events'
import { statusLabel } from '@/lib/format'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Calendar, Link2, Check } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'
import ConfirmSheet, { type ConfirmSpec } from '@/components/ConfirmSheet'
import Field from '@/components/Field'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const EVENT_COLORS: Record<string, string> = {
  shoot: 'var(--accent)',
  meeting: 'var(--accent-soft)',
  call: 'var(--accent-soft)',
  deadline: 'var(--warning)',
  personal: 'var(--text-tertiary)',
  iphone: 'var(--text-secondary)',
}

type EventData = {
  id: string
  title: string
  eventType: string
  date: string
  startTime: string | null
  endTime: string | null
  notes: string | null
  job: { id: string; name: string } | null
  client: { id: string; name: string } | null
}

type JobOption = { id: string; name: string; client_id: string | null }
type ClientOption = { id: string; name: string }

// Client and job pickers that stay consistent: choosing a job fills in its
// client, and choosing a client narrows the jobs to theirs. Used by both the
// new-event form and the link editor on an existing event.
function LinkPickers({ jobs, clients, initialClient = '', initialJob = '' }: { jobs: JobOption[]; clients: ClientOption[]; initialClient?: string; initialJob?: string }) {
  const [clientId, setClientId] = useState(initialClient)
  const [jobId, setJobId] = useState(initialJob)
  const jobOptions = jobs.filter((j) => !clientId || j.client_id === clientId)
  return (
    <>
      <Field label="Linked Client">
        <CustomSelect
          name="clientId"
          placeholder="None"
          searchable
          value={clientId}
          onChange={(v) => { setClientId(v); if (jobId && v && jobs.find((j) => j.id === jobId)?.client_id !== v) setJobId('') }}
          options={[{ value: '', label: 'None' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </Field>
      <Field label="Linked Job">
        <CustomSelect
          name="jobId"
          placeholder="None"
          searchable
          value={jobId}
          onChange={(v) => { setJobId(v); const owner = jobs.find((j) => j.id === v)?.client_id; if (owner) setClientId(owner) }}
          options={[{ value: '', label: 'None' }, ...jobOptions.map((j) => ({ value: j.id, label: j.name }))]}
        />
      </Field>
    </>
  )
}

function LinkChips({ event }: { event: EventData }) {
  if (!event.client && !event.job) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {event.client && <Link href={`/dashboard/clients/${event.client.id}`} className="badge badge-accent">{event.client.name}</Link>}
      {event.job && <Link href={`/dashboard/jobs/${event.job.id}`} className="badge badge-muted">{event.job.name}</Link>}
    </div>
  )
}

function EditLinks({ event, jobs, clients, onDone }: { event: EventData; jobs: JobOption[]; clients: ClientOption[]; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="space-y-3 mt-2"
      action={async (fd) => {
        setSaving(true)
        const res = await updateEventLinks(event.id, String(fd.get('clientId') ?? ''), String(fd.get('jobId') ?? ''))
        setSaving(false)
        if (res.error) setError(res.error)
        else onDone()
      }}
    >
      <LinkPickers jobs={jobs} clients={clients} initialClient={event.client?.id ?? ''} initialJob={event.job?.id ?? ''} />
      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary btn-sm"><Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

export default function CalendarView({ events, jobs, clients, month, year, feedToken }: { events: EventData[]; jobs: JobOption[]; clients: ClientOption[]; month: number; year: number; feedToken: string | null }) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingLinks, setEditingLinks] = useState<string | null>(null)
  const [confirmSpec, setConfirm] = useState<ConfirmSpec | null>(null)
  const [state, action, pending] = useActionState(createEvent, undefined)

  const today = new Date()
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year
  const todayDate = today.getDate()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = (firstDay.getDay() + 6) % 7 // Monday = 0
  const totalDays = lastDay.getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function eventsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter((e) => e.date.startsWith(dateStr))
  }

  function navMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    router.push(`/dashboard/calendar?month=${m}&year=${y}`)
  }

  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : []

  // Days that actually have something on them, in order, each day's events
  // sorted by start time (untimed events sort last rather than jumping to 00:00).
  const agendaDays = Array.from({ length: totalDays }, (_, i) => i + 1)
    .map((day) => ({
      day,
      events: eventsForDay(day).slice().sort((a, b) =>
        (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
      ),
    }))
    .filter((g) => g.events.length > 0)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.tuimedia.nz'
  const webcalUrl = feedToken
    ? `webcal://${appUrl.replace(/^https?:\/\//, '')}/api/calendar/feed.ics?token=${encodeURIComponent(feedToken)}`
    : null

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Calendar</h1>
        </div>
        <div className="page-header-actions">
          {webcalUrl && (
            <a href={webcalUrl} className="btn-secondary hidden! sm:inline-flex!">
              <Calendar className="w-3.5 h-3.5" /> Subscribe
            </a>
          )}
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Event
          </button>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4">
        <button onClick={() => navMonth(-1)} className="btn-icon"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{MONTHS[month]} {year}</h2>
        <button onClick={() => navMonth(1)} className="btn-icon"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Calendar grid — desktop projection (see .calendar-grid-view) */}
      <div className="card-flush overflow-hidden calendar-grid-view">
        <div className="grid grid-cols-7">
          {DAYS.map((d) => (
            <div key={d} className="table-header text-center py-3 text-xs">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dayEvents = day ? eventsForDay(day) : []
            const isToday = isCurrentMonth && day === todayDate
            const isSelected = day === selectedDay
            return (
              <div
                key={i}
                onClick={() => day && setSelectedDay(day)}
                className="min-h-[100px] p-2 cursor-pointer transition-colors"
                style={{
                  background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                  borderRight: '1px solid var(--bg-border)',
                  borderBottom: '1px solid var(--bg-border)',
                  borderLeft: isToday ? '2px solid var(--accent)' : undefined,
                }}
              >
                {day && (
                  <>
                    <span className="text-sm font-medium" style={{ color: isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>{day}</span>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div key={e.id} className="text-2xs px-1.5 py-0.5 rounded truncate" style={{ background: EVENT_COLORS[e.eventType] || 'var(--bg-elevated)', color: 'var(--on-accent)' }}>
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>+{dayEvents.length - 3} more</p>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Agenda — mobile projection of the SAME month. A 7-column grid in
          ~45px columns is unreadable on a phone, so below 768px the month
          becomes a date-grouped list. Both trees render; CSS shows one.
          Nothing is dropped either way — this is a different shape for the
          same events, not a reduced set of them. */}
      <div className="calendar-agenda-view">
        {agendaDays.length === 0 ? (
          <div className="empty-state card">
            <Calendar className="w-10 h-10 empty-icon" />
            <p className="empty-title">Nothing this month</p>
            <p className="empty-description">Events you add will show up here.</p>
          </div>
        ) : (
          <div className="card-flush overflow-hidden">
            {agendaDays.map(({ day, events: dayEvents }) => {
              const isToday = isCurrentMonth && day === todayDate
              const weekday = DAYS[(new Date(year, month, day).getDay() + 6) % 7]
              return (
                <section key={day}>
                  <h3 className={`agenda-day${isToday ? ' agenda-day-today' : ''}`}>
                    <span className="agenda-day-num">{day}</span>
                    <span className="agenda-day-name">{weekday}</span>
                    {isToday && <span className="agenda-today-pill">Today</span>}
                  </h3>
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="agenda-row"
                      onClick={() => setSelectedDay(day)}
                    >
                      <span className="agenda-time">{e.startTime || '\u2014'}</span>
                      <span
                        className="agenda-dot"
                        style={{ background: EVENT_COLORS[e.eventType] || 'var(--text-tertiary)' }}
                      />
                      <span className="agenda-body">
                        <span className="agenda-title">{e.title}</span>
                        {(e.client || e.job) && <span className="agenda-job">{[e.client?.name, e.job?.name].filter(Boolean).join(' · ')}</span>}
                      </span>
                    </button>
                  ))}
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            {selectedDay} {MONTHS[month]} {year}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No events on this day.</p>
          ) : (
            selectedEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ background: EVENT_COLORS[e.eventType] }} />
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="badge badge-muted">{e.eventType === 'iphone' ? 'iPhone' : statusLabel(e.eventType)}</span>
                    {e.startTime && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.startTime}{e.endTime ? ` – ${e.endTime}` : ''}</span>}
                  </div>
                  {e.notes && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{e.notes}</p>}
                  {editingLinks === e.id ? (
                    <EditLinks event={e} jobs={jobs} clients={clients} onDone={() => setEditingLinks(null)} />
                  ) : (
                    <>
                      <LinkChips event={e} />
                      {e.eventType !== 'iphone' && (
                        <button type="button" className="text-xs mt-1.5 inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }} onClick={() => setEditingLinks(e.id)}>
                          <Link2 className="w-3 h-3" /> {e.client || e.job ? 'Change link' : 'Link to a client or job'}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {/* Mirrored from the phone: it would be back on the next sync,
                    so the only real delete is on the phone. */}
                {e.eventType !== 'iphone' && <button
                  onClick={() => setConfirm({
                    title: 'Delete this event?',
                    body: `"${e.title}" comes off the calendar. If it is a shoot mirrored from a job, editing the job is the better move — this removes only the calendar entry.`,
                    confirmLabel: 'Delete event',
                    destructive: true,
                    onConfirm: () => { deleteEvent(e.id) },
                  })}
                  className="btn-icon"
                  aria-label={`Delete ${e.title}`}
                ><Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} /></button>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Event Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>New Event</h3>
              <button onClick={() => setShowModal(false)} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <form action={action} className="space-y-4">
              <Field label="Title *">
                <input name="title" required className="field-input" placeholder="Event title" />
      </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Type">
                  <CustomSelect
                    name="eventType"
                    defaultValue="shoot"
                    options={[
                      { value: 'shoot', label: 'Shoot' },
                      { value: 'meeting', label: 'Meeting' },
                      { value: 'deadline', label: 'Deadline' },
                      { value: 'personal', label: 'Personal' },
                    ]}
                  />
      </Field>
                <Field label="Date *">
                  <DatePicker name="date" required defaultValue={selectedDay ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` : ''} className="field-input" />
      </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start Time">
                  <input name="startTime" type="time" className="field-input" />
      </Field>
                <Field label="End Time">
                  <input name="endTime" type="time" className="field-input" />
      </Field>
              </div>
              <LinkPickers jobs={jobs} clients={clients} />
              <Field label="Notes">
                <textarea name="notes" rows={2} className="field-input" />
      </Field>
              {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
              <button type="submit" disabled={pending} className="btn-primary w-full">
                {pending ? 'Creating...' : 'Create Event'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmSheet spec={confirmSpec} onClose={() => setConfirm(null)} />
    </div>
  )
}
