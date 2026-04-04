/**
 * TuiBird — SVG logomark.
 * Once you drop your PNG into /public, swap this component for:
 *   <Image src="/logo-mark.png" alt="Tui Media" width={w} height={h} />
 */
export default function TuiBird({
  className = '',
  size = 32,
  style,
}: {
  className?: string
  size?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size * 1.6}
      viewBox="0 0 100 160"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Tui Media logomark"
    >
      {/* Body + head silhouette */}
      <path d="
        M 16,22
        C 19,14 28,10 38,14
        C 43,9  52,8  61,14
        C 70,20 74,32 71,44
        C 78,54 82,70 81,88
        C 80,112 70,136 55,150
        C 52,153 48,153 45,150
        C 30,140 20,118 18,94
        C 16,76 18,58 25,46
        C 18,38 13,30 16,22 Z
      " />
      {/* White throat feather — the tui's signature marking */}
      <ellipse cx="62" cy="36" rx="8" ry="9" fill="white" />
      {/* Tail feather detail */}
      <path
        d="M 36,148 C 30,156 22,165 18,175
           C 26,164 38,158 50,157
           C 62,158 72,164 78,174
           C 74,165 66,156 60,148"
        opacity="0.9"
      />
    </svg>
  )
}
