'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import type { AskQuestion } from '@/lib/tui/receipts'
import { useMounted } from '@/lib/useMounted'

// Tui's questions, answered by tapping.
//
// When Tui needs decisions before it acts (the commercial terms of a contract,
// above all) it calls ask_arlo, and this pops up with one question at a time
// and the options Tui tailored to the deal. Tapping an option only selects it:
// he moves on with Next (and sends with Send answers), so a mis-tap is never
// final. Any question can be answered in his own words instead.
//
// Same sheet as ConfirmSheet: bottom sheet on a phone, centred dialog from
// 640px. Rendered into <body> through a portal, because the chat lives inside
// cards with overflow: hidden and glass surfaces whose backdrop-filter would
// otherwise become the containing block for position: fixed.

export function formatAnswers(questions: AskQuestion[], answers: string[]): string {
  if (questions.length === 1) return answers[0] ?? ''
  return questions
    .map((q, i) => `${q.question.replace(/[?:]\s*$/, '')}: ${answers[i] ?? ''}`)
    .join('\n')
}

export default function AskSheet({
  questions,
  onSubmit,
  onClose,
}: {
  questions: AskQuestion[]
  onSubmit: (answers: string[]) => void
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []))
  const [typed, setTyped] = useState<string[]>(() => questions.map(() => ''))
  const mounted = useMounted()
  const firstOptionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  useEffect(() => { firstOptionRef.current?.focus() }, [step, mounted])

  const q = questions[step]
  const isLast = step === questions.length - 1
  const answerFor = (i: number) => typed[i].trim() || picked[i].join(', ')
  const answered = Boolean(answerFor(step))

  function finish() {
    const answers = questions.map((_, i) => typed[i].trim() || picked[i].join(', '))
    if (answers.some((a) => !a)) {
      setStep(answers.findIndex((a) => !a))
      return
    }
    onSubmit(answers)
  }

  function choose(label: string) {
    const next = picked.map((p) => [...p])
    if (q.multi) {
      next[step] = next[step].includes(label) ? next[step].filter((l) => l !== label) : [...next[step], label]
      setPicked(next)
      return
    }
    next[step] = [label]
    setPicked(next)
    setTyped((t) => t.map((v, i) => (i === step ? '' : v)))
  }

  if (!mounted) return null

  return createPortal(
    <div
      className="confirm-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="confirm-sheet ask-sheet">
        {questions.length > 1 && (
          <div className="ask-progress" aria-label={`Question ${step + 1} of ${questions.length}`}>
            {questions.map((_, i) => (
              <span key={i} className={`ask-progress-bar${i <= step ? ' is-done' : ''}`} />
            ))}
          </div>
        )}
        <p className="ask-kicker">
          Tui needs {questions.length === 1 ? 'an answer' : `${questions.length} answers`}
          {questions.length > 1 ? ` · ${step + 1} of ${questions.length}` : ''}
        </p>
        <h2 id="ask-title" className="confirm-title">{q.question}</h2>
        {q.multi && <p className="ask-hint">Pick any that apply.</p>}

        <div className="ask-options">
          {q.options.map((o, i) => {
            const on = picked[step].includes(o.label) && !typed[step].trim()
            return (
              <button
                key={o.label}
                ref={i === 0 ? firstOptionRef : undefined}
                type="button"
                className={`ask-option${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => choose(o.label)}
              >
                <span className="ask-option-text">
                  <span className="ask-option-label">{o.label}</span>
                  {o.detail && <span className="ask-option-detail">{o.detail}</span>}
                </span>
                <span className="ask-option-tick" aria-hidden="true">{on && <Check className="w-3.5 h-3.5" />}</span>
              </button>
            )
          })}
        </div>

        <input
          className="field-input ask-own"
          placeholder="Or type your own answer"
          value={typed[step]}
          onChange={(e) => setTyped((t) => t.map((v, i) => (i === step ? e.target.value : v)))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typed[step].trim()) {
              e.preventDefault()
              if (isLast) finish()
              else setStep((s) => s + 1)
            }
          }}
        />

        <div className="confirm-actions">
          <button
            type="button"
            className="btn-secondary confirm-cancel"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
          >
            {step === 0 ? 'Later' : 'Back'}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!answered}
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
          >
            {isLast ? 'Send answers' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
