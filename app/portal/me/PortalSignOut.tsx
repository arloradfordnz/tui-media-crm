'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

/** Only shown on the signed-in portal — the token links have no session to end. */
export default function PortalSignOut() {
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  return (
    <button onClick={signOut} className="btn-ghost btn-sm">
      <LogOut className="w-3.5 h-3.5" />
      Sign out
    </button>
  )
}
