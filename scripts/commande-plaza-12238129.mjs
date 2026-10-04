// La commande Plaza Grossiste 12238129 du 02/10/2026.
//
// ⚠️ PLAZA N'EST PAS UN NOUVEAU FOURNISSEUR : il est en base depuis le 02/10
// avec 65 références de catalogue. Ce qui est nouveau, c'est une commande
// PAYÉE — donc des prix RÉELLEMENT PAYÉS, là où le catalogue n'était que du
// tarif affiché. La distinction compte : arbitrer un fournisseur sur un tarif
// d'appel en croyant lire un prix réglé se paie pendant des mois (0152).
//
// ⚠️⚠️ ELLE N'ENTRE PAS EN STOCK, et c'est voulu. C'est un retrait sur place
// à Brignoles (France Drive) : la marchandise est payée mais pas enlevée.
// La faire entrer maintenant afficherait un stock qu'on n'a pas. Elle
// entrera au bon de livraison, le jour du retrait.
//
// ⚠️ AUCUNE CLÉ DE COMPARAISON N'EST POSÉE. Plaza vend le sac à croissants en
// deux formats (12+5×15 pour deux croissants, 14+6×20 pour six) et nous ne
// savons pas lequel correspond au nôtre — la 0151 a déjà écarté le sac
// « N°101 » face à notre « N°104 ». Les pistes sont RAPPORTÉES, pas écrites.
//
//   node scripts/commande-plaza-12238129.mjs [--ecrire]
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
const REF = '12238129', LE = '2026-10-02'
const TOTAL_HT = 137.49, TOTAL_TTC = 164.99

// référence · désignation · quantité · PU HT · unité d'achat
const LIGNES = [
  ['221.89',  'Sachet à couverts et serviette neutre kraft 11×22,5 cm — carton de 400', 1, 36.90, 'carton 400'],
  ['281.88',  'Set de table 31×43 cm noir recyclé 80 g/m² — carton de 1000',            1, 34.90, 'carton 1000'],
  ['S01KN',   'Sac à croissants kraft 12+5×15 cm (2 croissants) — carton de 1000',      1,  8.39, 'carton 1000'],
  ['S03KN',   'Sac à croissants kraft 14+6×20 cm (6 croissants) — carton de 1000',      1, 10.90, 'carton 1000'],
  ['255.80',  'Sac sandwich kraft ingraissable 12+4×26 cm — pack de 500',               1,  8.99, 'pack 500'],
  ['1010511', 'Combo boîte à salade kraft 750 ml + couvercle PET — pack de 25',         3,  4.49, 'pack 25'],
  ['102.36P', 'Serviette 1 pli 30×30 cm blanche — pack de 100',                         3,  0.89, 'pack 100'],
  ['162.68',  'Ardoise murale noire 30×45 cm, cadre bois',                              1, 10.99, 'pièce'],
  ['175.81',  'Feutres craie fluorescent blanc pour ardoises — pack de 2',              1,  2.79, 'pack 2'],
  ['233.61',  'Ardoise de table sur chevalet 35,5×21,8×18 cm, bois',                    1,  7.49, 'pièce'],
]
const somme = Math.round(LIGNES.reduce((s, l) => s + l[2] * l[3], 0) * 100) / 100
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — commande Plaza ${REF} du ${LE} ──\n`)
console.log(`   ${LIGNES.length} lignes · somme ${somme.toFixed(2)} € · total imprimé ${TOTAL_HT.toFixed(2)} €`)
// ⚠️ Même discipline que pour les devis : on refuse d'écrire tant que les
// lignes ne retombent pas sur le total. Un décalage ne lève aucune erreur.
if (Math.abs(somme - TOTAL_HT) > 0.02) { console.log(`   ✗ écart de ${(somme - TOTAL_HT).toFixed(2)} € — RIEN n'est écrit.\n`); process.exit(1) }
console.log(`   ✓ les lignes retombent sur le total imprimé`)
for (const [r, d, q, pu] of LIGNES) console.log(`   ${r.padEnd(9)} ${String(q).padStart(2)} × ${pu.toFixed(2).padStart(6)} = ${(q * pu).toFixed(2).padStart(6)} €  ${d.slice(0, 52)}`)

