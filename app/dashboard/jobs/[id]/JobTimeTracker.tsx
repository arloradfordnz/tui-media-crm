'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { Play, Square, Plus, Trash2, Pencil, X, Check, Timer, DollarSign } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import { formatNZD, formatDate } from '@/lib/format'
import {
  startTimer,
  stopTimer,
  addManualEntry,
  updateTimeEntry,
  deleteTimeEntry,
  updateJobHourlyRate,
} from '@/app/actions/time'

const TIME_CATEGORIES = ['general', 'shoot', 'edit', 'admin', 'travel', 'meeting'] as const

export type TimeEntry = {
  id: string
  description: string | null
  category: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  billable: boolean
  hourlyRate: number | null
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  shoot: 'Shoot',
  edit: 'Edit',
  admin: 'Admin',
  travel: 'Travel',
  meeting: 'Meeting',
}

const CATEGORY_OPTIONS = TIME_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))

function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

function formatHMS(seconds: number): string {
  if (seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return d.toISOString().slice(0, 10)
}

function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0=Sun
  const diff = (day + 6) % 7 // make Mon = 0
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - diff)
  return out
}

export default function JobTimeTracker({
  jobId,
  hourlyRate,
  estimatedHours,
  entries,
}: {
  jobId: string
  hourlyRate: number
  estimatedHours: number
  entries: TimeEntry[]
}) {
  const [isPending, startTransition] = useTransition()
  const [now, setNow] = useState(() => Date.now())

  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState<string>('general')

  const [manualOpen, setManualOpen] = useState(false)
  const [manualState, manualAction, manualPending] = useActionState(addManualEntry, undefined)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('general')
  const [editHours, setEditHours] = useState(0)
  const [editMinutes, setEditMinutes] = useState(0)
  const [editBillable, setEditBillable] = useState(true)

  const [rateInput, setRateInput] = useState(hourlyRate.toString())

  const running = entries.find((e) => e.endedAt === null)

  // Live tick for running timer
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])

  // Reset manual form on successful submit
  useEffect(() => {
    if (manualState && !manualState.error && manualPending === false) {
      setManualOpen(false)
    }
  }, [manualState, manualPending])

  function handleStart() {
    if (isPending) return
    startTransition(async () => {
      await startTimer(jobId, newDescription, newCategory)
      setNewDescription('')
    })
  }

  function handleStop(entryId: string) {
    startTransition(async () => { await stopTimer(entryId) })
  }

  function handleDelete(entryId: string) {
    if (!confirm('Delete this time entry?')) return
    startTransition(async () => { await deleteTimeEntry(entryId) })
  }

  function beginEdit(e: TimeEntry) {
    setEditingId(e.id)
    setEditDescription(e.description || '')
    setEditCategory(e.category || 'general')
    const secs = e.durationSeconds || 0
    setEditHours(Math.floor(secs / 3600))
    setEditMinutes(Math.floor((secs % 3600) / 60))
    setEditBillable(e.billable)
  }

  function saveEdit() {
    if (!editingId) return
    const id = editingId
    startTransition(async () => {
      await updateTimeEntry(id, {
        description: editDescription,
        category: editCategory,
        billable: editBillable,
        hours: editHours,
        minutes: editMinutes,
      })
      setEditingId(null)
    })
  }

  function handleRateBlur() {
    const r = parseFloat(rateInput) || 0
    if (r === hourlyRate) return
    startTransition(async () => { await updateJobHourlyRate(jobId, r) })
  }

  // Totals
  const completedEntries = entries.filter((e) => e.endedAt !== null)
  const runningSeconds = running ? Math.max(0, Math.round((now - new Date(running.startedAt).getTime()) / 1000)) : 0
  const totalSeconds = completedEntries.reduce((sum, e) => sum + (e.durationSeconds || 0), 0) + runningSeconds

  const todayKey = new Date().toISOString().slice(0, 10)
  const todaySeconds =
    completedEntries.filter((e) => dayKey(e.startedAt) === todayKey).reduce((s, e) => s + (e.durationSeconds || 0), 0) +
    (running && dayKey(running.startedAt) === todayKey ? runningSeconds : 0)

  const weekStart = startOfWeek(new Date()).getTime()
  const weekSeconds =
    completedEntries.filter((e) => new Date(e.startedAt).getTime() >= weekStart).reduce((s, e) => s + (e.durationSeconds || 0), 0) +
    (running && new Date(running.startedAt).getTime() >= weekStart ? runningSeconds : 0)

  // Billable value — use entry.hourlyRate if set, otherwise job.hourlyRate
  const billableValue = completedEntries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + ((e.durationSeconds || 0) / 3600) * (e.hourlyRate ?? hourlyRate), 0) +
    (running?.billable ? (runningSeconds / 3600) * (running.hourlyRate ?? hourlyRate) : 0)

  // Category breakdown
  const categorySeconds: Record<string, number> = {}
  for (const e of completedEntries) {
    const cat = e.category || 'general'
    categorySeconds[cat] = (categorySeconds[cat] || 0) + (e.durationSeconds || 0)
  }
  if (running) {
    const cat = running.category || 'general'
    categorySeconds[cat] = (categorySeconds[cat] || 0) + runningSeconds
  }
  const categoriesUsed = TIME_CATEGORIES.filter((c) => categorySeconds[c] > 0)

  // Budget progress
  const estimatedSeconds = estimatedHours * 3600
  const budgetPct = estimatedSeconds > 0 ? Math.min((totalSeconds / estimatedSeconds) * 100, 100) : 0
  const overBudget = estimatedSeconds > 0 && totalSeconds > estimatedSeconds
  const nearBudget = estimatedSeconds > 0 && totalSeconds / estimatedSeconds >= 0.8
  const budgetColor = overBudget ? 'var(--danger)' : nearBudget ? 'var(--warning)' : 'var(--accent)'

  // Group entries by day for display (most recent first)
  const sorted = [...completedEntries].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  const groups = new Map<string, TimeEntry[]>()
  for (const e of sorted) {
    const k = dayKey(e.startedAt)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(e)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Timer className="w-4 h-4" /> Time Tracking
        </h3>
        <div className="flex items-center gap-2">
          <DollarSign className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Rate/hr</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={handleRateBlur}
            className="field-input text-sm"
            style={{ width: '90px', padding: '4px 8px' }}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SummaryCell label="Today" value={formatDuration(todaySeconds)} />
        <SummaryCell label="This Week" value={formatDuration(weekSeconds)} />
        <SummaryCell label="Total" value={formatDuration(totalSeconds)} />
        <SummaryCell label="Billable" value={formatNZD(billableValue)} accent />
      </div>

      {/* Budget progress bar */}
      {estimatedHours > 0 && (
        <div className="mb-4 rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Budget</span>
            <span className="text-xs font-medium tabular-nums" style={{ color: budgetColor }}>
              {overBudget
                ? `${formatDuration(totalSeconds - estimatedSeconds)} over budget`
                : `${formatDuration(estimatedSeconds - totalSeconds)} remaining`}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${budgetPct}%`, background: budgetColor }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDuration(totalSeconds)} logged</span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{estimatedHours}h estimated</span>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {categoriesUsed.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {categoriesUsed.map((cat) => (
            <span key={cat} className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{CATEGORY_LABELS[cat]}</span>
              {formatDuration(categorySeconds[cat])}
            </span>
          ))}
        </div>
      )}

      {/* Active / Start Timer */}
      {running ? (
        <div
          className="rounded-lg p-4 mb-4"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)' }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Running</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                  {CATEGORY_LABELS[running.category] || running.category}
                </span>
              </div>
              <div className="text-2xl font-mono font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {formatHMS(runningSeconds)}
              </div>
              {running.description && (
                <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{running.description}</div>
              )}
              <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Started {new Date(running.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button onClick={() => handleStop(running.id)} className="btn-primary flex items-center gap-2">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mb-4 flex-wrap">
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleStart() }}
            placeholder="What are you working on?"
            className="field-input flex-1 min-w-[200px]"
          />
          <div style={{ minWidth: '140px' }}>
            <CustomSelect value={newCategory} onChange={setNewCategory} options={CATEGORY_OPTIONS} />
          </div>
          <button onClick={handleStart} disabled={isPending} className="btn-primary flex items-center gap-2">
            <Play className="w-3.5 h-3.5" /> Start
          </button>
        </div>
      )}

      {/* Manual Entry Toggle */}
      <div className="mb-4">
        {!manualOpen ? (
          <button onClick={() => setManualOpen(true)} className="btn-secondary text-sm flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> Log time manually
          </button>
        ) : (
          <form action={manualAction} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
            <input type="hidden" name="jobId" value={jobId} />
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Log time manually</span>
              <button type="button" onClick={() => setManualOpen(false)} className="btn-icon"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="field-label">Date</label>
                <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} className="field-input text-sm" />
              </div>
              <div>
                <label className="field-label">Hours</label>
                <input type="number" name="hours" min={0} defaultValue={0} className="field-input text-sm" />
              </div>
              <div>
                <label className="field-label">Minutes</label>
                <input type="number" name="minutes" min={0} max={59} defaultValue={30} className="field-input text-sm" />
              </div>
              <div>
                <label className="field-label">Category</label>
                <select name="category" defaultValue="general" className="field-input text-sm">
                  {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="field-label">Description</label>
              <input name="description" placeholder="Optional note..." className="field-input text-sm" />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" name="billable" defaultChecked /> Billable
              </label>
              <div className="flex gap-2">
                {manualState?.error && <span className="text-xs" style={{ color: 'var(--danger)' }}>{manualState.error}</span>}
                <button type="submit" disabled={manualPending} className="btn-primary">{manualPending ? '...' : 'Save entry'}</button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Entries grouped by day */}
      {groups.size === 0 && !running ? (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No time logged yet. Start the timer or add an entry manually.</p>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([day, dayEntries]) => {
            const daySeconds = dayEntries.reduce((s, e) => s + (e.durationSeconds || 0), 0)
            return (
              <div key={day}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{formatDate(day)}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDuration(daySeconds)}</span>
                </div>
                <div className="space-y-1">
                  {dayEntries.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      jobHourlyRate={hourlyRate}
                      isEditing={editingId === e.id}
                      editDescription={editDescription}
                      editCategory={editCategory}
                      editHours={editHours}
                      editMinutes={editMinutes}
                      editBillable={editBillable}
                      onEditDescription={setEditDescription}
                      onEditCategory={setEditCategory}
                      onEditHours={setEditHours}
                      onEditMinutes={setEditMinutes}
                      onEditBillable={setEditBillable}
                      onBeginEdit={() => beginEdit(e)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={saveEdit}
                      onDelete={() => handleDelete(e.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="text-base font-semibold tabular-nums" style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function EntryRow({
  entry,
  jobHourlyRate,
  isEditing,
  editDescription,
  editCategory,
  editHours,
  editMinutes,
  editBillable,
  onEditDescription,
  onEditCategory,
  onEditHours,
  onEditMinutes,
  onEditBillable,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  entry: TimeEntry
  jobHourlyRate: number
  isEditing: boolean
  editDescription: string
  editCategory: string
  editHours: number
  editMinutes: number
  editBillable: boolean
  onEditDescription: (v: string) => void
  onEditCategory: (v: string) => void
  onEditHours: (v: number) => void
  onEditMinutes: (v: number) => void
  onEditBillable: (v: boolean) => void
  onBeginEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: () => void
}) {
  const duration = entry.durationSeconds || 0
  const rate = entry.hourlyRate ?? jobHourlyRate
  const value = entry.billable ? (duration / 3600) * rate : 0

  if (isEditing) {
    return (
      <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          <input type="number" min={0} value={editHours} onChange={(ev) => onEditHours(parseInt(ev.target.value) || 0)} className="field-input text-sm" placeholder="Hours" />
          <input type="number" min={0} max={59} value={editMinutes} onChange={(ev) => onEditMinutes(parseInt(ev.target.value) || 0)} className="field-input text-sm" placeholder="Min" />
          <select value={editCategory} onChange={(ev) => onEditCategory(ev.target.value)} className="field-input text-sm">
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={editBillable} onChange={(ev) => onEditBillable(ev.target.checked)} /> Billable
          </label>
        </div>
        <input value={editDescription} onChange={(ev) => onEditDescription(ev.target.value)} placeholder="Description" className="field-input text-sm mb-2" />
        <div className="flex justify-end gap-2">
          <button onClick={onCancelEdit} className="btn-secondary text-sm flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
          <button onClick={onSaveEdit} className="btn-primary text-sm flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Save</button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <div className="text-sm font-mono tabular-nums" style={{ color: 'var(--text-primary)', minWidth: '70px' }}>
        {formatDuration(duration)}
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}>
        {CATEGORY_LABELS[entry.category] || entry.category}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate" style={{ color: entry.description ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          {entry.description || '—'}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {new Date(entry.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {entry.endedAt && ` – ${new Date(entry.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      </div>
      {entry.billable ? (
        <div className="text-sm tabular-nums" style={{ color: 'var(--accent)' }}>{formatNZD(value)}</div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>non-billable</span>
      )}
      <button onClick={onBeginEdit} className="btn-icon" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
      <button onClick={onDelete} className="btn-icon" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  )
}
