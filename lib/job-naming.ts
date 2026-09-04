import { stripJobPrefix } from './format'

export type DuplicateJobMatch = { id: string; name: string; status: string }

/**
 * Finds an existing non-archived job for the same client whose name matches
 * this one once any "Client — " prefix is stripped, so "July Content" and
 * "Team Bainbridge — July Content" are recognised as the same intended job
 * even if typed differently. Two different clients sharing a month-based
 * name is normal and not a collision, this only checks within one client.
 *
 * Used by both the dashboard "New Job" form and the create_job AI tool, so
 * a duplicate can't slip in through either path.
 */
export async function findDuplicateJobName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientId: string,
  name: string,
  excludeJobId?: string
): Promise<DuplicateJobMatch | null> {
  const target = stripJobPrefix(name).trim().toLowerCase()
  if (!target) return null

  let query = supabase
    .from('jobs')
    .select('id, name, status')
    .eq('client_id', clientId)
    .neq('status', 'archived')
  if (excludeJobId) query = query.neq('id', excludeJobId)

  const { data } = await query
  return (data ?? []).find((j: { name: string }) => stripJobPrefix(j.name).trim().toLowerCase() === target) ?? null
}
