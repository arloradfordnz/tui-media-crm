'use client'

import { useActionState } from 'react'
import { createClient } from '@/app/actions/clients'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const LEAD_SOURCES = ['Referral', 'Website', 'Social Media', 'Google', 'Word of Mouth', 'Other']
const PIPELINE_STAGES = ['enquiry', 'discovery', 'proposal', 'contract', 'booked']
const STATUSES = ['lead', 'active']

export default function NewClientPage() {
  const [state, action, pending] = useActionState(createClient, undefined)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </Link>

      <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>New Client</h1>

      <form action={action} className="card space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Name *</label>
            <input name="name" required className="field-input" placeholder="Full name" />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input name="email" type="email" className="field-input" placeholder="email@example.com" />
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input name="phone" className="field-input" placeholder="+64..." />
          </div>
          <div>
            <label className="field-label">Location</label>
            <input name="location" className="field-input" placeholder="City, NZ" />
          </div>
          <div>
            <label className="field-label">Lead Source</label>
            <select name="leadSource" className="field-input">
              <option value="">Select...</option>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">First Contact</label>
            <input name="firstContact" type="date" className="field-input" />
          </div>
          <div>
            <label className="field-label">Pipeline Stage</label>
            <select name="pipelineStage" defaultValue="enquiry" className="field-input">
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Status</label>
            <select name="status" defaultValue="lead" className="field-input">
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="field-label">Tags</label>
          <input name="tags" className="field-input" placeholder="Wedding, Referral, Corporate (comma-separated)" />
        </div>

        <div>
          <label className="field-label">Notes</label>
          <textarea name="notes" rows={3} className="field-input" placeholder="Private notes..." />
        </div>

        {state?.error && (
          <div className="text-sm px-4 py-3 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)' }}>
            {state.error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? 'Creating...' : 'Create Client'}
          </button>
          <Link href="/dashboard/clients" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
