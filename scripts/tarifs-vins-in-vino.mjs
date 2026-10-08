// La carte des vins In Vino — coefficient 4 sur le PRIX D'ACHAT, 10 € sur
// la pizza.
//
// Décision du gérant, 06/10/2026, en deux temps. D'abord « 25 % de food cost
// sur place » ; puis, les chiffres sous les yeux, « mets plutôt sur le prix
// d'achat ». Le TTC vaut donc QUATRE FOIS le prix payé au fournisseur.
//
// ⚠️⚠️ CE N'EST PAS LA MÊME CHOSE, ET L'ÉCART EST ÉNORME EN HAUT DE CARTE.
// Le food cost se mesure sur le HT, le client paie le TTC : viser 25 % de
// food cost sur de l'alcool revient à un coefficient de 4,8 sur l'achat, pas
// de 4. Le champagne sortait à 91 € ; au coefficient 4 il sort à 76 €. Même
// consigne en apparence, quinze euros d'écart sur la bouteille.
//
// ⚠️ Un coefficient 4 TTC sur un achat HT donne exactement 30 % de food cost
// (1,2 ÷ 4), sur toute la gamme et quel que soit le prix. C'est la règle
// classique de la carte des vins, et elle a l'avantage d'être vérifiable de
// tête au comptoir : le prix affiché est le prix payé fois quatre.
//
// ⚠️ LES PRIX SONT ARRONDIS À L'EURO SUPÉRIEUR, jamais à l'inférieur : au
//-dessus, le food cost reste SOUS 25 % ; en dessous il passerait au-dessus
// de la consigne sans que personne ne le voie. Un prix de carte se lit
// 36,00 €, pas 35,28 €.
//
// ⚠️ UN SEUL PRODUIT PORTE LES DEUX PRIX pour l'entrée de gamme.
// `prix_sur_place_ttc` existe exactement pour ça (0144) : `prix_vente_ht`
// alimente `price_togo` (10 € avec la pizza), `prix_sur_place_ttc` alimente
// `price` (19 € à table). Créer deux fiches ferait deux boutons au comptoir
// et l'équipe taperait le mauvais un vendredi soir.
//
// ⚠️ AUCUN VIN N'EST `vendable_online` (0144) : pas de contrôle d'âge sur le
// click & collect. Le prix « à emporter » est celui du COMPTOIR et de la
// tournée, pas celui du site.
//
// ⚠️ Les six nouvelles fiches sont en BAR, comme la Bouteille Coteaux Varois
// et le Crémant : c'est le bar qui sert le vin, et la ventilation du CA suit
// `etablissement_id`. À déplacer en Restauration si le gérant préfère que ces
// bouteilles comptent pour la salle.
//
//   node scripts/tarifs-vins-in-vino.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')
// TTC = prix d'achat × COEF. Un seul nombre à bouger pour revoir la carte.
const COEF = 4

