import { Clapperboard, CalendarDays, Check } from 'lucide-react'

// What a client sees about their monthly content: how many videos this month,
// how many are delivered, where the month is up to, when the next shoot is,
// and anything still to come from earlier months. Counts come from the same
// backlog as the Retainers page (videos uploaded to the portal), so the client
// and Arlo are always looking at the same number.

export type PortalProgress = {
  nextShoot: { date: string; startTime: string | null } | null
  retainer: {
    videosPerMonth: number
    shootsPerMonth: number | null
    paused: boolean
    currentMonth: { label: string; expected: number; delivered: number; shootsDone: number } | null
    catchUp: { label: string; missing: number; delivered: number; expected: number }[]
    videosOwed: number
  } | null
}

function shootDay(date: string, startTime: string | null): string {
  // Noon UTC keeps the calendar day the same in NZ whatever the offset.
  const d = new Date(`${date}T12:00:00Z`)
  const day = d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' })
  if (!startTime) return day
  const [h, m] = startTime.split(':').map(Number)
  if (Number.isNaN(h)) return day
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
  return `${day}, ${time}`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function ContentProgress({ progress }: { progress: PortalProgress }) {
  const { retainer, nextShoot } = progress
  const month = retainer?.currentMonth ?? null

  // Three stages a month moves through. Delivered wins; any shoot done or
  // video in means editing; otherwise the month is still waiting on a shoot.
  const stage = !month ? null
    : month.delivered >= month.expected ? 2
    : month.shootsDone > 0 || month.delivered > 0 ? 1
    : 0
  const stages = ['Shoot', 'Editing', 'Delivered']

  const subtitle = month
    ? (stage === 2 ? `${month.label} is all delivered` : `Where we're up to in ${month.label}`)
    : retainer?.paused ? 'Your monthly content is paused'
    : nextShoot ? 'Your next shoot' : ''

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="stat-icon-bubble bubble-sm">
          <Clapperboard className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Your Content</h2>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
        </div>
      </div>

      <div className="card portal-progress">
        {month && (
          <>
            <div className="portal-progress-head">
              <p className="portal-progress-count">
                <strong>{month.delivered}</strong> of {plural(month.expected, 'video')}
              </p>
              <p className="portal-progress-caption">delivered for {month.label}</p>
            </div>

            <div className="portal-progress-bar" role="img" aria-label={`${month.delivered} of ${month.expected} videos delivered`}>
              {Array.from({ length: month.expected }, (_, i) => (
                <span key={i} className={i < month.delivered ? 'is-done' : ''} />
              ))}
            </div>

            <ol className="portal-progress-steps">
              {stages.map((label, i) => (
                <li key={label} className={i < stage! || stage === 2 ? 'is-done' : i === stage ? 'is-current' : ''}>
                  <span className="portal-progress-dot">{(i < stage! || stage === 2) && <Check className="w-3 h-3" />}</span>
                  {label}
                </li>
              ))}
            </ol>
          </>
        )}

        {(nextShoot || month) && (
          <div className="portal-progress-rows">
            <div className="portal-progress-row">
              <span><CalendarDays className="w-3.5 h-3.5" /> Next shoot</span>
              <span>{nextShoot ? shootDay(nextShoot.date, nextShoot.startTime) : stage === 0 ? "We'll be in touch to book it" : 'Not booked yet'}</span>
            </div>
            {month && retainer?.shootsPerMonth ? (
              <div className="portal-progress-row">
                <span>Shoots this month</span>
                <span>{month.shootsDone} of {retainer.shootsPerMonth} done</span>
              </div>
            ) : null}
          </div>
        )}

        {retainer && retainer.catchUp.length > 0 && (
          <div className="portal-progress-catchup">
            <p className="portal-progress-catchup-title">
              Still to come from earlier months: <strong>{plural(retainer.videosOwed, 'video')}</strong>
            </p>
            <ul>
              {retainer.catchUp.map((m) => (
                <li key={m.label}>
                  <span>{m.label}</span>
                  <span>{m.delivered} of {m.expected} delivered, {m.missing} to come</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {retainer?.paused && !month && retainer.catchUp.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing outstanding. Let us know when you want to start again.</p>
        )}
      </div>
    </div>
  )
}
