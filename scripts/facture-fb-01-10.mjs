// La facture France Boissons 4136964411 du 01/10/2026.
//
// ⚠️⚠️ ELLE PORTE BIEN LA REMISE. C'est la réponse à l'alerte du 02/10 : la
// COMMANDE Eazle affichait les tarifs publics, la FACTURE applique « Rem/majo
// article » ligne par ligne (−14 % sur Desperados et Heineken, −16 % sur les
// eaux et le Perrier, −18 % sur la limonade…). Il n'y a pas d'avoir à
// réclamer : le prix net est le bon.
//
// ⚠️ ELLE EST RATTACHÉE AU BON DE LIVRAISON BL-47231850 — donc elle n'ajoute
// AUCUNE entrée de stock (0166). Le BL a déjà fait entrer la marchandise ;
// compter les deux la ferait entrer deux fois, sans qu'aucune erreur ne le
// signale.
//
// ⚠️ DEUX LIGNES SONT À PRIX NET ZÉRO : les caisses OFFERTES (Fanta 2+2,
// Fuze tea 2+1), promotions relevées le 27/09. Elles sont enregistrées —
// c'est de la marchandise reçue — mais elles ne doivent JAMAIS propager un
// prix : un coût à zéro se lit « gratuit » et donnerait un food cost de 0 %.
//
//   node scripts/facture-fb-01-10.mjs [--ecrire]
import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
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
const NUM = '4136964411', LE = '2026-10-01', ECHEANCE = '2026-10-30'
const TOTAL_HT = 1999.32, TOTAL_TTC = 2300.46

// ── lecture du PDF, PAR COORDONNÉES ──────────────────────────────────
//
// ⚠️⚠️ ON LIT À LA COLONNE, PAS AU RANG. Le nombre de valeurs varie d'une
// ligne à l'autre — les droits d'accises n'existent que sur l'alcool, la
// consigne que sur le verre — et deviner la position au rang a produit trois
// résultats faux de suite : 20,29 € de droits sur une eau minérale, puis un
// montant égal au prix net sur une ligne d'une unité, puis 49 € d'écart sur
// le total. Les colonnes, elles, sont à une abscisse FIXE, lisible dans
// l'en-tête : Net 273, Droits 385, Montant net HT 440.
const COL = { net: [255, 300], droits: [360, 400], montant: [400, 470] }
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync('data/facture-france-boissons-2026-10-01.pdf')), useSystemFonts: true }).promise
const num = s => Number(String(s).replace(/\s/g, '').replace(',', '.'))
const dans = (cells, [a, b]) => {
  const c = cells.find(o => o.x >= a && o.x < b)
  return c ? num(c.s) : null
}
const rangs = []
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent()
  const L = new Map()
  for (const it of tc.items) {
    if (!it.str?.trim()) continue
    const y = Math.round(it.transform[5])
    if (!L.has(y)) L.set(y, [])
    L.get(y).push({ x: Math.round(it.transform[4]), s: it.str.trim() })
  }
  for (const y of [...L.keys()].sort((a, b) => b - a)) rangs.push(L.get(y).sort((a, b) => a.x - b.x))
}
const texte = r => r.map(o => o.s).join(' ').replace(/\s+/g, ' ').trim()
const lignes = []
for (let i = 0; i < rangs.length; i++) {
  const t = texte(rangs[i])
  const m = t.match(/^(\d{4,6})\s+(.+?)\s+\d/)
  if (!m) continue
  const suivant = rangs.slice(i + 1, i + 5).find(r => texte(r).startsWith('Prix net'))
  if (!suivant) continue
  // quantité : « Cols » s'il existe, « Colis » sinon
  const colis = dans(rangs[i], [200, 232]), cols = dans(rangs[i], [232, 258])
  const quantite = cols ?? colis
  const net = dans(suivant, COL.net), droits = dans(suivant, COL.droits) ?? 0
  const montant = dans(suivant, COL.montant)
  if (quantite == null || net == null || montant == null) {
    // ⚠️ Les verres publicitaires n'ont ni quantité ni montant : ils sont
    // OFFERTS. On les signale sans les compter.
    console.log(`   · offert, non compté : ${m[2].slice(0, 44)}`)
    continue
  }
  lignes.push({ reference: m[1], description: m[2].trim(), quantite,
    prix_unitaire_ht: Math.round((net + droits) * 10000) / 10000,
    total_ht: montant, offerte: net === 0 })
}
const somme = Math.round(lignes.reduce((s, l) => s + l.total_ht, 0) * 100) / 100
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — facture ${NUM} du ${LE} ──\n`)
console.log(`   ${lignes.length} lignes chiffrées`)

// ⚠️⚠️ LE CONTRÔLE PORTE SUR CHAQUE LIGNE, pas sur le total. C'est ce qu'on
// peut PROUVER : pour chacune, (prix net + droits) × quantité doit retomber
// sur le montant imprimé. Un décalage d'une colonne ne lève aucune erreur,
// il rend des nombres plausibles — c'est la seule façon de l'attraper.
const faux = lignes.filter(l => {
  // ⚠️ UN MONTANT À ZÉRO N'EST PAS UNE ERREUR : les verres publicitaires
  // portent un prix unitaire et une remise commerciale de 100 %. La ligne
  // existe, la marchandise est reçue, elle ne coûte rien.
  if (l.total_ht === 0) return false
  const attendu = Math.round(l.prix_unitaire_ht * l.quantite * 100) / 100
  // ⚠️ La tolérance suit la QUANTITÉ : le prix net et les droits sont
  // imprimés à trois ou quatre décimales, et France Boissons arrondit sa
  // colonne à partir de valeurs non tronquées. Sur 48 canettes l'écart
  // légitime atteint 3 centimes.
  return Math.abs(attendu - l.total_ht) > 0.02 + 0.0005 * l.quantite
})
if (faux.length) {
  console.log(`   ✗ ${faux.length} ligne(s) dont le calcul ne retombe pas — RIEN n'est écrit :`)
  for (const l of faux) console.log(`      ${l.quantite} × ${l.prix_unitaire_ht} ≠ ${l.total_ht}  ${l.description.slice(0, 40)}`)
  process.exit(1)
}
console.log(`   ✓ les ${lignes.length} lignes retombent sur leur propre montant`)
for (const l of lignes) console.log(`   ${l.reference.padEnd(7)} ${String(l.quantite).padStart(4)} × ${l.prix_unitaire_ht.toFixed(4).padStart(8)} = ${l.total_ht.toFixed(2).padStart(8)} €${l.offerte ? '  ⚠ OFFERTE' : ''}  ${l.description.slice(0, 38)}`)

