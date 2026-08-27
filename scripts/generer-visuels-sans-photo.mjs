// Plaques d'attente pour les produits actifs sans photo.
//
// Le menu public exige DEUX conditions : une famille valide et une image.
// Sans visuel, un produit reste invisible du site — donc invendable en ligne,
// quel que soit son classement.
//
// Ces produits sont arrivés par le catalogue de la caisse et ne figurent sur
// aucune affiche CasaTasia : il n'y a rien à y découper. On ne reprend pas non
// plus les visuels de marque sur le web — photographies sous droits sur un
// site marchand, le risque serait pour le restaurant.
//
// À la place, une plaque typographique reprenant l'identité des affiches :
// fond vert (#16250f), filets et texte or (#E8B86D), nom en serif, au format
// des vraies photos (900×675) pour que la grille du site reste régulière.
//
// ⚠️ VISUELS D'ATTENTE. Dès que le fournil photographie ces produits, il
// suffit de remplacer les fichiers : les URL en base ne changent pas.
//
// ⚠️ Les images ne sont visibles qu'APRÈS déploiement (le site vitrine
// consomme /api/public/menu en CORS, l'URL doit rester absolue).
//
// Usage : node scripts/generer-visuels-sans-photo.mjs [--ecrire]
//         sans --ecrire, rien n'est écrit ni en base ni sur le disque.

import sharp from 'sharp'
import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const BASE_URL = 'https://app-restaurant-livid.vercel.app/produits'

// Familles jamais commandables en ligne — règle établie par la 0115 et
// vérifiée sur les 66 produits déjà photographiés : 0 sur 6 pour les boissons
// chaudes, 0 sur 8 pour les formules, 100 % partout ailleurs.
const JAMAIS_EN_LIGNE = new Set(['Boisson chaude', 'Formule', 'Formule petit-déjeuner'])
// Les composants de formule ne sont pas des produits autonomes : ils n'ont
// rien à faire sur la vitrine, avec ou sans visuel.
const EXCLUS = /^Formule\s*—/

const L = 900, H_IMG = 675
const VERT_HAUT = '#16250f', VERT_BAS = '#0d1a0a'
const OR = '#e8b86d', OR_PALE = '#c9a15c'

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const taille = nom => (nom.length <= 9 ? 78 : nom.length <= 14 ? 62 : nom.length <= 20 ? 50 : 42)

const slug = nom => nom.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Sépare « Pago pomme 33 cl » en titre et format. */
function titreEtFormat(nom, categorie) {
  const m = nom.match(/^(.*?)[\s,]*(\d+\s?(?:cl|ml|l|g|kg))\s*$/i)
  if (m) return [m[1].trim(), m[2].replace(/(\d)([a-z])/i, '$1 $2').toLowerCase()]
  // « Salade · salade » : quand la famille répète le nom, la seconde ligne
  // n'apprend rien. On la remplace par la maison plutôt que de bégayer.
  const fam = categorie.toLowerCase()
  return [nom, fam === nom.toLowerCase() ? 'fait maison' : fam]
}

function plaque(nom, format) {
  const t = taille(nom)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H_IMG}">
  <defs><linearGradient id="fond" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${VERT_HAUT}"/><stop offset="100%" stop-color="${VERT_BAS}"/>
  </linearGradient></defs>
  <rect width="${L}" height="${H_IMG}" fill="url(#fond)"/>
  <rect x="26" y="26" width="${L - 52}" height="${H_IMG - 52}" fill="none"
        stroke="${OR}" stroke-opacity="0.55" stroke-width="2.5"/>
  <rect x="38" y="38" width="${L - 76}" height="${H_IMG - 76}" fill="none"
        stroke="${OR}" stroke-opacity="0.22" stroke-width="1"/>
  <line x1="330" y1="228" x2="420" y2="228" stroke="${OR}" stroke-opacity="0.5" stroke-width="1.5"/>
  <line x1="480" y1="228" x2="570" y2="228" stroke="${OR}" stroke-opacity="0.5" stroke-width="1.5"/>
  <path d="M450 220 L458 228 L450 236 L442 228 Z" fill="${OR}" fill-opacity="0.75"/>
  <text x="${L / 2}" y="330" text-anchor="middle" fill="${OR}"
        font-family="Georgia, 'Times New Roman', serif" font-size="${t}" font-weight="bold">${esc(nom)}</text>
  <text x="${L / 2}" y="392" text-anchor="middle" fill="${OR_PALE}"
        font-family="Georgia, 'Times New Roman', serif" font-size="30" font-style="italic">${esc(format)}</text>
  <line x1="330" y1="446" x2="570" y2="446" stroke="${OR}" stroke-opacity="0.35" stroke-width="1"/>
  <text x="${L / 2}" y="586" text-anchor="middle" fill="${OR}" fill-opacity="0.6"
        font-family="Georgia, 'Times New Roman', serif" font-size="21" letter-spacing="6">CASATASIA</text>
  <text x="${L / 2}" y="618" text-anchor="middle" fill="${OR}" fill-opacity="0.4"
        font-family="Georgia, 'Times New Roman', serif" font-size="16" letter-spacing="3" font-style="italic">Le Fournil</text>
</svg>`
}

const q = async p => (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json()

const sans = await q('recettes?select=id,nom,categorie&actif=eq.true&image_url=is.null&order=categorie,nom')
const cibles = sans.filter(r => !EXCLUS.test(r.nom))
const ignores = sans.filter(r => EXCLUS.test(r.nom))

console.log(`${sans.length} produit(s) sans photo · ${cibles.length} à traiter · ${ignores.length} ignoré(s)\n`)
if (ignores.length) console.log(`  ignorés (composants de formule) : ${ignores.map(r => r.nom).join(', ')}\n`)

if (ECRIRE) fs.mkdirSync('public/produits', { recursive: true })

let n = 0
for (const r of cibles) {
  const [titre, format] = titreEtFormat(r.nom, r.categorie)
  const s = slug(r.nom)
  const enLigne = !JAMAIS_EN_LIGNE.has(r.categorie)
  console.log(`  ${r.nom.padEnd(30)} → ${s}.jpg   « ${titre} · ${format} »   en ligne : ${enLigne ? 'oui' : 'non'}`)
  if (!ECRIRE) continue

  await sharp(Buffer.from(plaque(titre, format))).jpeg({ quality: 86 }).toFile(`public/produits/${s}.jpg`)
  const rep = await fetch(`${U}/rest/v1/recettes?id=eq.${r.id}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ image_url: `${BASE_URL}/${s}.jpg`, vendable_online: enLigne }),
  })
  if (rep.ok) n++
  else console.log(`     ✗ base : HTTP ${rep.status}`)
}

console.log(ECRIRE
  ? `\n${n}/${cibles.length} visuels générés et rattachés.\n⚠️ Visibles seulement après déploiement.`
  : `\n(essai à blanc — relancer avec --ecrire pour générer)`)
