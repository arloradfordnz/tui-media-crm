'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { isMemoryCategory } from '@/lib/ai-memory'

// Settings → Memory. The same rows Tui writes with remember/update_memory/
// forget (lib/ai-tools.ts), edited by hand.

function clean(content: unknown): string | { error: string } {
  const text = String(content ?? '').trim()
  if (!text) return { error: 'Write something to remember.' }
  if (text.length > 500) return { error: 'Keep it to one short fact (under 500 characters).' }
  return text
}

export async function addMemory(content: string, category: string): Promise<{ error?: string }> {
  const text = clean(content)
  if (typeof text !== 'string') return text
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('ai_memories').insert({
    content: text,
    category: isMemoryCategory(category) ? category : 'preference',
    source: 'arlo',
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings')
  return {}
}

export async function updateMemory(id: string, content: string, category: string): Promise<{ error?: string }> {
  const text = clean(content)
  if (typeof text !== 'string') return text
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('ai_memories')
    .update({
      content: text,
      ...(isMemoryCategory(category) ? { category } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings')
  return {}
}

export async function deleteMemory(id: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('ai_memories').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings')
  return {}
}
