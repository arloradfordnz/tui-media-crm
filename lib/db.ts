import { PrismaClient } from '@/app/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is not set.')

  // Vercel serverless cannot reach the direct Supabase host.
  // DATABASE_URL must be the pgBouncer pooler URL (port 6543).
  // If you see a connection error to db.*.supabase.co, your Vercel
  // DATABASE_URL is set to the wrong value — it must use the pooler host.
  if (url.includes('db.') && url.includes('.supabase.co') && !url.includes('pooler.supabase.com')) {
    throw new Error(
      'DATABASE_URL is pointing at the direct Supabase host, which is unreachable from Vercel. ' +
      'Set DATABASE_URL to the pgBouncer pooler URL (*.pooler.supabase.com:6543).'
    )
  }

  const adapter = new PrismaPg({ connectionString: url })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
