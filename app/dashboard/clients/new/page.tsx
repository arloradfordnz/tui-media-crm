'use client'

import { useActionState } from 'react'
import { createClient } from '@/app/actions/clients'
import { statusLabel } from '@/lib/format'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'
import DatePicker from '@/components/DatePicker'
import Field from '@/components/Field'
import { CLIENT_CATEGORIES, INDUSTRIES, BRANDS } from '@/lib/client-fields'

const LEAD_SOURCES = ['Referral', 'Website Application', 'Website', 'Social Media', 'Google', 'Word of Mouth', 'Other']
const PIPELINE_STAGES = ['enquiry', 'discovery', 'proposal', 'negotiation', 'won']
const STATUSES = ['lead', 'active', 'past', 'archived']

export default function NewClientPage() {
  const [state, action, pending] = useActionState(createClient, undefined)

  return (
    <div>
      {/* The standard page header, not a hand-rolled one. These two pages
          stacked the back link, the title and the form in a `space-y-6`, so
          the title had 24px under it against the 40px every other page gives
          its heading, and the form card read as if it were welded to it. */}
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/dashboard/clients" className="page-back">
            <ArrowLeft className="w-4 h-4" /> Back to Clients
          </Link>
          <h1 className="page-title">New Client</h1>
        </div>
      </div>

      <form action={action} className="card space-y-5">
        {/* Not nested in the Industry Field: Field takes a single child, and a
            datalist is referenced by id from anywhere in the document. */}
        <datalist id="industry-options">
          {INDUSTRIES.map((i) => <option key={i} value={i} />)}
        </datalist>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Client / Business Name *">
            <input name="name" required className="field-input" placeholder="Acme Co. or full name" />
      </Field>
          <Field label="Key Contact Person">
            <input name="contactPerson" className="field-input" placeholder="Jane Smith" />
      </Field>
          <Field label="Email">
            <input name="email" type="email" className="field-input" placeholder="email@example.com" />
      </Field>
          <Field label="Phone">
            <input name="phone" className="field-input" placeholder="+64..." />
      </Field>
          <Field label="Location">
            <input name="location" className="field-input" placeholder="City, NZ" />
      </Field>
          <Field label="Lead Source">
            <CustomSelect
              name="leadSource"
              placeholder="Select..."
              options={[{ value: '', label: 'Select...' }, ...LEAD_SOURCES.map((s) => ({ value: s, label: s }))]}
            />
      </Field>
          <Field label="First Contact">
            <DatePicker name="firstContact" className="field-input" />
      </Field>
          <Field label="Pipeline Stage">
            <CustomSelect
              name="pipelineStage"
              defaultValue="enquiry"
              options={PIPELINE_STAGES.map((s) => ({ value: s, label: statusLabel(s) }))}
            />
      </Field>
          <Field label="Status">
            <CustomSelect
              name="status"
              defaultValue="lead"
              options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
            />
      </Field>
          <Field label="Client Type">
            <CustomSelect
              name="clientCategory"
              defaultValue="video_ads"
              options={[{ value: '', label: 'Select...' }, ...CLIENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]}
            />
      </Field>
          {/* Free text with suggestions — see INDUSTRIES in lib/client-fields.ts
              for why this isn't a locked-down select. */}
          <Field label="Industry">
            <input name="industry" list="industry-options" className="field-input" placeholder="Construction, marine, tourism..." />
      </Field>
          <Field label="Brand">
            <CustomSelect
              name="brand"
              defaultValue="tui_media"
              options={BRANDS.map((b) => ({ value: b.value, label: b.label }))}
            />
      </Field>
          <Field label="Monthly Retainer">
            <input name="monthlyRetainer" type="number" min="0" step="0.01" className="field-input" placeholder="e.g. 480 — leave blank if not a retainer" />
      </Field>
        </div>

        <Field label="Tags">
          <input name="tags" className="field-input" placeholder="Wedding, Referral, Corporate (comma-separated)" />
      </Field>

        <Field label="Notes">
          <textarea name="notes" rows={3} className="field-input" placeholder="Private notes..." />
      </Field>

        {state?.error && (
          <div className="alert alert-danger">
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
