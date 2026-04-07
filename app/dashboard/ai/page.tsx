import AiChat from '@/components/AiChat'

export default function AiPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" style={{ letterSpacing: '-0.02em' }}>AI Assistant</h1>
      <AiChat fullPage />
    </div>
  )
}
