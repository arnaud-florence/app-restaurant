// Ramener à 45 % de food cost ce qui le dépasse.
//
// Décision du gérant, 06/10/2026 : sa fourchette est 38-45 %, et quatre
// produits sortaient par le haut — on y perd de la marge à chaque vente.
//
// ⚠️⚠️ LA BAGUETTE JEANNETTE EST EXCLUE, et il faut que ce soit écrit. Elle
// est à 49 % DÉLIBÉRÉMENT depuis le même jour : à 2,10 € elle était plus
// chère que la Campestre de 295 g alors qu'elle n'en fait que 270. Un
// script qui « corrige tout ce qui dépasse 45 % » la remonterait à 1,55 €
// et défferait la décision, sans que personne ne s'en aperçoive.
//
// ⚠️ On arrondit AU-DESSUS, au 5 centimes. Arrondir au plus proche
// laisserait la moitié des produits encore au-dessus de 45 % — on viserait
// une cible qu'on n'atteint pas.
//
//   node scripts/prix-food-cost-45.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, ZK = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const CIBLE = 0.45
const EXCLUS = new Set(['Baguette Jeannette'])

// ⚠️ On ne corrige QUE ce qui est explicitement désigné. Le critère objectif
// « food cost > 45 % » remonte aussi six bouteilles de 1,5 L, deux Red Bull,
// une glace et DEUX BIÈRES — et les bières ne relèvent pas de cette logique :
// la carte du bar est posée sur le COÛT DU SERVICE, pas sur le food cost. Le
// demi ne paie presque que le service et tient parce que la pinte, la
// bouteille et le spritz portent la marge ; le remonter isolément déséquilibre
// l'ensemble. `--tous` passe outre, en connaissance de cause.
const TOUS = process.argv.includes('--tous')
const DESIGNES = new Set(['Tiramisu individuel', 'Sacristain',
  'Muffin chocolat-noisette', 'Muffin citron'])

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

const tous = await sb('recettes?select=id,nom,categorie,cout_achat_ht,prix_vente_ht,prix_sur_place_ttc,tva&actif=is.true&limit=1000')
const haut = Math.ceil, a5 = x => haut(x * 20) / 20
const cibles = []
for (const p of tous) {
  if (p.cout_achat_ht == null || p.prix_vente_ht == null) continue
  const c = Number(p.cout_achat_ht), ht = Number(p.prix_vente_ht), k = 1 + Number(p.tva) / 100
  if (!(ht > 0)) continue
  const fc = c / ht
  if (fc <= CIBLE) continue
  const neufTtc = a5(c / CIBLE * k)
  const neufHt = Number((neufTtc / k).toFixed(4))
  cibles.push({ p, c, ttc: ht * k, fc, neufTtc, neufHt, fcApres: c / neufHt })
}
cibles.sort((a, b) => b.fc - a.fc)

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · cible ${CIBLE * 100} % ──\n`)
const retenus = cibles.filter(x => !EXCLUS.has(x.p.nom) && (TOUS || DESIGNES.has(x.p.nom)))
for (const x of cibles) {
  const ex = EXCLUS.has(x.p.nom)
  const pris = retenus.includes(x)
  console.log(`  ${ex ? '⏭ EXCLU ' : pris ? '✎ REPRIS' : '· en attente'.padEnd(8)}${x.p.nom.slice(0, 28).padEnd(28)} ${String(x.p.categorie).slice(0, 12).padEnd(12)} ${x.ttc.toFixed(2).padStart(5)} € ${(x.fc * 100).toFixed(0).padStart(3)} %  →  ${ex ? '(inchangé, décision du jour)' : pris ? `${x.neufTtc.toFixed(2)} € ${(x.fcApres * 100).toFixed(0)} %` : `(${x.neufTtc.toFixed(2)} € — non demandé)`}`)
}
if (!retenus.length) { console.log('\n   rien à corriger.\n'); process.exit(0) }
console.log(`\n   ${retenus.length} produit(s) à remonter`)
if (!ECRIRE) { console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

// ── la caisse D'ABORD ──
const cat = await z('catalog/dishes?limit=0'); const plats = cat.j?.dishes ?? []
if (plats.length < 100) { console.error(`⛔ la caisse rend ${plats.length} plats — lecture ratée.`); process.exit(1) }
const parRemote = new Map(plats.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = []
for (const x of retenus) {
  const d = parRemote.get(x.p.id)
  if (!d) { console.error(`   ⚠️ ${x.p.nom} : aucune contrepartie en caisse, ignoré`); continue }
  // ⚠️ `name` et `tax` recopiés tels quels — un upsert incomplet écrase ce
  // qui s'imprime sur les tickets (0141).
  if (d.name == null || d.tax == null) { console.error(`   ⚠️ ${x.p.nom} : champ obligatoire manquant, ignoré`); continue }
  const c = Math.round(x.neufTtc * 100)
  // ⚠️ `price` est le prix SALLE : il ne bouge QUE s'il n'y a pas de tarif
  // sur place distinct. Sinon on écraserait le prix du verre consigné.
  const salle = x.p.prix_sur_place_ttc == null ? c : Math.round(Number(x.p.prix_sur_place_ttc) * 100)
  corps.push({ id: d.id, name: d.name, tax: d.tax, price: salle, price_togo: c })
}
if (corps.length) {
  const rep = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (rep.s !== 200) { console.error(`⛔ caisse : HTTP ${rep.s} ${rep.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`\n   ✓ caisse : ${corps.length} prix`)
}
for (const x of retenus) {
  await sb(`recettes?id=eq.${x.p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: x.neufHt }) })
}
console.log(`   ✓ base   : ${retenus.length} prix\n`)
