import { after } from 'next/server'
import type { FlagKind } from '@/lib/tui/flags'

// Push, not poll.
//
// The proactive assistant ran on seven brain-tick crons a day, each one
// re-reading the entire CRM to work out whether anything had changed. That is
// backwards twice over. Most ticks found nothing, because most of the day
// nothing happens. And the moments that actually matter — a client asking for
// changes, a proposal coming back accepted — waited up to four hours to be
// noticed, which is the one thing a proactive assistant is for.
//
// A client clicking a button in the portal is an event the server already
// handles. This turns that handler into the trigger.

export type AssistantEvent = {
  /** Reuses the flag taxonomy so an event and a swept concern are one thing. */
  kind: FlagKind | 'client_action'
  /** Stable per occurrence, so two clicks on the same button are one flag. */
  key: string
  /** One sentence, in Tui's voice, describing what just happened. */
  subject: string
  severity?: 'low' | 'normal' | 'high'
  detail?: Record<string, unknown>
  /**
   * Whether this is worth a text right now. False records the flag and lets
   * the next sweep decide — the right choice for things that are useful
   * context but not worth interrupting a school day for.
   */
  urgent?: boolean
}

type Supa = any // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Record an event as a flag the dashboard's "Your week" list reads.
 *
 * It used to also wake the Telegram assistant to text Arlo about urgent ones.
 * Telegram was removed (November 2026), so the flag is now the whole job;
 * `urgent` is kept on the type so callers need not change.
 */
export function emitAssistantEvent(supabase: Supa, event: AssistantEvent): void {
  after(async () => {
    const nowISO = new Date().toISOString()

    const { error } = await supabase.from('assistant_flags').upsert(
      {
        key: event.key,
        kind: event.kind,
        subject: event.subject,
        severity: event.severity ?? 'normal',
        detail: event.detail ?? null,
        first_seen_at: nowISO,
        last_seen_at: nowISO,
        resolved_at: null,
      },
      { onConflict: 'key', ignoreDuplicates: false }
    )
    if (error) console.error('[tui/events] flag write failed:', error.message)
  })
}
