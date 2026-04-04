import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import DashboardShell from './DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    redirect('/login')
  }

  return <DashboardShell>{children}</DashboardShell>
}
