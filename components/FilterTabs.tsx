'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'
import CustomSelect from './CustomSelect'

export type FilterOption = { value: string; label: string }

export default function FilterTabs({
  options,
  paramName = 'status',
  defaultValue,
}: {
  options: FilterOption[]
  paramName?: string
  defaultValue?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get(paramName) ?? defaultValue ?? options[0]?.value
  const [optimistic, setOptimistic] = useState(current)
  const [pending, startTransition] = useTransition()

  useEffect(() => { setOptimistic(current) }, [current])

  function onSelect(value: string) {
    if (value === optimistic) return
    setOptimistic(value)
    const next = new URLSearchParams(params.toString())
    if (defaultValue !== undefined && value === defaultValue) {
      next.delete(paramName)
    } else {
      next.set(paramName, value)
    }
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <div style={{ opacity: pending ? 0.7 : 1, transition: 'opacity 100ms ease' }}>
      {/* Mobile: dropdown */}
      <div className="sm:hidden w-full">
        <CustomSelect
          value={optimistic}
          onChange={onSelect}
          options={options}
        />
      </div>
      {/* Desktop: button row */}
      <div className="hidden sm:flex gap-2">
        {options.map((o) => {
          const active = o.value === optimistic
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSelect(o.value)}
              className="btn-secondary text-sm"
              style={active ? { background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
