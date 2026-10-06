// Enregistrer la facture Gineys 03777865 — la pièce, pas seulement les prix.
//
// ⚠️⚠️ `facture-gineys-0610.mjs` a propagé les PRIX D'ACHAT et s'est arrêté
// là : la facture elle-même n'a jamais été écrite. Conséquence silencieuse —
// les 43 colis livrés le 6 octobre n'entrent dans AUCUN stock, la dette
// fournisseur ne la connaît pas, et le P&L non plus. Le gérant constate « le
// stock est bas » et tout le monde cherche ailleurs.
//
// ⚠️ Les entrées de stock se calculent sur la DESCRIPTION de la ligne
// (`calculerEntrees`, qui cherche le libellé fournisseur dedans) et sur
// l'UNITÉ : une ligne « col » est multipliée par son C=N, une ligne « pce »
// est prise telle quelle. Écrire 'pce' ici diviserait les entrées par le
// conditionnement — 1 croissant au lieu de 56.
//
// ⚠️ Cette facture n'a PAS de bon de livraison séparé : elle compte donc en
// entier. C'est l'inverse du cas France Boissons, où le BL portait déjà la
// marchandise et où `facture_liee_id` empêche le double comptage (0166).
//
// ⚠️ Il RECOPIE la liste des lignes de `facture-gineys-0610.mjs` —
// modifier les deux ensemble.
//
//   node scripts/enregistrer-facture-gineys-0610.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const NUM = '03777865', LE = '2026-10-06', ECHEANCE = '2026-10-16'
const TOTAL_HT = 943.07, TOTAL_TTC = 1012.96
const FRAIS = 3.99   // « fa 2,99 » + « se 1,00 », portés à part sur la facture

