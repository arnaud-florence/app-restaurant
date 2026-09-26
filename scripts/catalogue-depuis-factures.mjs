// Le catalogue de nos fournisseurs historiques, tiré de nos propres factures.
//
//   node scripts/catalogue-depuis-factures.mjs [--ecrire]
//
// Gineys, Promocash et Lavazza n'ont jamais envoyé de devis : ce qu'on sait
// de leurs prix vient des factures scannées. C'est même mieux qu'un devis —
// ce sont des prix RÉELLEMENT PAYÉS. Mais il faut que ça se voie, d'où
// `nature = 'facture'` (0152) : arbitrer un fournisseur sur un tarif d'appel
// qu'on ne reverra jamais se paie pendant des mois.
//
// ⚠️ RIEN N'EST REDEVINÉ. Le rattachement (matière ou produit) est recopié
// de la ligne de facture, qui l'a obtenu par référence, par libellé ou par
// un humain dans /admin/correspondances. Refaire le travail ici, c'est se
// tromper une deuxième fois, différemment.
//
// ⚠️ LE PRIX D'UNE LIGNE EST CELUI DE SON UNITÉ DE LIGNE, pas de la pièce.
// « CROISSANT PREPOUSSE 70G C=96 » à 28,84 € est le prix du CARTON. Écrit
// tel quel comme prix à la pièce, il donnait un croissant à 28 € — la faute
// du 22/08 qui avait corrompu quatre produits. Le colisage vient du `C=N`,
// et sans lui on n'écrit AUCUNE contenance.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}
// Les règles de lecture d'un tarif (unité de facturation, colisage C=N,
// contenance) vivent dans `_tarifs-communs.mjs` : l'import du portail Gineys
// en a besoin à l'identique, et deux copies finissent toujours par diverger.
import { UNITE, REFERENCE, conditionnement, contenance, norme } from './_tarifs-communs.mjs'

const [fournisseurs, factures, ings, recs] = await Promise.all([
  sb('fournisseurs?select=id,nom'),
  sb('factures_fournisseurs?select=id,fournisseur_id,numero,date_emission,type_document'),
  sb('ingredients?select=id,nom'),
  sb('recettes?select=id,nom'),
])
const lignes = await sb('facture_lignes?select=id,facture_id,description,reference,unite,prix_unitaire_ht,ingredient_id,recette_id,ignoree&ignoree=eq.false')

