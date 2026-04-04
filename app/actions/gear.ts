'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'

export async function createGear(prevState: { error?: string } | undefined, formData: FormData) {
  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const purchaseValue = formData.get('purchaseValue') as string
  const insuranceValue = formData.get('insuranceValue') as string
  const serialNumber = formData.get('serialNumber') as string
  const notes = formData.get('notes') as string

  if (!name) return { error: 'Name is required.' }

  await db.gear.create({
    data: {
      name,
      category: category || null,
      purchaseValue: purchaseValue ? parseFloat(purchaseValue) : null,
      insuranceValue: insuranceValue ? parseFloat(insuranceValue) : null,
      serialNumber: serialNumber || null,
      notes: notes || null,
    },
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

  await db.gear.update({
    where: { id: gearId },
    data: {
      name,
      category: category || null,
      status: status || 'available',
      purchaseValue: purchaseValue ? parseFloat(purchaseValue) : null,
      insuranceValue: insuranceValue ? parseFloat(insuranceValue) : null,
      serialNumber: serialNumber || null,
      notes: notes || null,
    },
  })

  revalidatePath('/dashboard/gear')
  return {}
}

export async function deleteGear(gearId: string) {
  await db.gear.delete({ where: { id: gearId } })
  revalidatePath('/dashboard/gear')
}
