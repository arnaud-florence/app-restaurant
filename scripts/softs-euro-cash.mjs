// Les 1,5 L s'achètent chez Euro-Cash — décision du gérant, 02/10/2026.
//
// ⚠️⚠️ ON POSE LE FOURNISSEUR, PAS UNE RÉFÉRENCE.
// Euro-Cash a bien un rayon « Boissons — PET & verres perdus » (86 réfs), mais
// deux choses manquent et aucune ne se devine :
//   1. il est revenu ENTIÈREMENT NON CHIFFRÉ de leur devis (3 rayons sur 21
//      l'ont été) — donc aucun prix à écrire ;
//   2. ses désignations ne portent AUCUN format : « Coca Cola », « Sprite »,
//      « Coca Zéro », sans la contenance. Un PET existe en 50 cl, 1 L, 1,25 L,
//      1,5 L et 2 L.
// Choisir une de ces lignes pour notre 1,5 L serait inventer une référence —
// et une référence fausse passe AVANT le nom au rapprochement des factures
// (0142) : elle se tromperait en silence, et pour toujours.
//
// Le coût de 1,50 € reste une HYPOTHÈSE posée à la création des produits. Il
// n'y a pas de drapeau `prix_estime` sur `recettes` (0165 ne l'a posé que sur
// `ingredients`) : la première facture Euro-Cash le remplacera.
//
//   node scripts/softs-euro-cash.mjs [--ecrire]
import fs from 'node:fs'
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const [ec] = await sb('fournisseurs?nom=eq.Euro-Cash&select=id,nom')
const softs = await sb('recettes?nom=ilike.*1,5 L*&actif=is.true&select=id,nom,fournisseur_id&order=nom')

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — les 1,5 L chez Euro-Cash ──\n`)
for (const s of softs) {
  const deja = s.fournisseur_id === ec.id
  console.log(`  ${deja ? '=' : '→'} ${s.nom.padEnd(26)} Euro-Cash${deja ? ' (déjà)' : ''}`)
  if (!ECRIRE || deja) continue
  // `reference_fournisseur` reste VIDE : voir l'en-tête. Jamais de code inventé.
  await sb(`recettes?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ fournisseur_id: ec.id }) })
}
console.log(`\n  ⚠️ À RELANCER CHEZ EURO-CASH — leur devis a laissé 18 rayons sur 21 vides :`)
console.log(`     • le format 1,5 L de chaque soft (Coca, Coca Zéro, Orangina, Ice Tea, Oasis)`)
console.log(`       → leur rayon PET ne dit pas les contenances : demander le format AVEC le code`)
console.log(`     • Pamplemousse 49965, Cranberry 50042, Ginger Ale 50068, Ginger Beer 50070`)
console.log(`     • et Fanta 1,5 L, qu'ils n'ont pas du tout`)
console.log(ECRIRE ? '' : '\n  (essai à blanc — relancer avec --ecrire)\n')
