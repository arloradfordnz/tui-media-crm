export default function CalendarLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton" style={{ width: '120px', height: '28px' }} />
        <div className="skeleton" style={{ width: '140px', height: '36px' }} />
      </div>
      <div className="card" style={{ minHeight: '400px' }}>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '14px' }} />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '80px' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
