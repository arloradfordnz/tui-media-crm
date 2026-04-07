'use client'

import { useState, useEffect } from 'react'
import { Pencil, Save, Building2, DollarSign, Target, MessageSquare, Palette, HelpCircle } from 'lucide-react'

const SECTIONS = [
  { key: 'about', label: 'About Tui Media', icon: Building2 },
  { key: 'pricing', label: 'Pricing Structure', icon: DollarSign },
  { key: 'sales_pitch', label: 'Sales Pitch & Key Selling Points', icon: Target },
  { key: 'target_clients', label: 'Target Clients & Ideal Customer', icon: Target },
  { key: 'faq', label: 'Frequently Asked Questions', icon: HelpCircle },
  { key: 'brand_guidelines', label: 'Brand Guidelines & Tone of Voice', icon: Palette },
]

export default function BusinessInfoView() {
  const [data, setData] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/business-info')
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {}
        for (const s of d.sections) map[s.section] = s.content
        setData(map)
        setLoaded(true)
      })
  }, [])

  async function handleSave(section: string) {
    setSaving(true)
    await fetch('/api/business-info', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, content: editContent }),
    })
    setData((prev) => ({ ...prev, [section]: editContent }))
    setEditing(null)
    setSaving(false)
  }

  if (!loaded) {
    return <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {SECTIONS.map(({ key, label, icon: Icon }) => {
        const isEditing = editing === key
        const content = isEditing ? editContent : (data[key] || '')

        return (
          <div key={key} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</h3>
              </div>
              {isEditing ? (
                <button onClick={() => handleSave(key)} disabled={saving} className="btn-primary text-xs" style={{ padding: '6px 12px' }}>
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
                </button>
              ) : (
                <button onClick={() => { setEditing(key); setEditContent(data[key] || '') }} className="btn-secondary text-xs" style={{ padding: '6px 12px' }}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={8}
                className="field-input text-sm"
                autoFocus
              />
            ) : content ? (
              <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {content}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No content yet. Click Edit to add.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
