import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const notifications = await db.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(notifications)
}
