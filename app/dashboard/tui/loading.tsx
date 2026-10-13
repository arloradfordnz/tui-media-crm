import { Line } from '@/components/Skeleton'

// Mirrors app/dashboard/tui/page.tsx: the chat fills the whole screen (the
// same .tui-page height the page uses), with the message box pinned to the
// bottom. The suggestion chips show on an empty thread, so they are here too.
export default function TuiLoading() {
  return (
    <div className="tui-page animate-fade-in">
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12 }}>
        <div className="flex gap-2 flex-wrap">
          {[150, 130, 120, 160].map((w, i) => <Line key={i} w={w} h={34} r={999} />)}
        </div>
        <Line h={48} r={999} />
      </div>
    </div>
  )
}
