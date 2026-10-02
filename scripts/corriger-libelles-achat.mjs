// Des libellés d'achat trop courts aspiraient les entrées des autres —
// 02/10/2026, trouvé par `audit-chaine-livraison.mjs`.
//
// `(ops)/inventaire` et `/admin/reassort` cherchent le libellé du fournisseur
// DANS la description de la ligne de document. Un libellé court est donc
// contenu dans les libellés longs, et absorbe leurs entrées en silence :
//
//   « Orange »       ⊂ « Fanta Orange IVC 25cl [promo] »
//   « Fanta Orange » ⊂ « Fanta Orange IVC 25cl [promo] »
//   « Pomme »        ⊂ « CHAUSSON AU POMME CRU 100G DELICES C=54 »
//
// Les 96 canettes de Fanta livrées le 01/10 seraient entrées TROIS fois :
// au Fanta 25 cl du bar, au Fanta 33 cl du Fournil, et au jus d'orange.
//
// ⚠️ ON EFFACE PLUTÔT QUE DE DEVINER. Un libellé absent fait retomber le
// rapprochement sur le nom du produit — qui ne matchera rien, donc aucune
// entrée. C'est un manque, visible et réparable au premier scan. Un libellé
// faux, lui, écrit un stock faux sans rien signaler, et on ne le découvre
// qu'en comptant. Le manque est réparable, pas le faux.
//
// ⚠️ La vraie correction de fond serait que le rapprochement retienne le
// libellé le PLUS LONG qui matche, au lieu de tous. Elle vit dans deux
// implémentations (la page d'inventaire en porte une copie en ligne) : à
// faire ensemble, pas la veille d'une ouverture.
//
//   node scripts/corriger-libelles-achat.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const A_EFFACER = [
  ['Jus d’orange 33 cl', 'Orange', 'contenu dans « Fanta Orange IVC 25cl [promo] » ET « Fanta Orange »'],
  ["Jus d'orange 33 cl", 'Orange', 'contenu dans « Fanta Orange IVC 25cl [promo] » ET « Fanta Orange »'],
  ['Jus de pomme 33 cl', 'Pomme', 'contenu dans « CHAUSSON AU POMME CRU 100G DELICES C=54 »'],
  ['Fanta 33 cl', 'Fanta Orange', 'contenu dans « Fanta Orange IVC 25cl [promo] »'],
]
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — libellés d'achat qui en absorbent d'autres ──\n`)
for (const [nom, attendu, pourquoi] of A_EFFACER) {
  const [p] = await sb(`recettes?nom=eq.${encodeURIComponent(nom)}&select=id,nom,libelle_achat`)
  if (!p) continue
  if ((p.libelle_achat ?? '').trim() !== attendu) { console.log(`   = ${nom} porte « ${p.libelle_achat ?? '—'} », pas « ${attendu} » — laissé tel quel`); continue }
  console.log(`   ✗ ${nom.padEnd(22)} « ${attendu} » effacé`)
  console.log(`     ${pourquoi}`)
  if (ECRIRE) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ libelle_achat: null }) })
}
console.log(ECRIRE ? '' : '\n  (essai à blanc — relancer avec --ecrire)\n')
