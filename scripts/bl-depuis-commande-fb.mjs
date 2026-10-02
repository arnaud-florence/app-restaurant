// Entrer la livraison France Boissons en stock — 02/10/2026.
//
// Le BL papier ne passe pas au scanner. Mais la commande Eazle 47231850 porte
// les libellés EXACTS du fournisseur et les quantités : de quoi construire le
// bon de livraison sans attendre.
//
// ⚠️ UNE COMMANDE N'EST PAS UNE LIVRAISON. Ce document dit ce qui a été
// DEMANDÉ ; une rupture ou une substitution ne s'y verrait pas. Il est donc
// créé en `bon_livraison` — qui ne porte AUCUN montant et ne propage AUCUN
// prix d'achat (0166) — et sa note dit d'où il vient. À contrôler contre le
// papier.
//
// ⚠️⚠️ LES UNITÉS D'EAZLE NE SONT PAS TOUTES LA MÊME CHOSE, et c'est le
// piège central :
//   • « pièce »  → une bouteille. 1:1.
//   • « unité »  → une canette pour un soft… mais un LITRE pour un fût.
//     « Birra Moretti, 60 unité » est 60 LITRES, soit TROIS fûts de 20 L.
// Écrit tel quel, le stock afficherait soixante fûts : vingt fois trop, sans
// qu'aucune erreur ne le signale. Les lignes de fût sont donc converties, et
// le prix remonté au fût pour que la ligne reste cohérente avec elle-même.
//
// ⚠️ ON APPREND `libelle_achat` DE CETTE LIVRAISON. Aucun des 34 produits
// rattachés n'en avait : `matieres-bar.mjs` avait délibérément refusé de
// l'inventer, faute de facture — « il s'apprendra au premier scan ». La
// première livraison est là. Sans cette clé, les entrées de stock ne se
// rapprochent de rien : `(ops)/inventaire` cherche le libellé du fournisseur
// DANS la description de la ligne.
//
// ⚠️ ON N'APPREND QUE CE QUI DÉSIGNE UN SEUL GROUPE. « Oasis tropical »
// est contenu dans « Oasis tropical 1,5 L » : posé sur la canette du bar, il
// absorberait les entrées de la bouteille du Fournil. Même règle qu'à
// l'apprentissage des références (0142) — un libellé qui en désigne deux
// n'enseigne rien.
//
//   node scripts/bl-depuis-commande-fb.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const norm = x => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const NUMERO = 'BL-47231850', LIVRE_LE = '2026-10-01'
// Les deux seules lignes facturées au LITRE, et la contenance de leur fût.
const FUTS = { 'Affligem Blonde': 20, 'Birra Moretti': 20 }

const [bon] = await sb('bons_commande?reference=eq.FB-47231850&select=id,fournisseur_id,reference')
const lignes = await sb(`bon_commande_lignes?bon_commande_id=eq.${bon.id}&select=libelle,quantite_commandee,unite,prix_unitaire_ht,recette_id,ingredient_id&order=libelle`)
const [deja] = await sb(`factures_fournisseurs?numero=eq.${NUMERO}&fournisseur_id=eq.${bon.fournisseur_id}&select=id`)
if (deja) { console.log(`\n  ⚠️ ${NUMERO} existe déjà — rien n'est recréé (ce serait un double comptage).\n`); process.exit(0) }

