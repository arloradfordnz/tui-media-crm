'use client'

import { useActionState, useState, useEffect } from 'react'
import { createJob } from '@/app/actions/jobs'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Film, Heart, Building2, PartyPopper, Home, Palette } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'

type Client = { id: string; name: string; email: string | null }
type TemplateTask = { phase: string; title: string }
type TemplateDeliverable = { title: string; description: string | null }

const JOB_TYPES = [
  { value: 'wedding', label: 'Wedding', icon: Heart },
  { value: 'anniversary', label: 'Anniversary & Couples', icon: Heart },
  { value: 'corporate', label: 'Corporate', icon: Building2 },
  { value: 'event', label: 'Event', icon: PartyPopper },
  { value: 'realestate', label: 'Real Estate', icon: Home },
  { value: 'custom', label: 'Custom', icon: Palette },
]

const PHASES = ['preshoot', 'shootday', 'postproduction', 'delivery']
const PHASE_LABELS: Record<string, string> = { preshoot: 'Pre-shoot', shootday: 'Shoot Day', postproduction: 'Post-production', delivery: 'Delivery' }

export default function NewJobPage() {
  const [state, action, pending] = useActionState(createJob, undefined)
  const [step, setStep] = useState(0)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [jobType, setJobType] = useState('')
  const [jobName, setJobName] = useState('')
  const [shootDate, setShootDate] = useState('')
  const [shootLocation, setShootLocation] = useState('')
  const [quoteValue, setQuoteValue] = useState('')
  const [expectedAmount, setExpectedAmount] = useState('')
  const [expectedPaymentDate, setExpectedPaymentDate] = useState('')
  const [tasks, setTasks] = useState<TemplateTask[]>([])
  const [deliverables, setDeliverables] = useState<TemplateDeliverable[]>([])

  useEffect(() => {
    fetch('/api/clients').then((r) => r.json()).then(setClients).catch((err) => console.warn('Failed to load clients:', err))
  }, [])

  useEffect(() => {
    if (jobType) {
      fetch(`/api/templates/${jobType}`)
        .then((r) => r.json())
        .then((data) => {
          setTasks(data.tasks || [])
          setDeliverables(data.deliverables || [])
        })
        .catch((err) => console.warn('Failed to load template:', err))
    }
  }, [jobType])

  useEffect(() => {
    const client = clients.find((c) => c.id === selectedClient)
    if (client && jobType) {
      const typeLabel = JOB_TYPES.find((t) => t.value === jobType)?.label || jobType
      setJobName(`${client.name} — ${typeLabel}`)
    }
  }, [selectedClient, jobType, clients])

  const canNext = () => {
    if (step === 0) return selectedClient && jobName
    if (step === 1) return jobType
    return true
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/dashboard/jobs" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>New Job</h1>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {['Basics', 'Job Type', 'Tasks', 'Review'].map((label, i) => (
          <div key={label} className="flex-1">
            <div className="h-1.5 rounded-full mb-2" style={{ background: i <= step ? 'var(--accent)' : 'var(--bg-elevated)' }} />
            <p className="text-xs font-medium" style={{ color: i <= step ? 'var(--accent)' : 'var(--text-tertiary)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Step 0: Basics */}
      {step === 0 && (
        <div className="card space-y-5">
          <div>
            <label className="field-label">Client *</label>
            <CustomSelect
              value={selectedClient}
              onChange={setSelectedClient}
              placeholder="Select a client..."
              searchable
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div>
            <label className="field-label">Job Name *</label>
            <input value={jobName} onChange={(e) => setJobName(e.target.value)} className="field-input" placeholder="e.g. Smith Wedding — Highlight" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Shoot Date</label>
              <DatePicker value={shootDate} onChange={setShootDate} className="field-input" />
            </div>
            <div>
              <label className="field-label">Quote Value (NZD)</label>
              <input type="number" step="0.01" value={quoteValue} onChange={(e) => setQuoteValue(e.target.value)} className="field-input" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="field-label">Shoot Location</label>
            <input value={shootLocation} onChange={(e) => setShootLocation(e.target.value)} className="field-input" placeholder="Venue, City" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Expected Payment (NZD)</label>
              <input type="number" step="0.01" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} className="field-input" placeholder="Defaults to quote" />
            </div>
            <div>
              <label className="field-label">Expected Payment Date</label>
              <DatePicker value={expectedPaymentDate} onChange={setExpectedPaymentDate} className="field-input" />
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Job Type */}
      {step === 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {JOB_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setJobType(t.value)}
              className="card flex flex-col items-center gap-3 py-6 cursor-pointer transition-all"
              style={{
                borderColor: jobType === t.value ? 'var(--accent)' : 'var(--bg-border)',
                background: jobType === t.value ? 'var(--accent-muted)' : 'var(--bg-surface)',
              }}
            >
              <t.icon className="w-8 h-8" style={{ color: jobType === t.value ? 'var(--accent)' : 'var(--text-secondary)' }} />
              <span className="text-sm font-medium" style={{ color: jobType === t.value ? 'var(--accent)' : 'var(--text-primary)' }}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Tasks & Deliverables */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Task Checklist</h3>
            {tasks.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No template tasks. You can add tasks after creating the job.</p>
            ) : (
              PHASES.map((phase) => {
                const phaseTasks = tasks.filter((t) => t.phase === phase)
                if (phaseTasks.length === 0) return null
                return (
                  <div key={phase} className="mb-4">
                    <p className="label mb-2">{PHASE_LABELS[phase]}</p>
                    {phaseTasks.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                        <div className="w-4 h-4 rounded border" style={{ borderColor: 'var(--bg-border)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                        <button onClick={() => setTasks(tasks.filter((_, j) => j !== tasks.indexOf(t)))} className="ml-auto text-xs" style={{ color: 'var(--danger)' }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Deliverables</h3>
            {deliverables.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No template deliverables.</p>
            ) : (
              deliverables.map((d, i) => (
                <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
                  <Film className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <div>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{d.title}</span>
                    {d.description && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{d.description}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <form action={action}>
          <input type="hidden" name="name" value={jobName} />
          <input type="hidden" name="clientId" value={selectedClient} />
          <input type="hidden" name="jobType" value={jobType} />
          <input type="hidden" name="shootDate" value={shootDate} />
          <input type="hidden" name="shootLocation" value={shootLocation} />
          <input type="hidden" name="quoteValue" value={quoteValue} />
          <input type="hidden" name="expectedAmount" value={expectedAmount} />
          <input type="hidden" name="expectedPaymentDate" value={expectedPaymentDate} />
          <input type="hidden" name="tasks" value={JSON.stringify(tasks)} />
          <input type="hidden" name="deliverables" value={JSON.stringify(deliverables)} />

          <div className="card space-y-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Review & Create</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="label">Job Name</p><p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{jobName}</p></div>
              <div><p className="label">Client</p><p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{clients.find((c) => c.id === selectedClient)?.name || '—'}</p></div>
              <div><p className="label">Job Type</p><p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{JOB_TYPES.find((t) => t.value === jobType)?.label || '—'}</p></div>
              <div><p className="label">Shoot Date</p><p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{shootDate || '—'}</p></div>
              <div><p className="label">Location</p><p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{shootLocation || '—'}</p></div>
              <div><p className="label">Quote Value</p><p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{quoteValue ? `$${quoteValue}` : '—'}</p></div>
            </div>
            <div><p className="label">Tasks</p><p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{tasks.length} tasks</p></div>
            <div><p className="label">Deliverables</p><p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{deliverables.length} deliverables</p></div>

            {state?.error && (
              <div className="text-sm px-4 py-3 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>{state.error}</div>
            )}

            <button type="submit" disabled={pending} className="btn-primary w-full">
              <Check className="w-4 h-4" /> {pending ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-secondary" style={step === 0 ? { opacity: 0.3 } : {}}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {step < 3 && (
          <button onClick={() => setStep(step + 1)} disabled={!canNext()} className="btn-primary" style={!canNext() ? { opacity: 0.4 } : {}}>
            Next <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
