import type { SupabaseClient } from '@supabase/supabase-js'

// The Tui thread. Telegram and every dashboard surface read and write the same
// sms_messages rows, so there is exactly one conversation with Tui regardless
// of where you happen to be typing.
export type ThreadMessage = {
  direction: 'inbound' | 'outbound'
  body: string
  created_at: string
}

// The assistant forgets a conversation after a day. Nothing is deleted: rows
// older than this are simply not shown and not sent to the model, so every
// surface (dashboard, Telegram) starts a fresh conversation the next day. What
// it should keep for good is in ai_memories, which this does not touch.
export const THREAD_WINDOW_MS = 24 * 60 * 60 * 1000
export const threadSince = () => new Date(Date.now() - THREAD_WINDOW_MS).toISOString()

// Oldest-first, which is the order the UI renders and the order the model
// wants. The query itself is newest-first because that is the only way to take
// the LAST n rows without a full scan.
export async function getTuiThread(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  limit = 12
): Promise<ThreadMessage[]> {
  const { data } = await supabase
    .from('sms_messages')
    .select('direction, body, created_at')
    .gte('created_at', threadSince())
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as ThreadMessage[]).slice().reverse()
}
