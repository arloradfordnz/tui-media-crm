import type { MetadataRoute } from 'next'

// Lets the CRM be added to a phone's home screen as an app: it opens straight
// into the dashboard, full screen, with the favicon's bird as its icon (the
// PNGs are rendered from app/icon.svg by scripts/make-app-icons.mjs). iOS
// reads its icon from app/apple-icon.png instead of from here.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tui Media',
    short_name: 'Tui Media',
    description: 'Tui Media — studio dashboard and client portal',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#060D1A',
    theme_color: '#060D1A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
