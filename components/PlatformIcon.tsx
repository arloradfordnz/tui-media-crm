/**
 * Inline monochrome SVG icons for the social platforms we track. Coloured
 * via `currentColor` so the consumer can pass any tone (accent, white, muted)
 * via the wrapping element's `color` style. Lucide-react in this app's
 * version doesn't ship brand glyphs, so we keep simplified paths here.
 */

type Props = {
  platform: string
  className?: string
  style?: React.CSSProperties
}

export default function PlatformIcon({ platform, className = 'w-4 h-4', style }: Props) {
  // Most brand glyphs run edge-to-edge of a 24×24 box, while Lucide icons
  // ship with ~1.5px built-in padding. Use a slightly enlarged viewBox so
  // these brand icons sit at the same visual size as the rest of the UI
  // without clipping the camera lens / circle outlines.
  const common = {
    className,
    style: { color: 'var(--accent)', ...style },
    viewBox: '-1.5 -1.5 27 27',
    xmlns: 'http://www.w3.org/2000/svg',
  }

  if (platform === 'youtube') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    )
  }
  if (platform === 'vimeo') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.404 0-2.586-1.297-3.55-3.892l-1.93-7.083c-.715-2.594-1.484-3.892-2.317-3.892-.182 0-.812.376-1.881 1.131L0 7.13c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.65 6.266 1.92 7.055 1.86c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.797 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.892 3.443-5.79 6.776-5.677 2.473.07 3.643 1.671 3.515 4.797z" />
      </svg>
    )
  }
  if (platform === 'instagram') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.069 1.646.069 4.85s-.011 3.584-.069 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.069-4.85.069s-3.584-.011-4.85-.069c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608C2.175 15.747 2.163 15.367 2.163 12s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608.975-.975 2.242-1.249 3.608-1.311C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.775.13 4.602.405 3.635 1.372 2.668 2.339 2.393 3.512 2.335 4.789.014 8.332 0 8.741 0 12s.014 3.668.072 4.948c.058 1.277.333 2.45 1.3 3.417.967.967 2.14 1.242 3.417 1.3C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.277-.058 2.45-.333 3.417-1.3.967-.967 1.242-2.14 1.3-3.417.058-1.28.072-1.689.072-4.948s-.014-3.668-.072-4.948c-.058-1.277-.333-2.45-1.3-3.417-.967-.967-2.14-1.242-3.417-1.3C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    )
  }
  if (platform === 'tiktok') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.2a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.86 4.86 0 0 1-1.84-.63z" />
      </svg>
    )
  }
  if (platform === 'facebook') {
    return (
      <svg {...common} fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    )
  }
  // Generic fallback
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
