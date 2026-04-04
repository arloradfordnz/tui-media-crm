'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('tui-theme')
    setIsDark(saved !== 'light')
  }, [])

  function toggle() {
    const root = document.documentElement
    if (isDark) {
      root.classList.remove('dark')
      root.classList.add('light')
      localStorage.setItem('tui-theme', 'light')
      setIsDark(false)
    } else {
      root.classList.remove('light')
      root.classList.add('dark')
      localStorage.setItem('tui-theme', 'dark')
      setIsDark(true)
    }
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-muted hover:text-fg hover:bg-bg-hover transition-colors text-sm w-full ${className}`}
      style={{ '--bg-hover': 'var(--bg-hover)' } as React.CSSProperties}
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 shrink-0" />
          <span>Light mode</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 shrink-0" />
          <span>Dark mode</span>
        </>
      )}
    </button>
  )
}
