import type { Metadata, Viewport } from "next";
import ReactDOM from "react-dom";
import { Patrick_Hand } from "next/font/google";
import "./globals.css";

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-patrick-hand",
});

export const metadata: Metadata = {
  title: "Tui Media",
  description: "Tui Media — studio dashboard and client portal",
  // Favicon comes from app/icon.svg (Next.js convention) — same mark as tuimedia.nz.
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
    <html lang="en" className={`${patrickHand.variable} dark`}>
      <body>
        {children}
      </body>
    </html>
  );
}
