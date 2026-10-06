// La Baguette Jeannette à 1,40 € — décision du gérant, 06/10/2026.
//
// Elle était à 2,10 €, soit plus cher que la Campestre de 295 g alors
// qu'elle n'en fait que 270 : c'était l'anomalie de la carte pain.
//
// ⚠️ ET ELLE NE SE PROPAGE PAS. 1,40 € implique 49,1 % de food cost, au
// -dessus de la fourchette 38-45 % que le gérant s'est donnée. Appliqué aux
// onze pains et viennoiseries, ce taux ferait tomber le croissant à 1,25 €
// et le pain au chocolat à 1,15 € — les deux meilleures ventes — pour
// 29 % de marge en moins, mesuré sur les volumes réels d'août. Sept des
// onze produits sont déjà DANS la fourchette : on ne corrige que
// l'anomalie.
//
//   node scripts/prix-jeannette.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, ZK = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const PRODUIT = 'Baguette Jeannette', TTC = 1.40
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

const [p] = await sb(`recettes?select=id,nom,cout_achat_ht,prix_vente_ht,prix_sur_place_ttc,tva&nom=eq.${encodeURIComponent(PRODUIT)}`)
if (!p) { console.error(`⛔ « ${PRODUIT} » introuvable`); process.exit(1) }
const k = 1 + Number(p.tva) / 100
const htNeuf = Number((TTC / k).toFixed(4))
const cout = Number(p.cout_achat_ht)
const fc = cout / htNeuf * 100
console.log(`\n  ${p.nom} : ${(Number(p.prix_vente_ht) * k).toFixed(2)} €  →  ${TTC.toFixed(2)} € TTC`)
console.log(`  HT ${Number(p.prix_vente_ht).toFixed(4)} → ${htNeuf.toFixed(4)}  (TVA ${p.tva} %)`)
console.log(`  coût ${cout.toFixed(4)} €  ·  food cost ${fc.toFixed(1)} %  ·  marge ${(htNeuf - cout).toFixed(4)} € HT`)
// ⚠️ Le garde-fou habituel : un coût atteignant 95 % du prix de vente est
// une erreur de saisie, pas une marge écrasée.
if (cout >= htNeuf * 0.95) { console.error(`⛔ coût ${cout} € pour ${htNeuf} € HT — refusé.`); process.exit(1) }
if (fc > 60) { console.error(`⛔ food cost ${fc.toFixed(0)} % — au-delà du plausible, refusé.`); process.exit(1) }
if (!ECRIRE) { console.log(`\n  (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

// ── la caisse D'ABORD : c'est elle qui peut refuser ──
const cat = await z('catalog/dishes?limit=0'); const plats = cat.j?.dishes ?? []
if (plats.length < 100) { console.error(`⛔ la caisse rend ${plats.length} plats — lecture ratée.`); process.exit(1) }
const d = plats.find(x => String(x.remote_id) === p.id)
if (!d) { console.error('⛔ aucune contrepartie en caisse'); process.exit(1) }
// ⚠️ On RECOPIE name et tax tels quels — un upsert incomplet écrase ce qui
// s'imprime sur les tickets (0141). `price` est le prix SALLE, `price_togo`
// celui de l'emporter : ici aucun tarif sur place distinct, donc les deux.
if (d.name == null || d.tax == null) { console.error('⛔ champ obligatoire manquant en caisse'); process.exit(1) }
const c = Math.round(TTC * 100)
const rep = await z('catalog/dishes', { method: 'POST',
  body: JSON.stringify([{ id: d.id, name: d.name, tax: d.tax, price: c, price_togo: c }]) })
if (rep.s !== 200) { console.error(`⛔ caisse : HTTP ${rep.s} ${rep.t.slice(0, 200)} — rien n'est écrit chez nous`); process.exit(1) }
console.log(`\n  ✓ caisse : ${(d.price / 100).toFixed(2)} € → ${TTC.toFixed(2)} €`)
await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: htNeuf }) })
console.log(`  ✓ base   : ${htNeuf.toFixed(4)} € HT\n`)