// Tous les produits, pour savoir si un libellé en désigne plus d'un.
const tous = await sb('recettes?actif=is.true&select=id,nom,nom_matiere,libelle_achat')
const cleGroupe = r => (r.nom_matiere ?? '').trim() || (r.libelle_achat ?? '').trim() || r.nom
// ⚠️ LE TEST EST À SENS UNIQUE, et le sens compte. `(ops)/inventaire` cherche
// la clé du groupe DANS la description de la ligne : le danger est donc qu'un
// libellé COURT soit contenu dans la clé d'un autre groupe — « Oasis tropical »
// dans « Oasis tropical 1,5 L ». L'inverse ne gêne pas : « Fanta Orange IVC
// 25cl [promo] » contient le mot « Orange », mais aucune ligne future ne
// portera cette chaîne entière pour un autre produit. Testé dans les deux sens,
// le garde-fou rejetait des libellés parfaitement distinctifs.
const ambigu = lib => {
  const n = norm(lib)
  if (n.length < 4) return 'libellé trop court'
  const touches = new Set(tous.filter(r => norm(cleGroupe(r)).includes(n)).map(cleGroupe))
  return touches.size > 1 ? `contenu dans ${touches.size} groupes : ${[...touches].slice(0, 3).join(' / ')}` : null
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — ${NUMERO}, livré le ${LIVRE_LE} ──\n`)
const corps = []
for (const l of lignes) {
  const fut = FUTS[l.libelle]
  const q = fut ? Number(l.quantite_commandee) / fut : Number(l.quantite_commandee)
  const pu = fut ? Number(l.prix_unitaire_ht) * fut : Number(l.prix_unitaire_ht)
  if (fut) console.log(`   ⚙ ${l.libelle} : ${l.quantite_commandee} L → ${q} fût(s) de ${fut} L, ${pu.toFixed(2)} €/fût`)
  corps.push({ description: l.libelle, quantite: q, unite: 'pce',
    prix_unitaire_ht: Math.round(pu * 10000) / 10000, total_ht: Math.round(q * pu * 100) / 100,
    recette_id: l.recette_id, ingredient_id: l.ingredient_id })
}
console.log(`\n   ${corps.length} lignes, ${corps.reduce((s, x) => s + x.quantite, 0)} unités achetées`)

// ── ce que la livraison APPREND ──
const aApprendre = new Map()
for (const l of lignes) {
  if (!l.recette_id) continue
  const p = tous.find(r => r.id === l.recette_id)
  if (!p || p.libelle_achat) continue
  const raison = ambigu(l.libelle)
  const cle = cleGroupe(p)
  if (!aApprendre.has(cle)) aApprendre.set(cle, { lib: l.libelle, raison, ids: [] })
  // tous les produits du même groupe partagent la matière (le demi ET la pinte)
  for (const r of tous) if (cleGroupe(r) === cle && !r.libelle_achat) aApprendre.get(cle).ids.push(r.id)
}
const ok = [...aApprendre.values()].filter(x => !x.raison)
const refus = [...aApprendre.values()].filter(x => x.raison)
console.log(`\n── libelle_achat appris : ${ok.length} groupes`)
for (const x of ok) console.log(`   ${String(x.lib).slice(0, 46).padEnd(46)} → ${[...new Set(x.ids)].length} produit(s)`)
if (refus.length) {
  console.log(`\n   ⚠️ ${refus.length} NON appris — un libellé ambigu absorberait les entrées d'un autre :`)
  for (const x of refus) console.log(`      ${String(x.lib).slice(0, 34).padEnd(34)} ${x.raison}`)
}
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

const [bl] = await sb('factures_fournisseurs', { method: 'POST', body: JSON.stringify({
  fournisseur_id: bon.fournisseur_id, bon_commande_id: bon.id, numero: NUMERO,
  type_document: 'bon_livraison', date_emission: LIVRE_LE,
  montant_ht: 0, montant_ttc: 0, statut: 'paye',
  notes: `Reconstruit depuis la commande Eazle 47231850 — le BL papier ne passait pas au scanner. `
    + `Les quantités sont celles COMMANDÉES : à contrôler contre le papier. `
    + `Fûts convertis du litre au fût de 20 L.` }) })
await sb('facture_lignes', { method: 'POST', body: JSON.stringify(corps.map(c => ({ ...c, facture_id: bl.id }))) })
console.log(`\n   ✓ ${NUMERO} créé — ${corps.length} lignes`)
for (const x of ok) for (const id of [...new Set(x.ids)])
  await sb(`recettes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ libelle_achat: x.lib }) })
console.log(`   ✓ libelle_achat posé sur ${ok.reduce((s, x) => s + new Set(x.ids).size, 0)} produits`)
await sb(`bons_commande?id=eq.${bon.id}`, { method: 'PATCH', body: JSON.stringify({ statut: 'recu', reception_at: new Date().toISOString(), reception_a_verifier: true }) })
for (const l of lignes) await sb(`bon_commande_lignes?bon_commande_id=eq.${bon.id}&libelle=eq.${encodeURIComponent(l.libelle)}`,
  { method: 'PATCH', body: JSON.stringify({ quantite_recue: l.quantite_commandee }) })
console.log(`   ✓ bon marqué réceptionné, à vérifier contre le papier\n`)
