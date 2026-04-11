export default function DocumentsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton" style={{ width: '240px', height: '28px' }} />
        <div className="skeleton" style={{ width: '120px', height: '36px' }} />
      </div>
      <div className="card space-y-4">
        <div className="skeleton" style={{ width: '100px', height: '14px' }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '42px' }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="skeleton" style={{ width: '60%', height: '14px' }} />
            <div className="skeleton" style={{ width: '40%', height: '10px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
