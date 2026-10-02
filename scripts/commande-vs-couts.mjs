// Ce qu'on a COMMANDÉ face à ce que la carte UTILISE — 02/10/2026.
//
// Le bon FB-47231850 porte 47 lignes et des prix réels. Les coûts de la carte
// bar, eux, viennent du relevé Eazle du 21/09 — prix REMISÉ + droits
// d'accises. Les deux doivent concorder ; là où ils divergent, il faut savoir
// POURQUOI avant de toucher à un prix de vente.
//
// ⚠️ UN ÉCART N'EST PAS FORCÉMENT UNE ERREUR DE NOTRE CÔTÉ. La commande
// 47231850 a été facturée au TARIF PUBLIC — la remise du contrat n'a pas été
// appliquée, c'est signalé à France Boissons et une correction est annoncée.
// Un prix commandé PLUS CHER que notre coût est donc le symptôme attendu, pas
// une sous-estimation de la carte. L'inverse, lui, serait grave.
//
// ⚠️⚠️ ON NE COMPARE QUE CE QUI EST COMPARABLE, ET C'EST LA MOITIÉ DU TRAVAIL.
// Trois familles, trois bases, et deux d'entre elles ne se comparent PAS en
// l'état :
//
//   1. SOFTS, EAUX, BIÈRES BOUTEILLE — ligne en « unité », une unité achetée
//      = une unité vendue. Comparaison DIRECTE, c'est la seule fiable ici.
//
//   2. SPIRITUEUX ET APÉRITIFS — ligne en « pièce », donc le prix d'une
//      BOUTEILLE. Diviser par le rendement ne suffit pas : la ligne du bon
//      est NETTE DE DROITS D'ACCISES, que `cout_achat_ht` inclut (relevé du
//      21/09). Sur un spiritueux les droits pèsent autant que la bouteille —
//      7,15 € pour une 70 cl à 40°. D'où des « −45 % » qui ne sont pas une
//      marge sous-estimée mais une taxe absente d'un côté. NON COMPARÉS.
//
//   3. FÛTS — la ligne est au LITRE, pas au fût : « Birra Moretti, 60 unité,
//      5,20 € » est 60 litres à 5,20 €/L, soit trois fûts de 20 L. Divisé par
//      les 80 demis d'un fût, ça donnait « −93 % ». NON COMPARÉS.
//
// Un chiffre absurde dans un rapport ne se corrige pas tout seul : il discrédite
// les dix-neuf lignes justes qui l'entourent.
//
// ⚠️ On ne réécrit AUCUN coût ici. Tant que l'avoir n'est pas arrivé, on ne
// sait pas lequel des deux prix on paiera : écrire le prix public écraserait
// la remise négociée, écrire la remise affirmerait un avoir qu'on n'a pas.
//
//   node scripts/commande-vs-couts.mjs
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const sb = async p => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return JSON.parse(t)
}
const e = n => n == null ? '—' : n.toFixed(4).replace('.', ',')
const [bon] = await sb('bons_commande?reference=eq.FB-47231850&select=id,reference,montant_total_ht')
const lignes = await sb(`bon_commande_lignes?bon_commande_id=eq.${bon.id}&select=libelle,quantite_commandee,prix_unitaire_ht,recette_id,ingredient_id`)

const ids = lignes.filter(l => l.recette_id).map(l => l.recette_id)
const prods = await sb(`recettes?id=in.(${[...new Set(ids)].join(',')})&select=id,nom,categorie,cout_achat_ht,prix_vente_ht,tva,prix_sur_place_ttc,unites_par_achat,nom_matiere`)
const parId = new Map(prods.map(p => [p.id, p]))