const nomF = new Map(fournisseurs.map(f => [f.id, f.nom]))
const nomI = new Map(ings.map(i => [i.id, i.nom]))
const nomR = new Map(recs.map(r => [r.id, r.nom]))
const parFacture = new Map(factures.map(f => [f.id, f]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)

// ⚠️ Un AVOIR porte des montants négatifs : c'est de la marchandise rendue,
// pas un tarif. La 0127 le dit déjà pour la propagation des prix d'achat.
const retenues = lignes.filter(l => {
  const f = parFacture.get(l.facture_id)
  return f && f.type_document !== 'avoir' && Number(l.prix_unitaire_ht) > 0
})

// Un seul tarif par article et par fournisseur : le PLUS RÉCENT. Garder les
// quatre passages d'un croissant ferait quatre lignes au catalogue et un
// « moins cher » choisi au hasard entre elles.
const meilleure = new Map()
for (const l of retenues) {
  const f = parFacture.get(l.facture_id)
  const cle = `${f.fournisseur_id}|${norme(l.description)}`
  const vue = meilleure.get(cle)
  if (!vue || (f.date_emission ?? '') > (parFacture.get(vue.facture_id).date_emission ?? '')) meilleure.set(cle, l)
}

const rows = [], sansContenance = []
for (const l of meilleure.values()) {
  const f = parFacture.get(l.facture_id)
  // ⚠️ Une unité manquante n'est PAS une pièce. « PQ 200 SERV BLC » à 1,15 €
  // est un paquet de deux cents serviettes : lu comme une pièce, il faisait
  // dire à l'écran que Promocash vendait la serviette quatre-vingt-huit fois
  // le prix de Gineys, alors qu'elle est moins chère. `inconnu` ne se compare
  // à rien, et l'écran demande la contenance.
  // Tout code inconnu — y compris une unité absente, comme sur les tickets
  // Promocash — est un CONTENANT : on cherche sa contenance, on ne la
  // suppose pas.
  const unite = UNITE[l.unite] ?? 'contenant'
  let cv = null, cu = null
  if (unite === 'colis') {
    const n = conditionnement(l.description)
    if (n) { cv = n; cu = 'piece' } else sansContenance.push(l.description)
  } else if (!REFERENCE.has(unite)) {
    // ⚠️ SEULEMENT pour un contenant. Le prix d'une ligne facturée au kilo ou
    // au litre EST déjà le prix de référence : « HUILE GIDOLIVE BID=5L,
    // q=5 L, pu=4,133 » coûte 4,133 €/L. Le rediviser par les 5 L lus dans
    // le libellé donnait 0,827 €/L — et l'écran annonçait 496 % d'écart avec
    // le devis Félix Potin, sur un prix qu'on paie nous-mêmes. Même faute sur
    // le saumon (42 € au lieu de 21) et les olives (4,12 au lieu de 10,30).
    const c = contenance(l.description)
    if (c) { cv = c.valeur; cu = c.unite }
  }
  rows.push({
    fournisseur_id: f.fournisseur_id,
    // Les factures déjà scannées n'ont pas de référence (elle n'était pas
    // extraite à l'époque) : le libellé normalisé sert de clé stable, sinon
    // l'upsert ne saurait pas quoi remplacer.
    reference: l.reference ?? norme(l.description).slice(0, 60),
    designation: l.description.replace(/\s+/g, ' ').trim(),
    famille: null,
    unite,
    prix_ht: Number(l.prix_unitaire_ht),
    colis_quantite: null,
    colis_libelle: l.unite,
    contenance_valeur: cv,
    contenance_unite: cu,
    // Le rattachement vient de la ligne, jamais d'une nouvelle déduction.
    cle_comparaison: l.ingredient_id ? nomI.get(l.ingredient_id) ?? null
      : l.recette_id ? nomR.get(l.recette_id) ?? null : null,
    ingredient_id: l.ingredient_id,
    recette_id: l.recette_id,
    date_tarif: f.date_emission,
    source: `Facture ${f.numero} du ${f.date_emission}`,
    nature: 'facture',
    actif: true,
  })
}

const parFournisseur = {}
for (const r of rows) {
  const n = nomF.get(r.fournisseur_id) ?? '?'
  parFournisseur[n] ??= { total: 0, matiere: 0, produit: 0, orphelin: 0 }
  parFournisseur[n].total++
  if (r.ingredient_id) parFournisseur[n].matiere++
  else if (r.recette_id) parFournisseur[n].produit++
  else parFournisseur[n].orphelin++
}
for (const [n, s] of Object.entries(parFournisseur))
  console.log(`  ${n.padEnd(12)} ${String(s.total).padStart(4)} article(s) — ${s.matiere} matière(s), ${s.produit} produit(s), ${s.orphelin} sans rattachement`)
console.log(`\n  total : ${rows.length}`)
if (sansContenance.length)
  console.log(`  ⚠️ ${sansContenance.length} colis sans C=N : aucun prix à la pièce ne sera affiché pour eux`)

// Ce qui devient comparable : une clé portée par DEUX fournisseurs au moins.
const deja = await sb('catalogue_fournisseur?select=cle_comparaison,fournisseur_id&cle_comparaison=not.is.null')
const parCle = new Map()
for (const x of [...deja, ...rows].filter(x => x.cle_comparaison)) {
  if (!parCle.has(x.cle_comparaison)) parCle.set(x.cle_comparaison, new Set())
  parCle.get(x.cle_comparaison).add(x.fournisseur_id)
}
const duels = [...parCle.entries()].filter(([, s]) => s.size > 1)
console.log(`  face-à-face entre fournisseurs : ${duels.length}`)
for (const [cle] of duels) console.log(`     · ${cle}`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
const ecrites = await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif',
  { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows) })
console.log(`\n  → ${ecrites.length} tarif(s) enregistré(s), marqués « facture ».\n`)
