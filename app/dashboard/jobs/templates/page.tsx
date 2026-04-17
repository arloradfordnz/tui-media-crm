import { createServerSupabaseClient } from '@/lib/supabase'
import TemplatesView from './TemplatesView'

export default async function TemplatesPage() {
  const supabase = await createServerSupabaseClient()

  const { data: templates } = await supabase
    .from('job_templates')
    .select('id, job_type, name, template_tasks(id, phase, title, sort_order), template_deliverables(id, title, description, sort_order)')
    .order('name')

  return <TemplatesView templates={templates ?? []} />
}
