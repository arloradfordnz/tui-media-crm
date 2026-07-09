'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, MonitorSmartphone } from 'lucide-react'

type Theme = 'system' | 'light' | 'dark'

// Theme switch for the CRM. 'system' (the default) follows the device's
// light/dark mode live; explicit choices are remembered in localStorage and
// read pre-paint in layout.tsx.
export default function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const saved = localStorage.getItem('tui-theme')
    setTheme(saved === 'dark' || saved === 'light' ? saved : 'system')
  }, [])

  function apply(next: Theme) {
    const root = document.documentElement
    const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark', dark)
    root.classList.toggle('light', !dark)
    localStorage.setItem('tui-theme', next)
    setTheme(next)
  }

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'system', label: 'System', icon: MonitorSmartphone },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ]

  return (
    <div className="card">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Appearance</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Choose how Tui Media looks on this device. System follows your device&apos;s light or dark mode.
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
