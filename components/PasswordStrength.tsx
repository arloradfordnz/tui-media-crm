'use client'

import { Check, Circle } from 'lucide-react'
import { checkPassword } from '@/lib/password-strength'

// Weak → strong, using the app's own alert colours rather than a new palette.
const TONE = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--success)', 'var(--success)']

/**
 * Live feedback under a "new password" field. Advice only: the server runs the
 * same check (plus a breached-password lookup) and is what actually decides.
 *
 * `personal` is anything the password must not contain, such as the email.
 */
export default function PasswordStrength({
  value,
  personal,
}: {
  value: string
  personal?: (string | null | undefined)[]
}) {
  const check = checkPassword(value, personal)
  const started = value.length > 0
  const tone = TONE[check.score]

  return (
    <div aria-live="polite" className="space-y-2 -mt-1">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: started && check.score >= i ? tone : 'var(--bg-border)' }}
            />
          ))}
        </div>
        <span className="text-xs font-medium w-14 text-right" style={{ color: started ? tone : 'var(--text-tertiary)' }}>
          {started ? check.label : ''}
        </span>
      </div>

      {started && check.problem ? (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{check.problem}</p>
      ) : started ? (
        <p className="text-xs" style={{ color: 'var(--success)' }}>Looks strong. We’ll also check it against known data breaches when you save.</p>
      ) : null}

      <ul className="space-y-1">
        {check.rules.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs" style={{ color: r.met ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {r.met ? <Check className="w-3 h-3" style={{ color: 'var(--success)' }} /> : <Circle className="w-3 h-3" />}
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
