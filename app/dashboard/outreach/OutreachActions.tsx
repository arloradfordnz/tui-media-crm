'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, MailOpen, Archive, ArchiveRestore } from 'lucide-react'

type ParsedDraft = {
  id: string
  to: string
  subject: string
  body: string
}

function mailtoUrl({ to, subject, body }: ParsedDraft) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

async function setArchived(id: string, unarchive = false) {
  await fetch('/api/outreach/archive', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, unarchive }),
  })
}

export default function OutreachActions({
  drafts,
  mode,
  isArchived = false,
}: {
  drafts: ParsedDraft[]
  mode: 'single' | 'all'
  isArchived?: boolean
}) {
  const router = useRouter()
  const [archiving, setArchiving] = useState(false)

  if (mode === 'single') {
    const draft = drafts[0]

    async function handleArchive() {
      setArchiving(true)
      await setArchived(draft.id, isArchived)
      router.refresh()
    }

    if (isArchived) {
      return (
        <button
          onClick={handleArchive}
          disabled={archiving}
          className="btn-ghost text-sm inline-flex items-center gap-1.5"
        >
          <ArchiveRestore className="w-3.5 h-3.5" />
          {archiving ? 'Restoring…' : 'Unarchive'}
        </button>
      )
    }

    async function handleOpenInMail() {
      window.location.href = mailtoUrl(draft)
      await setArchived(draft.id)
      router.refresh()
    }

    return (
      <div className="inline-flex items-center gap-2">
        <button
          onClick={handleArchive}
          disabled={archiving}
          className="btn-ghost text-sm inline-flex items-center gap-1.5"
          title="Archive"
        >
          <Archive className="w-3.5 h-3.5" />
          {archiving ? '…' : 'Archive'}
        </button>
        <button
          onClick={handleOpenInMail}
          className="btn-ghost text-sm inline-flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          Open in Mail
        </button>
      </div>
    )
  }

  async function openAll() {
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
