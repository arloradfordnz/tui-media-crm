'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  name?: string
  defaultValue?: string
  required?: boolean
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  placeholder?: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function toDisplay(val: string): string {
  if (!val) return ''
  const [y, m, d] = val.split('-')
  if (!y || !m || !d) return ''
  return `${m}/${d}/${y.slice(2)}`
}

function fromYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function DatePicker({
  name, defaultValue, required,
  value: controlledValue, onChange,
  disabled, className = '', style, placeholder = 'MM/DD/YY',
}: Props) {
  const isControlled = controlledValue !== undefined
  const [internal, setInternal] = useState(defaultValue ?? '')
  const value = isControlled ? controlledValue : internal

  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const initDate = value ? new Date(value + 'T00:00:00') : new Date()
  const [viewYear, setViewYear] = useState(initDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initDate.getMonth())

  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [value])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapperRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return }
    if (!btnRef.current) return
    function position() {
      const r = btnRef.current!.getBoundingClientRect()
      const menuH = 290
      const spaceBelow = window.innerHeight - r.bottom
      const openUp = spaceBelow < menuH && r.top > spaceBelow
      setMenuPos({ top: openUp ? r.top - menuH - 4 : r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [open])

  function select(y: number, m: number, d: number) {
    const newVal = fromYMD(y, m, d)
    if (!isControlled) setInternal(newVal)
    onChange?.(newVal)
    setOpen(false)
    btnRef.current?.focus()
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)

  const selectedTs = value ? new Date(value + 'T00:00:00').getTime() : null
  const todayTs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()

  return (
    <div ref={wrapperRef} className={`custom-select ${className}`} style={{ position: 'relative', ...style }}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="custom-select-trigger"
      >
        <span className={value ? 'custom-select-value' : 'custom-select-placeholder'}>
          {value ? toDisplay(value) : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease' }} />
      </button>

      {open && menuPos && mounted && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Date picker"
          className="custom-select-menu"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, zIndex: 1000 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid var(--bg-border)' }}>
            <button type="button" onClick={prevMonth} style={{ padding: '4px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} style={{ padding: '4px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px 8px 4px', gap: 2 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', padding: '2px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px 8px', gap: 2 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />
              const cellTs = new Date(viewYear, viewMonth, day).getTime()
              const isSelected = cellTs === selectedTs
              const isToday = cellTs === todayTs
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => select(viewYear, viewMonth, day)}
                  style={{
                    textAlign: 'center',
                    fontSize: 13,
                    padding: '6px 2px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 600 : isToday ? 500 : 400,
                    background: isSelected ? 'var(--accent)' : 'none',
                    color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-primary)',
                    transition: 'background 80ms',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none' }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
