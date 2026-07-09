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

// Apply the theme before first paint so it never flashes.
// Explicit 'light'/'dark' choices (Settings → Appearance) win; anything else
// follows the device's prefers-color-scheme, live — the media-query listener
// re-checks localStorage so an explicit choice made later still sticks.
// Client-facing pages swap logos via .logo-light/.logo-dark in globals.css.
const themeInit = `(function(){var d=document.documentElement;function set(dark){d.classList.toggle('dark',dark);d.classList.toggle('light',!dark);}try{var t=localStorage.getItem('tui-theme');var mq=window.matchMedia('(prefers-color-scheme: dark)');set(t==='dark'||(t!=='light'&&mq.matches));mq.addEventListener('change',function(e){var s=localStorage.getItem('tui-theme');if(s==='dark'||s==='light')return;set(e.matches);});}catch(e){set(false);}})();`;

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
