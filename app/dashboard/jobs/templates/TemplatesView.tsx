'use client'

import { useActionState, useState } from 'react'
import {
  createTemplate, deleteTemplate,
  addTemplateTask, deleteTemplateTask,
  addTemplateDeliverable, deleteTemplateDeliverable,
} from '@/app/actions/templates'
import { Layers, Plus, Trash2, X, ChevronDown, ChevronRight, ClipboardList, Package } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'

const PHASES = ['preshoot', 'shootday', 'postproduction', 'delivery']
const PHASE_LABELS: Record<string, string> = {
  preshoot: 'Pre-Shoot',
  shootday: 'Shoot Day',
  postproduction: 'Post Production',
  delivery: 'Delivery',
}

type TemplateTask = { id: string; phase: string; title: string; sort_order: number }
type TemplateDeliverable = { id: string; title: string; description: string | null; sort_order: number }
type Template = { id: string; job_type: string; name: string; template_tasks: TemplateTask[]; template_deliverables: TemplateDeliverable[] }

function NewTemplateForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createTemplate, undefined)

  return (
    <form action={action} className="card space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Template</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="field-label">Template Name *</label>
          <input name="name" required placeholder="e.g. Wedding Package" className="field-input" />
        </div>
        <div>
          <label className="field-label">Job Type Key *</label>
          <input name="job_type" required placeholder="e.g. wedding" className="field-input" />
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Used when creating a job — lowercase, no spaces</p>
        </div>
      </div>
      {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary text-sm">{pending ? 'Creating...' : 'Create Template'}</button>
        <button type="button" onClick={onDone} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  )
}

function TaskForm({ templateId }: { templateId: string }) {
  const [state, action, pending] = useActionState(addTemplateTask, undefined)
  return (
    <form action={action} className="flex gap-2 mt-3">
      <input type="hidden" name="template_id" value={templateId} />
      <div style={{ width: '160px', flexShrink: 0 }}>
        <CustomSelect
          name="phase"
          required
          defaultValue="preshoot"
          options={PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))}
        />
      </div>
      <input name="title" required placeholder="Task title…" className="field-input text-sm flex-1" />
      <button type="submit" disabled={pending} className="btn-primary text-sm" style={{ padding: '6px 12px' }}>
        <Plus className="w-3.5 h-3.5" />
      </button>
      {state?.error && <p className="text-xs self-center" style={{ color: 'var(--danger)' }}>{state.error}</p>}
    </form>
  )
}

function DeliverableForm({ templateId }: { templateId: string }) {
  const [state, action, pending] = useActionState(addTemplateDeliverable, undefined)
  return (
    <form action={action} className="flex gap-2 mt-3">
      <input type="hidden" name="template_id" value={templateId} />
      <input name="title" required placeholder="Deliverable title…" className="field-input text-sm flex-1" />
      <input name="description" placeholder="Description (optional)" className="field-input text-sm flex-1" />
      <button type="submit" disabled={pending} className="btn-primary text-sm" style={{ padding: '6px 12px' }}>
        <Plus className="w-3.5 h-3.5" />
      </button>
      {state?.error && <p className="text-xs self-center" style={{ color: 'var(--danger)' }}>{state.error}</p>}
    </form>
  )
}

function TemplateCard({ template }: { template: Template }) {
  const [expanded, setExpanded] = useState(false)
  const tasksByPhase = PHASES.map((phase) => ({
    phase,
    tasks: [...template.template_tasks]
      .filter((t) => t.phase === phase)
      .sort((a, b) => a.sort_order - b.sort_order),
  })).filter((g) => g.tasks.length > 0)

  const sortedDeliverables = [...template.template_deliverables].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {expanded
            ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          }
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{template.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              <span className="font-mono">{template.job_type}</span>
              {' · '}{template.template_tasks.length} tasks · {template.template_deliverables.length} deliverables
            </p>
          </div>
        </button>
        <button
          onClick={() => { if (confirm(`Delete "${template.name}"? This cannot be undone.`)) deleteTemplate(template.id) }}
          className="btn-icon"
          title="Delete template"
        >
          <Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} />
        </button>
      </div>

      {expanded && (
        <div className="mt-5 space-y-5" style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '20px' }}>
          {/* Tasks */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Tasks</p>
            </div>
            {tasksByPhase.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No tasks yet.</p>
            )}
            {tasksByPhase.map(({ phase, tasks }) => (
              <div key={phase} className="mb-3">
                <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{PHASE_LABELS[phase]}</p>
                <div className="space-y-1">
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                      <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                      <button onClick={() => deleteTemplateTask(t.id)} className="btn-icon" style={{ opacity: 0.5 }}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <TaskForm templateId={template.id} />
          </div>

          {/* Deliverables */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Deliverables</p>
            </div>
            {sortedDeliverables.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No deliverables yet.</p>
            )}
            <div className="space-y-1">
              {sortedDeliverables.map((d) => (
                <div key={d.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="flex-1">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{d.title}</span>
                    {d.description && <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>{d.description}</span>}
                  </div>
                  <button onClick={() => deleteTemplateDeliverable(d.id)} className="btn-icon" style={{ opacity: 0.5 }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <DeliverableForm templateId={template.id} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function TemplatesView({ templates }: { templates: Template[] }) {
  const [showNew, setShowNew] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Job Templates</h1>
        </div>
        {!showNew && (
          <button onClick={() => setShowNew(true)} className="btn-primary w-fit">
            <Plus className="w-4 h-4" /> New Template
          </button>
        )}
      </div>

      <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Templates auto-populate tasks and deliverables when a new job is created with a matching job type. Click a template to expand and edit its contents.
        </p>
      </div>

      {showNew && <NewTemplateForm onDone={() => setShowNew(false)} />}

      {templates.length === 0 && !showNew ? (
        <div className="card text-center py-16">
          <Layers className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No templates yet</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>Create a template to pre-fill tasks and deliverables when creating jobs.</p>
          <button onClick={() => setShowNew(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => <TemplateCard key={t.id} template={t} />)}
        </div>
      )}
    </div>
  )
}
