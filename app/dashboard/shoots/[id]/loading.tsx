import { BackLink, PageHeader, FormCard } from '@/components/Skeleton'

// Mirrors the shoot pack: back link, client over job, the facts card, then the
// shot list card.
export default function ShootPackLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <BackLink />
      <PageHeader subtitle />
      <FormCard fields={4} />
      <FormCard fields={6} />
    </div>
  )
}
