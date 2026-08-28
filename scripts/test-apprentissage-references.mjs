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
const recs = await sb('recettes?select=id,reference_fournisseur&actif=eq.true')
const refs = (recs ?? []).map(r => r.reference_fournisseur).filter(Boolean)
const doublons = refs.filter((r, i) => refs.indexOf(r) !== i)
t('aucune référence produit en double', doublons.length === 0, doublons.join(', '))

const ings = await sb('ingredients?select=id,reference_fournisseur&actif=eq.true')
const refsI = (ings ?? []).map(r => r.reference_fournisseur).filter(Boolean)
t('aucune référence matière en double',
  refsI.filter((r, i) => refsI.indexOf(r) !== i).length === 0)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko ? 1 : 0)
