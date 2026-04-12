'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useTransition } from 'react'
import { Search } from 'lucide-react'

export default function SearchInput({ basePath, placeholder, paramName = 'search' }: { basePath: string; placeholder: string; paramName?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const defaultValue = searchParams.get(paramName) || ''

  function handleChange(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(paramName, value)
      } else {
        params.delete(paramName)
      }
      startTransition(() => {
        router.push(`${basePath}?${params.toString()}`)
      })
    }, 250)
  }

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
      <input
        defaultValue={defaultValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="search-input"
        style={isPending ? { opacity: 0.7 } : undefined}
      />
    </div>
  )
}
