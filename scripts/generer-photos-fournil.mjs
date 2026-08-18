// Génère les 60 photos produit du Fournil en les découpant dans les 13 affiches
// CasaTasia, vers public/produits/*.jpg (900×675, JPEG qualité 86).
//
// Les rectangles sont exprimés en fractions de la largeur/hauteur de l'affiche,
// donc indépendants de la résolution d'export des affiches. Ils sont calés au
// plus près du produit, hors cartouches dorés (nom et prix) : une photo qui
// embarquerait le prix deviendrait fausse à la première hausse de tarif.
//
// À rejouer si les affiches changent, puis vérifier visuellement le rendu.
//
// Usage : AFFICHES=/chemin/vers/les/affiches node scripts/generer-photos-fournil.mjs

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const D = process.env.AFFICHES ?? '/Users/admin/Downloads'
const AFF = {
  pains:      `${D}/06CFDCD0-9D1B-4564-B842-47B3C0240CD7.PNG`,
  vienn:      `${D}/7838880A-24A8-448B-A1DC-50731AC23AA5.PNG`,
  plaque:     `${D}/4EC8B528-492E-48A6-AA7C-A12852BD14B9.PNG`,
  rondes:     `${D}/75FDEF00-7D2D-4FDA-95E1-93A7EDD2C59C.PNG`,
  patis:      `${D}/09D47434-EA9E-4B8C-89C8-C1DD02FC3A92.PNG`,
  gourm:      `${D}/F9A48D2A-1ACE-4829-BAB2-18F2CEE531E8.PNG`,
  sandw:      `${D}/38C4B5E3-92E6-4799-936A-EEAC931208E8.PNG`,
  panini:     `${D}/F73ADA93-1E8D-4F23-B64E-DD4DB3677DF1.PNG`,
  salades:    `${D}/E41D58E2-8032-4B14-8FB8-9A2DABC693E9.PNG`,
  bfroides:   `${D}/4FC220BA-F898-486D-B510-B4EDFEF44FAE.PNG`,
  bchaudes:   `${D}/A487FBEE-1D36-42EB-AFE2-585076546157.PNG`,
  formules:   `${D}/099814DA-F850-4046-A680-9FBA9B707147.PNG`,
  petitdej:   `${D}/18538D70-4C15-49B3-AE74-BB207953AE97.PNG`,
}

