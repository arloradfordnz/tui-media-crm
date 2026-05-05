import DashboardShell from './DashboardShell'

// Auth is enforced by middleware (proxy.ts) — no need to repeat the
// getUser() round trip here; doing so doubled latency on every nav.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
