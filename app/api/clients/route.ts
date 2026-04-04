import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const clients = await db.client.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  })
  return NextResponse.json(clients)
}
