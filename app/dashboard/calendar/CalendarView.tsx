'use client'

import { useActionState, useState } from 'react'
import { createEvent, deleteEvent } from '@/app/actions/events'
import { statusLabel } from '@/lib/format'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Calendar } from 'lucide-react'
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
}

export default function CalendarView({ events, jobs, month, year, feedToken }: { events: EventData[]; jobs: { id: string; name: string }[]; month: number; year: number; feedToken: string | null }) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
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
                        {e.job && <span className="agenda-job">{e.job.name}</span>}
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
                    <span className="badge badge-muted">{statusLabel(e.eventType)}</span>
                    {e.startTime && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.startTime}{e.endTime ? ` – ${e.endTime}` : ''}</span>}
                  </div>
                  {e.notes && <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{e.notes}</p>}
                  {e.job && <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>Job: {e.job.name}</p>}
                </div>
                <button
                  onClick={() => setConfirm({
                    title: 'Delete this event?',
                    body: `"${e.title}" comes off the calendar. If it is a shoot mirrored from a job, editing the job is the better move — this removes only the calendar entry.`,
                    confirmLabel: 'Delete event',
                    destructive: true,
                    onConfirm: () => { deleteEvent(e.id) },
                  })}
                  className="btn-icon"
                  aria-label={`Delete ${e.title}`}
                ><Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} /></button>
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
              <Field label="Linked Job">
                <CustomSelect
                  name="jobId"
                  placeholder="None"
                  searchable
                  options={[{ value: '', label: 'None' }, ...jobs.map((j) => ({ value: j.id, label: j.name }))]}
                />
      </Field>
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
