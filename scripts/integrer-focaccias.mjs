// Visuels des quatre focaccias du Fournil, depuis Wikimedia Commons.
//
// Ces focaccias sont faites sur place et ne figurent sur aucune affiche
// CasaTasia. À défaut de photo maison, chaque garniture reçoit une photo
// libre qui lui correspond RÉELLEMENT — base blanche pour les blanches,
// anchois pour la tomate-anchois. Une seule image générique servie quatre
// fois aurait redonné quatre cartes indistinctes, ce qu'on cherchait
// justement à corriger.
//
// ⚠️ Ce sont des photos d'illustration, pas les produits du fournil. Dès
// qu'une photo maison existe, la remplacer via
// scripts/integrer-photos-produits.mjs — les URL en base ne changent pas.
//
// Licences : voir ATTRIBUTIONS ci-dessous. Deux CC BY-SA imposent la mention
// de l'auteur ET le partage à l'identique ; elles sont créditées sur la page
// des mentions légales du site. Ne pas ajouter d'image ici sans y ajouter
// aussi son crédit.
//
// Usage : node scripts/integrer-focaccias.mjs

import sharp from 'sharp'

const UA = { 'User-Agent': 'CasaTasiaFournil/1.0 (https://casatasia.fr; contact@casatasia.fr) node' }
const L = 900, H = 675
const pause = (ms) => new Promise(r => setTimeout(r, ms))

// [slug, fichier Commons, licence, recadrage horizontal optionnel {x0,x1} en fractions]
const ATTRIBUTIONS = [
  ['focaccia-creme-fraiche-mozza', 'Burned Pizza.jpg',                  'Domaine public', null],
  ['focaccia-reine-blanche',       'Pizza with bacon and mozzarella.jpg','CC BY-SA 4.0',   null],
  // L'image montre DEUX pizzas ; celle aux anchois est à droite.
  ['focaccia-tomate-anchois',      'Focacce Fatte In Casa.jpg',          'CC BY-SA 4.0',   { x0: 0.45, x1: 1 }],
  ['focaccia-tomates-mozza',       'Bari, Italy - panoramio (1).jpg',    'CC BY 3.0',      null],
]

async function urlHauteRes(fichier) {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  for (const [k, v] of Object.entries({
    format: 'json', action: 'query', titles: `File:${fichier}`,
    prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '1600' })) u.searchParams.set(k, v)
  for (let e = 0; e < 3; e++) {
    try {
      const d = await (await fetch(u, { headers: UA })).json()
      const p = Object.values((d.query || {}).pages || {})[0]
      const ii = (p?.imageinfo || [{}])[0]
      if (ii.thumburl || ii.url) return ii.thumburl || ii.url
    } catch {}
    await pause(900)
  }
  return null
}

for (const [slug, fichier, licence, recadre] of ATTRIBUTIONS) {
  const url = await urlHauteRes(fichier)
  if (!url) { console.log(`  ✗ ${slug} : ${fichier} introuvable`); continue }

  let buf = null
  for (let e = 0; e < 4; e++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); break } } catch {}
    await pause(800 * (e + 1))
  }
  if (!buf) { console.log(`  ✗ ${slug} : téléchargement échoué`); continue }

  let img = sharp(buf).rotate()
  if (recadre) {
    const m = await sharp(buf).metadata()
    img = img.extract({
      left: Math.round(m.width * recadre.x0), top: 0,
      width: Math.round(m.width * (recadre.x1 - recadre.x0)), height: m.height })
  }
  await img.resize(L, H, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 88 })
    .toFile(`public/produits/${slug}.jpg`)

  console.log(`  ✓ ${slug.padEnd(30)} ${licence.padEnd(15)} ${fichier}`)
  await pause(350)
}
