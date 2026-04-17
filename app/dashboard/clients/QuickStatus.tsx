'use client'

import { useEffect, useRef, useState, useTransition, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { updateClientStatus } from '@/app/actions/clients'
import { statusLabel, statusBadgeClass } from '@/lib/format'

const OPTIONS = ['active', 'lead', 'past', 'archived']

export default function QuickStatus({ clientId, status }: { clientId: string; status: string }) {
  const [current, setCurrent] = useState(status)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setCurrent(status) }, [status])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.right - 160 })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(next: string) {
    setOpen(false)
    if (next === current) return
    const prev = current
    setCurrent(next)
    startTransition(async () => {
      const res = await updateClientStatus(clientId, next)
      if (res && 'error' in res) setCurrent(prev)
    })
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        className={`badge ${statusBadgeClass(current)}`}
        style={{ cursor: 'pointer', opacity: pending ? 0.6 : 1 }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Click to change status"
      >
        {statusLabel(current)}
      </button>

      {open && pos && mounted && createPortal(
        <div
          ref={menuRef}
          className="custom-select-menu"
          role="listbox"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 160, zIndex: 1000 }}
        >
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {OPTIONS.map((o) => {
              const isSel = o === current
              return (
                <button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); choose(o) }}
                  className="custom-select-option"
                  data-selected={isSel}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>{statusLabel(o)}</span>
                  {isSel && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
