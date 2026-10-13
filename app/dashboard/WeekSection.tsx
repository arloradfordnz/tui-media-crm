'use client'

import { useState, type ReactNode } from 'react'

// "Your week" with its overflow behind a real control. The list is capped so
// the panel does not run the length of the page, and the "+2 more" in the
// heading used to be a label with nothing behind it. It now opens the rest in
// place, and the same control folds them away again.
//
// The rows are rendered on the server and passed in, so this only decides
// which of them show.
export default function WeekSection({
  rows,
  extra,
  empty,
}: {
  rows: ReactNode
  extra: ReactNode[]
  empty: ReactNode | null
}) {
  const [open, setOpen] = useState(false)
  const more = extra.length

  return (
    <section className="today-week">
      <div className="section-head">
        <h2 className="section-heading">Your week</h2>
        {more > 0 && (
          <button
            type="button"
            className="section-head-meta section-head-more"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Show less' : `+${more} more`}
          </button>
        )}
      </div>

      {empty ?? (
        <div className="card-flush">
          {rows}
          {open && extra}
        </div>
      )}
    </section>
  )
}
