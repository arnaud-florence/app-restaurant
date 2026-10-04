// La carte des pizzas de l'affiche du 12 octobre 2026.
//
// Relevée sur l'affiche fournie par le gérant le 04/10/2026. Les prix sont
// ceux du PANNEAU, donc TTC : c'est `prix_vente_ht` qui se recalcule, jamais
// l'inverse — le client paie ce qui est affiché.
//
// ⚠️ LA DATE D'OUVERTURE PASSE DU 3 AU 12 OCTOBRE. Les quatre modules du
// groupe restaurant portaient `date_ouverture_prevue = 2026-10-03`, déjà
// dépassée : le site annonçait donc une ouverture passée. L'affiche ne parle
// que des PIZZAS — seul `pizzeria` est redaté ici, les trois autres sont
// SIGNALÉS et attendent une décision.
//
// ⚠️ TVA 10 % : une pizza est un plat, à emporter comme sur place (0113).
//
//   node scripts/carte-pizzas-12-octobre.mjs [--ecrire]
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
const TVA = 10
const ht = ttc => Math.round(ttc / (1 + TVA / 100) * 10000) / 10000
const e = n => n.toFixed(2).replace('.', ',')

// nom affiche · TTC · garniture · nom actuel en base (si différent)
const CARTE = [
  ['La Marguerite',            9.90, 'Sauce tomate, mozzarella, emmental, olives, origan'],
  ['La Tasia',                11.90, 'Sauce tomate, mozzarella, emmental, jambon blanc, champignons, olives, origan'],
  ['La Reine Tasia',          12.90, 'Sauce tomate, mozzarella, emmental, jambon blanc, champignons, œuf, olives, origan'],
  ['La Provençale',           13.50, 'Sauce tomate, mozzarella, emmental, courgettes, aubergines, poivrons, oignons rouges, olives, origan'],
  ['La St-Quinis',            13.90, 'Sauce tomate, mozzarella, emmental, chorizo, poivrons, oignons rouges, olives, origan'],
  ['La Ferrage',              14.90, 'Crème fraîche, mozzarella, emmental, pommes de terre, lardons, oignons confits, olives, origan'],
  ["L'Issole",                14.50, 'Crème fraîche, mozzarella, emmental, chèvre, miel, noix, roquette, olives, origan'],
  ["L'Anastasie",             15.90, 'Sauce tomate, mozzarella, emmental, tomates cerises, jambon cru, roquette, parmesan, olives, origan'],
  ['La CasaTasia — Signature', 17.50, 'Sauce tomate, mozzarella, emmental, burrata, coppa, tomates cerises, pesto, roquette, parmesan, olives, origan', 'La CasaTasia Signature'],
  ['La 4 Fromages',           14.90, 'Crème fraîche, mozzarella, emmental, chèvre, gorgonzola, parmesan, olives, origan', 'La Quatre Fromages'],
  ['La Naples',               14.50, 'Sauce tomate, mozzarella, emmental, viande hachée, poivrons, olives, origan'],
  ['La Camembert',            15.90, 'Crème fraîche, mozzarella, emmental, pommes de terre, camembert, jambon cru, olives, origan'],
  ["La Perle de l'Issole",    15.90, 'Crème fraîche, mozzarella, emmental, oignons confits, saumon, aneth, citron, olives, origan'],
]

