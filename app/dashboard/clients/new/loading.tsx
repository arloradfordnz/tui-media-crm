import { FormCard, PageHeader } from '@/components/Skeleton'

// Mirrors app/dashboard/clients/new/page.tsx: back link over "New Client",
// then one card of paired fields with the notes box and the save button.
export default function NewClientLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader back />
      <FormCard fields={8} textarea buttons={1} />
    </div>
  )
}