// nom de carte, coût d'achat HT (facture FAC-829)
const NOUVEAUX = [
  ['Côte du Rhône Lucien Tramier',          6.00],
  ['Château La Lieue tradition rosé',       7.35],
  ['Bordeaux supérieur Toulouse-Lautrec',   7.50],
  ['Château La Lieue tradition blanc',      9.00],
  ['Château La Lieue Batilde Philomène',    9.90],
  ['Champagne Pol Cochet',                 18.90],
]
// L'entrée de gamme : fiches DÉJÀ en place, taguées PIZZA, déjà à 10 € TTC.
const ENTREE = ['Bouteille de vin rouge 75 cl', 'Bouteille de vin rosé 75 cl', 'Bouteille de vin blanc 75 cl']
const COUT_ENTREE = 3.90, EMPORTER_TTC = 10.00

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers ?? {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const f = n => n.toFixed(2).replace('.', ',')
// TTC = achat × 4, arrondi AU-DESSUS. Au-dessus, le food cost reste SOUS
// 30 % ; en dessous il passerait au-dessus de la consigne sans que personne
// ne le voie. Et un prix de carte se lit 30,00 €, pas 29,40 €.
const tarif = cout => Math.ceil(cout * COEF)

// Le gabarit : on CLONE une fiche de vin existante plutôt que d'inventer des
// champs. `etablissement_id`, `tag_destination` et `tva` mal posés cassent en
// silence (ventilation du CA, bouton sans famille, TVA sous-collectée).
const [modele] = await sb('recettes?select=*&nom=eq.Bouteille%20Coteaux%20Varois')
if (!modele) { console.error('⛔ gabarit « Bouteille Coteaux Varois » introuvable'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · carte des vins In Vino ──\n`)
console.log(`   SUR PLACE, coefficient ${COEF} sur le prix d'achat`)
console.log('   vin                                  achat    ×4 exact   retenu   fc réel')
const aCreer = []
for (const [nom, cout] of NOUVEAUX) {
  const ttc = tarif(cout), ht = Math.round(ttc / 1.2 * 10000) / 10000
  const [deja] = await sb(`recettes?select=id,prix_vente_ht&nom=eq.${encodeURIComponent(nom)}`)
  console.log(`   ${nom.padEnd(36)} ${f(cout).padStart(6)} ${f(cout * COEF).padStart(8)} ${f(ttc).padStart(8)} ${(cout / ht * 100).toFixed(1).padStart(7)} %${deja ? '   (existe)' : ''}`)
  aCreer.push({ nom, cout, ttc, ht, id: deja?.id ?? null })
}

console.log('\n   À EMPORTER avec la pizza (fiches existantes, tag PIZZA)')
const entree = []
for (const nom of ENTREE) {
  const [p] = await sb(`recettes?select=id,nom,prix_vente_ht,prix_sur_place_ttc,cout_achat_ht,tag_destination&nom=eq.${encodeURIComponent(nom)}`)
  if (!p) { console.log(`   ⚠️ ${nom} introuvable — ignoré`); continue }
  const salle = tarif(COUT_ENTREE)
  const htEmp = Math.round(EMPORTER_TTC / 1.2 * 10000) / 10000
  console.log(`   ${nom.padEnd(36)} ${f(COUT_ENTREE).padStart(6)}  emporter ${f(EMPORTER_TTC)} € (fc ${(COUT_ENTREE / htEmp * 100).toFixed(1)} %)  ·  salle ${f(salle)} € (fc ${(COUT_ENTREE / (salle / 1.2) * 100).toFixed(1)} %)`)
  entree.push({ ...p, salle, htEmp })
}
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

for (const v of aCreer) {
  const champs = {
    nom: v.nom, nom_caisse: v.nom, categorie: 'Vin',
    tag_destination: modele.tag_destination, etablissement_id: modele.etablissement_id,
    prix_vente_ht: v.ht, tva: 20, contient_alcool: true,
    // ⚠️ Jamais en ligne : pas de contrôle d'âge sur le click & collect.
    vendable_online: false, actif: true,
    cout_achat_ht: v.cout, unites_par_achat: 1, nb_portions: 1, temps_preparation: 0,
    // Les sulfites sont vrais PAR DÉFINITION sur un vin — mais on ne SIGNE
    // pas la déclaration (`allergenes_valides_le` reste nul) : valider
    // affirme que la liste est COMPLÈTE, et ça se lit sur l'étiquette.
    allergenes_complementaires: ['sulfites'],
    type_revenu: 'vente', stock_minimum: 0, stock_cible: 1,
  }
  if (v.id) await sb(`recettes?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: v.ht, cout_achat_ht: v.cout }) })
  else await sb('recettes', { method: 'POST', body: JSON.stringify(champs) })
}
console.log(`\n   ✓ ${aCreer.length} bouteilles tarifées en salle`)

for (const p of entree) {
  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({
    cout_achat_ht: COUT_ENTREE, prix_vente_ht: p.htEmp, prix_sur_place_ttc: p.salle }) })
}
console.log(`   ✓ ${entree.length} bouteilles d'entrée de gamme : 10 € emporter / ${f(entree[0]?.salle ?? 0)} € salle`)
console.log(`\n   ⚠️ rien n'est encore dans la caisse — pousser avec l'import Zelty.\n`)
