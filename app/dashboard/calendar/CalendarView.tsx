'use client'

import { useActionState, useState } from 'react'
import { createEvent, deleteEvent } from '@/app/actions/events'
import { statusLabel } from '@/lib/format'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from 'lucide-react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const EVENT_COLORS: Record<string, string> = {
  shoot: 'var(--accent)',
  call: 'var(--accent-hover)',
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

export default function CalendarView({ events, jobs, month, year }: { events: EventData[]; jobs: { id: string; name: string }[]; month: number; year: number }) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Calendar</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Event
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-4">
        <button onClick={() => navMonth(-1)} className="btn-icon"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{MONTHS[month]} {year}</h2>
        <button onClick={() => navMonth(1)} className="btn-icon"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {/* Calendar grid */}
      <div className="card-flush overflow-hidden">
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
                        <div key={e.id} className="text-[10px] px-1.5 py-0.5 rounded truncate" style={{ background: EVENT_COLORS[e.eventType] || 'var(--bg-elevated)', color: '#fff' }}>
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>+{dayEvents.length - 3} more</p>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
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
                <button onClick={() => { if (confirm('Delete this event?')) deleteEvent(e.id) }} className="btn-icon"><Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} /></button>
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
              <div>
                <label className="field-label">Title *</label>
                <input name="title" required className="field-input" placeholder="Event title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Type</label>
                  <select name="eventType" className="field-input">
                    <option value="shoot">Shoot</option>
                    <option value="call">Call</option>
                    <option value="deadline">Deadline</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Date *</label>
                  <input name="date" type="date" required defaultValue={selectedDay ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` : ''} className="field-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Start Time</label>
                  <input name="startTime" type="time" className="field-input" />
                </div>
                <div>
                  <label className="field-label">End Time</label>
                  <input name="endTime" type="time" className="field-input" />
                </div>
              </div>
              <div>
                <label className="field-label">Linked Job</label>
                <select name="jobId" className="field-input">
                  <option value="">None</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Notes</label>
                <textarea name="notes" rows={2} className="field-input" />
              </div>
              {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
              <button type="submit" disabled={pending} className="btn-primary w-full">
                {pending ? 'Creating...' : 'Create Event'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
