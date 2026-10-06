// La grille des pains et viennoiseries — arrêtée par le gérant le 06/10/2026.
//
// Ce ne sont PAS des prix calculés : ce sont des prix DÉCIDÉS, dictés
// produit par produit. Le food cost est affiché pour information, il ne
// commande rien ici. C'est l'inverse de la démarche habituelle, et c'est
// voulu — un prix de boulangerie se lit sur un panneau avant d'être un
// ratio.
//
// ⚠️ Quatre produits convergent sur 1,40 € : croissant, pain au chocolat,
// pain aux raisins et chausson aux pommes. Un prix unique de viennoiserie
// se retient au comptoir et se tape sans hésiter.
//
//   node scripts/tarifs-pains-0610.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, ZK = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')

const TARIFS = {
  'Baguette classique': 1.20,
  'Baguette Jeannette': 1.40,
  'Baguette Paris': 2.40,
  'Campestre multicéréales': 1.90,
  'Pain complet': 2.30,
  'Pain restaurant': 1.90,
  'Pavé Le Jeannot': 3.90,
  'Chausson aux pommes': 1.40,
  'Croissant': 1.40,
  'Pain au chocolat': 1.40,
  'Pain aux raisins': 1.40,
}

const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const z = async (p, o = {}) => {
  const r = await fetch(`https://api.zelty.fr/2.11/${p}`, { ...o,
    headers: { Authorization: `Bearer ${ZK}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
  const t = await r.text()
  return { s: r.status, t, j: (() => { try { return JSON.parse(t) } catch { return null } })() }
}

const noms = Object.keys(TARIFS)
const prod = await sb(`recettes?select=id,nom,categorie,cout_achat_ht,prix_vente_ht,prix_sur_place_ttc,tva&nom=in.(${noms.map(n => `"${n}"`).join(',')})`)
// ⚠️ Un nom qui ne retrouve pas son produit est une ERREUR, pas un détail :
// le prix validé ne serait appliqué nulle part, en silence.
const absents = noms.filter(n => !prod.some(p => p.nom === n))
if (absents.length) { console.error(`⛔ introuvable(s) : ${absents.join(', ')} — rien n'est écrit.`); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · grille validée par le gérant ──\n`)
console.log('produit                     actuel  →  validé   food cost')
console.log('─'.repeat(60))
const maj = []
for (const n of noms) {
  const p = prod.find(x => x.nom === n)
  const k = 1 + Number(p.tva) / 100, ttc = Number(p.prix_vente_ht) * k
  const neufHt = Number((TARIFS[n] / k).toFixed(4))
  const c = p.cout_achat_ht == null ? null : Number(p.cout_achat_ht)
  const fc = c == null ? null : c / neufHt * 100
  // ⚠️ Le garde-fou habituel : un coût atteignant 95 % du prix de vente est
  // une erreur de saisie, pas une marge écrasée.
  if (c != null && c >= neufHt * 0.95) { console.error(`⛔ ${n} : coût ${c} € pour ${neufHt} € HT — refusé.`); process.exit(1) }
  const bouge = Math.abs(ttc - TARIFS[n]) > 0.005
  console.log(`${n.slice(0, 26).padEnd(26)} ${ttc.toFixed(2).padStart(6)} → ${TARIFS[n].toFixed(2).padStart(6)} €  ${fc != null ? fc.toFixed(0).padStart(3) + ' %' : '  —'}${bouge ? '' : '   (inchangé)'}`)
  if (bouge) maj.push({ p, neufHt, ttc: TARIFS[n] })
}
console.log(`\n   ${maj.length} prix à modifier sur ${noms.length}`)
if (!maj.length) { console.log('\n   rien à faire.\n'); process.exit(0) }
if (!ECRIRE) { console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

// ── la caisse D'ABORD : c'est elle qui peut refuser ──
const cat = await z('catalog/dishes?limit=0'); const plats = cat.j?.dishes ?? []
if (plats.length < 100) { console.error(`⛔ la caisse rend ${plats.length} plats — lecture ratée.`); process.exit(1) }
const parRemote = new Map(plats.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = []
for (const m of maj) {
  const d = parRemote.get(m.p.id)
  if (!d) { console.error(`   ⚠️ ${m.p.nom} : aucune contrepartie en caisse, ignoré`); continue }
  // ⚠️ `name` et `tax` recopiés TELS QUELS : `POST /catalog/dishes` est un
  // upsert, et un objet incomplet écrase ce qui s'imprime sur les tickets.
  if (d.name == null || d.tax == null) { console.error(`   ⚠️ ${m.p.nom} : champ obligatoire manquant, ignoré`); continue }
  const c = Math.round(m.ttc * 100)
  // ⚠️ `price` est le prix SALLE : il ne suit que s'il n'existe pas de tarif
  // sur place distinct, sinon on écraserait le prix du verre consigné.
  const salle = m.p.prix_sur_place_ttc == null ? c : Math.round(Number(m.p.prix_sur_place_ttc) * 100)
  corps.push({ id: d.id, name: d.name, tax: d.tax, price: salle, price_togo: c })
}
if (corps.length) {
  const rep = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (rep.s !== 200) { console.error(`⛔ caisse : HTTP ${rep.s} ${rep.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`\n   ✓ caisse : ${corps.length} prix`)
}
for (const m of maj) {
  await sb(`recettes?id=eq.${m.p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: m.neufHt }) })
}
console.log(`   ✓ base   : ${maj.length} prix\n`)
