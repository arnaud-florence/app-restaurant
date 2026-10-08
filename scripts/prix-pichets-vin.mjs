// Le quart et le demi de vin — 4,50 € et 8,00 €, décision du gérant 06/10/2026.
//
// Les deux viennent du BIB 10 L d'In Vino, 24,00 € HT, soit 2,40 €/L : le
// quart coûte 0,60 €, le demi 1,20 €.
//
// ⚠️ UN SEUL PRIX, pas de version « servi à table » comme pour le verre.
// C'est un choix : le pichet est le format de la maison, il ne change pas
// selon l'endroit où on s'assied.
//
// ⚠️ LE COEFFICIENT 4 NE S'APPLIQUE PAS ICI — il vaut pour une bouteille
// qu'on débouche et qu'on sert telle quelle. ×4 sur le BIB donnerait un
// quart à 2,40 €, moins cher que le verre de 12 cl qui le compose.
//
// ⚠️ LE PICHET NE DÉCOMPTE AUCUN STOCK, et ce script n'y change rien. Les
// verres portent `nom_matiere` et sortent du bon BIB ; un pichet ne dit pas
// sa COULEUR, donc il ne peut pointer sur aucun des trois. Le vin servi en
// pichet quitte la réserve sans que l'inventaire le voie, et la commande
// conseillée sous-estime les BIB d'autant. Reste à trancher : des pichets
// par couleur, ou ce trou assumé.
//
//   node scripts/prix-pichets-vin.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const BIB_PAR_L = 2.40
const TARIFS = [['Pichet 25 cl', 4.50, 0.25], ['Pichet 50 cl', 8.00, 0.50]]

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

const noms = TARIFS.map(t => t[0])
const prod = await sb(`recettes?select=id,nom,actif,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht&nom=in.(${noms.map(n => `"${n}"`).join(',')})`)
const absents = noms.filter(n => !prod.some(p => p.nom === n))
if (absents.length) { console.error(`⛔ introuvable(s) : ${absents.join(', ')} — rien n'est écrit.`); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · BIB ${f(BIB_PAR_L)} €/L ──\n`)
console.log('   format          coût    avant  →  retenu    €/L   marge HT    fc')
const maj = []
for (const [nom, ttc, litres] of TARIFS) {
  const p = prod.find(x => x.nom === nom)
  const cout = Math.round(BIB_PAR_L * litres * 10000) / 10000
  const ht = Math.round(ttc / 1.2 * 10000) / 10000
  const avant = p.prix_vente_ht * (1 + p.tva / 100)
  // ⚠️ Un coût qui atteint 95 % du prix de vente est une erreur de saisie,
  // pas une marge écrasée.
  if (cout >= ht * 0.95) { console.error(`⛔ ${nom} : coût ${cout} € pour ${ht} € HT — refusé.`); process.exit(1) }
  console.log(`   ${nom.padEnd(14)} ${f(cout, 3).padStart(6)}  ${f(avant).padStart(6)}  →  ${f(ttc).padStart(6)} ${f(ttc / litres).padStart(7)} ${f(ht - cout).padStart(8)} ${((cout / ht) * 100).toFixed(1).padStart(7)} %`)
  maj.push({ p, ttc, ht, cout })
}
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── la CAISSE d'abord : si elle refuse, rien n'est désynchronisé ──
const cat = JSON.parse((await z('catalog/dishes?show_all=true&limit=0')).t).dishes ?? []
if (cat.length < 100) { console.error(`⛔ la caisse rend ${cat.length} plats — lecture ratée, rien n'est écrit.`); process.exit(1) }
const par = new Map(cat.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = []
for (const m of maj) {
  const d = par.get(m.p.id)
  if (!d) { console.log(`   ⚠️ ${m.p.nom} : absent de la caisse`); continue }
  // ⚠️ `name` et `tax` recopiés TELS QUELS : l'upsert écrase ce qui s'imprime
  // sur les tickets.
  if (d.name == null || d.tax == null) { console.log(`   ⚠️ ${m.p.nom} : champ obligatoire manquant`); continue }
  const c = Math.round(m.ttc * 100)
  const salle = m.p.prix_sur_place_ttc == null ? c : Math.round(Number(m.p.prix_sur_place_ttc) * 100)
  corps.push({ id: d.id, name: d.name, tax: d.tax, price: salle, price_togo: c })
}
if (corps.length) {
  const r = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (r.s !== 200) { console.error(`⛔ caisse : HTTP ${r.s} ${r.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
  console.log(`\n   ✓ caisse : ${corps.length} prix`)
}
for (const m of maj) await sb(`recettes?id=eq.${m.p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: m.ht, cout_achat_ht: m.cout, actif: true }) })
console.log(`   ✓ base   : ${maj.length} prix\n`)
