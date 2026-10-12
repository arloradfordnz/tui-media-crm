import type { NextConfig } from "next";

// Every package @react-pdf drags in. They are listed out rather than globbed
// loosely because an over-broad exclude here fails at RUNTIME, not at build
// time — see the note on outputFileTracingExcludes below.
const REACT_PDF_ONLY = [
  "node_modules/@react-pdf/**",
  "node_modules/fontkit/**",
  "node_modules/brotli/**",
  "node_modules/yoga-layout/**",
  "node_modules/hyphen/**",
  "node_modules/linebreak/**",
  "node_modules/bidi-js/**",
  "node_modules/restructure/**",
  "node_modules/unicode-properties/**",
  "node_modules/unicode-trie/**",
  "node_modules/jay-peg/**",
  "node_modules/tiny-inflate/**",
  "node_modules/dfa/**",
  "node_modules/js-md5/**",
  "node_modules/media-engine/**",
  "node_modules/emoji-regex-xs/**",
  "node_modules/svg-arc-to-cubic-bezier/**",
  "node_modules/normalize-svg-path/**",
  "node_modules/parse-svg-path/**",
  "node_modules/abs-svg-path/**",
  "node_modules/hsl-to-hex/**",
  "node_modules/hsl-to-rgb-for-reals/**",
];

const nextConfig: NextConfig = {
  // Local dev only: keep build output away from iCloud, where the file watcher
  // misses changes and sync can corrupt .next. A folder ending in .nosync is
  // skipped by iCloud. (It used to be /tmp/tui-media-crm-next, but Next 16.4
  // refuses a distDir outside the project.) Vercel (production build) must use
  // the default .next dir.
  ...(process.env.NODE_ENV === 'development' ? { distDir: '.next.nosync' } : {}),

  // ── Keep 6MB of PDF library out of four serverless functions ─────────────
  // @react-pdf is only ever loaded in the BROWSER: both call sites are
  // `await import('@react-pdf/renderer')` inside a click handler in a
  // 'use client' component (ClientPortalView, DocumentForm). Nothing on the
  // server renders a PDF — there is no renderToStream/renderToBuffer anywhere
  // in app/ or lib/.
  //
  // A dynamic import is still a traced dependency, though, so Vercel was
  // shipping the whole library — fontkit, pdfkit, brotli, a layout engine —
  // inside the function bundle for every route that could reach it:
  //
  //     portal/me                 9.9MB  (5.5MB of it @react-pdf)
  //     portal/client/[token]     9.7MB  (5.5MB)
  //     dashboard/documents       8.4MB  (5.5MB)
  //     dashboard/documents/[id]  8.1MB  (5.5MB)
  //
  // against ~2.1MB for every other route. Two of those four are the pages
  // CLIENTS see, and a fat function is a slower cold start — which on a CRM
  // this quiet is most visits.
  //
  // This only trims what is deployed next to the FUNCTION. The browser still
  // gets its lazily-loaded chunk out of .next/static, so Download PDF is
  // untouched — verify after any change here by confirming a ~1.4MB
  // react-pdf chunk still exists under .next/static/chunks.
  //
  // Scoped to '**/*' on purpose: no server route may use this library, so a
  // new page that imports the PDF component should not quietly re-acquire 6MB.
  // Every package listed was verified to appear ONLY in these four routes'
  // traces and in no other route's.
  outputFileTracingExcludes: {
    "**/*": REACT_PDF_ONLY,
  },

  // Dev only: lets the preview browser pane, which reaches the server as
  // 127.0.0.1, hydrate. Ignored in production builds.
  allowedDevOrigins: ['127.0.0.1'],

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // ── Security headers ─────────────────────────────────────────────────────
  // frame-ancestors / X-Frame-Options stop the dashboard, the portal and the
  // sign-in pages being framed by another site (clickjacking). The Referrer
  // policy matters more than it looks: portal and proposal links carry their
  // secret in the URL path, and without it a click on any outbound link in a
  // page would hand that URL to the other site. nosniff, HSTS and the
  // permissions policy are the standard hardening set.
  //
  // No script-src on purpose. Next injects inline scripts for hydration and the
  // layout has its own; a script policy loose enough to work here (unsafe-inline)
  // adds nothing, and a nonce-based one needs per-request rendering for every
  // page. These directives do the work without risking a blank page.
  async headers() {
    const security = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
    ]
    // Pages that are reached by a secret link or behind a login are never for a
    // search engine, and anything holding a session is never for a shared cache.
    const private_ = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ]
    return [
      { source: '/:path*', headers: security },
      { source: '/portal/:path*', headers: private_ },
      { source: '/proposal/:path*', headers: private_ },
      { source: '/dashboard/:path*', headers: private_ },
      { source: '/login', headers: private_ },
    ]
  },

  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
