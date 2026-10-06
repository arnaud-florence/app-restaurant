// Les pichets par COULEUR — pour que le vin servi en pichet sorte du stock.
//
// ⚠️⚠️ LE PICHET GÉNÉRIQUE NE DÉCOMPTAIT AUCUN BIB, et c'était le trou le
// plus large de la carte des vins. Les verres portent `nom_matiere` et
// sortent du bon BIB ; un pichet « 25 cl » ne dit pas sa couleur, donc il ne
// pouvait pointer sur aucun des trois. Le vin servi en pichet quittait la
// réserve sans que l'inventaire le voie — et depuis que le quart est à
// 4,50 €, c'est le format le plus probable en salle. On aurait commandé à
// l'aveugle dès la première semaine, sans qu'aucune erreur ne le signale.
//
// Six fiches remplacent les deux : rouge / rosé / blanc × quart et demi.
//
// ⚠️ `unites_par_achat` est le nombre d'unités VENDUES par unité ACHETÉE :
// un BIB de 10 L donne 40 quarts ou 20 demis. C'est lui qui décompte le
// stock, et c'est lui qui replie les six pichets et les six verres sur UNE
// ligne d'inventaire par couleur (0131). Se tromper ferait commander à côté.
//
// ⚠️ LE RETRAIT DES DEUX GÉNÉRIQUES SE MÈNE DES DEUX CÔTÉS, caisse d'abord.
// Les éteindre seulement chez nous laisserait deux boutons au comptoir que
// la cuisine ne verrait plus ; seulement en caisse, le miroir du catalogue
// éteindrait nos fiches et on ne saurait pas pourquoi (0141).
//
// ⚠️ On DÉSACTIVE, on ne supprime pas : une suppression emporterait
// l'historique de ventes et ne se défait pas.
//
//   node scripts/pichets-par-couleur.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const BIB_L = 10, BIB_HT = 24.00
const FORMATS = [['25 cl', 0.25, 4.50], ['50 cl', 0.50, 8.00]]
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
const f = (n, d = 2) => n.toFixed(d).replace('.', ',')

// ⚠️ Le nom de la matière est RELU sur le verre de la même couleur, jamais
// recopié : une faute de frappe créerait une quatrième ligne de stock
// fantôme, et les pichets ne décompteraient toujours rien.
const verres = await sb('recettes?select=id,nom,nom_matiere,categorie,tag_destination,etablissement_id,tva,allergenes_complementaires&nom=like.Verre%20de%20*%2012%20cl')
const matiere = {}
for (const c of COULEURS) {
  const v = verres.find(x => x.nom === `Verre de ${c} 12 cl`)
  if (!v?.nom_matiere) { console.error(`⛔ « Verre de ${c} 12 cl » sans nom_matiere — rien n'est écrit.`); process.exit(1) }
  matiere[c] = v
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · BIB ${BIB_L} L à ${f(BIB_HT)} € ──\n`)
const aCreer = []
for (const [lib, litres, ttc] of FORMATS) {
  const parBib = BIB_L / litres, cout = Math.round(BIB_HT / parBib * 10000) / 10000
  const ht = Math.round(ttc / 1.2 * 10000) / 10000
  for (const c of COULEURS) {
    const nom = `Pichet de ${c} ${lib}`
    const [deja] = await sb(`recettes?select=id&nom=eq.${encodeURIComponent(nom)}`)
    console.log(`   ${nom.padEnd(26)} ${f(ttc).padStart(6)} €   coût ${f(cout, 3)}   ${parBib}/BIB   ← ${matiere[c].nom_matiere}${deja ? '   (existe)' : ''}`)
    aCreer.push({ nom, c, ht, cout, parBib, id: deja?.id ?? null })
  }
}
const generiques = await sb('recettes?select=id,nom,actif&nom=in.("Pichet 25 cl","Pichet 50 cl")')
console.log(`\n   à éteindre : ${generiques.map(g => `${g.nom}${g.actif ? '' : ' (déjà éteint)'}`).join(', ')}`)
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── les génériques s'éteignent en CAISSE d'abord ──
const cat = JSON.parse((await z('catalog/dishes?show_all=true&limit=0')).t).dishes ?? []
if (cat.length < 100) { console.error(`⛔ la caisse rend ${cat.length} plats — lecture ratée, rien n'est écrit.`); process.exit(1) }
const par = new Map(cat.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = []
for (const g of generiques.filter(x => x.actif)) {
  const d = par.get(g.id)
  if (!d) { console.log(`   ⚠️ ${g.nom} : absent de la caisse`); continue }
  if (d.name == null || d.tax == null || d.price == null) { console.log(`   ⚠️ ${g.nom} : champ obligatoire manquant`); continue }
  // ⚠️ `name`, `price` et `tax` recopiés TELS QUELS : l'upsert écrase ce qui
  // s'imprime sur les tickets. On ne touche QUE `disable`.
  corps.push({ id: d.id, name: d.name, tax: d.tax, price: d.price, price_togo: d.price_togo ?? d.price, disable: true })
}
if (corps.length) {
  const r = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (r.s !== 200) { console.error(`⛔ caisse : HTTP ${r.s} ${r.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`\n   ✓ caisse : ${corps.length} pichet(s) générique(s) éteint(s)`)
}
for (const g of generiques.filter(x => x.actif)) {
  // ⚠️ On efface `nom_caisse` : sans ça le miroir pourrait encore rattacher
  // un ticket au générique, et le rattachement redeviendrait ambigu.
  await sb(`recettes?id=eq.${g.id}`, { method: 'PATCH', body: JSON.stringify({ actif: false, nom_caisse: null }) })
}
console.log(`   ✓ base   : ${generiques.filter(x => x.actif).length} générique(s) désactivé(s)`)

const m0 = matiere[COULEURS[0]]
for (const p of aCreer) {
  const m = matiere[p.c]
  const champs = {
    nom: p.nom, nom_caisse: p.nom, categorie: m.categorie,
    tag_destination: m.tag_destination, etablissement_id: m.etablissement_id,
    prix_vente_ht: p.ht, tva: m.tva, contient_alcool: true, vendable_online: false, actif: true,
    cout_achat_ht: p.cout, nom_matiere: m.nom_matiere, unites_par_achat: p.parBib,
    allergenes_complementaires: m.allergenes_complementaires,
    nb_portions: 1, temps_preparation: 0, type_revenu: 'vente', stock_minimum: 0, stock_cible: 0,
  }
  if (p.id) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: p.ht, cout_achat_ht: p.cout, unites_par_achat: p.parBib, nom_matiere: m.nom_matiere, actif: true }) })
  else await sb('recettes', { method: 'POST', body: JSON.stringify(champs) })
}
console.log(`   ✓ base   : ${aCreer.length} pichets par couleur`)
console.log(`\n   ⚠️ pas encore en caisse — import Zelty à lancer.\n`)