const [f] = await sb('fournisseurs?nom=eq.Plaza%20Grossiste&select=id,nom,email,telephone,adresse')
const [deja] = await sb(`bons_commande?reference=eq.${REF}&select=id`)
if (deja) { console.log(`\n   ⚠️ la commande ${REF} est déjà enregistrée — rien n'est recréé.\n`); process.exit(0) }

// pistes de comparaison, RAPPORTÉES et non posées
const mats = await sb('ingredients?categorie=eq.Emballage&actif=is.true&select=nom,unite,prix_achat_ht')
const pistes = [
  ['Sacs sandwich',    '255.80',  8.99 / 500 * 1000, 'colis 1000'],
  ['Serviettes',       '102.36P', 0.89 / 100 * 3000, 'colis 3000'],
  ['Sacs à croissants','S01KN',   8.39,              'colis 1000'],
]
console.log(`\n   pistes de comparaison — RAPPORTÉES, pas posées :`)
for (const [nom, ref, prixRamene, base] of pistes) {
  const m = mats.find(x => x.nom === nom); if (!m) continue
  const nous = Number(m.prix_achat_ht)
  const d = (prixRamene - nous) / nous * 100
  console.log(`      ${nom.padEnd(20)} nous ${nous.toFixed(2).padStart(7)} €/${base.padEnd(11)} · Plaza ${prixRamene.toFixed(2).padStart(6)} € → ${(d > 0 ? '+' : '') + d.toFixed(0)} %  (réf ${ref})`)
}
console.log(`      ⚠️ Plaza vend le sac à croissants en DEUX formats (2 ou 6 croissants) et`)
console.log(`         nous ignorons lequel est le nôtre. À trancher dans /admin/tarifs-fournisseurs.`)

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// coordonnées, lues sur le bon
if (!f.email) await sb(`fournisseurs?id=eq.${f.id}`, { method: 'PATCH', body: JSON.stringify({
  email: 'contact@plaza-grossiste.com', telephone: '09 72 58 20 82',
  adresse: '260 rue des Romarins — ZI Nicopolis, 83170 Brignoles' }) })

const [bon] = await sb('bons_commande', { method: 'POST', body: JSON.stringify({
  fournisseur_id: f.id, reference: REF, statut: 'envoye', date_commande: LE,
  montant_total_ht: TOTAL_HT, envoye_le: `${LE}T12:00:00Z`, envoye_a: 'plaza-grossiste.com (commande en ligne)',
  // ⚠️ `reception_a_verifier` reste à false : rien n'a été reçu, c'est un
  // retrait sur place à venir.
  notes: `Commande en ligne réglée par CARTE BLEUE le ${LE} — net à payer 0,00 €. `
    + `${TOTAL_TTC.toFixed(2)} € TTC. RETRAIT SUR PLACE à Brignoles (France Drive) : `
    + `la marchandise est payée mais PAS ENLEVÉE. Elle n'entre en stock qu'au bon de livraison, `
    + `le jour du retrait.` }) })
await sb('bon_commande_lignes', { method: 'POST', body: JSON.stringify(LIGNES.map(([r, d, q, pu, u]) => ({
  bon_commande_id: bon.id, libelle: `${d} (réf ${r})`, quantite_commandee: q,
  prix_unitaire_ht: pu, unite: u, recette_id: null, ingredient_id: null }))) })
console.log(`\n   ✓ commande ${REF} enregistrée — statut « envoyé », payée, en attente de retrait`)

// ── le catalogue Plaza passe du TARIF AFFICHÉ au PRIX PAYÉ ───────────
// ⚠️ C'est la vraie valeur de ce document : 10 références dont on connaît
// désormais le prix RÉGLÉ, et non plus seulement affiché.
await sb(`catalogue_fournisseur?fournisseur_id=eq.${f.id}&date_tarif=eq.${LE}&nature=eq.facture`, { method: 'DELETE' })
await sb('catalogue_fournisseur', { method: 'POST', body: JSON.stringify(LIGNES.map(([r, d, , pu, u]) => ({
  fournisseur_id: f.id, reference: r, designation: d, unite: u, prix_ht: pu,
  date_tarif: LE, source: `commande ${REF} réglée`, nature: 'facture',
  tarif_negocie: true, actif: true }))) })
console.log(`   ✓ ${LIGNES.length} références au catalogue Plaza en « prix payé »\n`)