console.log(`\n════ ${bon.reference} — ${lignes.length} lignes commandées, ${bon.montant_total_ht} € ════\n`)
const ecarts = [], ok = [], orphelines = [], horsBase = []
for (const l of lignes) {
  if (!l.recette_id) { orphelines.push(l); continue }
  const p = parId.get(l.recette_id)
  const n = p.unites_par_achat == null ? null : Number(p.unites_par_achat)
  const notre = p.cout_achat_ht == null ? null : Number(p.cout_achat_ht)
  const brut = Number(l.prix_unitaire_ht)
  if (n == null || n <= 0) { horsBase.push({ l, p, cmd: brut, notre, pourquoi: 'rendement inconnu' }); continue }
  if (n !== 1) {
    horsBase.push({ l, p, cmd: brut, notre, n,
      pourquoi: p.categorie === 'Bière' || /pression|demi|pinte/i.test(p.nom)
        ? 'ligne au LITRE, pas au fût' : 'ligne NETTE de droits d\'accises' })
    continue
  }
  if (notre == null) { ecarts.push({ l, p, cmd: brut, notre, pct: null, n }); continue }
  const pct = (brut - notre) / notre * 100
  ;(Math.abs(pct) < 1 ? ok : ecarts).push({ l, p, cmd: brut, notre, pct, n })
}
console.log(`── ${ecarts.length} écarts entre le prix commandé et le coût de la carte\n`)
console.log('   produit                        commandé    carte     écart')
for (const x of ecarts.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)))
  console.log(`   ${x.p.nom.slice(0, 29).padEnd(29)} ${e(x.cmd).padStart(8)} ${e(x.notre).padStart(9)} `
    + `${(x.pct == null ? 'coût inconnu' : (x.pct > 0 ? '+' : '') + x.pct.toFixed(1).replace('.', ',') + ' %').padStart(10)}`
    )

const haut = ecarts.filter(x => x.pct != null && x.pct > 0)
const bas = ecarts.filter(x => x.pct != null && x.pct < 0)
if (haut.length) {
  const m = haut.reduce((s, x) => s + x.pct, 0) / haut.length
  console.log(`\n   ${haut.length} commandés PLUS CHER que la carte, de ${m.toFixed(1).replace('.', ',')} % en moyenne.`)
  console.log(`   C'est le symptôme ATTENDU de la remise non appliquée sur cette`)
  console.log(`   commande : la carte porte le prix remisé du relevé du 21/09.`)
}
if (bas.length) {
  console.log(`\n   ⚠️⚠️ ${bas.length} commandés MOINS CHER que la carte — l'inverse du symptôme.`)
  console.log(`   Sur une ligne comparable, c'est notre coût qui est trop haut,`)
  console.log(`   donc une marge SOUS-ESTIMÉE :`)
  for (const x of bas) console.log(`      ${x.p.nom.slice(0, 29).padEnd(29)} ${e(x.cmd)} vs ${e(x.notre)}`)
}
console.log(`\n── ${ok.length} concordent au centime`)
if (horsBase.length) {
  console.log(`\n── ${horsBase.length} lignes NON COMPARÉES, et c'est voulu`)
  const par = {}
  for (const x of horsBase) (par[x.pourquoi] ??= []).push(x)
  for (const [raison, l] of Object.entries(par)) {
    console.log(`\n   ${raison} — ${l.length} ligne(s)`)
    for (const x of l) console.log(`      ${x.p.nom.slice(0, 29).padEnd(29)} bon ${e(x.cmd).padStart(8)}  carte ${e(x.notre).padStart(8)}  (÷ ${x.n ?? '?'})`)
  }
}
console.log(`\n── ${orphelines.length} lignes commandées qui ne nourrissent AUCUN produit`)
console.log(`   (consommables, café, matières — pas une anomalie, mais rien n'en`)
console.log(`    tire de coût tant qu'elles ne sont pas rattachées) :`)
for (const l of orphelines) console.log(`      ${e(Number(l.prix_unitaire_ht)).padStart(8)} × ${String(l.quantite_commandee).padStart(3)}  ${l.libelle}`)
console.log('')
