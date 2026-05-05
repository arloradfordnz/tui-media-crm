'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Eye, Pencil, Save, Trash2, Users, FileText, Calendar, Check, User, Lock } from 'lucide-react'
import { renderDocBody } from '@/lib/markdown'
import { updateNote, deleteNote } from '@/app/actions/notes'
import { timeAgo } from '@/lib/format'
import CustomSelect from '@/components/CustomSelect'

type Note = {
  id: string
  title: string
  body: string
  kind: 'general' | 'meeting'
  meeting_date: string | null
  attendees: string | null
  client_id: string | null
  updated_at: string
}

type Client = { id: string; name: string }

export default function NoteEditor({ note, clients }: { note: Note; clients: Client[] }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body || '')
  const [kind, setKind] = useState<'general' | 'meeting'>(note.kind)
  const [meetingDate, setMeetingDate] = useState(note.meeting_date || '')
  const [attendees, setAttendees] = useState(note.attendees || '')
  const [clientId, setClientId] = useState(note.client_id || '')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef({ title, body, kind, meetingDate, attendees, clientId })

  // Debounced auto-save
  useEffect(() => {
    const last = lastSavedRef.current
    if (
      last.title === title &&
      last.body === body &&
      last.kind === kind &&
      last.meetingDate === meetingDate &&
      last.attendees === attendees &&
      last.clientId === clientId
    ) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        await updateNote(note.id, {
          title,
          body,
          kind,
          meeting_date: meetingDate || null,
          attendees: attendees || null,
          client_id: clientId || null,
        })
        lastSavedRef.current = { title, body, kind, meetingDate, attendees, clientId }
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      })
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [title, body, kind, meetingDate, attendees, clientId, note.id])

  function handleDelete() {
    if (!confirm('Delete this note? This cannot be undone.')) return
    startTransition(async () => {
      await deleteNote(note.id)
    })
  }

  return (
    <div className="card">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <KindToggle kind={kind} onChange={setKind} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {pending ? 'Saving…' : saved ? (
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
                <Check className="w-3 h-3" /> Saved
              </span>
            ) : `Updated ${timeAgo(note.updated_at)}`}
          </span>
          <div className="inline-flex rounded-full p-0.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
            <ModePill active={mode === 'edit'} onClick={() => setMode('edit')} icon={Pencil} label="Edit" />
            <ModePill active={mode === 'preview'} onClick={() => setMode('preview')} icon={Eye} label="Preview" />
          </div>
          <button onClick={handleDelete} className="btn-icon" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled"
        className="w-full bg-transparent border-0 outline-none text-2xl font-semibold mb-3"
        style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}
      />

      {/* Client link — admin-only, never visible in client portal */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-3 items-end">
        <div className="box-inset">
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>
            <User className="w-3 h-3 inline mr-1 -mt-0.5" /> Linked client
          </label>
          <CustomSelect
            value={clientId}
            onChange={setClientId}
            placeholder="None"
            searchable
            options={[{ value: '', label: 'None' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <div className="inline-flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-full self-end" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
          <Lock className="w-3 h-3" />
          Admin only · not shown in portal
        </div>
      </div>

      {/* Meeting metadata */}
      {kind === 'meeting' && (
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 mb-4">
          <div className="box-inset">
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>
              <Calendar className="w-3 h-3 inline mr-1 -mt-0.5" /> Date
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full bg-transparent border-0 outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
          <div className="box-inset">
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>
              <Users className="w-3 h-3 inline mr-1 -mt-0.5" /> Attendees
            </label>
            <input
              type="text"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Names, separated by commas"
              className="w-full bg-transparent border-0 outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      )}

      {/* Body */}
      {mode === 'edit' ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === 'meeting'
            ? '# Agenda\n- ...\n\n# Discussion\n\n# Action items\n- [ ] '
            : 'Write your note in markdown…'}
          className="w-full bg-transparent border-0 outline-none resize-none text-sm font-mono leading-relaxed"
          style={{ color: 'var(--text-primary)', minHeight: 400 }}
        />
      ) : (
        <div className="box-inset-lg">
          {body.trim() ? (
            <div className="prose-doc" dangerouslySetInnerHTML={{ __html: renderDocBody(body) }} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nothing to preview yet.</p>
          )}
        </div>
      )}

      {/* Manual save trigger (debounce already handles it, but useful to force) */}
      <div className="flex items-center justify-end mt-4">
        <button
          onClick={() => startTransition(async () => {
            await updateNote(note.id, {
              title, body, kind,
              meeting_date: meetingDate || null,
              attendees: attendees || null,
              client_id: clientId || null,
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 1500)
          })}
          disabled={pending}
          className="btn-ghost btn-ghost-accent"
        >
          <Save className="w-3.5 h-3.5" /> Save now
        </button>
      </div>
    </div>
  )
}

function KindToggle({ kind, onChange }: { kind: 'general' | 'meeting'; onChange: (k: 'general' | 'meeting') => void }) {
  return (
    <div className="inline-flex rounded-full p-0.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
      <button
        onClick={() => onChange('general')}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors`}
        style={{
          color: kind === 'general' ? '#fff' : 'var(--text-secondary)',
          background: kind === 'general' ? 'var(--grad-accent)' : 'transparent',
        }}
      >
        <FileText className="w-3 h-3" /> General
      </button>
      <button
        onClick={() => onChange('meeting')}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors`}
        style={{
          color: kind === 'meeting' ? '#fff' : 'var(--text-secondary)',
          background: kind === 'meeting' ? 'var(--grad-accent)' : 'transparent',
        }}
      >
        <Users className="w-3 h-3" /> Meeting
      </button>
    </div>
  )
}

function ModePill({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors"
      style={{
        color: active ? '#fff' : 'var(--text-secondary)',
        background: active ? 'var(--grad-accent)' : 'transparent',
      }}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  )
}
