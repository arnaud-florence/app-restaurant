// L'affiche A4 des pains — à donner au fabricant de panneau.
//
// ⚠️ LES PRIX SONT LUS DANS LA BASE, JAMAIS RETAPÉS. C'est la règle déjà
// posée pour la carte des boissons : une carte tapée à la main finit
// toujours par afficher un autre prix que le ticket, et c'est le prix
// AFFICHÉ que le client est en droit de payer. Un prix corrigé dans l'outil
// (donc dans la caisse) change l'affiche au prochain tirage.
//
// ⚠️ Les photos sont celles du catalogue Arti'Pat, extraites par
// `photos-pains-artipat.mjs` — pas des images d'ambiance. Le client vient
// chercher au comptoir ce qu'il a vu sur le panneau.
//
// Sort un JPEG 300 dpi ET un PDF A4 d'une page : un imprimeur veut un
// format de page exact, pas une image dont il devra deviner l'échelle.
//
//   node scripts/affiche-pains.mjs [--ecrire]

import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')
const PHOTOS = 'data/affiche-pains'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY

// slug du fichier photo ← nom du produit en base
const SLUG = {
  'Baguette classique': 'baguette-classique',
  'Baguette Jeannette': 'baguette-jeannette',
  'Baguette Paris': 'baguette-paris',
  'Campestre multicéréales': 'campestre-multicereales',
  'Pain complet': 'pain-complet',
  'Pain restaurant': 'pain-restaurant',
  'Pavé Le Jeannot': 'pave-le-jeannot',
}

// A4 à 300 dpi
const L = 2480, H = 3508
const VERT = '#253328', CREME = '#faf8f4', GRIS = '#6b6b63'
const MARGE = 150, ENTETE = 430, PIED = 190
const PHOTO_L = 700, PHOTO_H = 330
const PRIX_PX = 104, NOM_PX = 86, NOM_PX_MIN = 56
// Largeur réservée au prix, mesurée sur le plus large : « 10,00 € ».
const COL_PRIX = 430, GOUTTIERE = 60

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const eur = n => n.toFixed(2).replace('.', ',') + ' €'

const sb = async p => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

