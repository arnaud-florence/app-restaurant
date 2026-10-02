// L'offre Krill — proposition 056/260178 du 02/10/2026, valable au 31/10.
//
// Nouveau fournisseur, apporté par le gérant. 33 références, relues DANS le
// PDF (jamais recopiées à la main : recopier un code article, c'est faire
// chiffrer un autre produit et s'en apercevoir à la livraison).
//
// ⚠️ « Le prix net issu de la remise est indicatif » — c'est imprimé sur
// l'offre. Ces prix sont donc une PROPOSITION, pas un prix payé :
// `nature = 'devis'`, et rien n'est écrit dans `ingredients.prix_achat_ht`.
// Un devis peut être un tarif d'appel consenti pour emporter un client (0152).
//
// ⚠️ Le PDF vit dans `data/devis-krill-2026-10-02.pdf`, GITIGNORÉ :
// conditions négociées, dépôt public.
//
//   node scripts/import-offre-krill.mjs [--ecrire]
import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const PDF = 'data/devis-krill-2026-10-02.pdf'
const DATE = '2026-10-02'

// ── lecture du PDF, ligne par ligne recomposée par coordonnées ───────
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), useSystemFonts: true }).promise
const brutes = []
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent()
  const parY = new Map()
  for (const it of tc.items) {
    if (!it.str?.trim()) continue
    const y = Math.round(it.transform[5])
    if (!parY.has(y)) parY.set(y, [])
    parY.get(y).push({ x: it.transform[4], s: it.str })
  }
  for (const y of [...parY.keys()].sort((a, b) => b - a))
    brutes.push(parY.get(y).sort((a, b) => a.x - b.x).map(o => o.s).join(' ').replace(/\s+/g, ' ').trim())
}
// Une ligne d'article : CODE (6 chiffres) … UNITÉ … PRIX
const UNITES = { KILO: 'kg', UNITE: 'piece', SACHET: 'contenant', LITRE: 'L' }
const lignes = []
for (const t of brutes) {
  const m = t.match(/^(\d{6})\s+(.+?)\s+(KILO|UNITE|SACHET|LITRE)\s+([\d.,]+)$/)
  if (!m) continue
  lignes.push({
    reference: m[1],
    designation: m[2].replace(/^¤\s*/, '').trim(),   // ¤ = marqueur d'offre, pas du libellé
    unite: UNITES[m[3]],
    prix_ht: Number(m[4].replace(',', '.')),
  })
}
if (lignes.length < 30) { console.log(`\n  ⚠️ ${lignes.length} lignes seulement — l'extraction a échoué, rien n'est écrit.\n`); process.exit(1) }

// ── contenance : SEULEMENT quand la désignation la dit sans ambiguïté ──
//
// ⚠️ On ne déduit AUCUNE contenance d'un format incertain. « CARPACCIO SAUMON
// 70 G X 5 … X4 » facturé à l'UNITÉ : l'unité est-elle le sachet de 5, la
// barquette ou le colis de 4 ? À 16,89 € les trois lectures sont plausibles,
// elles diffèrent d'un facteur vingt. Sans prix de référence, l'écran dit
// « non comparable » plutôt qu'un €/kg inventé.
//
// ⚠️ Et un multiplicateur (« X 30 », « X 10 X6 ») est un COLISAGE, pas une
// contenance : le prix affiché est celui d'UNE pièce.
const CONTENANCE = {
  // bouteilles et boîtes : le poids du contenant facturé est écrit
  '875032': [0.92, 'kg'], '873090': [0.95, 'kg'], '877000': [0.95, 'kg'], '872189': [0.95, 'kg'],
  '872168': [4.1, 'kg'], '872184': [0.95, 'kg'], '879021': [4.15, 'kg'],
  // pièces uniques dont le poids est celui de l'unité facturée
  '673491': [2, 'kg'], '673406': [1.6, 'kg'], '673514': [1.1, 'kg'],
  // pâtisseries à la pièce : le poids de LA pièce
  '670709': [0.083, 'kg'], '670082': [0.08, 'kg'], '670379': [0.12, 'kg'],
  '670099': [0.097, 'kg'], '670879': [0.11, 'kg'], '671008': [0.08, 'kg'],
  '671015': [0.08, 'kg'], '670157': [0.08, 'kg'], '670091': [0.106, 'kg'],
  '675000': [0.065, 'kg'], '671139': [0.09, 'kg'], '670223': [0.1, 'kg'],
  // dosettes
  '875031': [0.01, 'kg'], '873089': [0.004, 'kg'], '877037': [0.01, 'kg'],
}

// ── fournisseur ──────────────────────────────────────────────────────
let [krill] = await sb('fournisseurs?nom=eq.Krill&select=id,nom')
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — offre Krill 056/260178 ──\n`)
console.log(`   ${lignes.length} références lues dans le PDF`)
if (!krill) {
  console.log('   fournisseur « Krill » à créer')
  if (ECRIRE) [krill] = await sb('fournisseurs', { method: 'POST', body: JSON.stringify({
    nom: 'Krill', actif: true, contact: 'Jean-Noël Gracianette', telephone: '06 23 62 27 47',
    conditions_tarifaires: 'Proposition 056/260178 du 02/10/2026, valable au 31/10/2026. '
      + '⚠️ L’offre imprime « le prix net issu de la remise est indicatif » : ces prix sont une '
      + 'proposition, pas un prix payé. Entité facturante : PRENOT GUINARD.' }) })
} else console.log(`   fournisseur « Krill » déjà en base`)

const avecCont = lignes.filter(l => CONTENANCE[l.reference]).length
console.log(`   ${avecCont} avec une contenance établie · ${lignes.length - avecCont} sans, donc non comparables au kilo\n`)
for (const l of lignes) {
  const c = CONTENANCE[l.reference]
  const ref = c ? `  ${(l.prix_ht / c[0]).toFixed(3).padStart(8)} €/${c[1]}` : '        —      '
  console.log(`   ${l.reference}  ${String(l.prix_ht).padStart(7)} €/${l.unite.padEnd(10)}${ref}  ${l.designation.slice(0, 50)}`)
}
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ⚠️ La clé unique est (fournisseur, référence, date) : réimporter la MÊME
// offre corrige, une offre d'une autre date s'ajoute et l'ancienne survit.
// C'est elle qui rendra une hausse lisible.
await sb(`catalogue_fournisseur?fournisseur_id=eq.${krill.id}&date_tarif=eq.${DATE}`, { method: 'DELETE' })
await sb('catalogue_fournisseur', { method: 'POST', body: JSON.stringify(lignes.map(l => ({
  fournisseur_id: krill.id, reference: l.reference, designation: l.designation,
  unite: l.unite, prix_ht: l.prix_ht,
  contenance_valeur: CONTENANCE[l.reference]?.[0] ?? null,
  contenance_unite: CONTENANCE[l.reference]?.[1] ?? null,
  date_tarif: DATE, source: 'devis Krill 056/260178', nature: 'devis',
  // ⚠️ Un devis est chiffré NOMMÉMENT pour CASATASIA : la remise est connue.
  tarif_negocie: true, actif: true,
}))) })
console.log(`\n   ✓ ${lignes.length} références importées\n`)
