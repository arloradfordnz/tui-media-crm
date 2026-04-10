'use client'

import { useState } from 'react'
import { Download, Save } from 'lucide-react'

const TEMPLATES = ['Contract', 'Quote', 'Call Sheet', 'General Document']

export default function PdfGenerator() {
  const [template, setTemplate] = useState('Contract')
  const [form, setForm] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    businessName: 'Tui Media',
    date: new Date().toISOString().split('T')[0],
    jobDescription: '',
    shootDate: '',
    location: '',
    body: '',
  })
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleDownloadPdf() {
    setGenerating(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { default: TuiDocument } = await import('./TuiPdfDocument')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(TuiDocument({ template, form }) as any).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${template.replace(/\s+/g, '_')}_${form.clientName || 'document'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation error:', err)
    }
    setGenerating(false)
  }

  async function handleSaveTemplate() {
    setSaving(true)
    try {
      const res = await fetch('/api/documents/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template} - ${form.clientName || 'Untitled'}`,
          docType: template.toLowerCase().replace(/\s+/g, '_'),
          content: JSON.stringify({ template, form }),
        }),
      })
      if (res.ok) {
        window.location.reload()
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Generate PDF</h2>
        <select value={template} onChange={(e) => setTemplate(e.target.value)} className="field-input" style={{ width: 'auto' }}>
          {TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Client Name</label>
          <input value={form.clientName} onChange={(e) => update('clientName', e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label">Client Email</label>
          <input value={form.clientEmail} onChange={(e) => update('clientEmail', e.target.value)} className="field-input" type="email" />
        </div>
        <div>
          <label className="field-label">Client Phone</label>
          <input value={form.clientPhone} onChange={(e) => update('clientPhone', e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label">Business Name</label>
          <input value={form.businessName} onChange={(e) => update('businessName', e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label">Date</label>
          <input value={form.date} onChange={(e) => update('date', e.target.value)} type="date" className="field-input" />
        </div>
        <div>
          <label className="field-label">Shoot Date</label>
          <input value={form.shootDate} onChange={(e) => update('shootDate', e.target.value)} type="date" className="field-input" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Job Description</label>
          <input value={form.jobDescription} onChange={(e) => update('jobDescription', e.target.value)} className="field-input" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Location</label>
          <input value={form.location} onChange={(e) => update('location', e.target.value)} className="field-input" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Document Content</label>
          <textarea value={form.body} onChange={(e) => update('body', e.target.value)} rows={8} className="field-input" placeholder="Write your document content here..." />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleDownloadPdf} disabled={generating} className="btn-primary">
          <Download className="w-4 h-4" /> {generating ? 'Generating...' : 'Download PDF'}
        </button>
        <button onClick={handleSaveTemplate} disabled={saving} className="btn-secondary">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save as Template'}
        </button>
      </div>
    </div>
  )
}
