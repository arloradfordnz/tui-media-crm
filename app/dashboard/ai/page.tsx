import AiChat from '@/components/AiChat'
import AiPageScrollLock from './AiPageScrollLock'

export default function AiPage() {
  return (
    <>
      <AiPageScrollLock />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100dvh - 140px)',
          maxHeight: 'calc(100dvh - 140px)',
        }}
        className="ai-page-shell"
      >
        <h1 className="text-2xl font-semibold mb-4" style={{ letterSpacing: '-0.02em', flexShrink: 0 }}>AI Assistant</h1>
        <div style={{ flex: '1 1 auto', minHeight: 0 }}>
          <AiChat fullPage />
        </div>
      </div>
    </>
  )
}
