'use client'

import { useActionState, useState } from 'react'
import { createGear, updateGear, deleteGear } from '@/app/actions/gear'
import { formatNZD, statusLabel, statusBadgeClass } from '@/lib/format'
import Link from 'next/link'
import { Camera, Plus, X, Trash2, Edit2 } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'

const CATEGORIES = ['all', 'camera', 'lens', 'audio', 'lighting', 'accessories', 'other']
const STATUSES = ['all', 'available', 'out_on_shoot', 'in_service', 'retired']
const CAT_LABELS: Record<string, string> = { camera: 'Camera', lens: 'Lens', audio: 'Audio', lighting: 'Lighting', accessories: 'Accessories', other: 'Other' }

type GearItem = {
  id: string
  name: string
  category: string | null
  status: string
  purchaseValue: number | null
  insuranceValue: number | null
  serialNumber: string | null
  notes: string | null
}

export default function GearView({ gear, category, status }: { gear: GearItem[]; category: string; status: string }) {
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<GearItem | null>(null)
  const [createState, createAction, createPending] = useActionState(createGear, undefined)
  const [updateState, updateAction, updatePending] = useActionState(updateGear, undefined)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Gear & Equipment</h1>
        <button onClick={() => { setEditItem(null); setShowModal(true) }} className="btn-primary w-fit">
          <Plus className="w-4 h-4" /> Add Gear
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/dashboard/gear?category=${c}${status !== 'all' ? `&status=${status}` : ''}`}
            className="btn-secondary text-sm"
            style={category === c ? { background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
          >
            {c === 'all' ? 'All' : CAT_LABELS[c] || c}
          </Link>
        ))}
        <div className="w-px mx-1" style={{ background: 'var(--bg-border)' }} />
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/dashboard/gear?status=${s}${category !== 'all' ? `&category=${category}` : ''}`}
            className="btn-secondary text-sm"
            style={status === s ? { background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
          >
            {s === 'all' ? 'All Status' : statusLabel(s)}
          </Link>
        ))}
      </div>

      {/* Totals summary */}
      {gear.length > 0 && (() => {
        const totalPurchase = gear.reduce((s, g) => s + (g.purchaseValue || 0), 0)
        const totalInsurance = gear.reduce((s, g) => s + (g.insuranceValue || 0), 0)
        const activeGear = gear.filter((g) => g.status !== 'retired')
        return (
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center py-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Total Items</p>
              <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{gear.length}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{activeGear.length} active</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Purchase Value</p>
              <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{formatNZD(totalPurchase)}</p>
            </div>
            <div className="card text-center py-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Insurance Value</p>
              <p className="text-xl font-semibold" style={{ color: 'var(--accent)' }}>{formatNZD(totalInsurance)}</p>
            </div>
          </div>
        )
      })()}

      {/* Grid */}
      {gear.length === 0 ? (
        <div className="empty-state card">
          <Camera className="w-10 h-10 empty-icon" />
          <p className="empty-title">No gear found</p>
          <p className="empty-description">Add your first piece of equipment to start tracking.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {gear.map((g) => (
            <div key={g.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{g.name}</h3>
                  {g.category && <span className="badge badge-muted mt-1">{CAT_LABELS[g.category] || g.category}</span>}
                </div>
                <span className={`badge ${statusBadgeClass(g.status)}`}>{statusLabel(g.status)}</span>
              </div>
              <div className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {g.purchaseValue && <p>Purchase: {formatNZD(g.purchaseValue)}</p>}
                {g.insuranceValue && <p>Insurance: {formatNZD(g.insuranceValue)}</p>}
                {g.serialNumber && <p className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>S/N: {g.serialNumber}</p>}
              </div>
              <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--bg-border)' }}>
                <button onClick={() => { setEditItem(g); setShowModal(true) }} className="btn-icon"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => { if (confirm('Delete this item?')) deleteGear(g.id) }} className="btn-icon"><Trash2 className="w-4 h-4" style={{ color: 'var(--danger)' }} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{editItem ? 'Edit Gear' : 'Add Gear'}</h3>
              <button onClick={() => setShowModal(false)} className="btn-icon"><X className="w-5 h-5" /></button>
            </div>
            <form action={editItem ? updateAction : createAction} className="space-y-4">
              {editItem && <input type="hidden" name="gearId" value={editItem.id} />}
              <div>
                <label className="field-label">Name *</label>
                <input name="name" required defaultValue={editItem?.name || ''} className="field-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Category</label>
                  <CustomSelect
                    name="category"
                    defaultValue={editItem?.category || ''}
                    placeholder="Select..."
                    options={[{ value: '', label: 'Select...' }, ...CATEGORIES.filter((c) => c !== 'all').map((c) => ({ value: c, label: CAT_LABELS[c] }))]}
                  />
                </div>
                {editItem && (
                  <div>
                    <label className="field-label">Status</label>
                    <CustomSelect
                      name="status"
                      defaultValue={editItem.status}
                      options={STATUSES.filter((s) => s !== 'all').map((s) => ({ value: s, label: statusLabel(s) }))}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Purchase Value (NZD)</label>
                  <input name="purchaseValue" type="number" step="0.01" defaultValue={editItem?.purchaseValue || ''} className="field-input" />
                </div>
                <div>
                  <label className="field-label">Insurance Value (NZD)</label>
                  <input name="insuranceValue" type="number" step="0.01" defaultValue={editItem?.insuranceValue || ''} className="field-input" />
                </div>
              </div>
              <div>
                <label className="field-label">Serial Number</label>
                <input name="serialNumber" defaultValue={editItem?.serialNumber || ''} className="field-input" />
              </div>
              <div>
                <label className="field-label">Notes</label>
                <textarea name="notes" rows={2} defaultValue={editItem?.notes || ''} className="field-input" />
              </div>
              {(createState?.error || updateState?.error) && <p className="text-sm" style={{ color: 'var(--danger)' }}>{createState?.error || updateState?.error}</p>}
              <button type="submit" disabled={createPending || updatePending} className="btn-primary w-full">
                {(createPending || updatePending) ? 'Saving...' : editItem ? 'Update Gear' : 'Add Gear'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
