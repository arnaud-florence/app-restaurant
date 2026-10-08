// Les noms doivent dire la même chose des deux côtés.
//
// Constaté le 06/10/2026 : le gérant voyait « Pavé multicéréales » sur sa
// caisse alors que la carte dit « Pavé Le Jeannot » depuis hier. Douze noms
// divergeaient — et `verifier-carte-zelty.mjs` annonçait « 174 conformes en
// tout point, 0 écart ». Il ne comparait pas les noms.
//
// Deux sens, parce que les deux côtés ont eu raison tour à tour :
//
// ⚠️ VERS LA CAISSE — quatre renommages faits chez nous et jamais poussés.
// Le nom est ce qui s'imprime sur le ticket et ce que l'équipe cherche au
// comptoir : un produit qui porte deux noms se tape deux fois.
//
// ⚠️ VERS NOTRE BASE — huit desserts que la caisse suffixe « (salle) » et
// que nous nommions comme leur jumeau du comptoir. Notre base contenait
// donc DEUX « Paris-Brest », l'un à 3,90 € et l'autre à 6,50 € : ambigu à
// l'inventaire, dans le réassort et dans toute liste. La caisse a eu la
// bonne idée, on la reprend.
//
//   node scripts/aligner-noms-caisse.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, ZK = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
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

const cat = await z('catalog/dishes?limit=0')
const plats = cat.j?.dishes ?? []
// ⚠️ Une lecture qui rend moins de 100 plats est RATÉE, pas un catalogue
// vide : on n'écrit rien sur une telle base (0141).
if (plats.length < 100) { console.error(`⛔ la caisse rend ${plats.length} plats — lecture ratée.`); process.exit(1) }

const tous = await sb('recettes?select=id,nom,actif&actif=is.true&limit=1000')
const parId = new Map(tous.map(x => [x.id, x.nom]))
const diff = plats.filter(x => x.remote_id && parId.get(String(x.remote_id))
  && parId.get(String(x.remote_id)) !== x.name)

// ⚠️ Le suffixe « (salle) » est la convention de la CAISSE, et elle est
// juste : le même dessert y a deux prix et deux boutons. On l'adopte chez
// nous plutôt que de l'effacer là-bas.
const versBase = diff.filter(x => x.name.endsWith(' (salle)'))
const versCaisse = diff.filter(x => !x.name.endsWith(' (salle)'))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ${diff.length} nom(s) divergent(s) ──`)
console.log(`\n→ POUSSÉS VERS LA CAISSE (notre nom fait foi) : ${versCaisse.length}`)
for (const x of versCaisse) console.log(`   « ${x.name} »  →  « ${parId.get(String(x.remote_id))} »`)
console.log(`\n→ REPRIS DANS NOTRE BASE (le suffixe « (salle) » de la caisse) : ${versBase.length}`)
for (const x of versBase) console.log(`   « ${parId.get(String(x.remote_id))} »  →  « ${x.name} »`)

if (!ECRIRE) { console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

// ── 1. la caisse ──
// ⚠️ `POST /catalog/dishes` est un UPSERT qui exige name, price et tax : on
// RECOPIE price et tax tels quels et on REFUSE s'il en manque un, sinon on
// écrase le prix imprimé sur les tickets (0141). Tableau NU, un seul appel.
const corps = []
for (const x of versCaisse) {
  if (x.price == null || x.tax == null) { console.error(`   ⚠️ ${x.name} : champ obligatoire manquant, ignoré`); continue }
  corps.push({ id: x.id, name: parId.get(String(x.remote_id)), price: x.price, tax: x.tax })
}
if (corps.length) {
  const rep = await z('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  if (rep.s !== 200) { console.error(`   ✗ caisse : HTTP ${rep.s} ${rep.t.slice(0, 200)}`); process.exit(1) }
  console.log(`\n   ✓ caisse : ${corps.length} nom(s) corrigé(s)`)
}

// ── 2. notre base ──
for (const x of versBase) {
  await sb(`recettes?id=eq.${x.remote_id}`, { method: 'PATCH', body: JSON.stringify({ nom: x.name }) })
}
console.log(`   ✓ base  : ${versBase.length} nom(s) corrigé(s)\n`)
