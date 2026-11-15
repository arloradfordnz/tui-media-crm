'use client'

import { useState, useTransition } from 'react'
import { Brain, ChevronDown, Trash2, Plus, Check, X } from 'lucide-react'
import { addMemory, updateMemory, deleteMemory } from '@/app/actions/memory'
import { MEMORY_CATEGORIES, type Memory } from '@/lib/ai-memory'

// Settings → Memory: everything the assistant has been told to remember.
//
// Reworked for the phone (November 2026). It used to be every memory in one
// long list with two icon buttons on each row, which on a phone made Settings
// several screens of memory before anything else, and the buttons took a
// quarter of each row. Now:
//   - adding one comes first, because that is the thing you come here to do
//   - each kind of memory is a row that opens, closed to begin with, so the
//     card is a handful of lines until you want to read one
//   - a memory is edited by tapping it; Forget lives inside the edit view, so
//     nothing destructive sits under a scrolling thumb

function savedLabel(m: Memory): string {
  const date = new Date(m.updated_at || m.created_at).toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short',
  })
  const by = m.source === 'arlo' ? 'Added by you' : 'Learned by the assistant'
  return `${by} · ${date}`
}

function MemoryRow({ memory }: { memory: Memory }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(memory.content)
  const [category, setCategory] = useState(memory.category)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const cancel = () => { setEditing(false); setDraft(memory.content); setCategory(memory.category); setError(null) }

  const save = () => start(async () => {
    const res = await updateMemory(memory.id, draft, category)
    if (res.error) setError(res.error)
    else { setError(null); setEditing(false) }
  })

  const remove = () => {
    if (!confirm('Forget this? The assistant will stop knowing it.')) return
    start(async () => {
      const res = await deleteMemory(memory.id)
      if (res.error) setError(res.error)
    })
  }

  if (editing) {
    return (
      <li className="memory-row memory-row-editing">
        <textarea
          className="field-input memory-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={500}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
            if (e.key === 'Escape') cancel()
          }}
        />
        <select className="memory-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kind of memory">
          {MEMORY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div className="memory-edit-bar">
          <button type="button" className="btn-ghost btn-sm memory-forget" disabled={pending} onClick={remove}>
            <Trash2 className="w-3.5 h-3.5" /> Forget
          </button>
          <div className="memory-edit-actions">
            <button type="button" className="btn-ghost btn-sm" onClick={cancel}>
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={pending || !draft.trim()} onClick={save}>
              <Check className="w-3.5 h-3.5" /> {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      </li>
    )
  }

  return (
    <li className="memory-row" style={pending ? { opacity: 0.5 } : undefined}>
      <button type="button" className="memory-body" onClick={() => setEditing(true)} aria-label="Edit this memory">
        <span className="memory-content">{memory.content}</span>
        <span className="memory-meta">
          {memory.clients?.name && <span className="badge badge-accent badge-sm">{memory.clients.name}</span>}
          <span>{savedLabel(memory)}</span>
        </span>
      </button>
      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
    </li>
  )
}

function AddMemory() {
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<string>('workflow')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await addMemory(content, category)
      if (res.error) setError(res.error)
      else { setError(null); setContent('') }
    })
  }

  return (
    <form onSubmit={submit} className="memory-add">
      <input
        className="field-input"
        placeholder="e.g. A reel takes me about an hour to edit"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={500}
        aria-label="Something to remember"
      />
      <div className="memory-add-bar">
        <select className="memory-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kind of memory">
          {MEMORY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button type="submit" className="btn-primary btn-sm" disabled={pending || !content.trim()}>
          <Plus className="w-3.5 h-3.5" /> {pending ? 'Adding…' : 'Remember'}
        </button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  )
}

export default function MemorySettings({ memories }: { memories: Memory[] | null }) {
  const known = new Set<string>(MEMORY_CATEGORIES.map((c) => c.key))
  const groups = [
    ...MEMORY_CATEGORIES.map((c) => ({ ...c, items: (memories ?? []).filter((m) => m.category === c.key) })),
    { key: 'other', label: 'Other', hint: '', items: (memories ?? []).filter((m) => !known.has(m.category)) },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Brain className="w-4 h-4" /> Memory
        </h2>
        {memories && memories.length > 0 && (
          <span className="badge badge-muted badge-sm">{memories.length} {memories.length === 1 ? 'thing' : 'things'}</span>
        )}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        What the assistant knows about how you work. Tell it in chat or add it here. Tap one to change or forget it.
      </p>

      <AddMemory />

      {memories === null ? (
        <p className="text-sm mt-5" style={{ color: 'var(--text-tertiary)' }}>Couldn&apos;t load memory just now.</p>
      ) : groups.length === 0 ? (
        <div className="memory-empty">
          <Brain className="w-5 h-5" />
          <p>Nothing remembered yet.</p>
        </div>
      ) : (
        <div className="memory-groups">
          {groups.map((g) => (
            <details key={g.key} className="memory-group">
              <summary className="memory-group-head">
                <span className="memory-group-title">{g.label}</span>
                <span className="memory-group-count">{g.items.length}</span>
                <ChevronDown className="memory-group-chevron" aria-hidden="true" />
              </summary>
              <ul className="memory-list">
                {g.items.map((m) => <MemoryRow key={m.id} memory={m} />)}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
