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
