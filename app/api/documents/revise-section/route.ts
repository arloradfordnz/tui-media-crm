import { NextRequest } from 'next/server'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase-admin'
import { reviseSection } from '@/lib/section-revise'

// Revise one highlighted section of a document (the Tui box on the document
// page). Returns the new text; the page puts it in place and Arlo saves it.
// Nothing is written here, so a signed contract's lock is never in question.
export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const body = await request.json().catch(() => null) as { document?: unknown; start?: unknown; end?: unknown; instructions?: unknown } | null
  const document = typeof body?.document === 'string' ? body.document : ''
  const start = Number(body?.start)
  const end = Number(body?.end)
  const instructions = typeof body?.instructions === 'string' ? body.instructions : ''
  if (!document || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > document.length || end <= start) {
    return Response.json({ error: 'Highlight the part you want changed first.' }, { status: 400 })
  }
  if (!instructions.trim()) return Response.json({ error: 'Say what should change.' }, { status: 400 })
  const result = await reviseSection({ document, start, end, instructions })
  if ('error' in result) return Response.json(result, { status: 502 })
  return Response.json(result)
}