const base = await sb('recettes?tag_destination=eq.PIZZA&select=id,nom,prix_vente_ht,tva,description,actif,categorie,etablissement_id,vendable_online,image_url')
// ⚠️⚠️ L'APOSTROPHE DÉCIDE SI ON MET À JOUR OU SI ON DUPLIQUE. La base porte
// « L'Issole » avec une apostrophe DROITE ; écrite en typographique « L’Issole »,
// la pizza ressortait « NOUVELLE » et aurait été créée une seconde fois — deux
// fiches, deux boutons en caisse, et les ventes coupées en deux. On rapproche
// donc sur une clé normalisée, et on garde l'orthographe déjà en base.
const cle = s => s.replace(/[’‘`]/g, "'").toLowerCase().trim()
const parNom = new Map(base.map(p => [cle(p.nom), p]))
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — carte des pizzas du 12 octobre ──\n`)
console.log('   pizza                       base    affiche   écart')
const aCreer = [], aMajPrix = [], aRenommer = [], aMajDesc = []
for (const [nom, ttc, desc, ancien] of CARTE) {
  const p = parNom.get(cle(ancien ?? nom))
  if (!p) { aCreer.push({ nom, ttc, desc }); console.log(`   ${nom.padEnd(26)}    —   ${e(ttc).padStart(7)}   NOUVELLE`); continue }
  const actuel = Number(p.prix_vente_ht) * (1 + p.tva / 100)
  const d = ttc - actuel
  console.log(`   ${nom.padEnd(26)} ${e(actuel).padStart(6)}  ${e(ttc).padStart(7)}  ${Math.abs(d) < 0.005 ? '  =' : (d > 0 ? '+' : '') + e(d)}`)
  if (Math.abs(d) >= 0.005) aMajPrix.push({ p, ttc })
  if (ancien) { aRenommer.push({ p, nom }); console.log(`   ${' '.repeat(26)} ↳ renommée depuis « ${ancien} »`) }
  if ((p.description ?? '').trim() !== desc) aMajDesc.push({ p, desc })
}
const enTrop = base.filter(p => p.actif && !CARTE.some(([n, , , a]) => cle(a ?? n) === cle(p.nom)))
console.log(`\n   ${aMajPrix.length} prix à changer · ${aRenommer.length} à renommer · ${aMajDesc.length} garnitures à corriger · ${aCreer.length} à créer`)
if (enTrop.length) console.log(`   ⚠️ ${enTrop.length} pizza(s) en base ABSENTE(S) de l'affiche : ${enTrop.map(p => p.nom).join(', ')}`)

if (ECRIRE) {
  for (const { p, ttc } of aMajPrix)
    await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: ht(ttc) }) })
  for (const { p, nom } of aRenommer)
    await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ nom }) })
  for (const { p, desc } of aMajDesc)
    await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ description: desc }) })
  // ⚠️ La nouvelle pizza naît SANS photo : le menu public exige famille ET
  // image, elle restera donc hors du site jusqu'à ce qu'on la photographie ou
  // qu'on lui pose une plaque. C'est voulu — une photo d'emprunt montrerait
  // la pizza de quelqu'un d'autre.
  const modele = base[0]
  for (const { nom, ttc, desc } of aCreer)
    await sb('recettes', { method: 'POST', body: JSON.stringify({
      nom, categorie: 'Pizzeria', tag_destination: 'PIZZA',
      etablissement_id: modele.etablissement_id, prix_vente_ht: ht(ttc), tva: TVA,
      description: desc, vendable_online: true, actif: true }) })
  console.log(`\n   ✓ ${aMajPrix.length} prix, ${aRenommer.length} noms, ${aMajDesc.length} garnitures, ${aCreer.length} créations`)
}

// ── la date d'ouverture ──────────────────────────────────────────────
const mods = await sb('activites_modules?activite=eq.restaurant&select=cle,actif,teaser,date_ouverture_prevue&order=cle')
console.log(`\n── la date d'ouverture ──`)
for (const m of mods) {
  const perimee = m.date_ouverture_prevue && m.date_ouverture_prevue < new Date().toISOString().slice(0, 10)
  console.log(`   ${m.cle.padEnd(20)} ${String(m.date_ouverture_prevue ?? '—').padEnd(12)} ${perimee ? '⚠️ DÉPASSÉE' : ''}`)
}
if (ECRIRE) {
  await sb('activites_modules?cle=eq.pizzeria', { method: 'PATCH', body: JSON.stringify({ date_ouverture_prevue: '2026-10-12' }) })
  console.log(`\n   ✓ pizzeria → 2026-10-12 (l'affiche ne parle que des pizzas)`)
  console.log(`   ⚠️ bar, restaurant_salle et evenementiel gardent une date DÉPASSÉE :`)
  console.log(`      le site annonce donc une ouverture qui a déjà eu lieu. À trancher.`)
}
console.log(ECRIRE ? '' : '\n  (essai à blanc — relancer avec --ecrire)\n')
