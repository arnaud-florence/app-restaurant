// Les 8 BIB de la facture In Vino entrent en stock — par COULEUR.
//
// ⚠️⚠️ UNE SEULE LIGNE POUR TROIS COULEURS NE PEUT ENTRER DANS AUCUN STOCK.
// `calculerEntrees()` rapproche une ligne de livraison en cherchant le
// libellé de la cible DANS sa description. La ligne d'In Vino dit
// « BIB 10 L — 3 rouge, 3 rosé, 2 blanc » ; les trois cibles s'appellent
// « Vin rouge BIB 10 L », « Vin rosé … », « Vin blanc … ». Aucune n'est
// contenue dans la description : les HUIT BIB restaient hors stock.
//
// Et c'est le genre de trou qui ne se signale pas — la facture est
// enregistrée, son montant est juste, le P&L est juste. Seul l'inventaire
// est aveugle, et on le découvre en manquant de rosé un samedi soir.
//
// ⚠️ LA RÉPARTITION N'EST PAS DEVINÉE : elle est ÉCRITE sur la facture
// (« 3X ROUGE 3X ROSE 2X BLANC »). On ne découpe que ce que le fournisseur
// a lui-même détaillé. S'il ne l'avait pas fait, la bonne réponse serait de
// le lui demander, pas de répartir au jugé.
//
// ⚠️ Le TOTAL ne bouge pas : 3+3+2 = 8 BIB à 24,00 € = 192,00 € HT. Le
// contrôle le vérifie avant d'écrire — une facture dont les lignes ne
// retombent plus sur le total est pire qu'une facture sans détail.
//
//   node scripts/facture-in-vino-bib-par-couleur.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const NUM = 'FAC-829', PU = 24.00
// Écrit sur la facture, pas déduit.
const REPARTITION = [['rouge', 3], ['rosé', 3], ['blanc', 2]]

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

const [f] = await sb(`factures_fournisseurs?select=id,numero,montant_ht&numero=eq.${NUM}`)
if (!f) { console.error(`⛔ facture ${NUM} introuvable`); process.exit(1) }
const lignes = await sb(`facture_lignes?select=id,description,quantite,prix_unitaire_ht,total_ht&facture_id=eq.${f.id}&order=reference`)
const bib = lignes.find(l => /^BIB 10 L/.test(l.description))

// ⚠️ Les libellés des cibles sont RELUS sur les produits, jamais recopiés :
// c'est exactement ce que `calculerEntrees()` cherchera.
const verres = await sb('recettes?select=nom,nom_matiere&nom=like.Verre%20de%20*%2012%20cl')
const cible = {}
for (const [c] of REPARTITION) {
  const v = verres.find(x => x.nom === `Verre de ${c} 12 cl`)
  if (!v?.nom_matiere) { console.error(`⛔ pas de matière pour le ${c} — rien n'est écrit.`); process.exit(1) }
  cible[c] = v.nom_matiere
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ${NUM} ──\n`)
if (!bib) {
  console.log('   la ligne BIB groupée a déjà été découpée :')
  for (const l of lignes.filter(x => /BIB/.test(x.description)))
    console.log(`   · ${l.description.padEnd(22)} ${l.quantite} × ${Number(l.prix_unitaire_ht).toFixed(2)} €`)
  console.log('\n   rien à faire.\n'); process.exit(0)
}
console.log(`   avant : « ${bib.description} »  ${bib.quantite} × ${Number(bib.prix_unitaire_ht).toFixed(2)} € = ${Number(bib.total_ht).toFixed(2)} €\n`)
const total = REPARTITION.reduce((s, [, q]) => s + q * PU, 0)
for (const [c, q] of REPARTITION)
  console.log(`   après : « ${cible[c].padEnd(20)} »  ${q} × ${PU.toFixed(2)} € = ${(q * PU).toFixed(2)} €`)
// ⚠️ Contrôle avant écriture : une facture dont les lignes ne retombent plus
// sur le total imprimé est pire qu'une facture sans détail.
if (Math.abs(total - Number(bib.total_ht)) > 0.01) {
  console.error(`\n⛔ ${total.toFixed(2)} € contre ${Number(bib.total_ht).toFixed(2)} € — rien n'est écrit.`); process.exit(1)
}
console.log(`\n   total inchangé : ${total.toFixed(2)} €`)
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

await sb('facture_lignes', { method: 'POST', body: JSON.stringify(REPARTITION.map(([c, q], i) => ({
  facture_id: f.id, reference: `INV-01${'abc'[i]}`, description: cible[c],
  quantite: q, unite: 'pce', prix_unitaire_ht: PU, total_ht: Math.round(q * PU * 100) / 100 }))) })
await sb(`facture_lignes?id=eq.${bib.id}`, { method: 'DELETE' })
console.log(`\n   ✓ 1 ligne groupée → ${REPARTITION.length} lignes par couleur`)
console.log(`   ✓ les 8 BIB entrent maintenant dans le bon stock\n`)
