import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('documents').select('content')

  let max = 99
  for (const row of data ?? []) {
    if (!row.content) continue
    try {
      const obj = JSON.parse(row.content as string)
      const n = obj?.form?.documentNumber
      if (typeof n === 'string') {
        const m = n.match(/^#(\d+)$/)
        if (m) {
          const num = parseInt(m[1], 10)
          if (Number.isFinite(num) && num > max) max = num
        }
      }
    } catch { /* not JSON, skip */ }
  }

  const next = max + 1
  return Response.json({ number: `#${next}` })
}
