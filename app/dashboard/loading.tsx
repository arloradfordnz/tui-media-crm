export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title skeleton */}
      <div className="skeleton" style={{ width: '200px', height: '28px' }} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="skeleton" style={{ width: '60%', height: '12px' }} />
            <div className="skeleton" style={{ width: '40%', height: '24px' }} />
          </div>
        ))}
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card space-y-3">
            <div className="skeleton" style={{ width: '120px', height: '14px' }} />
            <div className="skeleton" style={{ width: '100%', height: '40px' }} />
            <div className="skeleton" style={{ width: '100%', height: '40px' }} />
            <div className="skeleton" style={{ width: '80%', height: '40px' }} />
          </div>
        </div>
        <div className="card space-y-3">
          <div className="skeleton" style={{ width: '120px', height: '14px' }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2">
              <div className="skeleton" style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 }} />
              <div className="flex-1 space-y-2">
                <div className="skeleton" style={{ width: '90%', height: '12px' }} />
                <div className="skeleton" style={{ width: '50%', height: '10px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
