'use client'

import { useActionState, useState, useEffect } from 'react'
import { createJob } from '@/app/actions/jobs'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Film, Heart, Building2, PartyPopper, Home, Palette, Video, AlertTriangle } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'
import { statusLabel } from '@/lib/format'

type Client = { id: string; name: string; email: string | null }
type TemplateDeliverable = { title: string; description: string | null }

const JOB_TYPES = [
  { value: 'wedding', label: 'Wedding', icon: Heart },
  { value: 'anniversary', label: 'Anniversary & Couples', icon: Heart },
  { value: 'corporate', label: 'Corporate', icon: Building2 },
  { value: 'event', label: 'Event', icon: PartyPopper },
  { value: 'realestate', label: 'Real Estate', icon: Home },
  { value: 'social_media', label: 'Social Media', icon: Video },
  { value: 'custom', label: 'Custom', icon: Palette },
]

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
  const [deliverables, setDeliverables] = useState<TemplateDeliverable[]>([])

  useEffect(() => {
    fetch('/api/clients').then((r) => r.json()).then(setClients).catch((err) => console.warn('Failed to load clients:', err))
  }, [])

  // Picking a type seeds its default deliverables. This belongs in the click
  // handler, not in an effect watching jobType: an effect made the seeding a
  // second render that also clobbered any edit the user made, since it re-ran
  // whenever jobType was merely re-set to the same value.
  function chooseJobType(value: string) {
    setJobType(value)
    setDeliverables(value === 'social_media' ? [{ title: 'Instagram Reel', description: null }] : [])
  }

  const canNext = () => {
    if (step === 0) return selectedClient && jobName
    if (step === 1) return jobType
    return true
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/jobs" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <h1 className="page-title">New Job</h1>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {['Basics', 'Job Type', 'Review'].map((label, i) => (
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
            <input value={jobName} onChange={(e) => setJobName(e.target.value)} className="field-input" placeholder="e.g. Highlight Film" />
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
              onClick={() => chooseJobType(t.value)}
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

      {/* Step 2: Review */}
      {step === 2 && (
        <form action={action}>
          <input type="hidden" name="name" value={jobName} />
          <input type="hidden" name="clientId" value={selectedClient} />
          <input type="hidden" name="jobType" value={jobType} />
          <input type="hidden" name="shootDate" value={shootDate} />
          <input type="hidden" name="shootLocation" value={shootLocation} />
          <input type="hidden" name="quoteValue" value={quoteValue} />
          <input type="hidden" name="expectedAmount" value={expectedAmount} />
          <input type="hidden" name="expectedPaymentDate" value={expectedPaymentDate} />
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
            {deliverables.length > 0 && (
              <div>
                <p className="label">Deliverables</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {deliverables.map((d, i) => (
                    <span key={i} className="flex items-center gap-1.5 badge badge-accent">
                      <Film className="w-3 h-3" /> {d.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {state?.duplicate ? (
              <div className="space-y-3">
                <div className="alert alert-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    There&apos;s already a job called &ldquo;{state.duplicate.name}&rdquo; for this client ({statusLabel(state.duplicate.status)}).
                    Create another one anyway, or go back and adjust the name?
                  </span>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(0)} className="btn-secondary flex-1">
                    <ArrowLeft className="w-4 h-4" /> Go back and rename
                  </button>
                  <button type="submit" name="confirmDuplicate" value="true" disabled={pending} className="btn-primary flex-1">
                    <Check className="w-4 h-4" /> {pending ? 'Creating...' : 'Create anyway'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {state?.error && (
                  <div className="alert alert-danger">{state.error}</div>
                )}
                <button type="submit" disabled={pending} className="btn-primary w-full">
                  <Check className="w-4 h-4" /> {pending ? 'Creating...' : 'Create Job'}
                </button>
              </>
            )}
          </div>
        </form>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-secondary" style={step === 0 ? { opacity: 0.3 } : {}}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {step < 2 && (
          <button onClick={() => setStep(step + 1)} disabled={!canNext()} className="btn-primary" style={!canNext() ? { opacity: 0.4 } : {}}>
            Next <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
