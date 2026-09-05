'use client'

// Tabs for a record page — one long scroll broken into the questions you
// actually arrive with. Distinct from FilterTabs, which filters a LIST and
// puts its state in the URL: this switches between panels of one record, so
// it is local state and a re-render, not a navigation.
//
// Panels stay mounted and are hidden with CSS rather than unmounted, so a
// half-typed note or an open upload does not vanish because you glanced at
// another tab.

export type RecordTab = { id: string; label: string; count?: number }

export default function RecordTabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: RecordTab[]
  active: string
  onChange: (id: string) => void
  label: string
}) {
  // Left/right arrows move between tabs, which is what a tablist is expected
  // to do and what a row of plain buttons does not.
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    onChange(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <div className="page-tabs page-tabs-scroll" role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`page-tab ${isActive ? 'active' : ''}`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="page-tab-count">{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function RecordPanel({
  id,
  active,
  children,
}: {
  id: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <div
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={!active}
      className="space-y-6"
    >
      {children}
    </div>
  )
}
