import BusinessInfoView from './BusinessInfoView'

export default function BusinessPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>Business Info</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Personal reference area — not client facing.</p>
      </div>
      <BusinessInfoView />
    </div>
  )
}
