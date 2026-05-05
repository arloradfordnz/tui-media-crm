import { createServerSupabaseClient } from '@/lib/supabase'
import { NotebookPen, Plus, Users, FileText } from 'lucide-react'
import Link from 'next/link'
import { createNote } from '@/app/actions/notes'
import { timeAgo } from '@/lib/format'
import NoteEditor from './NoteEditor'

type Note = {
  id: string
  title: string
  body: string
  kind: 'general' | 'meeting'
  meeting_date: string | null
  attendees: string | null
  created_at: string
  updated_at: string
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ id?: string; kind?: string }> }) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: notes } = await supabase
    .from('notes')
    .select('id, title, body, kind, meeting_date, attendees, created_at, updated_at')
    .order('updated_at', { ascending: false })

  const all = (notes ?? []) as Note[]
  const filterKind = params.kind === 'meeting' || params.kind === 'general' ? params.kind : null
  const filtered = filterKind ? all.filter((n) => n.kind === filterKind) : all
  const selected = params.id ? all.find((n) => n.id === params.id) ?? null : filtered[0] ?? null

  const meetingCount = all.filter((n) => n.kind === 'meeting').length
  const generalCount = all.filter((n) => n.kind === 'general').length

  async function newGeneral() { 'use server'; await createNote('general') }
  async function newMeeting() { 'use server'; await createNote('meeting') }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="stat-icon-bubble">
            <NotebookPen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate" style={{ letterSpacing: '-0.02em' }}>Notes</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {all.length} note{all.length === 1 ? '' : 's'} · {meetingCount} meeting · {generalCount} general
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form action={newMeeting}>
            <button type="submit" className="btn-secondary text-sm">
              <Users className="w-3.5 h-3.5" /> New meeting
            </button>
          </form>
          <form action={newGeneral}>
            <button type="submit" className="btn-primary text-sm">
              <Plus className="w-3.5 h-3.5" /> New note
            </button>
          </form>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <FilterPill href="/dashboard/notes" active={!filterKind} label={`All (${all.length})`} />
        <FilterPill href="/dashboard/notes?kind=meeting" active={filterKind === 'meeting'} label={`Meetings (${meetingCount})`} />
        <FilterPill href="/dashboard/notes?kind=general" active={filterKind === 'general'} label={`General (${generalCount})`} />
      </div>

      {/* Two-column: list + editor */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Note list */}
        <div className="card" style={{ padding: '0.75rem' }}>
          {filtered.length === 0 ? (
            <div className="box-inset text-sm text-center" style={{ color: 'var(--text-tertiary)', padding: '2rem 1rem' }}>
              No notes yet.<br />
              <span className="text-xs">Create one with the buttons above.</span>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((n) => {
                const isActive = selected?.id === n.id
                const preview = (n.body || '').replace(/[#>*_`-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
                return (
                  <Link
                    key={n.id}
                    href={`/dashboard/notes?id=${n.id}${filterKind ? `&kind=${filterKind}` : ''}`}
                    className="block px-3 py-2.5 rounded-xl transition-colors"
                    style={{
                      background: isActive ? 'var(--accent-muted)' : 'transparent',
                      border: isActive ? '1px solid rgba(119,144,237,0.4)' : '1px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {n.kind === 'meeting' ? (
                        <Users className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                      ) : (
                        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                      )}
                      <span className="text-sm font-medium truncate" style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {n.title}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {preview || `Updated ${timeAgo(n.updated_at)}`}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        <div>
          {selected ? (
            <NoteEditor key={selected.id} note={selected} />
          ) : (
            <div className="card flex items-center justify-center" style={{ minHeight: 400 }}>
              <div className="text-center">
                <div className="stat-icon-bubble bubble-lg mx-auto mb-3" style={{ marginInline: 'auto' }}>
                  <NotebookPen className="w-6 h-6" />
                </div>
                <p className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>No note selected</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Pick a note on the left, or create a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={active ? 'btn-ghost btn-ghost-accent' : 'btn-ghost'}
      style={{ pointerEvents: active ? 'none' : undefined }}
    >
      {label}
    </Link>
  )
}
