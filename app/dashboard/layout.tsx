import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isClientAccount } from '@/lib/client-auth'
import DashboardShell from './DashboardShell'

export const metadata: Metadata = {
  title: 'Tui Media — Dashboard',
}

// Whether someone is signed in is settled by middleware (proxy.ts) from the
// cookie, with no round trip. *Which kind* of account they hold is settled
// here, against the auth server.
//
// This deliberately re-adds the getUser() call that was removed from this
// layout for latency. It was the right call to drop it when the only account
// in the project was Arlo's and the check was pure repetition; it stopped
// being repetition once clients could sign in, because the middleware reads
// the role from a cookie and this reads it from Supabase. The cost is mostly
// hidden anyway — the layout renders concurrently with the page's own queries.
//
// RLS is still the real lock (see migration_client_accounts.sql): a client who
// somehow reached this shell would find every query beneath it returning
// nothing. This is here so they get sent somewhere useful instead of staring
// at an empty dashboard.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (await isClientAccount()) redirect('/portal/me')
  return <DashboardShell>{children}</DashboardShell>
}
