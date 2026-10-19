// DÉPLACER UN PRODUIT D'UNE FAMILLE À UNE AUTRE, DES DEUX CÔTÉS.
//
// Généralisation de `whiskies-en-aperitif-1610.mjs`, écrit pour le sac de
// viennoiseries de la veille (19/10/2026) : « laisse-le dans viennoiserie ».
//
// ⚠️ LA FAMILLE N'EST PAS UN DÉTAIL D'AFFICHAGE : elle range le bouton sur
// l'écran de caisse, elle décide de la section de la carte imprimée, et —
// pour `/admin/reassort` et `(ops)/inventaire` — elle décide si le produit
// SE STOCKE (`CATEGORIES_ASSEMBLEES`). Un déplacement a donc des effets en
// cascade qu'il faut regarder avant, pas découvrir après.
//
// ⚠️ LA CAISSE D'ABORD (0141) : si elle refuse, rien n'est désynchronisé.
// Et on recopie `name`/`price`/`tax` tels quels — cet upsert peut écraser le
// prix imprimé sur les tickets. `price_togo` et `options` sont OMIS, donc
// PRÉSERVÉS (mesuré le 12/10).
//
// ⚠️ LE CONTRÔLE DE COHÉRENCE DES TAUX EST REJOUÉ AVANT D'ÉCRIRE, pas après :
// deux taux dans une même famille font rougir `verifier-carte-zelty`, et à
// raison — c'est ce contrôle qui avait trouvé le Pago à 5,5 % parmi seize
// boissons à 10 %.
//
//   node scripts/deplacer-famille.mjs --nom="…" --vers="…" [--ecrire]
//   (plusieurs produits : --nom="A" --nom="B")
import fs from 'node:fs'

const noms = process.argv.filter(a => a.startsWith('--nom=')).map(a => a.slice(6))
const vers = process.argv.find(a => a.startsWith('--vers='))?.slice(7)
const ECRIRE = process.argv.includes('--ecrire')
if (!noms.length || !vers) {
  console.log('usage : node scripts/deplacer-famille.mjs --nom="Produit" --vers="Famille" [--ecrire]')
  process.exit(1)
}

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  let der
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o,
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                   Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                   'Content-Type': 'application/json', Prefer: 'return=representation',
                   ...(o.headers || {}) } })
      const t = await r.text()
      if (r.ok) return t ? JSON.parse(t) : null
      der = `Supabase ${r.status} :: ${t.slice(0, 220)}`
      if (r.status < 500) throw new Error(der)
    } catch (e) { der = e.cause?.code ?? e.message; console.log(`   base, tentative ${n} → ${der}`) }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(`Supabase injoignable : ${der}`)
}
const zl = async (p, o = {}) => {
  let d = { status: 0, body: {} }
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
        headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                   'Content-Type': 'application/json', ...(o.headers || {}) } })
      d = { status: r.status, body: await r.json().catch(() => ({})) }
      if (r.status === 200) return d
      console.log(`   caisse, tentative ${n} sur ${p} → HTTP ${r.status} ${JSON.stringify(d.body).slice(0, 160)}`)
      if (r.status !== 429 && r.status < 500) return d
    } catch (e) { console.log(`   caisse, tentative ${n} sur ${p} → ${e.cause?.code ?? e.message}`) }
    await new Promise(s => setTimeout(s, 3000 * n))
  }
  return d
}

