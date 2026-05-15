'use client'

import { Send, MailOpen } from 'lucide-react'

type ParsedDraft = {
  to: string
  subject: string
  body: string
}

function mailtoUrl({ to, subject, body }: ParsedDraft) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export default function OutreachActions({
  drafts,
  mode,
}: {
  drafts: ParsedDraft[]
  mode: 'single' | 'all'
}) {
  if (mode === 'single') {
    const draft = drafts[0]
    return (
      <a
        href={mailtoUrl(draft)}
        className="btn-ghost text-sm inline-flex items-center gap-1.5"
      >
        <Send className="w-3.5 h-3.5" />
        Open in Mail
      </a>
    )
  }

  function openAll() {
    drafts.forEach((draft, i) => {
      setTimeout(() => {
        window.location.href = mailtoUrl(draft)
      }, i * 300)
    })
  }

  return (
    <button onClick={openAll} className="btn-primary inline-flex items-center gap-2">
      <MailOpen className="w-4 h-4" />
      Open All in Mail ({drafts.length})
    </button>
  )
}
