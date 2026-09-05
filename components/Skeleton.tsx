// Loading placeholders that mirror the page they stand in for.
//
// The old ones did not: the dashboard's showed five stat cards in a grid and a
// three-column content area, and the real page has a greeting, two lists and a
// chat panel. A skeleton that does not match is worse than none, because the
// layout visibly rearranges itself the moment the data lands.
//
// Rule for anything added here: build the skeleton by looking at the page, and
// give every block the real element's height so nothing shifts on swap.

export function Line({ w = '100%', h = 12, r }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: r ?? Math.min(h / 2, 8) }}
      aria-hidden="true"
    />
  )
}

/** The title, its supporting line, and the action buttons beside them. */
export function PageHeader({
  subtitle = false,
  actions = 0,
}: {
  subtitle?: boolean
  actions?: number
}) {
  return (
    <div className="page-header">
      <div className="page-header-left">
        <Line w={180} h={28} />
        {subtitle && <div style={{ marginTop: 10 }}><Line w={260} h={14} /></div>}
      </div>
      {actions > 0 && (
        <div className="page-header-actions">
          {Array.from({ length: actions }).map((_, i) => (
            <Line key={i} w={i === 0 ? 150 : 120} h={44} r={999} />
          ))}
        </div>
      )}
    </div>
  )
}

/** The filter tab strip. */
export function Tabs({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-5" style={{ paddingBottom: 10, borderBottom: '1px solid var(--bg-border)', marginBottom: 24 }}>
      {Array.from({ length: count }).map((_, i) => <Line key={i} w={54} h={14} />)}
    </div>
  )
}

/**
 * Rows in a .card-flush list. Two lines each, because every record table in
 * this app reflows to a name over a run of supporting facts.
 */
export function Rows({ count = 5, trailing = true }: { count?: number; trailing?: boolean }) {
  return (
    <div className="card-flush">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4"
          style={{
            paddingTop: 18,
            paddingBottom: 18,
            borderBottom: i === count - 1 ? 'none' : '1px solid var(--bg-border)',
          }}
        >
          <div className="flex-1 space-y-2" style={{ minWidth: 0 }}>
            <Line w={`${52 - i * 4}%`} h={14} />
            <Line w={`${34 - i * 3}%`} h={11} />
          </div>
          {trailing && <Line w={72} h={24} r={999} />}
        </div>
      ))}
    </div>
  )
}

/** A section heading above a block. */
export function Heading({ w = 96 }: { w?: number }) {
  return <div style={{ marginBottom: 10 }}><Line w={w} h={13} /></div>
}
