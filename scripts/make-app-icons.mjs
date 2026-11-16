// Renders the home-screen icons from app/icon.svg (the favicon), so the icon
// on a phone's home screen is the same bird as the browser tab — not a page
// screenshot, which is what iOS falls back to when there is no PNG
// apple-touch-icon (it does not accept SVG).
//
// The bird is centred on the navy of its own body, so it reads as the white
// outline it is in a dark tab. Re-run after changing app/icon.svg:
//   node scripts/make-app-icons.mjs
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const BG = '#0A1428'
const favicon = await readFile(new URL('../app/icon.svg', import.meta.url))
const [, vbW, vbH] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(favicon.toString()).map(Number)

async function render(size, out, fill) {
  // fill = share of the square the bird's height takes up
  const h = Math.round(size * fill)
  const w = Math.round((h * vbW) / vbH)
  const bird = await sharp(favicon, { density: 600 }).resize(w, h).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: bird, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png()
    .toFile(fileURLToPath(new URL(out, import.meta.url)))
  console.log('wrote', out)
}

await render(180, '../app/apple-icon.png', 0.78)
await render(192, '../public/icon-192.png', 0.78)
await render(512, '../public/icon-512.png', 0.78)
// Android masks to a circle; keep the bird inside the 80% safe zone.
await render(512, '../public/icon-maskable-512.png', 0.62)

// Launch screens for the home-screen app on iPhone (see startupImage in
// app/layout.tsx). The app's own background with the bird in the middle, one
// file per screen size because iOS ignores any that is not an exact match.
import { mkdir } from 'node:fs/promises'
const SPLASH_BG = '#060D1A'
const SCREENS = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [420, 912, 3], [393, 852, 3],
  [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2],
]
await mkdir(new URL('../public/splash/', import.meta.url), { recursive: true })
for (const [w, h, r] of SCREENS) {
  const W = w * r, H = h * r
  const bh = Math.round(W * 0.3)
  const bw = Math.round((bh * vbW) / vbH)
  const bird = await sharp(favicon, { density: 300 }).resize(bw, bh).png().toBuffer()
  const out = `../public/splash/${W}x${H}.png`
  await sharp({ create: { width: W, height: H, channels: 4, background: SPLASH_BG } })
    .composite([{ input: bird, left: Math.round((W - bw) / 2), top: Math.round((H - bh) / 2) }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(fileURLToPath(new URL(out, import.meta.url)))
  console.log('wrote', out)
}
