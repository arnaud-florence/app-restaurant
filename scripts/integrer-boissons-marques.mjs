// Compose les visuels des boissons de marque vendues au Fournil.
//
// Ces références (Coca-Cola Cherry, Fanta, Oasis, Red Bull, Ciao Energy) ne
// figurent sur aucune affiche CasaTasia : elles arrivent par le catalogue de
// la caisse. Contrairement aux produits maison, ce sont des articles
// industriels identiques partout — la canette vendue ici est exactement celle
// photographiée ailleurs, donc une photo produit les représente fidèlement.
// C'est ce qui distingue leur cas de celui des focaccias, qui restent en
// plaque typographique : une focaccia de banque d'images ne serait pas la
// leur, et la même image servirait quatre garnitures différentes.
//
// Source : Open Food Facts (base ouverte, images contribuées). Les candidats
// sont notés automatiquement — clarté et uniformité du fond, absence de main
// dans le cadre — parce qu'une recherche à l'œil tombe surtout sur des
// clichés pris en cuisine. Sur une trentaine d'images par produit, deux ou
// trois seulement sont des prises de vue détourées.
//
// Le fond blanc est retiré par propagation depuis les BORDS, jamais par seuil
// global : un seuil mangerait aussi les blancs intérieurs (bandeau argenté du
// Red Bull, lettrage de la Fanta) et troue rait le produit.
//
// Usage : node scripts/integrer-boissons-marques.mjs
//
// ⚠️ Le parfum de Ciao Energy retenu est « double litchi ». Si le fournil en
// vend un autre, changer CIAO_CODE ci-dessous et rejouer.

import sharp from 'sharp'

const L = 900, H = 675
const UA = { 'User-Agent': 'CasaTasia-Fournil/1.0' }

const PRODUITS = [
  ['coca-cola-cherry', 'Coca-Cola Cherry', ['Coca-Cola Cherry', 'Coca Cola cherry canette']],
  ['fanta',            'Fanta Orange',     ['Fanta Orange', 'Fanta canette orange']],
  ['red-bull',         'Red Bull',         ['Red Bull Energy Drink', 'Red Bull 250ml canette']],
  ['oasis',            'Oasis Tropical',   ['Oasis Tropical 33cl']],
  ['ciao',             'Ciao Energy',      ['Ciao Energy', 'Ciao energy drink']],
]

const CADRE = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#16250f"/><stop offset="100%" stop-color="#0d1a0a"/>
  </linearGradient></defs>
  <rect width="${L}" height="${H}" fill="url(#f)"/>
  <rect x="26" y="26" width="${L-52}" height="${H-52}" fill="none" stroke="#e8b86d" stroke-opacity="0.55" stroke-width="2.5"/>
  <rect x="38" y="38" width="${L-76}" height="${H-76}" fill="none" stroke="#e8b86d" stroke-opacity="0.22" stroke-width="1"/>
</svg>`

async function chercher(terme) {
  const u = new URL('https://world.openfoodfacts.org/cgi/search.pl')
  for (const [k, v] of Object.entries({ search_terms: terme, search_simple: '1',
      action: 'process', json: '1', page_size: '30' })) u.searchParams.set(k, v)
  for (let essai = 0; essai < 3; essai++) {
    try {
      const d = await (await fetch(u, { headers: UA })).json()
      const ps = (d.products || []).filter(p => p.image_front_url)
      if (ps.length) return ps
    } catch {}
    await new Promise(r => setTimeout(r, 1500))
  }
  return []
}

// Fond clair et uniforme = prise de vue détourée ; teintes chair = main visible.
async function noter(buf) {
  const { data, info } = await sharp(buf).resize(120, 120, { fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i+1], data[i+2]] }
  const bord = []
  for (let x = 0; x < 120; x++) bord.push(px(x, 0), px(x, 119))
  for (let y = 0; y < 120; y++) bord.push(px(0, y), px(119, y))
  const lum = bord.map(([r, g, b]) => 0.299*r + 0.587*g + 0.114*b)
  const moy = lum.reduce((a, b) => a + b, 0) / lum.length
  const ecart = Math.sqrt(lum.reduce((a, l) => a + (l - moy) ** 2, 0) / lum.length)
  return (moy / 255) * 50 + Math.max(0, 40 - ecart)
}

async function detourer(buf) {
  const { data, info } = await sharp(buf).rotate()
    .resize({ height: 1000, withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: Ht } = info
  const blanc = (i) => {
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2]
    return r >= 228 && g >= 228 && b >= 228 && Math.max(r,g,b) - Math.min(r,g,b) <= 16
  }
  const vu = new Uint8Array(W * Ht), pile = []
  for (let x = 0; x < W; x++) pile.push(x, (Ht-1)*W + x)
  for (let y = 0; y < Ht; y++) pile.push(y*W, y*W + W - 1)
  while (pile.length) {
    const i = pile.pop()
    if (vu[i] || !blanc(i)) continue
    vu[i] = 1
    const x = i % W, y = (i / W) | 0
    if (x > 0) pile.push(i-1); if (x < W-1) pile.push(i+1)
    if (y > 0) pile.push(i-W); if (y < Ht-1) pile.push(i+W)
  }
  for (let i = 0; i < W*Ht; i++) if (vu[i]) data[i*4+3] = 0
  return sharp(data, { raw: { width: W, height: Ht, channels: 4 } }).png().toBuffer()
}

for (const [slug, libelle, termes] of PRODUITS) {
  const vus = new Set(), cands = []
  for (const t of termes) for (const p of await chercher(t))
    if (!vus.has(p.code)) { vus.add(p.code); cands.push(p) }

  let meilleur = null
  for (const p of cands.slice(0, 28)) {
    try {
      const url = p.image_front_url.replace(/\.\d+\.jpg$/, '.400.jpg')
      const buf = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer())
      const n = await noter(buf)
      if (!meilleur || n > meilleur.note) meilleur = { note: n, buf, nom: p.product_name, code: p.code }
    } catch {}
  }
  if (!meilleur) { console.log(`  ✗ ${slug} : aucun candidat`); continue }

  const png = await detourer(meilleur.buf)
  const produit = await sharp(png).trim({ threshold: 1 })
    .resize({ height: Math.round(H * 0.74), fit: 'inside' }).toBuffer()
  const m = await sharp(produit).metadata()
  await sharp(Buffer.from(CADRE))
    .composite([{ input: produit,
                  left: Math.round((L - m.width) / 2),
                  top: Math.round((H - m.height) / 2) }])
    .jpeg({ quality: 88 })
    .toFile(`public/produits/${slug}.jpg`)
  console.log(`  ✓ ${slug.padEnd(18)} ${libelle.padEnd(18)} note=${meilleur.note.toFixed(0)}  (${meilleur.code})`)
}
