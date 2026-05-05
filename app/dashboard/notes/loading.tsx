export default function NotesLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 14 }} />
          <div className="space-y-2">
            <div className="skeleton" style={{ width: 120, height: 22 }} />
            <div className="skeleton" style={{ width: 180, height: 12 }} />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="skeleton" style={{ width: 130, height: 38, borderRadius: 999 }} />
          <div className="skeleton" style={{ width: 110, height: 38, borderRadius: 999 }} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <div className="card space-y-2" style={{ padding: '0.75rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 12 }} />
          ))}
        </div>
        <div className="card space-y-3">
          <div className="skeleton" style={{ width: '40%', height: 28 }} />
          <div className="skeleton" style={{ width: '100%', height: 14 }} />
          <div className="skeleton" style={{ width: '90%', height: 14 }} />
          <div className="skeleton" style={{ width: '95%', height: 14 }} />
          <div className="skeleton" style={{ width: '70%', height: 14 }} />
        </div>
      </div>
    </div>
  )
}
