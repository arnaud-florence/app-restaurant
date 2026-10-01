// Reconstituer dans l'outil la commande France Boissons passée sur Eazle.
//
// ⚠️ POURQUOI : la facture de demain n'aura RIEN à quoi se comparer. Le
// mécanisme existe (`factures_fournisseurs.bon_commande_id`, et la réception
// confronte commandé / reçu ligne à ligne) mais la commande a été passée sur
// le portail du fournisseur, pas ici. Sans ce bon, on ne verra ni les
// manquants, ni les écarts de prix — et c'est précisément là qu'ils se voient.
//
// ⚠️ LE BON EST CRÉÉ « ENVOYÉ », PAS BROUILLON, ET RIEN NE PART. Il a
// réellement été envoyé — le 30/09, depuis Eazle. Le laisser en brouillon
// mentirait, et le marquer envoyé sans horodatage fait tomber l'assertion
// « aucun bon envoyé sans horodatage d'envoi ». `envoye_a` porte le portail,
// pas une adresse e-mail : aucun message n'a transité par l'outil.
//
// ⚠️ LES PRIX SONT CEUX DU BON, DONC LE TARIF PUBLIC. La remise négociée
// n'y figurait pas ; signalée au commercial, correction annoncée. C'est
// justement l'écart que la comparaison avec la facture doit rendre visible.
//
//   node scripts/bon-depuis-commande-fb.mjs [--ecrire]
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
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const f2 = n => n.toFixed(2).replace('.', ',')

const cmd = JSON.parse(fs.readFileSync('data/france-boissons-commande-47231850.json', 'utf8'))
// Le relevé du panier de la veille porte les RÉFÉRENCES, que l'écran de
// commande n'affiche pas. On les récupère par le nom, entre deux documents
// du même fournisseur à un jour d'écart — pas par devinette.
const panier = JSON.parse(fs.readFileSync('data/france-boissons-panier-2026-09-29.json', 'utf8'))
const refParNom = new Map(panier.lignes.map(l => [norm(l.nom), l.ref]))
// ⚠️ Deux lignes ne sont PAS dans le panier de la veille : l'Affligem a changé
// d'ambrée en blonde entre le panier et la commande, et le CO2 a été ajouté au
// moment de valider. On ne les devine pas par le nom — on pose la référence
// relevée sur la fiche produit Eazle.
refParNom.set(norm('Affligem Blonde'), '97087')

const [four] = await sb('fournisseurs?nom=eq.France%20Boissons&select=id,nom')
const recs = await sb('recettes?reference_fournisseur=not.is.null&select=id,nom,reference_fournisseur,nom_matiere&limit=500')
const ings = await sb('ingredients?reference_fournisseur=not.is.null&select=id,nom,reference_fournisseur&limit=500')
const parRef = new Map()
for (const r of recs) parRef.set(String(r.reference_fournisseur).trim(), { recette_id: r.id, nom: r.nom })
for (const i of ings) if (!parRef.has(String(i.reference_fournisseur).trim())) parRef.set(String(i.reference_fournisseur).trim(), { ingredient_id: i.id, nom: i.nom })

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — bon de commande ${cmd.numero} ──\n`)
const lignes = []
let rattachees = 0
for (const l of cmd.lignes) {
  const ref = refParNom.get(norm(l.nom.replace(/\s*\(\d\)$/, ''))) ?? null
  const cible = ref ? parRef.get(String(ref)) : null
  if (cible) rattachees++
  // ⚠️ `quantite_commandee` est en UNITÉS, pas en colis : Eazle affiche
  // « 3 » pour trois caisses de 24 et un prix à la bouteille. Stocker 3 ferait
  // comparer trois bouteilles à soixante-douze livrées.
  lignes.push({
    ingredient_id: cible?.ingredient_id ?? null,
    recette_id: cible?.recette_id ?? null,
    // ⚠️ `libelle` TOUJOURS renseigné : c'est le texte du fournisseur, et
    // c'est lui qui permettra de rapprocher la facture même sans cible.
    libelle: l.nom.replace(/\s*\(\d\)$/, '') + (l.promo ? ' [promo]' : ''),
    quantite_commandee: l.colis * l.qte,
    prix_unitaire_ht: l.pu,
    unite: l.colis > 1 ? 'unité' : 'pièce',
  })
}
const total = cmd.lignes.reduce((s, l) => s + l.tot, 0)
console.log(`  ${lignes.length} lignes · ${rattachees} rattachées à un produit ou une matière · ${lignes.length - rattachees} au libellé seul`)
console.log(`  total ${f2(total)} € HT (tarif public, hors droits de ${f2(cmd.totaux.droits_regie)} €)\n`)
for (const l of lignes.slice(0, 8))
  console.log(`   ${(l.recette_id || l.ingredient_id) ? '✓' : '·'} ${l.libelle.slice(0, 44).padEnd(45)} ${String(l.quantite_commandee).padStart(5)} × ${f2(l.prix_unitaire_ht).padStart(6)} €`)
console.log(`   … et ${lignes.length - 8} autres`)

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

const [deja] = await sb(`bons_commande?fournisseur_id=eq.${four.id}&reference=eq.FB-${cmd.numero}&select=id`)
if (deja) { console.log(`\n  ⚠️ le bon FB-${cmd.numero} existe déjà (${deja.id}) — rien n'est recréé.\n`); process.exit(0) }

const [bon] = await sb('bons_commande', { method: 'POST', body: JSON.stringify({
  fournisseur_id: four.id, statut: 'envoye', reference: `FB-${cmd.numero}`,
  date_commande: cmd.date, date_livraison_prevue: cmd.livraison,
  montant_total_ht: Math.round(total * 100) / 100,
  envoye_le: `${cmd.date}T10:00:00Z`, envoye_a: 'portail Eazle (eazle.france-boissons.fr)',
  notes: `Commande passée sur le portail Eazle, n° ${cmd.numero}. Reconstituée dans l'outil le ${new Date().toISOString().slice(0, 10)} `
    + `pour servir de référence à la facture. ⚠️ Prix au tarif PUBLIC : la remise ne figurait pas sur le bon, `
    + `signalée à Fabrice Gomez, correction annoncée. Droits et régie ${f2(cmd.totaux.droits_regie)} € en sus, TTC ${f2(cmd.totaux.ttc)} €.`,
}) })
await sb('bon_commande_lignes', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
  body: JSON.stringify(lignes.map(l => ({ ...l, bon_commande_id: bon.id }))) })
console.log(`\n  ✓ bon FB-${cmd.numero} créé (${bon.id}) — statut « envoyé », ${lignes.length} lignes\n`)
