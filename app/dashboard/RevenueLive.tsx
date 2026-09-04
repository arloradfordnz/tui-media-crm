import { fetchXeroTransactionsCached } from '@/lib/xero'
import RevenueSection from './RevenueSection'
import { type ReportData } from './MonthlyReport'

type Point = { label: string; value: number }

// The Xero half of the revenue view, isolated so it can suspend on its own.
//
// This chain is an uncached, untimed third-party call that is slowest exactly
// when it matters most (cold start). It used to sit inline in the dashboard's
// top-level await, so every page load — including the ones where you only
// wanted to see today's shoots — waited on Xero before rendering anything.
//
// Now it renders behind <Suspense> with the locally-computed CRM figures as
// the fallback. Those numbers are already in memory and are honest on their
// own terms ("based on delivered jobs in CRM"), so the page is useful
// immediately and simply gets more accurate when Xero answers.
export default async function RevenueLive({
  now,
  crmChartMonths,
  crmRevenueThisMonth,
  crmRevenuePrevMonth,
  reportBase,
}: {
  now: string
  crmChartMonths: Point[]
  crmRevenueThisMonth: number
  crmRevenuePrevMonth: number
  reportBase: Omit<ReportData, 'revenueThisMonth' | 'revenuePrevMonth' | 'changePct' | 'chartData' | 'source'>
}) {
  const nowDate = new Date(now)

  let revenueThisMonth = crmRevenueThisMonth
  let revenuePrevMonth = crmRevenuePrevMonth
  let chartData = crmChartMonths
  let source = 'Based on delivered jobs in CRM'

  try {
    const xt = await fetchXeroTransactionsCached()
    if (xt != null) {
      const paidIn = xt.filter((t) => t.type === 'in' && t.status === 'PAID')
      const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString().slice(0, 10)
      const prevMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1).toISOString().slice(0, 10)

      revenueThisMonth = Math.round(
        paidIn.filter((t) => t.date >= monthStart).reduce((s, t) => s + t.amount, 0)
      )
      revenuePrevMonth = Math.round(
        paidIn
          .filter((t) => t.date >= prevMonthStart && t.date < monthStart)
          .reduce((s, t) => s + t.amount, 0)
      )
      chartData = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - (11 - i), 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return {
          label: d.toLocaleString('en-NZ', { month: 'short' }),
          value: Math.round(
            paidIn.filter((t) => t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0)
          ),
        }
      })
      source = 'Live from Xero'
    }
  } catch (err) {
    // Falling back to the CRM figures already assigned above. A Xero outage
    // should cost accuracy, not the page.
    console.error('[RevenueLive] Xero fetch error:', err)
  }

  // No prior month to compare against → no delta. A fabricated "100%" reads
  // as fake precision.
  const changePct =
    revenuePrevMonth > 0
      ? ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100
      : undefined

  return (
    <RevenueSection
      allMonthsData={chartData}
      revenueThisMonth={revenueThisMonth}
      revenuePrevMonth={revenuePrevMonth}
      changePct={changePct}
      reportData={{ ...reportBase, revenueThisMonth, revenuePrevMonth, changePct, chartData, source }}
    />
  )
}
