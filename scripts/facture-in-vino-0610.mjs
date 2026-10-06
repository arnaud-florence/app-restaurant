// IN VINO DISTRIBUTION — le fournisseur de vin et champagne, et sa première
// facture (FAC-829 du 06/10/2026, 614,10 € HT).
//
// C'est le fournisseur que CLAUDE.md attendait depuis septembre : « Le vin
// TRANQUILLE ne vient PAS de France Boissons — rouge, rosé et blanc passent
// par un vignoble ou un caviste ». Les coûts du vin au verre étaient des
// ESTIMATIONS depuis le relevé Eazle ; ils deviennent des prix payés.
//
// ⚠️ LE BIB EST LA SEULE LIGNE QUI SE PROPAGE. Les huit bouteilles n'ont
// aucun produit en face : la carte ne porte que « Bouteille de vin rouge /
// rosé / blanc 75 cl », génériques et sans coût. Les créer nommément est une
// décision commerciale — on PROPOSE un tarif, on ne crée pas huit produits
// qui partiraient vers la caisse et vers casatasia.fr sans que personne ne
// les ait validés.
//
// ⚠️ AUCUNE CONTENANCE N'EST DÉDUITE POUR LES BOUTEILLES. La facture n'écrit
// nulle part « 75 cl » : c'est le format évident, et c'est exactement pour ça
// qu'on ne l'invente pas — une contenance supposée donne un prix au litre
// faux, affiché comme les autres (même règle que France Boissons). Le BIB,
// lui, porte « 10L » dans son propre libellé.
//
// ⚠️ Pas de code article sur cette facture : la clé d'upsert de
// `catalogue_fournisseur` étant TOTALE sur (fournisseur, référence, date),
// plusieurs références vides le même jour se heurteraient en 23505 et
// feraient échouer l'insert entier. D'où le préfixe `INV-`, qui dit
// franchement que ce n'est pas un code fournisseur.
//
//   node scripts/facture-in-vino-0610.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const NUM = 'FAC-829', LE = '2026-10-06', ECHEANCE = '2026-10-20'
const TOTAL_HT = 614.10, TOTAL_TTC = 736.92

// désignation, quantité, PU HT, contenance (null = non écrite sur la facture)
const L = [
  ['BIB 10 L — 3 rouge, 3 rosé, 2 blanc',                8, 24.00, [10, 'L']],
  ['IGP Cave la Roquière — 2 rosé, 2 blanc',            12,  3.90, null],
  ['San Bastian IGP rouge',                              6,  3.90, null],
  ['Château La Lieue tradition rosé',                    6,  7.35, null],
  ['Château La Lieue tradition blanc',                   6,  9.00, null],
  ['Château La Lieue Batilde Philomène rouge',           6,  9.90, null],
  ['Côte du Rhône Lucien Tramier médaille d’or',         6,  6.00, null],
  ['Couleurs de Toulouse Lautrec — Bordeaux supérieur',  6,  7.50, null],
  ['Champagne Pol Cochet',                               6, 18.90, null],
]

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

const somme = L.reduce((s, [, q, pu]) => s + Math.round(q * pu * 100) / 100, 0)
console.log(`\n📄 ${NUM} · IN VINO DISTRIBUTION · ${LE}`)
console.log(`   ${L.length} lignes · somme ${somme.toFixed(2)} € · total imprimé ${TOTAL_HT.toFixed(2)} € HT`)
if (Math.abs(somme - TOTAL_HT) > 0.05) { console.error(`⛔ les lignes ne retombent pas sur le total — rien n'est écrit.`); process.exit(1) }
console.log(`   ✓ les lignes retombent au centime`)

// Le BIB : 24,00 € les 10 L = 2,40 €/L. Le verre de 12 cl en tire 83,33.
const parBib = 24.00, parVerre = Math.round(parBib / 83.33 * 10000) / 10000
console.log(`\n   BIB 10 L à ${parBib.toFixed(2)} € → ${(parBib / 10).toFixed(3)} €/L → verre 12 cl ${parVerre.toFixed(4)} €`)

