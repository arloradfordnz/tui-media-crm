'use server'

import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function changePassword(prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!currentPassword || !newPassword) return { error: 'All fields are required.' }
  if (newPassword !== confirmPassword) return { error: 'New passwords do not match.' }
  if (newPassword.length < 8) return { error: 'Password must be at least 8 characters.' }

  const session = await getSession()
  if (!session) return { error: 'Not authenticated.' }

  const user = await db.user.findUnique({ where: { id: session.userId } })
  if (!user) return { error: 'User not found.' }

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) return { error: 'Current password is incorrect.' }

  const hashed = await bcrypt.hash(newPassword, 12)
  await db.user.update({ where: { id: user.id }, data: { password: hashed } })

  return { success: true }
}