// [slug, affiche, x0, y0, x1, y1]  — fractions de la largeur/hauteur de l'affiche
export const CROPS = [
  // ─── Pains & baguettes (4 lignes × 2 colonnes, photo à gauche de chaque carte)
  ['baguette-classique',      'pains', 0.0398,0.1019,0.2960,0.3016],
  ['baguette-victoire',       'pains', 0.5123,0.1019,0.7685,0.3016],
  ['campestre-multicereales', 'pains', 0.0398,0.3117,0.2960,0.5114],
  ['pain-complet',            'pains', 0.5123,0.3117,0.7685,0.5114],
  ['batard-cereales',         'pains', 0.0398,0.5215,0.2960,0.7212],
  ['batard-mais-graines',     'pains', 0.5123,0.5215,0.7685,0.7212],
  ['pain-lin-tournesol',      'pains', 0.0398,0.7312,0.2960,0.9310],
  ['pave-multicereales',      'pains', 0.5123,0.7312,0.7685,0.9310],
  // ─── Viennoiseries (paysage, 2×2)
  ['croissant',               'vienn', 0.0369,0.1945,0.2850,0.5171],
  ['pain-au-chocolat',        'vienn', 0.5074,0.1945,0.7555,0.5171],
  ['pain-aux-raisins',        'vienn', 0.0369,0.5332,0.2850,0.8558],
  ['chausson-aux-pommes',     'vienn', 0.5074,0.5332,0.7555,0.8558],
  // ─── Pâtisseries & desserts (5 lignes, photo à gauche)
  ['flan-patissier',          'patis', 0.0427,0.1320,0.4080,0.2748],
  ['tropezienne',             'patis', 0.0427,0.2815,0.4080,0.4390],
  ['tartelette-citron',       'patis', 0.0427,0.4423,0.4080,0.5932],
  ['eclair-chocolat',         'patis', 0.0427,0.5965,0.4080,0.7440],
  ['tiramisu',                'patis', 0.0427,0.7507,0.4080,0.9048],
  // ─── Gourmandises (3×2, photo en haut de carte)
  ['cannele',                 'gourm', 0.0313,0.1153,0.4744,0.2815],
  ['madeleine-choco-noisette','gourm', 0.5076,0.1153,0.9507,0.2815],
  ['cookie-chocolat',         'gourm', 0.0313,0.4102,0.4744,0.5663],
  ['sacristain',              'gourm', 0.5076,0.4102,0.9507,0.5663],
  ['muffin-choco-noisette',   'gourm', 0.0313,0.6829,0.4744,0.8180],
  ['muffin-citron',           'gourm', 0.5076,0.6829,0.9507,0.8180],
  // ─── Sandwichs froids (4 lignes)
  ['sandwich-parisien',       'sandw', 0.0285,0.1173,0.6262,0.3184],
  ['sandwich-poulet',         'sandw', 0.0285,0.3217,0.6262,0.5228],
  ['sandwich-rosette',        'sandw', 0.0285,0.5261,0.6262,0.7272],
  ['sandwich-nordique',       'sandw', 0.0285,0.7305,0.6262,0.9316],
  // ─── Paninis chauds (3 lignes)
  ['panini-jambon-fromage',   'panini',0.0142,0.1488,0.5598,0.3887],
  ['panini-poulet-pesto',     'panini',0.0142,0.3968,0.5598,0.6535],
  ['panini-chevre-miel',      'panini',0.0142,0.6602,0.5598,0.9182],
  // ─── Salades composées (3 lignes)
  ['salade-poulet-feta',      'salades',0.0380,0.1193,0.5787,0.3988],
  ['salade-italienne',        'salades',0.0380,0.4021,0.5787,0.6702],
  ['salade-saumon',           'salades',0.0380,0.6736,0.5787,0.9383],
  // ─── Pizzas à la plaque (paysage, 2 panneaux)
  ['pizza-plaque-margherita', 'plaque',0.0302,0.2068,0.4913,0.5693],
  ['pizza-plaque-jambon-fromage','plaque',0.5080,0.2068,0.9698,0.5693],
  // ─── Pizzas rondes (paysage, 3 panneaux)
  ['pizza-ronde-reine',       'rondes',0.0268,0.1945,0.3318,0.5265],
  ['pizza-ronde-poulet-pesto','rondes',0.3405,0.1945,0.6448,0.5265],
  ['pizza-ronde-chevre-miel', 'rondes',0.6535,0.1945,0.9584,0.5265],
  // ─── Boissons froides (5 lignes ; 3 lignes portent 2 produits → photo scindée)
  ['eau-plate',               'bfroides',0.0398,0.2078,0.2960,0.3552],
  ['eau-gazeuse',             'bfroides',0.0398,0.3619,0.2960,0.5027],
  ['coca-cola',               'bfroides',0.0400,0.5094,0.1950,0.6434],
  ['coca-cola-zero',          'bfroides',0.1800,0.5094,0.3350,0.6434],
  ['ice-tea',                 'bfroides',0.0400,0.6568,0.1950,0.7942],
  ['orangina',                'bfroides',0.1800,0.6568,0.3350,0.7942],
  ['jus-orange',              'bfroides',0.0400,0.8009,0.1950,0.9383],
  ['jus-pomme',               'bfroides',0.1800,0.8009,0.3350,0.9383],
  // ─── Boissons chaudes (3×2) — rectangles déjà en 4:3, cadrés sur le haut de
  //     la tasse (crema / mousse / thé). Les tasses sont coincées en portrait
  //     entre les cartouches dorés : un cadre plein pied ferait entrer le prix.
  ['cafe-expresso',           'bchaudes',0.0300,0.2000,0.2100,0.2955],
  ['cafe-allonge',            'bchaudes',0.5000,0.2000,0.6800,0.2955],
  ['cafe-noisette',           'bchaudes',0.0180,0.4320,0.1850,0.5211],
  ['cappuccino',              'bchaudes',0.5120,0.4300,0.7000,0.5298],
  ['chocolat-chaud',          'bchaudes',0.0150,0.6820,0.2050,0.7775],
  ['the',                     'bchaudes',0.5000,0.6800,0.6900,0.7805],
  // ─── Formules (4 lignes)
  ['formule-salade-boisson',  'formules',0.0427,0.2011,0.4459,0.3820],
  ['formule-sandwich-boisson','formules',0.0427,0.3887,0.4459,0.5663],
  ['formule-salade-complete', 'formules',0.0427,0.6066,0.4459,0.7708],
  ['formule-sandwich-complete','formules',0.0427,0.7775,0.4459,0.9484],
  // ─── Formules petit-déjeuner (4 lignes)
  ['formule-express',         'petitdej',0.0190,0.1508,0.4269,0.3485],
  ['formule-douceur-chaude',  'petitdej',0.0190,0.3519,0.4269,0.5429],
  ['formule-pdj-complet',     'petitdej',0.0190,0.5462,0.4269,0.7373],
  ['formule-tartine',         'petitdej',0.0190,0.7406,0.4269,0.9316],
]

mkdirSync('public/produits', { recursive: true })
const meta = {}
for (const k of Object.keys(AFF)) meta[k] = await sharp(AFF[k]).metadata()

for (const [slug, aff, x0, y0, x1, y1] of CROPS) {
  const { width: W, height: H } = meta[aff]
  const left = Math.round(x0 * W), top = Math.round(y0 * H)
  const width = Math.round((x1 - x0) * W), height = Math.round((y1 - y0) * H)
  await sharp(AFF[aff]).extract({ left, top, width, height })
    .resize(900, 675, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(`public/produits/${slug}.jpg`)
}
console.log(`✓ ${CROPS.length} photos écrites dans public/produits/`)