const prod = await sb('recettes?select=nom,prix_vente_ht,tva&actif=eq.true&categorie=eq.Pain')
// ⚠️ On trie par PRIX croissant : c'est l'ordre dans lequel on choisit un
// pain, pas l'alphabet.
const pains = prod
  .map(p => ({ nom: p.nom, ttc: Number(p.prix_vente_ht) * (1 + Number(p.tva) / 100) }))
  .sort((a, b) => a.ttc - b.ttc)

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · affiche A4 des pains ──\n`)

// ⚠️ Un pain sans photo ferait une ligne vide au milieu du panneau, et un
// pain ABSENT de la base ne serait tout simplement pas affiché — personne ne
// s'en apercevrait avant d'avoir le panneau imprimé entre les mains.
const manquants = pains.filter(p => !SLUG[p.nom] || !fs.existsSync(path.join(PHOTOS, SLUG[p.nom] + '.jpg')))
if (manquants.length) {
  console.error(`⛔ sans photo : ${manquants.map(m => m.nom).join(', ')}`)
  console.error(`   → node scripts/photos-pains-artipat.mjs --ecrire`)
  process.exit(1)
}
const orphelines = Object.keys(SLUG).filter(n => !pains.some(p => p.nom === n))
if (orphelines.length) console.log(`   ℹ photo sans produit actif : ${orphelines.join(', ')}`)

for (const p of pains) console.log(`   ${p.nom.padEnd(26)} ${eur(p.ttc).padStart(8)}`)
console.log(`\n   ${pains.length} pains`)
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

const rowH = Math.floor((H - ENTETE - PIED) / pains.length)
const nomX = MARGE + PHOTO_L + 70
const NOM_MAX = L - MARGE - COL_PRIX - GOUTTIERE - nomX

// ⚠️ LA TAILLE DU NOM S'AJUSTE, elle n'est pas réglée à la main.
// « Campestre multicéréales » chevauchait son prix au premier tirage, et le
// prochain pain ajouté aurait rouvert le défaut en silence — sur un panneau
// imprimé, pas à l'écran. 0,60 est la largeur moyenne d'un caractère en
// Helvetica Bold ; on reste volontairement pessimiste.
const taille = nom => {
  const px = Math.floor(NOM_MAX / (nom.length * 0.60))
  return Math.max(NOM_PX_MIN, Math.min(NOM_PX, px))
}
const troplong = pains.filter(p => taille(p.nom) === NOM_PX_MIN)
if (troplong.length) console.log(`   ⚠️ nom(s) à la limite de lisibilité : ${troplong.map(p => p.nom).join(', ')}`)
const calques = []

// ── en-tête ──
const logo = 'public/logo-casatasia.png'
if (fs.existsSync(logo)) {
  const l = await sharp(logo).resize({ width: 560 }).toBuffer()
  const m = await sharp(l).metadata()
  calques.push({ input: l, left: Math.round((L - 560) / 2), top: Math.round((ENTETE - m.height) / 2) - 40 })
}

// ── photos ──
for (let i = 0; i < pains.length; i++) {
  const y = ENTETE + i * rowH
  const img = await sharp(path.join(PHOTOS, SLUG[pains[i].nom] + '.jpg'))
    .resize(PHOTO_L, PHOTO_H, { fit: 'cover', position: 'centre' })
    .toBuffer()
  calques.push({ input: img, left: MARGE, top: Math.round(y + (rowH - PHOTO_H) / 2) })
}

// ── textes et filets ──
let svg = `<svg width="${L}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${L}" height="${H}" fill="${CREME}"/>
  <rect x="0" y="0" width="${L}" height="${ENTETE}" fill="${VERT}"/>
  <text x="${L / 2}" y="${ENTETE - 62}" text-anchor="middle" font-family="Helvetica,Arial"
        font-size="74" font-weight="bold" letter-spacing="26" fill="#ffffff">NOS PAINS</text>`
for (let i = 0; i < pains.length; i++) {
  const y = ENTETE + i * rowH, cy = y + rowH / 2
  if (i) svg += `<rect x="${MARGE}" y="${y}" width="${L - 2 * MARGE}" height="2" fill="#dcd6cb"/>`
  svg += `<text x="${nomX}" y="${cy + 26}" font-family="Helvetica,Arial" font-size="${taille(pains[i].nom)}"
            font-weight="bold" fill="${VERT}">${esc(pains[i].nom)}</text>`
  svg += `<text x="${L - MARGE}" y="${cy + 34}" text-anchor="end" font-family="Helvetica,Arial"
            font-size="${PRIX_PX}" font-weight="bold" fill="${VERT}">${esc(eur(pains[i].ttc))}</text>`
}
const auj = new Date().toLocaleDateString('fr-FR')
svg += `<text x="${L / 2}" y="${H - 108}" text-anchor="middle" font-family="Helvetica,Arial"
          font-size="40" fill="${GRIS}">Prix TTC &#183; Parking des Ferrages, 83136 Sainte-Anastasie-sur-Issole</text>
        <text x="${L / 2}" y="${H - 56}" text-anchor="middle" font-family="Helvetica,Arial"
          font-size="32" fill="${GRIS}">Tarifs au ${auj}</text></svg>`

const jpg = `${PHOTOS}-A4.jpg`
await sharp(Buffer.from(svg))
  .composite(calques)
  .withMetadata({ density: 300 })
  .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
  .toFile(jpg)
console.log(`\n   ✓ ${jpg}`)

// ── PDF A4 d'une page, le JPEG inclus tel quel (DCTDecode) ──
// ⚠️ Un imprimeur veut une page au format exact : une image seule le laisse
// deviner l'échelle, et un panneau mal mis à l'échelle se refait.
const jd = fs.readFileSync(jpg)
const PT_L = 595.276, PT_H = 841.89
const objets = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_L} ${PT_H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  null, // image
  null, // flux
]
const flux = `q ${PT_L} 0 0 ${PT_H} 0 0 cm /Im0 Do Q`
const tete = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')
const morceaux = [tete]; const pos = []; let off = tete.length
const pousse = b => { morceaux.push(b); off += b.length }
for (let i = 0; i < 5; i++) {
  pos.push(off)
  if (i === 3) {
    pousse(Buffer.from(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${L} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jd.length} >>\nstream\n`, 'latin1'))
    pousse(jd); pousse(Buffer.from('\nendstream\nendobj\n', 'latin1'))
  } else if (i === 4) {
    pousse(Buffer.from(`5 0 obj\n<< /Length ${flux.length} >>\nstream\n${flux}\nendstream\nendobj\n`, 'latin1'))
  } else {
    pousse(Buffer.from(`${i + 1} 0 obj\n${objets[i]}\nendobj\n`, 'latin1'))
  }
}
const debutXref = off
let xref = `xref\n0 6\n0000000000 65535 f \n`
for (const p of pos) xref += `${String(p).padStart(10, '0')} 00000 n \n`
xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`
morceaux.push(Buffer.from(xref, 'latin1'))
const pdf = `${PHOTOS}-A4.pdf`
fs.writeFileSync(pdf, Buffer.concat(morceaux))
console.log(`   ✓ ${pdf}  (A4 exact, ${(fs.statSync(pdf).size / 1024 / 1024).toFixed(1)} Mo)\n`)
