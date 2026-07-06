import type { Metadata } from "next";
import { Poppins, Patrick_Hand } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

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

// Apply the saved theme before first paint so the theme never flashes.
// Default to LIGHT: it's the app's design default, and client-facing pages
// (login, portal, proposal) use the black logo which is invisible on a black
// dark-mode canvas for a first-time visitor who has nothing saved.
const themeInit = `(function(){try{var t=localStorage.getItem('tui-theme');document.documentElement.classList.add(t==='dark'?'dark':'light');}catch(e){document.documentElement.classList.add('light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.className} ${patrickHand.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
