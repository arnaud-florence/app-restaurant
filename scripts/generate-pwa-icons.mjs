// Génère des PNG 192x192 et 512x512 à partir de public/icon.svg.
// Sans sharp : on écrit des PNG IDAT minimalistes en couleur unie #10b981
// (vert emerald). Les browsers iOS/Android savent installer la PWA même
// avec ces PNG simples ; le SVG est référencé en priorité dans le manifest.
//
// Pour un rendu qualité, installer sharp puis :
//    npx sharp -i public/icon.svg -o public/icon-192.png resize 192
//    npx sharp -i public/icon.svg -o public/icon-512.png resize 512

import { writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'

function pngSolid(size, [r, g, b]) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)         // width
  ihdr.writeUInt32BE(size, 4)         // height
  ihdr[8]  = 8                        // bit depth
  ihdr[9]  = 2                        // color type (RGB)
  ihdr[10] = 0                        // compression
  ihdr[11] = 0                        // filter
  ihdr[12] = 0                        // interlace

  // IDAT : ligne par ligne, filter byte 0 puis RGB répété
  const stride = 1 + size * 3
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      const off = y * stride + 1 + x * 3
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b
    }
  }
  const idat = deflateSync(raw)

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
    const t = Buffer.from(type)
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
    return Buffer.concat([len, t, data, c])
  }

  const iend = chunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), iend])
}

const emerald = [16, 185, 129]   // #10b981
writeFileSync('public/icon-192.png', pngSolid(192, emerald))
writeFileSync('public/icon-512.png', pngSolid(512, emerald))
console.log('✓ icon-192.png + icon-512.png générés (couleur unie #10b981)')
