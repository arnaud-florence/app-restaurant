// METTRE EN PAUSE CE QUI N'EST PAS À L'ARDOISE — 04/10/2026.
//
// Décision du gérant : la semaine 1 est une ardoise RÉDUITE. Cinq plats de
// brasserie, et « rien d'autre en brasserie sera proposé ».
//
// ⚠️⚠️ UN PLAT QU'ON NE SERT PAS DOIT DISPARAÎTRE DE LA CAISSE, pas seulement
// du réassort. Laissé actif, il reste un bouton au comptoir : un serveur
// l'encaisse, la cuisine ne peut pas le faire, et c'est le client qui
// l'apprend. Le réassort, lui, l'écarte déjà tout seul (la cible d'une
// matière hors ardoise tombe à zéro).
//
// ⚠️⚠️ LE RETRAIT SE MÈNE DES DEUX CÔTÉS, JAMAIS D'UN SEUL.
// `recettes.actif = false` CHEZ NOUS **et** `disable` EN CAISSE. Poser
// `disable` seul ferait relire « produit inactif » par le miroir du
// catalogue, qui éteindrait notre fiche — le produit disparaîtrait sans que
// personne sache pourquoi (0141). Les deux ensemble, le miroir relit ce
// qu'il a déjà : aucune boucle.
//
// ⚠️ LES DESSERTS ET LE CAFÉ À TABLE NE SONT PAS TOUCHÉS. « Brasserie »
// désigne la carte SALÉE ; un dessert se vend à quelqu'un qui prend un café.
// Et l'erreur n'est pas symétrique : laisser un dessert actif coûte une
// commande de trop — le réassort l'exclut déjà —, le mettre en pause à tort
// coûte une vente qu'on ne peut pas encaisser le jour de l'ouverture.
//
//   node scripts/ardoise-pause.mjs [--ecrire] [--reprendre]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ZK = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const REPRENDRE = process.argv.includes('--reprendre')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const z = async (p, o = {}) => {
  const r = await fetch(`https://api.zelty.fr/2.11/${p}`, {
    ...o, headers: { Authorization: `Bearer ${ZK}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
  const t = await r.text()
  return { s: r.status, j: (() => { try { return JSON.parse(t) } catch { return null } })(), t }
}

// ⚠️ Les familles de la carte SALÉE. Les desserts, le café et les vins n'y
// sont pas : voir l'en-tête.
const SALE = new Set(['Plat', 'Burger', 'Grande salade', 'Planche', 'Menu'])
const ARDOISE = new Set([
  'Burger Montagnard', 'Entrecôte grillée', 'Gnocchis forestiers',
  'Camembert rôti', 'Salade Chèvre chaud', 'Plat du jour',
])

const tous = await sb('recettes?select=id,nom,categorie,actif,prix_vente_ht&tag_destination=eq.CUISINE&order=categorie,nom')
const cible = tous.filter(r => SALE.has(r.categorie) && !ARDOISE.has(r.nom))
const aPauser = cible.filter(r => r.actif)
const aReprendre = cible.filter(r => !r.actif)
const liste = REPRENDRE ? aReprendre : aPauser

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ${REPRENDRE ? 'REPRISE' : 'MISE EN PAUSE'} ──\n`)
console.log(`   carte salée hors ardoise : ${cible.length} plats`)
console.log(`   ${REPRENDRE ? 'à reprendre' : 'à mettre en pause'} : ${liste.length}\n`)
for (const r of liste) console.log(`      ${r.categorie.padEnd(16)} ${r.nom}`)
const intouches = tous.filter(r => r.actif && !SALE.has(r.categorie))
console.log(`\n   NON touchés (${intouches.length}) — desserts, café, et le reste :`)
console.log(`      ${intouches.map(r => r.nom).join(' · ')}`)
if (!liste.length) { console.log('\n   rien à faire.\n'); process.exit(0) }
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── 1. la caisse D'ABORD, parce que c'est elle qui peut refuser ──
// ⚠️ ON RELIT LE CATALOGUE AVANT D'ÉCRIRE. `POST /catalog/dishes` est un
// UPSERT qui exige `name`, `price` et `tax` : un objet incomplet écrase le
// prix imprimé sur les tickets. On recopie ces trois champs TELS QUELS et on
// REFUSE de construire s'il en manque un (0141).
const cat = await z('catalog/dishes?limit=0')
const plats = cat.j?.dishes ?? []
if (plats.length < 100) {
  console.error(`   ✗ la caisse rend ${plats.length} plats — c'est une LECTURE RATÉE, pas un catalogue vide. Rien n'est écrit.`)
  process.exit(1)
}
const parRemote = new Map(plats.filter(p => p.remote_id).map(p => [String(p.remote_id), p]))
const corps = [], sans = []
for (const r of liste) {
  const p = parRemote.get(r.id)
  if (!p) { sans.push(r.nom); continue }
  if (p.name == null || p.price == null || p.tax == null) { sans.push(`${r.nom} (champ obligatoire manquant)`); continue }
  corps.push({ id: p.id, name: p.name, price: p.price, tax: p.tax, disable: !REPRENDRE })
}
if (sans.length) console.log(`   ⚠️ ${sans.length} sans contrepartie exploitable : ${sans.join(', ')}`)
if (corps.length) {
  // ⚠️ TABLEAU NU, pas `{dishes: […]}` — enveloppé, l'API répond 400 en
  // réclamant des champs qu'elle n'a pas lus. Et UN SEUL appel : Zelty
  // plafonne son débit et répond 429 au cinquième appel à la file.
  const rep = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (rep.s !== 200) { console.error(`   ✗ caisse : HTTP ${rep.s} ${rep.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`   ✓ caisse : ${corps.length} plat(s) ${REPRENDRE ? 'réactivé(s)' : 'éteint(s)'}`)
}

// ── 2. notre base ENSUITE : si la caisse a refusé, on n'a rien désynchronisé ──
await sb(`recettes?id=in.(${liste.map(r => r.id).join(',')})`, {
  method: 'PATCH', body: JSON.stringify({ actif: !REPRENDRE }) })
console.log(`   ✓ base  : ${liste.length} plat(s) ${REPRENDRE ? 'repris' : 'en pause'}\n`)
