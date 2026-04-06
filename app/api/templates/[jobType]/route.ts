import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(_req: Request, { params }: { params: Promise<{ jobType: string }> }) {
  const { jobType } = await params
  const supabase = await createServerSupabaseClient()

  const { data: template } = await supabase
    .from('job_templates')
    .select('id, template_tasks(phase, title, sort_order), template_deliverables(title, description, sort_order)')
    .eq('job_type', jobType)
    .single()

  if (!template) {
    return NextResponse.json({ tasks: [], deliverables: [] })
  }

  const tasks = (template.template_tasks as { phase: string; title: string; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ phase: t.phase, title: t.title }))

  const deliverables = (template.template_deliverables as { title: string; description: string | null; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((d) => ({ title: d.title, description: d.description }))

  return NextResponse.json({ tasks, deliverables })
}
