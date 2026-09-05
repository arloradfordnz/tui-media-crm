'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { useMounted } from '@/lib/useMounted'

// The last of the window.* dialogs to go.
//
// ConfirmSheet replaced confirm(); this replaces alert(), which was still
// reporting the three failures that can actually happen mid-task: a client
// that would not delete, and an upload that fell over. A native alert blocks
// the whole page on an OS dialog with the bare domain in its title bar, and it
// arrives having thrown away whatever the user was doing.
//
// Errors do NOT auto-dismiss. A message you might have missed is not a message.

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: number; tone: ToastTone; title: string; detail?: string }

const ToastContext = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null)

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast must be used inside ToastProvider')
  return push
}

const AUTO_DISMISS: Record<ToastTone, number | null> = {
  success: 4000,
  info: 6000,
  // Something went wrong and the user has to decide what to do about it.
  error: null,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const mounted = useMounted()

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++
    setToasts((list) => [...list, { ...t, id }])
    const ms = AUTO_DISMISS[t.tone]
    if (ms != null) setTimeout(() => dismiss(id), ms)
  }, [dismiss])

  // Stable identity so every consumer below does not re-render on each toast.
  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && toasts.length > 0 && createPortal(
        <div className="toast-stack" role="region" aria-label="Notifications">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast toast-${t.tone}`}
              // Errors interrupt a screen reader; the quieter tones wait their turn.
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              <span className="toast-icon">
                {t.tone === 'success' ? <Check /> : t.tone === 'error' ? <AlertTriangle /> : <Info />}
              </span>
              <div className="toast-body">
                <p className="toast-title">{t.title}</p>
                {t.detail && <p className="toast-detail">{t.detail}</p>}
              </div>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
