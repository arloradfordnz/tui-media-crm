'use client'

import { useSyncExternalStore } from 'react'

function greetingText(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// The clock is an external store, and this is what useSyncExternalStore is
// for. The previous version rendered nothing, then set the greeting in an
// effect — a synchronous setState in an effect body, and a guaranteed extra
// render on every page load, to avoid the SSR/client mismatch that comes from
// the server's clock not being the reader's.
//
// getSnapshot returns the same string for the whole hour, so React's identity
// check settles immediately; the server snapshot is empty, which is what
// renders during hydration.
function subscribe(onStoreChange: () => void) {
  const id = setInterval(onStoreChange, 60_000)
  return () => clearInterval(id)
}

export default function ClientGreeting({ name = 'Arlo' }: { name?: string }) {
  const greeting = useSyncExternalStore(subscribe, greetingText, () => '')

  if (!greeting) return null
  return <>{greeting}, {name}.</>
}
