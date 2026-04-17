'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export type Option = { value: string; label: string; group?: string }

type Props = {
  // Form mode
  name?: string
  defaultValue?: string
  required?: boolean
  // Controlled mode
  value?: string
  onChange?: (value: string) => void
  // Common
  options: Option[]
  placeholder?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  searchable?: boolean
}

export default function CustomSelect({
  name,
  defaultValue,
  required,
  value: controlledValue,
  onChange,
  options,
  placeholder = 'Select...',
  disabled,
  className = '',
  style,
  searchable,
}: Props) {
  const [open, setOpen] = useState(false)
  const [internal, setInternal] = useState(defaultValue ?? '')
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const isControlled = controlledValue !== undefined

  useEffect(() => { setMounted(true) }, [])
  const value = isControlled ? controlledValue : internal

  const wrapperRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (
        wrapperRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) { setMenuPos(null); return }
    if (!btnRef.current) return
    function position() {
      const r = btnRef.current!.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom
      const spaceAbove = r.top
      const menuH = Math.min(280, options.length * 36 + 24)
      const openUp = spaceBelow < menuH && spaceAbove > spaceBelow
      setMenuPos({
        top: openUp ? r.top - menuH - 4 : r.bottom + 4,
        left: r.left,
        width: r.width,
      })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (open && searchable) setTimeout(() => searchRef.current?.focus(), 10)
  }, [open, searchable])

  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const selected = options.find((o) => o.value === value)

  function select(v: string) {
    if (!isControlled) setInternal(v)
    onChange?.(v)
    setOpen(false)
    setQuery('')
    btnRef.current?.focus()
  }

  function onButtonKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      const curIdx = filtered.findIndex((o) => o.value === value)
      setActiveIdx(curIdx >= 0 ? curIdx : 0)
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[activeIdx]
      if (opt) select(opt.value)
    }
  }

  return (
    <div ref={wrapperRef} className={`custom-select ${className}`} style={{ position: 'relative', ...style }}>
      {name && (
        <input type="hidden" name={name} value={value} required={required} />
      )}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onButtonKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="custom-select-trigger"
      >
        <span className={selected ? 'custom-select-value' : 'custom-select-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease' }} />
      </button>

      {open && menuPos && mounted && createPortal(
        <div
          ref={menuRef}
          className="custom-select-menu"
          role="listbox"
          onKeyDown={onListKey}
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 1000,
          }}
        >
          {searchable && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-border)' }}>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
                placeholder="Search..."
                className="custom-select-search"
              />
            </div>
          )}
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-tertiary)' }}>No matches</div>
            ) : (
              filtered.map((opt, i) => {
                const isSel = opt.value === value
                const isActive = i === activeIdx
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className="custom-select-option"
                    data-active={isActive}
                    data-selected={isSel}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>{opt.label}</span>
                    {isSel && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
