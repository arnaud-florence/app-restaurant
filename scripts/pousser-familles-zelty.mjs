// Ranger la carte de la caisse par familles.
//
// L'import crée les produits mais les laisse à plat : 84 boutons sans
// classement, inutilisables à 6 h 20. Ce script crée les familles côté Zelty
// (dans l'ordre du SERVICE, pas l'ordre alphabétique) et y rattache chaque
// produit.
//
// ⚠️ POST /catalog/dishes est un UPSERT qui exige name, price et tax. On RELIT
// chaque plat, on recopie ces trois champs tels quels, on n'ajoute que le tag,
// et on REFUSE de construire s'il en manque un — un objet incomplet écraserait
// le prix qui s'imprime sur les tickets.
//
// ⚠️ Tout part en UN SEUL appel. Zelty limite le débit (429 constaté au 5ᵉ
// appel d'affilée le 28/08/2026), et la documentation ne le dit pas.
//
//   node scripts/pousser-familles-zelty.mjs [--ecrire]
import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const Z = env.ZELTY_API_KEY, U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const zl = async (p, o = {}) => {
  const r = await fetch('https://api.zelty.fr/2.11/' + p,
    { ...o, headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// L'ordre du service : à 6 h 20 on vend du pain et du café, pas des pizzas.
const ORDRE = ['Pain', 'Viennoiserie', 'Boisson chaude', 'Formule petit-déjeuner',
  'Pâtisserie', 'Gourmandise', 'Glace', 'Sandwich', 'Panini', 'Salade', 'Pizza',
  'Formule', 'Boisson fraîche']

const tags = (await zl('catalog/tags')).body.tags ?? []
const manquantes = ORDRE.filter(n => !tags.some(t => t.name === n))
if (manquantes.length) {
  console.log(`  familles à créer : ${manquantes.join(', ')}`)
  if (ECRIRE) await zl('catalog/tags', { method: 'POST',
    body: JSON.stringify(manquantes.map(n => ({ name: n, remote_id: n, o: ORDRE.indexOf(n) }))) })
}
const idTag = new Map(((ECRIRE && manquantes.length
  ? (await zl('catalog/tags')).body.tags : tags) ?? []).map(t => [t.name, t.id]))

const nous = await (await fetch(`${U}/rest/v1/recettes?select=id,nom,categorie&actif=eq.true`,
  { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json()
const parId = new Map(nous.map(r => [String(r.id), r]))
const plats = (await zl('catalog/dishes?show_all=true&lang=fr&limit=0')).body.dishes ?? []

const aPousser = [], refus = [], deja = []
for (const p of plats) {
  const r = parId.get(String(p.remote_id ?? ''))
  if (!r) { refus.push(`${p.name} : aucune contrepartie chez nous`); continue }
  const tag = idTag.get(r.categorie)
  if (!tag) { refus.push(`${r.nom} : famille « ${r.categorie} » inconnue de la caisse`); continue }
  if (p.name == null || p.price == null || p.tax == null) {
    refus.push(`${r.nom} : champ obligatoire manquant chez Zelty — refus d'écrire`); continue }
  if ((p.tags ?? []).includes(tag)) { deja.push(r.nom); continue }
  // name/price/tax recopiés VERBATIM : on n'ajoute que le rattachement.
  aPousser.push({ id: p.id, name: p.name, price: p.price, tax: p.tax, tags: [tag] })
}

const parFamille = {}
for (const p of aPousser) {
  const nom = [...idTag.entries()].find(([, id]) => id === p.tags[0])?.[0] ?? '?'
  parFamille[nom] = (parFamille[nom] ?? 0) + 1
}
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
for (const n of ORDRE) if (parFamille[n]) console.log(`  ${n.padEnd(24)} ${parFamille[n]} produit(s)`)
if (deja.length) console.log(`\n  déjà rangés : ${deja.length}`)
if (refus.length) { console.log('\n  ── refusés ──'); refus.forEach(l => console.log('   ' + l)) }
console.log(`\n  à pousser : ${aPousser.length}`)

if (!ECRIRE) { console.log('\n  (rien envoyé)\n'); process.exit(0) }
if (aPousser.length) {
  const r = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(aPousser) })
  console.log(`\n  → HTTP ${r.status} · ${(r.body.dishes ?? []).length} plats mis à jour · errno ${r.body.errno}`)
}
