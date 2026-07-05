import BusinessInfoView from './BusinessInfoView'

export default function BusinessPage() {
  return (
    <div className="space-y-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header-left">
          <h1 className="page-title">Business Info</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Personal reference — not client facing.</p>
        </div>
      </div>
      <BusinessInfoView />
    </div>
  )
}
