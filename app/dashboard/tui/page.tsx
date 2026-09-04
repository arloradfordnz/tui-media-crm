import AiChat from '@/components/AiChat'

export const metadata = { title: 'Tui' }

// Tui as a destination rather than a keyboard shortcut. Before this route it
// was reachable only via ⌘K, which does not exist on a phone — so the single
// fastest way to get an answer was the one surface the phone could not open.
//
// The centre tab in MobileTabBar points here. ⌘K still works on desktop.
export default function TuiPage() {
  return (
    <div className="tui-page">
      <AiChat fullPage />
    </div>
  )
}
