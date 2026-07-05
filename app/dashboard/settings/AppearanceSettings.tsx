'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

type Theme = 'light' | 'dark'

// Light/Dark switch for the CRM. Writes <html class> immediately and
// remembers the choice in localStorage (read pre-paint in layout.tsx).
export default function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = localStorage.getItem('tui-theme')
    setTheme(saved === 'dark' ? 'dark' : 'light')
  }, [])

  function apply(next: Theme) {
    const root = document.documentElement
    root.classList.toggle('dark', next === 'dark')
    root.classList.toggle('light', next === 'light')
    localStorage.setItem('tui-theme', next)
    setTheme(next)
  }

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ]

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Appearance</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Choose how Tui Media looks on this device.
      </p>
      <div className="tab-pills" role="radiogroup" aria-label="Theme">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            className={`tab-pill${theme === value ? ' active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => apply(value)}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
