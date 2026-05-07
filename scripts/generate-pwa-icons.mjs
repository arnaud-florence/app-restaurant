// Génère public/icon-192.png et public/icon-512.png à partir de public/icon.svg
// via sharp (rendu vectoriel propre). Tombe sur un PNG couleur unie si sharp absent.

import { readFileSync, writeFileSync } from 'node:fs'

async function main() {
  let sharp
  try { sharp = (await import('sharp')).default }
  catch {
    console.warn('⚠ sharp absent — fallback PNG couleur unie. `npm i -D sharp` pour rendu propre.')
    return fallbackSolid()
  }

  const svg = readFileSync('public/icon.svg')
  for (const size of [192, 512]) {
    await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(`public/icon-${size}.png`)
    console.log(`✓ public/icon-${size}.png généré (rastérisation SVG ${size}×${size})`)
  }
}

function fallbackSolid() {
  // PNG couleur unie #10b981 — voir Module 25 pour la version sans sharp
  const { deflateSync, crc32 } = require('node:zlib')
  function pngSolid(size, [r, g, b]) {
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
    ihdr[8] = 8; ihdr[9] = 2
    const stride = 1 + size * 3
    const raw = Buffer.alloc(stride * size)
    for (let y = 0; y < size; y++) { raw[y * stride] = 0
      for (let x = 0; x < size; x++) {
        const off = y * stride + 1 + x * 3
        raw[off] = r; raw[off + 1] = g; raw[off + 2] = b
      } }
    const idat = deflateSync(raw)
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
      const t = Buffer.from(type)
      const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
      return Buffer.concat([len, t, data, c])
    }
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
  }
  for (const size of [192, 512]) {
    writeFileSync(`public/icon-${size}.png`, pngSolid(size, [16, 185, 129]))
    console.log(`✓ public/icon-${size}.png généré (couleur unie)`)
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
