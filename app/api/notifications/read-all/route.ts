import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST() {
  await db.notification.updateMany({
    where: { read: false },
    data: { read: true },
  })
  return NextResponse.json({ ok: true })
}
