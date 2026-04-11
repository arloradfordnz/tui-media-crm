'use client'

import { useActionState, useState } from 'react'
import { createDocument } from '@/app/actions/documents'
import { Plus, X } from 'lucide-react'

const DOC_TYPES = ['contract', 'callsheet', 'shotlist', 'questionnaire']

type ClientOption = { id: string; name: string }

export default function NewDocButton({ clients, defaultClientId }: { clients: ClientOption[]; defaultClientId?: string }) {
  const [showModal, setShowModal] = useState(false)
  const [state, action, pending] = useActionState(createDocument, undefined)

  return (
    <>
      <button onClick={() => setShowModal(true)} className="btn-primary">
        <Plus className="w-4 h-4" /> New Template
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>New Document</h3>
              <button onClick={() => setShowModal(false)} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <form action={action} className="space-y-4">
              <div>
                <label className="field-label">Name *</label>
                <input name="name" required className="field-input" placeholder="e.g. Wedding Contract Template" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Type</label>
                  <select name="docType" className="field-input">
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Client</label>
                  <select name="clientId" defaultValue={defaultClientId || ''} className="field-input">
                    <option value="">None (Template)</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              {state?.error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{state.error}</p>}
              <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? 'Creating...' : 'Create'}</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
