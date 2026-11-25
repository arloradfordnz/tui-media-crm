'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

/** Only shown on the signed-in portal — the token links have no session to end. */
export default function PortalSignOut({ plain = false }: { plain?: boolean }) {
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  // plain: a bare text button, for the Arlo Radford header.
  if (plain) return <button type="button" onClick={signOut}>Sign out</button>

  return (
    <button onClick={signOut} className="btn-ghost btn-sm">
      <LogOut className="w-3.5 h-3.5" />
      Sign out
    </button>
  )
}
