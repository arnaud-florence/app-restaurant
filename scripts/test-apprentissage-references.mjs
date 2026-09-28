// L'apprentissage des références au scan d'une facture.
//
// Sans lui, la référence extraite par le scanner était JETÉE : chaque facture
// repassait par le libellé, et les 134 lignes déjà scannées n'ont laissé
// AUCUNE référence derrière elles. Le rapprochement restait fragile pour
// toujours.
//
// Ce test vérifie surtout ce que l'apprentissage REFUSE d'apprendre : une
// référence fausse passe avant le nom, donc elle se trompe en silence et
// définitivement.
//
//   node scripts/test-apprentissage-references.mjs
import { readFileSync } from 'node:fs'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); return t ? JSON.parse(t) : null
}
let ok = 0, ko = 0
const t = (nom, cond, detail = '') => { if (cond) { console.log(`  ✓ ${nom}`); ok++ } else { console.log(`  ✗ ${nom} — ${detail}`); ko++ } }

console.log('\n── Apprentissage des références fournisseur ──\n')

// La règle, recopiée du code (actions.ts) — modifier les deux ensemble.
const apprend = ({ reference, parReference, nbTrouves, dejaUneRef }) =>
  Boolean(reference) && !parReference && nbTrouves === 1 && !dejaUneRef

t('une ligne référencée, rapprochée par le nom, sur UN produit → apprise',
  apprend({ reference: '52055', parReference: false, nbTrouves: 1, dejaUneRef: false }))
t('sans référence sur la ligne → rien à apprendre',
  !apprend({ reference: null, parReference: false, nbTrouves: 1, dejaUneRef: false }))
t('déjà rapproché PAR la référence → on ne réécrit pas ce qu’on savait',
  !apprend({ reference: '52055', parReference: true, nbTrouves: 1, dejaUneRef: false }))
t('le nom désigne PLUSIEURS produits → ambigu, on n’apprend rien',
  !apprend({ reference: '52055', parReference: false, nbTrouves: 4, dejaUneRef: false }))
t('le produit a déjà une référence → jamais écrasée',
  !apprend({ reference: '52055', parReference: false, nbTrouves: 1, dejaUneRef: true }))

// ── Contrôle sur données réelles : rien ne doit être cassé ──────────
// ⚠️ RÉVISÉ le 28/09/2026. Cette assertion exigeait qu'AUCUNE référence ne
// soit partagée par deux produits. C'est faux par construction : un seul
// achat nourrit souvent plusieurs produits vendus — le demi et la pinte
// sortent du même fût, le shot et la dose de tequila de la même bouteille,
// les deux pizzas à la plaque de la même plaque crue (le cas documenté du
// `filter` plutôt que du `find`), et les quatre cafés de la même capsule.
// Le test était rouge sur le modèle lui-même.
//
// Ce qui serait une VRAIE erreur, c'est une même référence chez DEUX
// FOURNISSEURS DIFFÉRENTS : la ligne de facture ne saurait plus lequel elle
// alimente, et le prix partirait sur le mauvais produit.
const recs = await sb('recettes?select=id,nom,reference_fournisseur,fournisseur_id&actif=eq.true')
const parRef = new Map()
for (const r of (recs ?? [])) {
  if (!r.reference_fournisseur) continue
  if (!parRef.has(r.reference_fournisseur)) parRef.set(r.reference_fournisseur, new Set())
  parRef.get(r.reference_fournisseur).add(r.fournisseur_id ?? null)
}
const ambigus = [...parRef].filter(([, f]) => [...f].filter(Boolean).length > 1)
t('aucune référence partagée par DEUX fournisseurs différents',
  ambigus.length === 0, ambigus.map(([r]) => r).join(', '))
t(`${parRef.size} référence(s) produit posée(s)`, parRef.size > 0)

const ings = await sb('ingredients?select=id,reference_fournisseur&actif=eq.true')
const refsI = (ings ?? []).map(r => r.reference_fournisseur).filter(Boolean)
t('aucune référence matière en double',
  refsI.filter((r, i) => refsI.indexOf(r) !== i).length === 0)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko ? 1 : 0)
