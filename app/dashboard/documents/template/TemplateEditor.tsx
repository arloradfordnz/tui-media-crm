'use client'

import { useState, useTransition } from 'react'
import { Check, RotateCcw, Save } from 'lucide-react'
import Field from '@/components/Field'
import { resetContractTemplate, updateContractTemplate } from '@/app/actions/documents'

export default function TemplateEditor({ initialBody }: { initialBody: string }) {
  const [body, setBody] = useState(initialBody)
  const [saved, setSaved] = useState(initialBody)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updateContractTemplate(body)
      if (result.error) return setError(result.error)
      setSaved(body.trim())
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    })
  }

  function reset() {
    setError(null)
    startTransition(async () => {
      const result = await resetContractTemplate()
      if (result.error) return setError(result.error)
      setBody(result.body)
      setSaved(result.body)
    })
  }

  return (
    <div className="card space-y-5">
      <Field label="Contract wording" hint="# for a section heading, **bold** inside a paragraph. Blank line between paragraphs. No bullet lists.">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="field-input"
          style={{ minHeight: 420 }}
        />
      </Field>
      {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={pending || body.trim() === saved.trim()} className="btn-primary">
          {justSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {pending ? 'Saving...' : justSaved ? 'Saved' : 'Save template'}
        </button>
        <button onClick={reset} disabled={pending} className="btn-secondary">
          <RotateCcw className="w-4 h-4" /> Reset to default
        </button>
      </div>
    </div>
  )
}
