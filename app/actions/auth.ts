'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { createSession, deleteSession } from '@/lib/session'

export async function login(prevState: { error?: string } | undefined, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return { error: 'Invalid email or password.' }
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    return { error: 'Invalid email or password.' }
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })

  redirect('/dashboard')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