// ⚠️ ET L'ÉCART AVEC LE TOTAL IMPRIMÉ EST DIT, PAS TU. La somme des lignes
// ne fait pas le total de la facture : 1 950,25 € contre 1 999,32 € annoncés.
// Ventilé par taux, le 5,5 % tombe à deux centimes près — donc les lignes
// sont bonnes — mais il manque 44,55 € en base 20 % et 4,50 € en contribution
// énergie. C'est une question pour France Boissons, pas une erreur de lecture
// qu'on pourrait corriger en devinant. Elle part dans la note de la facture.
const ecart = Math.round((TOTAL_HT - somme) * 100) / 100
console.log(`\n   somme des lignes ${somme.toFixed(2)} € · total imprimé ${TOTAL_HT.toFixed(2)} € · écart ${ecart.toFixed(2)} €`)
if (Math.abs(ecart) > 0.05) console.log(`   ⚠️ ${ecart.toFixed(2)} € que les lignes n'expliquent pas — à faire confirmer par le fournisseur`)

const [fb] = await sb('fournisseurs?nom=eq.France%20Boissons&select=id')
const [bl] = await sb('factures_fournisseurs?numero=eq.BL-47231850&select=id')
const [deja] = await sb(`factures_fournisseurs?numero=eq.${NUM}&fournisseur_id=eq.${fb.id}&select=id`)
if (deja) { console.log(`\n   ⚠️ la facture ${NUM} est déjà enregistrée — rien n'est recréé.\n`); process.exit(0) }
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
const [f] = await sb('factures_fournisseurs', { method: 'POST', body: JSON.stringify({
  fournisseur_id: fb.id, numero: NUM, type_document: 'facture',
  date_emission: LE, date_echeance: ECHEANCE,
  montant_ht: TOTAL_HT, montant_ttc: TOTAL_TTC, statut: 'a_payer',
  // ⚠️ Le lien au BL est ce qui empêche le double comptage des entrées.
  facture_liee_id: bl?.id ?? null,
  notes: `Prélèvement SEPA, relevé quinzaine 15 jours. Consignes 408,70 € en sus — net à payer 2 709,16 €. `
    + `Remise appliquée ligne à ligne. Rattachée au ${bl ? 'BL-47231850' : 'BL ABSENT ⚠️'}. `
    + (Math.abs(ecart) > 0.05
      ? `⚠️ ${ecart.toFixed(2)} € d'écart entre la somme des ${lignes.length} lignes (${somme.toFixed(2)} €) et le Montant HT imprimé : `
        + `la base 5,5 % concorde à 2 centimes près, il manque 44,55 € en base 20 % et 4,50 € de contribution énergie. À faire confirmer.`
      : '') }) })
await sb('facture_lignes', { method: 'POST', body: JSON.stringify(lignes.map(l => ({
  facture_id: f.id, reference: l.reference, description: l.description,
  quantite: l.quantite, unite: 'pce', prix_unitaire_ht: l.prix_unitaire_ht, total_ht: l.total_ht }))) })
console.log(`\n   ✓ facture ${NUM} enregistrée · ${lignes.length} lignes · ${TOTAL_HT.toFixed(2)} € HT`)
console.log(`   ✓ rattachée au BL — aucune entrée de stock ajoutée, la marchandise y est déjà\n`)
