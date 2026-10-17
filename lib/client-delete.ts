import type { SupabaseClient } from '@supabase/supabase-js'
import { deliveryKeysFor, deleteDeliveryObjects } from '@/lib/r2-cleanup'

// Deleting a client is more than one row: email logs point at it with no ON
// DELETE action, its documents are only SET NULL (and would be left behind,
// unfindable), and its portal login would survive and still sign in. Shared by
// the client page's Delete button (app/actions/clients.ts) and Tui's
// delete_client tool, so both clean up the same way.
//
// Runs with the service role; the caller checks who is asking. A client with a
// signed contract or an accepted proposal is refused by the database lock
// (20261016_0001), and that refusal comes back here as the error.
export async function deleteClientAndLeftovers(admin: SupabaseClient, clientId: string): Promise<{ error?: string }> {
  // email_logs.client_id FK has no ON DELETE action, and email_logs has RLS
  // with no UPDATE policy, so the refs are nulled first.
  const { error: logErr } = await admin.from('email_logs').update({ client_id: null }).eq('client_id', clientId)
  if (logErr) return { error: `Couldn't clear email logs for this client: ${logErr.message}` }

  // Collected BEFORE the delete: documents are ON DELETE SET NULL (unfindable
  // by client_id afterwards), and the portal login's link row cascades away.
  const [{ data: docRows }, { data: loginRows }] = await Promise.all([
    admin.from('documents').select('id').eq('client_id', clientId),
    admin.from('client_users').select('user_id').eq('client_id', clientId),
  ])
  const docIds = (docRows ?? []).map((d) => d.id as string)
  const loginIds = (loginRows ?? []).map((r) => r.user_id as string)

  const keys = await deliveryKeysFor(admin, { clientId })

  const { data: removed, error } = await admin.from('clients').delete().eq('id', clientId).select('id')
  if (error) return { error: error.message }
  if (!removed?.length) return { error: 'That client no longer exists.' }

  // The delivery_files rows cascaded away; the R2 objects did not.
  await deleteDeliveryObjects(keys)

  // Cleanup after the delete succeeded, so a failed delete never strips a
  // client of their documents.
  if (docIds.length > 0) await admin.from('documents').delete().in('id', docIds)
  await admin.from('notifications').delete().eq('client_id', clientId)
  await Promise.all(loginIds.map((id) => admin.auth.admin.deleteUser(id)))
  return {}
}
