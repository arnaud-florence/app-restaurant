// Planche-contact : toutes les vignettes sur une image, avec leur nom.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
const SRC = process.argv[2], OUT = process.argv[3]
const COLS = 4, W = 420, H = 315, LEG = 34, MARGE = 10
const f = fs.readdirSync(SRC).filter(x => /\.jpg$/.test(x)).sort()
const lignes = Math.ceil(f.length / COLS)
const LW = COLS * (W + MARGE) + MARGE
const LH = lignes * (H + LEG + MARGE) + MARGE
const calques = []
for (const [i, nom] of f.entries()) {
  const c = i % COLS, l = Math.floor(i / COLS)
  const x = MARGE + c * (W + MARGE), y = MARGE + l * (H + LEG + MARGE)
  // On rogne 7 % en bas : c'est là que vit le filigrane du générateur.
  const m = await sharp(path.join(SRC, nom)).metadata()
  const buf = await sharp(path.join(SRC, nom))
    .extract({ left: 0, top: 0, width: m.width, height: Math.floor(m.height * 0.93) })
    .resize(W, H, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer()
  calques.push({ input: buf, left: x, top: y })
  const t = nom.replace('.jpg', '').replace(/-/g, ' ')
  calques.push({
    input: Buffer.from(
      `<svg width="${W}" height="${LEG}"><rect width="${W}" height="${LEG}" fill="#141414"/>`
      + `<text x="${W / 2}" y="22" font-family="Helvetica,Arial" font-size="17" fill="#e8b86d" text-anchor="middle">`
      + `${i + 1}. ${t}</text></svg>`),
    left: x, top: y + H,
  })
}
await sharp({ create: { width: LW, height: LH, channels: 3, background: '#0d0d0d' } })
  .composite(calques).jpeg({ quality: 88 }).toFile(OUT)
console.log(`${f.length} vignettes → ${OUT}`)
