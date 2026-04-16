'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { saveEmailTemplate } from '@/app/actions/settings'
import { Mail, ChevronDown, ChevronRight, Check, AlertCircle } from 'lucide-react'

type Template = {
  id: string
  type: string
  subject: string
  body: string
  updated_at: string
}

const TYPE_LABELS: Record<string, string> = {
  welcome: 'Welcome Email',
  proposal: 'Proposal',
  proposal_accepted: 'Proposal Accepted',
  delivery: 'Delivery',
  revision: 'Revision Request',
  approval: 'Approval Confirmation',
}

function TemplateItem({ template }: { template: Template }) {
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [state, action, pending] = useActionState(saveEmailTemplate, undefined)

  return (
    <div style={{ borderBottom: '1px solid var(--bg-border)' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-3 px-1 text-left"
        style={{ color: 'var(--text-primary)' }}
      >
        <span className="text-sm font-medium">{TYPE_LABELS[template.type] || template.type}</span>
        {expanded ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
      </button>

      {expanded && (
        <form action={action} className="space-y-4 pb-4 px-1">
          <input type="hidden" name="type" value={template.type} />

          <div>
            <label className="field-label">Subject</label>
            <input
              name="subject"
              type="text"
              required
              className="field-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Body</label>
            <textarea
              name="body"
              required
              rows={5}
              className="field-input"
              style={{ resize: 'vertical', minHeight: '100px' }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Available variables: {'{{clientName}}'}, {'{{jobName}}'}, {'{{round}}'}, {'{{portalUrl}}'}, {'{{proposalUrl}}'}
            </p>
          </div>

          {state?.error && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
              <AlertCircle className="w-3.5 h-3.5" /> {state.error}
            </p>
          )}
          {state?.success && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
              <Check className="w-3.5 h-3.5" /> Template saved.
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-secondary">
            {pending ? 'Saving...' : 'Save Template'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function EmailTemplatesForm({ templates }: { templates: Template[] }) {
  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> Email Templates</span>
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        Customise the subject and body of automated emails. The greeting, sign-off, and footer are added automatically.
      </p>
      <div>
        {templates.map((template) => (
          <TemplateItem key={template.id} template={template} />
        ))}
      </div>
    </div>
  )
}
