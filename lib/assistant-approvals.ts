// Confirming destructive actions over Telegram.
//
// The executor (lib/ai-tools.ts) refuses anything in CONFIRM_TOOLS unless the
// request carries a fingerprint of that exact call. The dashboard can pass one
// directly; a text message has no approval channel, so this bridges the gap by
// parking the proposed action and quoting Arlo a short code to reply with.
//
// Confirmation is matched on an exact literal code, never on intent. The model
// does not decide whether Arlo agreed — a regex does. That matters because the
// inbound channel is the one place an outsider could put words in front of the
// assistant, and "yes"-detection is exactly the kind of thing a crafted
// message could exploit.
//
// Every function here degrades to a no-op if the table is missing, so the app
// keeps working before migration_assistant_pending_actions.sql has been run.
// The cost of the table not existing is that destructive tools stay refused
// over Telegram — which is the safe direction to fail in.

// How long a quoted code stays live. Short on purpose: long enough to read a
// text and reply, short enough that a stale "confirm" cannot fire a deletion
// proposed an hour ago in a different context.
const TTL_MINUTES = 10

export type PendingAction = {
  fingerprint: string
  code: string
  toolName: string
  description: string
}

/** Four hex characters is 65,536 possibilities against a 10-minute window
 *  holding a handful of rows — ample, and short enough to retype on a phone. */
function codeFor(fingerprint: string): string {
  return fingerprint.slice(0, 4)
}

/**
 * Park a refused destructive call so it can be confirmed by reply.
 * Returns the code to quote, or null if the store is unavailable.
 */
export async function recordPendingAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { fingerprint: string; toolName: string; toolInput: Record<string, unknown>; description: string }
): Promise<string | null> {
  const code = codeFor(args.fingerprint)
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString()

  const { error } = await supabase.from('assistant_pending_actions').insert({
    fingerprint: args.fingerprint,
    code,
    tool_name: args.toolName,
    tool_input: args.toolInput,
    description: args.description,
    expires_at: expiresAt,
  })

  if (error) {
    // Logged rather than thrown: failing to offer a confirmation should not
    // take down the turn, and the tool stays refused either way.
    console.error('[approvals] could not record pending action:', error.message)
    return null
  }
  return code
}

/**
 * Pull a confirmation code out of an inbound message.
 * Requires the literal word "confirm" — an agreeable-sounding message that
 * happens to contain four hex characters is not a confirmation.
 */
export function parseConfirmation(body: string): string | null {
  const match = /\bconfirm\s+([0-9a-f]{4})\b/i.exec(body)
  return match ? match[1].toLowerCase() : null
}

/**
 * Redeem a code for the fingerprint it authorises, marking it consumed so it
 * cannot be replayed. Returns null if the code is unknown, expired or already
 * used — all of which are treated identically on purpose.
 */
export async function consumeApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  code: string
): Promise<PendingAction | null> {
  const { data, error } = await supabase
    .from('assistant_pending_actions')
    .select('id, fingerprint, code, tool_name, description')
    .eq('code', code)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[approvals] lookup failed:', error.message)
    return null
  }
  const row = (data ?? [])[0]
  if (!row) return null

  // Consume before returning, so a repeated message cannot run it twice even
  // if the tool call itself later fails.
  const { error: consumeError } = await supabase
    .from('assistant_pending_actions')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('consumed_at', null)

  if (consumeError) {
    console.error('[approvals] could not consume:', consumeError.message)
    return null
  }

  return {
    fingerprint: row.fingerprint,
    code: row.code,
    toolName: row.tool_name,
    description: row.description,
  }
}
