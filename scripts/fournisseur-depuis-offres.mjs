// Poser un vrai fournisseur là où `fournisseur_principal` ne porte qu'une NOTE.
//
// ⚠️ `ingredients.fournisseur_principal` est un CHAMP LIBRE (module 3). Il
// contient tantôt un fournisseur, tantôt « ESTIMATION 21/09/2026 — à remplacer
// par la première facture ». `lireFournisseur()` démêle les deux, et une
// matière dont le champ ne porte qu'une note est traitée comme SANS
// interlocuteur : elle sort des bons de commande, en silence.
//
// On ne devine pas : on ne pose un nom que s'il existe une OFFRE CHIFFRÉE au
// catalogue, rattachée à cette matière par un humain. Et on retient le MOINS
// CHER parmi les offres comparables — la règle du gérant depuis le 27/09.
//
// ⚠️ Le PRIX n'est pas touché : un devis est une proposition, une facture est
// une preuve (0151). `prix_estime` reste vrai jusqu'à la première livraison.
//
//   node scripts/fournisseur-depuis-offres.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const q = async p => { const o = []; let f = 0; for (;;) {
  const r = await fetch(`${U}/rest/v1/${p}${p.includes('?') ? '&' : '?'}order=id&limit=1000&offset=${f}`, { headers: H })
  const j = await r.json(); if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300))
  o.push(...j); if (j.length < 1000) return o; f += 1000 } }

const { comparer } = await import('../.next/cache/tarifs-lib/tarifs-fournisseurs.js')
const fourn = new Map((await q('fournisseurs?select=id,nom')).map(f => [f.id, f.nom]))
const brut = (await q('catalogue_fournisseur?actif=eq.true&ingredient_id=not.is.null&select=id,reference,designation,prix_ht,unite,colis_quantite,contenance_valeur,contenance_unite,cle_comparaison,nature,ingredient_id,fournisseur_id'))
  .filter(l => l.prix_ht != null)
  .map(l => ({ ...l, prix_ht: Number(l.prix_ht), colis_quantite: l.colis_quantite == null ? null : Number(l.colis_quantite),
    contenance_valeur: l.contenance_valeur == null ? null : Number(l.contenance_valeur), fournisseur: { nom: fourn.get(l.fournisseur_id) } }))

// Le moins cher par matière, calculé par comparer() — jamais par un min brut :
// un min naïf oppose un colis de 3 000 serviettes à un paquet de 200.
const meilleur = new Map()
for (const g of comparer(brut)) {
  for (const l of g.lignes) {
    if (!l.ingredient_id || l.ref == null) continue
    const cur = meilleur.get(l.ingredient_id)
    if (!cur || l.ref.prix < cur.prix) meilleur.set(l.ingredient_id, { prix: l.ref.prix, unite: l.ref.unite, nom: l.fournisseur?.nom, des: l.designation })
  }
}
// Repli : une matière à offre unique n'a pas de groupe comparable, mais elle a
// bien un fournisseur — se taire ici la laisserait hors des bons de commande.
for (const l of brut) if (!meilleur.has(l.ingredient_id))
  meilleur.set(l.ingredient_id, { prix: null, nom: fourn.get(l.fournisseur_id), des: l.designation })

const ing = await q('ingredients?stocke=eq.true&actif=eq.true&select=id,nom,unite,fournisseur_principal,prix_achat_ht')
const note = f => !f || /^(ESTIMATION|estimation)/.test(f.trim())

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — fournisseur posé depuis les offres ──\n`)
let n = 0, reste = []
for (const i of ing) {
  if (!note(i.fournisseur_principal)) continue
  const m = meilleur.get(i.id)
  if (!m?.nom) { reste.push(i.nom); continue }
  n++
  console.log(`  ${i.nom.slice(0, 30).padEnd(31)} « ${(i.fournisseur_principal ?? '—').slice(0, 30)} »`)
  console.log(`  ${' '.repeat(31)} → ${m.nom}${m.prix != null ? `  (${m.prix.toFixed(3).replace('.', ',')} €/${m.unite}, le moins cher)` : '  (offre unique)'}`)
  if (ECRIRE) await fetch(`${U}/rest/v1/ingredients?id=eq.${i.id}`, { method: 'PATCH', headers: H,
    body: JSON.stringify({ fournisseur_principal: m.nom }) })
}
console.log(`\n  ${n} fournisseur(s) posé(s)`)
console.log(`  ${reste.length} matière(s) toujours sans aucune offre : ${reste.join(', ')}`)
console.log(ECRIRE ? '\n  ✓ écrit. ⚠️ Les PRIX restent estimés jusqu’à la première facture.\n' : '\n  (essai à blanc)\n')
