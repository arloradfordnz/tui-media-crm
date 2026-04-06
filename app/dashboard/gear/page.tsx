import { createServerSupabaseClient } from '@/lib/supabase'
import GearView from './GearView'

export default async function GearPage({ searchParams }: { searchParams: Promise<{ category?: string; status?: string }> }) {
  const params = await searchParams
  const catFilter = params.category || 'all'
  const statusFilter = params.status || 'all'

  const supabase = await createServerSupabaseClient()

  let query = supabase.from('gear').select('*').order('name', { ascending: true })
  if (catFilter !== 'all') query = query.eq('category', catFilter)
  if (statusFilter !== 'all') query = query.eq('status', statusFilter)

  const { data: gear } = await query

  // Normalise snake_case → camelCase for GearView
  const normalisedGear = (gear ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    purchaseValue: g.purchase_value,
    insuranceValue: g.insurance_value,
    serialNumber: g.serial_number,
    status: g.status,
    notes: g.notes,
    createdAt: g.created_at,
  }))

  return <GearView gear={normalisedGear} category={catFilter} status={statusFilter} />
}
