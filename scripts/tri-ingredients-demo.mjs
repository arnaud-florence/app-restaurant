#!/usr/bin/env node
// Sortir le jeu de DÉMO du catalogue d'ingrédients.
//
// 108 ingrédients ont été créés en mai-juin 2026 par le bouton « pack
// catalogue démarrage » de /admin/recettes (src/lib/catalogue-seed.ts) :
// fournisseurs fictifs (Metro France, Sysco, Brake, Pomona, Transgourmet),
// et des lignes qui ne sont manifestement pas d'une boulangerie de village —
// taurine, glucuronolactone, inositol, dioxyde de carbone, colorant caramel,
// malt pils, houblon en pellets. Quelqu'un avait semé une recette de boisson
// énergisante et un brassin de bière.
//
// Ils polluent tout ce qui lit les ingrédients : /admin/ingredients, le
// sélecteur des fiches techniques, les alertes de stock, la comparaison des
// tarifs fournisseurs.
//
// ⚠️ ON DÉSACTIVE, ON NE SUPPRIME PAS. `ingredients.actif = false` les sort
// de l'écran (qui filtre sur « actifs » par défaut) et des sélecteurs, sans
// emporter `historique_prix_ingredients` ni `mouvements_stock`. Une
// suppression ne se défait pas ; une désactivation, si.
//
// ⚠️⚠️ SIX SONT ÉPARGNÉS, ET C'EST TOUT L'INTÉRÊT DU SCRIPT : de VRAIES
// lignes de facture et de VRAIS tarifs fournisseurs s'y sont rattachés depuis.
// Les désactiver ferait disparaître un prix d'achat réellement payé, et la
// comparaison de tarifs qui va avec. Le critère n'est donc pas la date de
// création mais l'USAGE — comme pour la demande de tarif Gel Var.
//
// Usage : node scripts/tri-ingredients-demo.mjs [--ecrire]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ECRIRE = process.argv.includes('--ecrire')

const sb = (chemin, init = {}) => fetch(`${U}/rest/v1/${chemin}`, {
  ...init,
  headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
}).then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) }))

// ⚠️ La date SEULE ne suffit pas à désigner le jeu de démo : de vrais
// ingrédients du Fournil ont pu être créés à la même période. Mais aucun des
// 108 n'a de `libelle_achat` ni de `reference_fournisseur`, et c'est le vrai
// marqueur — ces deux champs ne se remplissent qu'au scan d'une facture.
const AVANT = '2026-07-01'

const { data: demo } = await sb(
  `ingredients?select=id,nom,actif,stocke,categorie,fournisseur_principal&created_at=lt.${AVANT}&order=nom`)
if (!Array.isArray(demo)) { console.error('lecture impossible', demo); process.exit(1) }

console.log(`\n── Tri du jeu de démo ──\n`)
console.log(`${demo.length} ingrédient(s) créé(s) avant le ${AVANT}\n`)

// ── Ce qui PROTÈGE un ingrédient de la désactivation ──────────────────────
// Une ligne de facture ou un tarif fournisseur est une donnée RÉELLE : ils
// portent un prix payé ou proposé. `historique_prix_ingredients` et
// `mouvements_stock`, eux, ont été créés par le seed lui-même — une ligne
// d'historique par ingrédient sert de point de départ, elle ne prouve rien.
const ids = demo.map(d => d.id)
const par = (n) => ids.slice(n * 60, (n + 1) * 60)
const proteges = new Map()
for (const table of ['facture_lignes', 'catalogue_fournisseur', 'recette_ingredients', 'inventaires', 'lots_produits']) {
  for (let n = 0; n * 60 < ids.length; n++) {
    const lot = par(n); if (lot.length === 0) break
    const { data } = await sb(`${table}?select=ingredient_id&ingredient_id=in.(${lot.join(',')})`)
    for (const r of data ?? []) {
      if (!r.ingredient_id) continue
      if (!proteges.has(r.ingredient_id)) proteges.set(r.ingredient_id, new Set())
      proteges.get(r.ingredient_id).add(table)
    }
  }
}

const aGarder = demo.filter(d => proteges.has(d.id))
const aSortir = demo.filter(d => !proteges.has(d.id) && d.actif)

console.log(`GARDÉS — de vraies données s'y rattachent (${aGarder.length}) :`)
for (const g of aGarder) {
  console.log(`   ${g.nom.padEnd(24)} ${[...proteges.get(g.id)].join(', ')}`)
}
console.log(`\nÀ DÉSACTIVER (${aSortir.length}) — aucun rattachement réel.`)
console.log(`   exemples : ${aSortir.slice(0, 8).map(d => d.nom).join(', ')}…`)

// ⚠️ Un ingrédient encore COMPTÉ à l'inventaire ne doit jamais être désactivé
// en silence : il disparaîtrait de la feuille de comptage du matin.
const comptes = aSortir.filter(d => d.stocke)
if (comptes.length > 0) {
  console.log(`\n   ⚠️ ${comptes.length} sont marqués « comptés au stock » : ${comptes.map(d => d.nom).join(', ')}`)
  console.log('      Ils sortiraient de la feuille d\'inventaire — à confirmer avant écriture.')
}

if (!ECRIRE) {
  console.log('\n(essai à blanc — relancer avec --ecrire)\n')
  process.exit(0)
}

// Sauvegarde AVANT écriture, hors dépôt : le dépôt est public, et une
// sauvegarde qu'on ne retrouve pas n'en est pas une.
const sauvegarde = `/tmp/ingredients-demo-${new Date().toISOString().slice(0, 10)}.json`
fs.writeFileSync(sauvegarde, JSON.stringify(demo, null, 1))
console.log(`\nsauvegarde : ${sauvegarde}`)

let n = 0
for (let i = 0; i * 60 < aSortir.length; i++) {
  const lot = aSortir.slice(i * 60, (i + 1) * 60).map(d => d.id)
  if (lot.length === 0) break
  const r = await sb(`ingredients?id=in.(${lot.join(',')})`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ actif: false }),
  })
  if (!r.ok) { console.error('échec', r.status, JSON.stringify(r.data)); process.exit(1) }
  n += lot.length
}
console.log(`\n✓ ${n} ingrédient(s) désactivé(s). Réversible : /admin/ingredients → filtre « Inactifs ».\n`)