const verres = await sb('recettes?select=id,nom,cout_achat_ht,unites_par_achat,prix_vente_ht,tva&nom_matiere=like.Vin%20*BIB*')
for (const v of verres) {
  const neuf = Math.round(parBib / Number(v.unites_par_achat) * 10000) / 10000
  const d = v.cout_achat_ht ? (neuf / Number(v.cout_achat_ht) - 1) * 100 : null
  console.log(`   ${v.nom.padEnd(24)} ${String(v.cout_achat_ht ?? '—').padStart(8)} → ${neuf.toFixed(4).padStart(8)}${d != null ? `  ${d >= 0 ? '+' : ''}${d.toFixed(1)} %` : ''}`)
}

const [dejaF] = await sb(`fournisseurs?nom=eq.In%20Vino%20Distribution&select=id`)
if (!ECRIRE) { console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

const fid = dejaF?.id ?? (await sb('fournisseurs', { method: 'POST', body: JSON.stringify({
  nom: 'In Vino Distribution', actif: true,
  adresse: '147 Impasse des jardins, 83136 Forcalqueiret',
  // ⚠️ `fournisseurs` n'a ni site_web ni notes : le SIRET et la banque vont
  // dans `conditions_tarifaires`, la seule colonne libre.
  conditions_tarifaires: 'Vins et champagnes. SIRET 93289841400010, TVA FR38932898414. '
    + 'Paiement à 14 jours, Crédit Agricole. ⚠️ Aucune adresse e-mail communiquée : '
    + 'un bon de commande sera rendu à copier, pas envoyé.',
  delai_livraison_jours: 2, minimum_commande: 0 }) }))[0].id
console.log(`\n   ✓ fournisseur ${dejaF ? 'déjà présent' : 'créé'}`)

const [deja] = await sb(`factures_fournisseurs?numero=eq.${NUM}&fournisseur_id=eq.${fid}&type_document=eq.facture&select=id`)
if (deja) { console.log(`   ⚠️ facture ${NUM} déjà enregistrée — rien n'est recréé.\n`); process.exit(0) }

const [f] = await sb('factures_fournisseurs', { method: 'POST', body: JSON.stringify({
  fournisseur_id: fid, numero: NUM, type_document: 'facture',
  date_emission: LE, date_echeance: ECHEANCE,
  montant_ht: TOTAL_HT, montant_ttc: TOTAL_TTC, statut: 'a_payer', nb_pages: 2,
  notes: 'Première livraison. TVA 20 % sur tout (alcool). Les 8 bouteilles n’ont pas de '
    + 'produit en face : tarifs de vente à arrêter avant de les créer.' }) })

await sb('facture_lignes', { method: 'POST', body: JSON.stringify(L.map(([des, q, pu], i) => ({
  facture_id: f.id, reference: `INV-${String(i + 1).padStart(2, '0')}`, description: des,
  quantite: q, unite: 'pce', prix_unitaire_ht: pu,
  total_ht: Math.round(q * pu * 100) / 100 }))) })
console.log(`   ✓ facture ${NUM} · ${L.length} lignes · ${TOTAL_HT.toFixed(2)} € HT`)

await sb('catalogue_fournisseur', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(L.map(([des, , pu, cont], i) => ({
    fournisseur_id: fid, reference: `INV-${String(i + 1).padStart(2, '0')}`, designation: des,
    prix_ht: pu, unite: 'contenant', nature: 'facture', date_tarif: LE,
    famille: 'CAVE', tarif_negocie: true,
    contenance_valeur: cont?.[0] ?? null, contenance_unite: cont?.[1] ?? null }))) })
console.log(`   ✓ ${L.length} tarifs au catalogue (nature facture = prix PAYÉ)`)

for (const v of verres) {
  const neuf = Math.round(parBib / Number(v.unites_par_achat) * 10000) / 10000
  if (neuf >= Number(v.prix_vente_ht) * 0.95) { console.log(`   ⚠️ ${v.nom} : coût ${neuf} € ≥ 95 % du prix de vente — refusé`); continue }
  await sb(`recettes?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ cout_achat_ht: neuf }) })
}
console.log(`   ✓ ${verres.length} coûts du vin au verre, désormais PAYÉS et non plus estimés\n`)
