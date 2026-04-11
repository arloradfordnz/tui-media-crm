export default function JobsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton" style={{ width: '80px', height: '28px' }} />
        <div className="skeleton" style={{ width: '100px', height: '36px' }} />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ width: '80px', height: '30px' }} />
        ))}
      </div>
      <div className="card-flush">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4" style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div className="flex-1 space-y-2">
              <div className="skeleton" style={{ width: '50%', height: '14px' }} />
              <div className="skeleton" style={{ width: '30%', height: '10px' }} />
            </div>
            <div className="skeleton" style={{ width: '70px', height: '22px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
