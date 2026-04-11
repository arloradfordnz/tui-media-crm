export default function GearLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton" style={{ width: '160px', height: '28px' }} />
        <div className="skeleton" style={{ width: '100px', height: '36px' }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-2">
            <div className="skeleton" style={{ width: '50%', height: '10px' }} />
            <div className="skeleton" style={{ width: '40%', height: '20px' }} />
          </div>
        ))}
      </div>
      <div className="card-flush">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4" style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
            <div className="flex-1 space-y-2">
              <div className="skeleton" style={{ width: '45%', height: '14px' }} />
              <div className="skeleton" style={{ width: '25%', height: '10px' }} />
            </div>
            <div className="skeleton" style={{ width: '60px', height: '22px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
