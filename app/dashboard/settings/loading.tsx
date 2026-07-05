export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="skeleton" style={{ width: '160px', height: '28px' }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="skeleton" style={{ width: '140px', height: '14px' }} />
          <div className="skeleton" style={{ width: '100%', height: '40px' }} />
          <div className="skeleton" style={{ width: '60%', height: '40px' }} />
        </div>
      ))}
    </div>
  )
}
