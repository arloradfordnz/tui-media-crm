'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function createGear(prevState: { error?: string } | undefined, formData: FormData) {
  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const purchaseValue = formData.get('purchaseValue') as string
  const insuranceValue = formData.get('insuranceValue') as string
  const serialNumber = formData.get('serialNumber') as string
  const notes = formData.get('notes') as string

  if (!name) return { error: 'Name is required.' }

  const supabase = await createServerSupabaseClient()
  await supabase.from('gear').insert({
    name,
    category: category || null,
    purchase_value: purchaseValue ? parseFloat(purchaseValue) : null,
    insurance_value: insuranceValue ? parseFloat(insuranceValue) : null,
    serial_number: serialNumber || null,
    notes: notes || null,
  })

  revalidatePath('/dashboard/gear')
  return {}
}

export async function updateGear(prevState: { error?: string } | undefined, formData: FormData) {
  const gearId = formData.get('gearId') as string
  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const status = formData.get('status') as string
  const purchaseValue = formData.get('purchaseValue') as string
  const insuranceValue = formData.get('insuranceValue') as string
  const serialNumber = formData.get('serialNumber') as string
  const notes = formData.get('notes') as string

  if (!name) return { error: 'Name is required.' }

  const supabase = await createServerSupabaseClient()
  await supabase.from('gear').update({
    name,
    category: category || null,
    status: status || 'available',
    purchase_value: purchaseValue ? parseFloat(purchaseValue) : null,
    insurance_value: insuranceValue ? parseFloat(insuranceValue) : null,
    serial_number: serialNumber || null,
    notes: notes || null,
  }).eq('id', gearId)

  revalidatePath('/dashboard/gear')
  return {}
}

export async function deleteGear(gearId: string) {
  const supabase = await createServerSupabaseClient()
  await supabase.from('gear').delete().eq('id', gearId)
  revalidatePath('/dashboard/gear')
}
