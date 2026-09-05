import { createServerSupabaseClient } from '@/lib/supabase'
import { getTuiThread } from '@/lib/tui/thread'
import TuiThread from '@/components/TuiThread'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Tui' }

// Tui as a destination rather than a keyboard shortcut. Before this route it
// was reachable only via ⌘K, which does not exist on a phone — so the single
// fastest way to get an answer was the one surface the phone could not open.
//
// The centre tab in MobileTabBar points here. ⌘K still works on desktop, and
// all three surfaces now share one thread.
export default async function TuiPage() {
  const supabase = await createServerSupabaseClient()
  const thread = await getTuiThread(supabase, 40)

  return (
    <div className="tui-page">
      <TuiThread initialThread={thread} variant="page" />
    </div>
  )
}