// code, désignation, nombre de COLIS, PU HT net du colis
const L = [
  ['0071031', 'PAIN PRECUIT 58CM 450G ARTIPAT C=20', 1, 16.205],
  ['0073480', 'CROISSANT COURBE PREPOUSSE 90G VENDOME C=56', 3, 32.775],
  ['0077901', 'PATON A PIZZA CRU 350G C=30', 5, 18.500],
  ['0071170', 'BAGUETTE CAMPESTRE MULTICEREALE 51CM 295G ARTIPAT C=25', 1, 20.308],
  ['0073563', 'PAIN AU CHOCOLAT PREPOUSSE 85G SIGNATURE C=60', 3, 31.926],
  ['0077903', 'PATON A PIZZA 250G C=40', 1, 18.150],
  ['0071374', 'PAVE LE JEANNOT PRECUIT SUR SOLE 450G ARTIPAT C=16', 1, 26.870],
  ['0073326', 'MINI BEIGNET NATURE 19G ARTIPAT C=175', 1, 36.140],
  ['0073328', 'MINI BEIGNET CHOCOLAT NOISETTE 25G ARTIPAT C=175', 1, 52.010],
  ['0076430', 'CANELE DE BORDEAUX 60G ARTIPAT C=30', 1, 14.881],
  ['0071908', 'PLAQUE FOCACCIA AIL BASILIC CUITE 560G ARTIPAT C=5', 1, 39.924],
  ['0071803', 'FOCACCIA TOMATE CERISE CUITE 37.5X27.5CM 800G C=4', 1, 31.750],
  ['0071809', 'FOCACCIA PRE-GRILLEE PRE-TRANCHE PRECUIT 14.5X9.5CM 90G C=36', 1, 25.123],
  ['0071365', 'PAIN COMPLET PRECUIT SUR SOLE 27CM 350G ARTIPAT C=20', 1, 19.244],
  ['0072550', 'CHAUSSON AU POMME CRU 100G DELICES C=54', 1, 20.142],
  ['0073321', 'BIG DONUT SUCRE 65G C=48', 1, 26.827],
  ['0073367', 'DOT MIX BOX 52G C=60', 1, 42.732],
  ['0073506', 'PAIN AU RAISIN PAC 110G CARACTERE C=60', 1, 32.623],
  ['0073752', 'COOKIE FOURRE AU CHOCOLAT LAIT 80G COOKIE DE JULIE C=30', 1, 36.049],
  ['0071149', 'BAGUETTE LA JEANNETTE PRECUITE 40CM 270G ARTIPAT C=25', 3, 16.302],
  ['0071012', 'PAIN PARIS PRECUIT 50CM 280G ARTIPAT C=20', 1, 20.290],
  // Hygiène, TVA 20 % — aucun produit vendu derrière.
  ['0180818', 'DISTRIBUTEUR PUSH BLANC SAVON LIQUIDE', 2, 7.800],
  ['0180506', 'DISTRIBUTEUR BLANC BOBINE DEVIDAGE CENTRAL', 2, 14.640],
  ['0180816', 'LOTION MAIN LAVANTE DESINFECTANTE ANTIBACTERIENNE 1L C=6', 1, 69.875],
  ['0180503', 'BOBINE A DEVIDAGE CENTRAL ECOLABEL C=6', 1, 9.535],
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

// ⚠️ Contrôle d'extraction : un décalage de colonne ne lève aucune erreur, il
// rend des nombres plausibles.
const somme = L.reduce((s, [, , q, pu]) => s + Math.round(q * pu * 100) / 100, 0)
const ecart = Math.round((TOTAL_HT - FRAIS - somme) * 100) / 100
console.log(`\n📄 Facture Gineys ${NUM} du ${LE}`)
console.log(`   ${L.length} lignes · somme ${somme.toFixed(2)} € + ${FRAIS.toFixed(2)} € de frais = ${(somme + FRAIS).toFixed(2)} €`)
console.log(`   total imprimé : ${TOTAL_HT.toFixed(2)} € HT · écart ${ecart.toFixed(2)} €`)
if (Math.abs(ecart) > 0.05) { console.error(`⛔ les lignes ne retombent pas sur le total — rien n'est écrit.`); process.exit(1) }

const [g] = await sb('fournisseurs?nom=eq.Gineys%20(Nicolas)&select=id')
if (!g) { console.error('⛔ fournisseur « Gineys (Nicolas) » introuvable'); process.exit(1) }
const [deja] = await sb(`factures_fournisseurs?numero=eq.${NUM}&fournisseur_id=eq.${g.id}&type_document=eq.facture&select=id`)
if (deja) { console.log(`\n   ⚠️ déjà enregistrée — rien n'est recréé.\n`); process.exit(0) }
if (!ECRIRE) { console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

const [f] = await sb('factures_fournisseurs', { method: 'POST', body: JSON.stringify({
  fournisseur_id: g.id, numero: NUM, type_document: 'facture',
  date_emission: LE, date_echeance: ECHEANCE,
  montant_ht: TOTAL_HT, montant_ttc: TOTAL_TTC, statut: 'a_payer', nb_pages: 2,
  notes: `Prélèvement 10 jours. Frais de facturation ${FRAIS.toFixed(2)} € portés à part. `
    + `3 distributeurs savon et 3 dévidoirs livrés en DÉGUSTATION (0,00 €) ne figurent pas dans les lignes : `
    + `ils sont en stock mais sans coût. Prix d'achat déjà propagés par facture-gineys-0610.mjs.` }) })

await sb('facture_lignes', { method: 'POST', body: JSON.stringify(L.map(([ref, des, q, pu]) => ({
  facture_id: f.id, reference: ref, description: des,
  // ⚠️ 'col' et pas 'pce' : c'est ce mot qui décide si la quantité est
  // multipliée par le C=N pour retrouver des pièces.
  quantite: q, unite: 'col', prix_unitaire_ht: pu,
  total_ht: Math.round(q * pu * 100) / 100 }))) })
console.log(`\n   ✓ facture ${NUM} enregistrée · ${L.length} lignes · ${TOTAL_HT.toFixed(2)} € HT`)
console.log(`   ✓ les 43 colis entrent maintenant en stock\n`)
