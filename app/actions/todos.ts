'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function createTodo(_prevState: { error?: string } | undefined, formData: FormData) {
  const title = (formData.get('title') as string)?.trim()
  if (!title) return { error: 'Title is required.' }

  const dueDate = (formData.get('due_date') as string) || null
  const linkedJobId = (formData.get('linked_job_id') as string) || null
  const linkedClientId = (formData.get('linked_client_id') as string) || null

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('todos').insert({
    title,
    due_date: dueDate || null,
    linked_job_id: linkedJobId || null,
    linked_client_id: linkedClientId || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/todos')
}

export async function toggleTodo(todoId: string, completed: boolean) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('todos').update({ completed }).eq('id', todoId)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/todos')
}

export async function updateTodo(
  todoId: string,
  data: { title: string; due_date: string | null; linked_job_id: string | null; linked_client_id: string | null },
) {
  const title = data.title?.trim()
  if (!title) return { error: 'Title is required.' }
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('todos').update({
    title,
    due_date: data.due_date || null,
    linked_job_id: data.linked_job_id || null,
    linked_client_id: data.linked_client_id || null,
  }).eq('id', todoId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/todos')
  return { ok: true }
}

export async function deleteTodo(todoId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('todos').delete().eq('id', todoId)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/todos')
}