console.log(`\n📦 ${noms.join(', ')} → famille « ${vers} »`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const liste = noms.map(n => JSON.stringify(n)).join(',')
const prod = await sb(`recettes?select=id,nom,categorie,tva,actif,tag_destination&nom=in.(${liste})`)
const absents = noms.filter(n => !prod.some(p => p.nom === n))
if (absents.length) throw new Error(`introuvable(s) : ${absents.join(', ')} — rien écrit`)

// ⚠️ cohérence des taux DANS la famille d'arrivée
const dejaLa = await sb(`recettes?select=nom,tva&categorie=eq.${encodeURIComponent(vers)}&actif=eq.true`)
const taux = new Set([...dejaLa.map(r => Number(r.tva)), ...prod.map(r => Number(r.tva))])
console.log(`   famille « ${vers} » : ${dejaLa.length} produit(s), taux ${[...new Set(dejaLa.map(r => r.tva))].join('/')} %`)
if (taux.size > 1) throw new Error(`le déplacement mettrait ${taux.size} taux différents dans « ${vers} » (${[...taux].join('/')} %) — rien écrit`)
console.log(`   ✓ un seul taux après déplacement : ${[...taux][0]} %`)

// ⚠️ ce que le déplacement change pour le STOCK : on le dit avant d'écrire
const libRe = fs.readFileSync('src/lib/reassort.ts', 'utf8')
const assemblees = [...(libRe.match(/CATEGORIES_ASSEMBLEES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
const horsStock = [...(libRe.match(/PRODUITS_HORS_STOCK = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
for (const p of prod) {
  const av = assemblees.includes(p.categorie), ap = assemblees.includes(vers)
  const nom = horsStock.includes(p.nom)
  console.log(`   ${p.nom.padEnd(34)} ${p.categorie} → ${vers}${p.actif ? '' : '  (inactif)'}`)
  if (av !== ap) console.log(`      ⚠ stockable : ${av ? 'non' : 'oui'} → ${ap ? 'non' : 'OUI'}` +
    (!ap && nom ? ` — mais exclu par PRODUITS_HORS_STOCK, donc hors inventaire et hors réassort` : '') +
    (!ap && !nom ? ` — il ENTRERA à l'inventaire et au réassort` : ''))
}
const dejaBon = prod.filter(p => p.categorie === vers)
if (dejaBon.length === prod.length) { console.log(`\n   = déjà tous en « ${vers} ». Rien à faire.\n`); process.exit(0) }

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. LA CAISSE D'ABORD ────────────────────────────────────────────
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien écrit`)
const tags = (await zl('catalog/tags')).body.tags ?? []
const tag = tags.find(t => t.name === vers)
if (!tag) throw new Error(`famille « ${vers} » inconnue de la caisse — rien écrit`)

const corps = []
for (const p of prod) {
  const z = plats.find(x => String(x.remote_id) === p.id)
  if (!z) throw new Error(`« ${p.nom} » n'a pas de contrepartie en caisse — rien écrit`)
  if (z.name == null || z.price == null || z.tax == null)
    throw new Error(`« ${p.nom} » : champ obligatoire manquant côté caisse — on ne construit pas`)
  corps.push({ id: z.id, name: z.name, price: z.price, tax: z.tax, tags: [tag.id] })
}
const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 250)}`)
console.log(`\n   ✓ caisse : ${corps.length} plat(s) rangé(s) en « ${vers} » (tag #${tag.id})`)

// ── 2. notre base ENSUITE ──────────────────────────────────────────
await sb(`recettes?id=in.(${prod.map(p => p.id).join(',')})`, {
  method: 'PATCH', body: JSON.stringify({ categorie: vers }) })
console.log(`   ✓ base   : ${prod.length} produit(s) en « ${vers} »`)

// ── 3. relecture ───────────────────────────────────────────────────
const T = Object.fromEntries(tags.map(t => [t.id, t.name]))
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const relu = await sb(`recettes?select=id,nom,categorie&nom=in.(${liste})`)
let ok = true
for (const r of relu) {
  const z = apres.find(x => String(x.remote_id) === r.id)
  const fams = (z?.tags ?? []).map(t => T[typeof t === 'object' ? t?.id : t])
  const bon = r.categorie === vers && fams.includes(vers)
  if (!bon) ok = false
  console.log(`   ${bon ? '✓' : '✗'} ${r.nom.padEnd(34)} base=${r.categorie} caisse=${JSON.stringify(fams)}`)
}
if (!ok) process.exit(1)
console.log('\n✅ Les deux côtés concordent.\n')
