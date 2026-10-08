// Deux ajustements de la carte des vins — gérant, 06/10/2026.
//
// 1. CHAMPAGNE POL COCHET À 59 €. Le coefficient 4 le mettait à 76 € ; c'est
//    arithmétiquement juste et commercialement trop haut pour un village.
//    À 59 € le food cost monte à 38 %, et c'est le bon arbitrage : sur une
//    bouteille à ce prix, ce qui compte est la marge en EUROS (30,27 € HT),
//    pas le taux. Un champagne qu'on ne vend pas a un food cost de zéro.
//
// 2. LES PICHETS AU QUART ET AU DEMI. Ils existaient, éteints des deux côtés.
//    Le quart fait 25 cl, le demi 50 cl — ce sont les deux formats qu'on
//    demande au comptoir, et ils tombent juste.
//
// ⚠️ LE COEFFICIENT 4 NE S'APPLIQUE PAS AUX PICHETS, et il ne faut pas le
// leur appliquer : il vaut pour une BOUTEILLE qu'on débouche et qu'on sert
// telle quelle. Un pichet vient du BIB à 2,40 €/L — ×4 donnerait un quart à
// 2,40 € et un demi à 4,80 €, moins cher que le verre dont ils sont faits.
// Le vin au verre se tarife au coût du SERVICE, comme tout le bar (0144).
//
// ⚠️ ON RALLUME DES DEUX CÔTÉS, et la CAISSE D'ABORD : si elle refuse, rien
// n'est désynchronisé. Rallumer chez nous seulement laisserait un produit
// vendable sur le site et introuvable au comptoir ; rallumer en caisse
// seulement le ferait rééteindre par le miroir du catalogue au passage
// suivant (0141).
//
//   node scripts/carte-vins-ajustements.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const CHAMPAGNE_TTC = 59.00
// Le BIB In Vino : 24,00 € les 10 L.
const BIB_PAR_L = 2.40
const PICHETS = [['Pichet 25 cl', 0.25], ['Pichet 50 cl', 0.50]]

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

const noms = ['Champagne Pol Cochet', ...PICHETS.map(p => p[0])]
const prod = await sb(`recettes?select=id,nom,actif,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht&nom=in.(${noms.map(n => `"${n}"`).join(',')})`)
const absents = noms.filter(n => !prod.some(p => p.nom === n))
if (absents.length) { console.error(`⛔ introuvable(s) : ${absents.join(', ')} — rien n'est écrit.`); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const maj = []
for (const p of prod) {
  if (p.nom === 'Champagne Pol Cochet') {
    const ht = Math.round(CHAMPAGNE_TTC / 1.2 * 10000) / 10000
    const avant = p.prix_vente_ht * 1.2
    console.log(`   ${p.nom.padEnd(22)} ${f(avant).padStart(6)} → ${f(CHAMPAGNE_TTC).padStart(6)} €   fc ${(p.cout_achat_ht / ht * 100).toFixed(1)} %  ·  marge ${f(ht - p.cout_achat_ht)} € HT  ·  coef ${f(CHAMPAGNE_TTC / p.cout_achat_ht)}`)
    maj.push({ p, patch: { prix_vente_ht: ht }, ttc: CHAMPAGNE_TTC })
  } else {
    const [, litres] = PICHETS.find(x => x[0] === p.nom)
    const cout = Math.round(BIB_PAR_L * litres * 10000) / 10000
    const ttc = p.prix_vente_ht * (1 + p.tva / 100), ht = ttc / 1.2
    console.log(`   ${p.nom.padEnd(22)} ${f(ttc).padStart(6)} €   coût ${String(p.cout_achat_ht).padStart(7)} → ${cout.toFixed(4)}   fc ${(cout / ht * 100).toFixed(1)} %  ·  marge ${f(ht - cout)} € HT   ${p.actif ? '' : '· à RALLUMER'}`)
    maj.push({ p, patch: { cout_achat_ht: cout, actif: true }, ttc, rallumer: !p.actif })
  }
}
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── la CAISSE d'abord ──
const cat = JSON.parse((await z('catalog/dishes?show_all=true&limit=0')).t).dishes ?? []
// ⚠️ Moins de 100 plats = lecture ratée, pas un catalogue vide.
if (cat.length < 100) { console.error(`⛔ la caisse rend ${cat.length} plats — lecture ratée, rien n'est écrit.`); process.exit(1) }
const par = new Map(cat.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = []
for (const m of maj) {
  const d = par.get(m.p.id)
  if (!d) { console.log(`   ⚠️ ${m.p.nom} : aucune contrepartie en caisse, ignoré`); continue }
  // ⚠️ `name` et `tax` recopiés TELS QUELS : POST /catalog/dishes est un
  // upsert, et un objet incomplet écrase ce qui s'imprime sur les tickets.
  if (d.name == null || d.tax == null) { console.log(`   ⚠️ ${m.p.nom} : champ obligatoire manquant, ignoré`); continue }
  const c = Math.round(m.ttc * 100)
  const salle = m.p.prix_sur_place_ttc == null ? c : Math.round(Number(m.p.prix_sur_place_ttc) * 100)
  const o = { id: d.id, name: d.name, tax: d.tax, price: salle, price_togo: c }
  if (m.rallumer) o.disable = false
  corps.push(o)
}
if (corps.length) {
  const r = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (r.s !== 200) { console.error(`⛔ caisse : HTTP ${r.s} ${r.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`\n   ✓ caisse : ${corps.length} plat(s)`)
}
for (const m of maj) await sb(`recettes?id=eq.${m.p.id}`, { method: 'PATCH', body: JSON.stringify(m.patch) })
console.log(`   ✓ base   : ${maj.length} plat(s)\n`)
