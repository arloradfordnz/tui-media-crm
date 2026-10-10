import type { Metadata, Viewport } from "next";
import ReactDOM from "react-dom";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tui Media",
  description: "Tui Media — studio dashboard and client portal",
  // Favicon comes from app/icon.svg (Next.js convention) — same mark as tuimedia.nz.
  // The home-screen icon is app/apple-icon.png, rendered from that same SVG.
  // appleWebApp makes "Add to Home Screen" open full screen like an app, with
  // the status bar drawn over the navy rather than a white strip above it.
  appleWebApp: {
    capable: true,
    title: 'Tui Media',
    statusBarStyle: 'black-translucent',
  },
};

// viewport-fit=cover is what lets env(safe-area-inset-*) resolve to anything
// other than zero. Without it the bottom of every screen sits under Safari's
// home indicator on a phone, which is where this app is mostly used.
//
// Deliberately no maximumScale/userScalable: pinch-zoom stays available. The
// iOS auto-zoom-on-focus problem is fixed by making inputs 16px (globals.css),
// not by taking zoom away from the user.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060D1A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Bricolage Grotesque is declared as @font-face in globals.css (its two
  // subsets each need their own unicode-range, which next/font/local has no
  // way to express). That leaves the font file behind a CSS parse, so the
  // latin subset — the one every screen needs — is preloaded here. latin-ext
  // is left to load on demand, only if a character in its range appears.
  ReactDOM.preload("/fonts/bricolage-grotesque-latin.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });

  return (
    // Dark is the only theme — the CRM has no light mode and no user setting
    // for one. The .dark class is applied statically rather than by a
    // pre-paint script (as it was when light mode existed and the choice had
    // to be read from localStorage/prefers-color-scheme before first paint),
    // because a static class needs no such script.
    <html lang="en" className="dark">
      <body>
        {children}
      </body>
    </html>
  );
}
