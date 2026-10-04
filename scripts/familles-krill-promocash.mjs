// LES RAYONS DE KRILL ET DE PROMOCASH — 04/10/2026.
//
// ⚠️ Krill (35 réfs) et Promocash (18) sont arrivés sans AUCUNE famille : le filtre par
// catégorie de `/admin/achats` ne rendait donc rien chez lui, et on ne
// pouvait pas répondre à « qu'est-ce qu'il a en dessert ? ».
//
// ⚠️ LES FAMILLES SONT CELLES DÉJÀ EN USAGE dans le catalogue (Gineys,
// Félix Potin), pas des noms inventés : `rayonFournisseur()` les range par
// MOTS-CLÉS, et un nom neuf tomberait en « Non classé ». On ne crée pas une
// taxonomie par fournisseur.
//
//   node scripts/familles-krill.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}
// ⚠️ L'ORDRE COMPTE : le PRODUIT passe avant le mode de conservation ou le
// contenant, sinon « TARTE SAUMON » tombe à la marée et « ECLAIR … BOITE »
// aux emballages. Même règle que `rayonFournisseur()`.
const REGLES = [
  [/quiche|tarte saumon|tarte.*brocolis|artichaut confit/i, 'TRAITEUR'],
  [/eclair|brownie|brookie|cookie|coulant|charlotte|flan patissier|gateau|tarte pomme|tarte tatin|tartelette|paris-brest|brioche/i, 'DESSERTS PÂTISSIERS'],
  [/carpaccio saumon|fish *(&|and) *chips|st jacques|saint.jacques/i, 'MARÉE'],
  [/carpaccio vb/i, 'VIANDE'],
  [/mayonnaise|moutarde|ketchup|sauce (caesar|tartare|pizza)/i, 'SAUCES FROIDES'],
  [/oignon|poivron|olive/i, 'LÉGUMES'],
  // ── Promocash ──
  // ⚠️ « SAC CROIS », « BOL SALADE », « SERV » sont des EMBALLAGES, pas de
  // l'alimentaire : rangés ailleurs, on les chercherait au rayon traiteur.
  [/^\d+sac |bol salade|serv blc|caissette/i, 'PRODUITS SERVICES'],
  [/ketchup|sce barbecue|sauce/i, 'SAUCES FROIDES'],
  [/coca|orangina|oasis|pago|ice tea|red bull|ciao|nectar|j pommes|cherry coke/i, 'BOISSONS'],
  [/sel fin|poivre|[ée]pice/i, 'ÉPICERIE'],
]
const fs2 = await sb('fournisseurs?select=id,nom&nom=in.(Krill,Promocash)')
const ids = fs2.map(x => x.id).join(',')
const c = await sb(`catalogue_fournisseur?select=id,designation,famille&fournisseur_id=in.(${ids})&order=designation`)
const plan = []
for (const x of c) {
  const r = REGLES.find(([re]) => re.test(x.designation))
  plan.push({ ...x, nouvelle: r ? r[1] : null })
}
const g = {}
for (const p of plan) g[p.nouvelle ?? '✗ non classé'] = (g[p.nouvelle ?? '✗ non classé'] ?? 0) + 1
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ${c.length} références Krill + Promocash ──\n`)
for (const [k, v] of Object.entries(g).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`)
const rien = plan.filter(p => !p.nouvelle)
if (rien.length) {
  // ⚠️ On ne range PAS au jugé : une famille approximative met le produit
  // dans le mauvais rayon, et on ne le retrouve plus en commandant.
  console.log(`\n   non classées, laissées telles quelles :`)
  for (const p of rien) console.log(`      ${p.designation}`)
}
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
let n = 0
for (const p of plan) {
  if (!p.nouvelle || p.famille === p.nouvelle) continue
  await sb(`catalogue_fournisseur?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ famille: p.nouvelle }) })
  n++
}
console.log(`\n   ✓ ${n} référence(s) rangée(s)\n`)
