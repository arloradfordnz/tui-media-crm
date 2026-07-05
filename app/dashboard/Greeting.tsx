'use client'

export default function Greeting() {
  const hour = new Date().getHours()
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return <>{salutation}, Arlo</>
}
