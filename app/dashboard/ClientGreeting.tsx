'use client'

import { useState, useEffect } from 'react'

function greetingText(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function ClientGreeting({ name = 'Arlo' }: { name?: string }) {
  const [greeting, setGreeting] = useState<string>('')

  useEffect(() => {
    setGreeting(greetingText())
    // Update if user leaves page open across time boundaries
    const id = setInterval(() => setGreeting(greetingText()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!greeting) return null
  return <>{greeting}, {name}.</>
}
