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
 * Record an event and, if urgent, wake the assistant.
 *
 * Runs entirely inside `after()`, so nothing here is on the client's critical
 * path: a portal visitor clicking "request changes" gets their response back
 * without waiting on Supabase, Anthropic or Telegram.
 *
 * Two steps with deliberately different reliability. The flag write is the one
 * that must not be lost — once it lands, the concern is durable and the next
 * sweep will raise it regardless of what else fails. The immediate turn is
 * fire-and-forget on top of that, so a Telegram outage costs promptness, not
 * the notification itself.
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

    if (!event.urgent) return
    await wakeAssistant(event)
  })
}

/**
 * Fire the event turn on its own route rather than inline.
 *
 * A server action's time budget belongs to the client waiting on it; an
 * assistant turn can run half a minute. /api/telegram/event carries its own
 * maxDuration, so the work happens where there is room for it.
 */
async function wakeAssistant(event: AssistantEvent): Promise<void> {
  const secret = process.env.CRON_SECRET
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  if (!secret || !base) {
    // Not an error worth failing on: the flag is already written, so the next
    // sweep raises it. Only the promptness is lost.
    console.warn('[tui/events] no CRON_SECRET or site URL — event turn skipped, flag will be swept')
    return
  }

  try {
    await fetch(`${base}/api/telegram/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ key: event.key, subject: event.subject }),
    })
  } catch (err) {
    console.error('[tui/events] event turn request failed:', err)
  }
}
