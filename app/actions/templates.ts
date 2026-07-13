'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function createTemplate(prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const name = formData.get('name') as string
  const jobType = formData.get('job_type') as string

  if (!name || !jobType) return { error: 'Name and job type are required.' }

  const slug = jobType.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const { error } = await supabase.from('job_templates').insert({ name, job_type: slug })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/jobs/templates')
}

export async function updateTemplate(prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const id = formData.get('id') as string
  const name = formData.get('name') as string

  if (!id || !name) return { error: 'ID and name are required.' }

  const { error } = await supabase.from('job_templates').update({ name }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/jobs/templates')
}

export async function deleteTemplate(id: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('template_tasks').delete().eq('template_id', id)
  await supabase.from('template_deliverables').delete().eq('template_id', id)
  await supabase.from('job_templates').delete().eq('id', id)
  revalidatePath('/dashboard/jobs/templates')
}

export async function addTemplateTask(prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const templateId = formData.get('template_id') as string
  const title = formData.get('title') as string
  const phase = formData.get('phase') as string

  if (!templateId || !title || !phase) return { error: 'All fields are required.' }

  const { data: existing } = await supabase
    .from('template_tasks')
    .select('sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSort = ((existing?.[0]?.sort_order ?? -1) as number) + 1

  const { error } = await supabase.from('template_tasks').insert({ template_id: templateId, title, phase, sort_order: nextSort })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/jobs/templates')
}

export async function deleteTemplateTask(id: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('template_tasks').delete().eq('id', id)
  revalidatePath('/dashboard/jobs/templates')
}

export async function addTemplateDeliverable(prevState: { error?: string } | undefined, formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const templateId = formData.get('template_id') as string
  const title = formData.get('title') as string
  const description = formData.get('description') as string

  if (!templateId || !title) return { error: 'Template and title are required.' }

  const { data: existing } = await supabase
    .from('template_deliverables')
    .select('sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSort = ((existing?.[0]?.sort_order ?? -1) as number) + 1

  const { error } = await supabase.from('template_deliverables').insert({
    template_id: templateId,
    title,
    description: description || null,
    sort_order: nextSort,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/jobs/templates')
}

export async function deleteTemplateDeliverable(id: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('template_deliverables').delete().eq('id', id)
  revalidatePath('/dashboard/jobs/templates')
}
