import { PrismaClient } from '@/app/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Always use DATABASE_URL (pgBouncer pooler) for runtime queries.
  // DIRECT_URL is only for migrations (prisma.config.ts) and must never
  // be used here — the direct host is unreachable in Vercel serverless.
  const connectionString = process.env.DATABASE_URL!
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
