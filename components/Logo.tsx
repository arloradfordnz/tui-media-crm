/**
 * Full Tui Media logo — bird + wordmark.
 * To use your actual PNG instead:
 *   Replace with: <Image src="/logo-dark.png" alt="Tui Media" width={160} height={40} />
 *   (use /logo-light.png when in light mode)
 */
import TuiBird from './TuiBird'

export default function Logo({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const birdSize = size === 'sm' ? 18 : size === 'lg' ? 30 : 22
  const textClass =
    size === 'sm'
      ? 'text-sm font-semibold'
      : size === 'lg'
      ? 'text-2xl font-bold'
      : 'text-base font-semibold'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TuiBird size={birdSize} className="text-accent shrink-0" />
      <span className={`${textClass} tracking-tight`}>
        <span style={{ color: 'var(--accent)' }}>Tui</span>
        <span className="text-fg">Media</span>
      </span>
    </div>
  )
}
