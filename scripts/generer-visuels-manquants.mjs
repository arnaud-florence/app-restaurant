// Génère un visuel de repli pour les produits du Fournil qui n'ont pas de photo.
//
// Ces produits sont arrivés par le catalogue de la caisse et ne figurent sur
// AUCUNE affiche CasaTasia : il n'y a donc rien à y découper (cf.
// scripts/generer-photos-fournil.mjs). On ne récupère pas non plus les visuels
// de marque des boissons sur le web — photographies sous droits et marques
// déposées, sur un site marchand : le risque juridique serait pour le
// restaurant, pas pour l'auteur du script.
//
// À la place, une plaque typographique reprenant l'identité des affiches :
// fond vert prélevé sur l'affiche « Nos boissons » (#12200c), filets et texte
// or (#E8B86D), nom du produit en serif. Le format est celui des vraies
// photos (900×675) pour que la grille du site reste régulière.
//
// ⚠️ Ce sont des visuels d'attente. Dès que le fournil photographie ces
// produits, remplacer les fichiers : les URL en base ne changent pas.
//
// Usage : node scripts/generer-visuels-manquants.mjs

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const L = 900, H = 675
const VERT_HAUT = '#16250f'
const VERT_BAS = '#0d1a0a'
const OR = '#e8b86d'
const OR_PALE = '#c9a15c'

// [slug, nom affiché, format]
const VISUELS = [
  ['focaccia-creme-fraiche-mozza', 'Focaccia', 'crème fraîche · mozzarella'],
  ['focaccia-reine-blanche',       'Focaccia', 'reine blanche'],
  ['focaccia-tomate-anchois',      'Focaccia', 'tomate · anchois'],
  ['focaccia-tomates-mozza',       'Focaccia', 'tomates · mozzarella'],
  ['ciao',                         'Ciao',            '33 cl'],
  ['coca-cola-cherry',             'Coca-Cola Cherry', '33 cl'],
  ['fanta',                        'Fanta',           '33 cl'],
  ['oasis',                        'Oasis',           '33 cl'],
  ['red-bull',                     'Red Bull',        '25 cl'],
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Réduit la taille du titre quand il est long, pour qu'il tienne sur une ligne
// sans jamais déborder du cadre.
const taille = (nom) => (nom.length <= 9 ? 78 : nom.length <= 14 ? 62 : 50)

function plaque(nom, format) {
  const t = taille(nom)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
  <defs>
    <linearGradient id="fond" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${VERT_HAUT}"/>
      <stop offset="100%" stop-color="${VERT_BAS}"/>
    </linearGradient>
  </defs>
  <rect width="${L}" height="${H}" fill="url(#fond)"/>

  <!-- Double filet or, comme le cadre des affiches -->
  <rect x="26" y="26" width="${L - 52}" height="${H - 52}" fill="none"
        stroke="${OR}" stroke-opacity="0.55" stroke-width="2.5"/>
  <rect x="38" y="38" width="${L - 76}" height="${H - 76}" fill="none"
        stroke="${OR}" stroke-opacity="0.22" stroke-width="1"/>

  <!-- Filet supérieur à losange, motif des séparateurs de l'affiche -->
  <line x1="330" y1="228" x2="420" y2="228" stroke="${OR}" stroke-opacity="0.5" stroke-width="1.5"/>
  <line x1="480" y1="228" x2="570" y2="228" stroke="${OR}" stroke-opacity="0.5" stroke-width="1.5"/>
  <path d="M450 220 L458 228 L450 236 L442 228 Z" fill="${OR}" fill-opacity="0.75"/>

  <text x="${L / 2}" y="330" text-anchor="middle" fill="${OR}"
        font-family="Georgia, 'Times New Roman', serif" font-size="${t}" font-weight="bold">
    ${esc(nom)}
  </text>

  <text x="${L / 2}" y="392" text-anchor="middle" fill="${OR_PALE}"
        font-family="Georgia, 'Times New Roman', serif" font-size="30" font-style="italic">
    ${esc(format)}
  </text>

  <line x1="330" y1="446" x2="570" y2="446" stroke="${OR}" stroke-opacity="0.35" stroke-width="1"/>

  <text x="${L / 2}" y="586" text-anchor="middle" fill="${OR}" fill-opacity="0.6"
        font-family="Georgia, 'Times New Roman', serif" font-size="21" letter-spacing="6">
    CASATASIA
  </text>
  <text x="${L / 2}" y="618" text-anchor="middle" fill="${OR}" fill-opacity="0.4"
        font-family="Georgia, 'Times New Roman', serif" font-size="16" letter-spacing="3" font-style="italic">
    Le Fournil
  </text>
</svg>`
}

mkdirSync('public/produits', { recursive: true })

let n = 0
for (const [slug, nom, format] of VISUELS) {
  await sharp(Buffer.from(plaque(nom, format)))
    .jpeg({ quality: 86 })
    .toFile(`public/produits/${slug}.jpg`)
  console.log(`  ✓ ${slug}.jpg    ${nom} — ${format}`)
  n++
}
console.log(`\n${n} visuel(s) généré(s) dans public/produits/`)
