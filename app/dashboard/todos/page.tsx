import { createServerSupabaseClient } from '@/lib/supabase'
import TodosView from './TodosView'

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter = 'todo' } = await searchParams
  const supabase = await createServerSupabaseClient()

  const [{ data: todos }, { data: jobs }, { data: clients }] = await Promise.all([
    supabase
      .from('todos')
      .select('id, title, completed, due_date, linked_job_id, linked_client_id, created_at, jobs:linked_job_id(id, name), clients:linked_client_id(id, name)')
      .order('created_at', { ascending: false }),
    supabase.from('jobs').select('id, name').not('status', 'in', '("delivered","archived")').order('name'),
    supabase.from('clients').select('id, name').order('name'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <TodosView
      todos={(todos ?? []) as any}
      jobs={jobs ?? []}
      clients={clients ?? []}
      filter={filter}
    />
  )
}
