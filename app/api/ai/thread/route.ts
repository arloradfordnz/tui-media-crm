import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'
import { getTuiThread } from '@/lib/tui/thread'

// Lets a client-rendered Tui surface (the ⌘K overlay, which has no server
// parent to seed it) start from the same thread as the server-rendered ones.
export async function GET() {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const supabase = await createServerSupabaseClient()
  return Response.json({ thread: await getTuiThread(supabase) })
}
