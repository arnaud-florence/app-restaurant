// Le verre de vin : 2,80 € au bar, 4,00 € servi à table.
//
// Décision du gérant, 06/10/2026.
//
// ⚠️⚠️ CE N'EST PAS L'AXE DE `prix_sur_place_ttc`, et s'y tromper facturerait
// le mauvais prix au comptoir. Ce champ (0144) distingue SUR PLACE et À
// EMPORTER — c'est ce qui fait les 10 € de la bouteille avec la pizza et ses
// 16 € à table. Ici l'axe est BAR contre SALLE, et un verre bu au comptoir
// est consommé SUR PLACE : il prendrait le prix salle. Le bar vendrait à 4 €.
//
// La réponse est celle du café, déjà éprouvée : « Café servi à table »
// (1,80 €) est une fiche DISTINCTE du café du comptoir (1,40 €). Deux prix
// imposent deux boutons en caisse — un seul, et l'équipe tape au jugé.
//
// ⚠️ LES DEUX FICHES PARTAGENT `nom_matiere` ET `unites_par_achat`. C'est ce
// qui fait que le BIB est décompté une seule fois et que l'inventaire replie
// les six verres sur une seule ligne de stock (0131). Les séparer ferait
// commander deux fois le même vin.
//
// ⚠️ Le tag et l'établissement changent AVEC le service : BAR / Bar pour le
// comptoir, CUISINE / Restauration pour la table. C'est ce qui ventile le CA
// au bon étage — et c'est exactement ce que fait « Café servi à table ».
//
//   node scripts/verres-vin-bar-et-table.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const BAR_TTC = 2.80, TABLE_TTC = 4.00
const COULEURS = ['rouge', 'rosé', 'blanc']

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY, ZK = process.env.ZELTY_API_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers ?? {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const z = async (p, o = {}) => {
  const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
    headers: { Authorization: 'Bearer ' + ZK, 'Content-Type': 'application/json', ...(o.headers ?? {}) } })
  return { s: r.status, t: await r.text() }
}
const f = n => n.toFixed(2).replace('.', ',')

// Le gabarit « servi à table » est le CAFÉ : on reprend son tag et son
// établissement plutôt que de les choisir.
const [cafe] = await sb('recettes?select=tag_destination,etablissement_id&nom=eq.Caf%C3%A9%20servi%20%C3%A0%20table')
if (!cafe) { console.error('⛔ gabarit « Café servi à table » introuvable'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · le verre de vin ──\n`)
const bar = [], table = []
for (const c of COULEURS) {
  const [p] = await sb(`recettes?select=*&nom=eq.${encodeURIComponent(`Verre de ${c} 12 cl`)}`)
  if (!p) { console.log(`   ⚠️ « Verre de ${c} 12 cl » introuvable — ignoré`); continue }
  const htBar = Math.round(BAR_TTC / 1.2 * 10000) / 10000
  console.log(`   Verre de ${c.padEnd(6)} au bar     ${f(BAR_TTC).padStart(5)} €   fc ${(p.cout_achat_ht / htBar * 100).toFixed(1).padStart(4)} %  ${p.actif ? '' : '· à RALLUMER'}`)
  bar.push({ p, ht: htBar })

  const nom = `Verre de ${c} servi à table`
  const [deja] = await sb(`recettes?select=id&nom=eq.${encodeURIComponent(nom)}`)
  const htT = Math.round(TABLE_TTC / 1.2 * 10000) / 10000
  console.log(`   ${nom.padEnd(30)} ${f(TABLE_TTC).padStart(5)} €   fc ${(p.cout_achat_ht / htT * 100).toFixed(1).padStart(4)} %  ${deja ? '· existe' : '· à CRÉER'}`)
  table.push({ modele: p, nom, ht: htT, id: deja?.id ?? null })
}
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── rallumage : la CAISSE d'abord, sinon on désynchronise ──
const cat = JSON.parse((await z('catalog/dishes?show_all=true&limit=0')).t).dishes ?? []
if (cat.length < 100) { console.error(`⛔ la caisse rend ${cat.length} plats — lecture ratée, rien n'est écrit.`); process.exit(1) }
const par = new Map(cat.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = []
for (const b of bar) {
  const d = par.get(b.p.id)
  if (!d) { console.log(`   ⚠️ ${b.p.nom} : absent de la caisse`); continue }
  if (d.name == null || d.tax == null) { console.log(`   ⚠️ ${b.p.nom} : champ obligatoire manquant`); continue }
  const c = Math.round(BAR_TTC * 100)
  corps.push({ id: d.id, name: d.name, tax: d.tax, price: c, price_togo: c, disable: false })
}
if (corps.length) {
  const r = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (r.s !== 200) { console.error(`⛔ caisse : HTTP ${r.s} ${r.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`\n   ✓ caisse : ${corps.length} verre(s) de bar rallumé(s)`)
}
for (const b of bar) await sb(`recettes?id=eq.${b.p.id}`, { method: 'PATCH', body: JSON.stringify({ actif: true, prix_vente_ht: b.ht }) })
console.log(`   ✓ base   : ${bar.length} verre(s) de bar à ${f(BAR_TTC)} €`)

for (const t of table) {
  const m = t.modele
  const champs = {
    nom: t.nom, nom_caisse: t.nom, categorie: m.categorie,
    // ⚠️ Le service change le tag ET l'établissement : c'est ce qui ventile
    // le CA au bon étage.
    tag_destination: cafe.tag_destination, etablissement_id: cafe.etablissement_id,
    prix_vente_ht: t.ht, tva: m.tva, contient_alcool: true, vendable_online: false, actif: true,
    // ⚠️ MÊME matière, MÊME rendement que le verre du bar : un seul BIB
    // décompté, une seule ligne d'inventaire.
    cout_achat_ht: m.cout_achat_ht, nom_matiere: m.nom_matiere, unites_par_achat: m.unites_par_achat,
    allergenes_complementaires: m.allergenes_complementaires,
    nb_portions: 1, temps_preparation: 0, type_revenu: 'vente', stock_minimum: 0, stock_cible: 0,
  }
  if (t.id) await sb(`recettes?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: t.ht, actif: true }) })
  else await sb('recettes', { method: 'POST', body: JSON.stringify(champs) })
}
console.log(`   ✓ base   : ${table.length} verre(s) « servi à table » à ${f(TABLE_TTC)} €`)
console.log(`\n   ⚠️ les fiches « servi à table » ne sont pas encore en caisse — import Zelty à lancer.\n`)
