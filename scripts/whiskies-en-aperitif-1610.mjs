// LES WHISKIES PASSENT EN « APÉRITIF » — 16/10/2026.
//
// Décision du gérant : « je voudrais que le whisky, le whisky premium, le
// baby whisky soient dans la catégorie apéritif et pas dans l'alcool ».
//
// ⚠️ CE N'EST PAS UN DÉTAIL D'AFFICHAGE : la famille est ce qui range le
// bouton sur l'écran de caisse, et c'est aussi la section de la carte
// imprimée (`print/carte-bar` filtre les sections par CATÉGORIE). Les trois
// quittent donc « Alcools » pour « Apéritifs » des deux côtés à la fois.
//
// ⚠️ LA CARTE IMPRIMÉE SUIT TOUTE SEULE, et c'est vérifié : ses sections
// « Apéritifs » et « Alcools » sont des filtres `categorie === …`, pas des
// listes de noms. Contrairement aux bières pression, dont la liste `PRESSION`
// a dû être corrigée quatre fois (Heineken, Pastis, Affligem, Gommé).
//
// ⚠️ LE CONTRÔLE DE COHÉRENCE DES TAUX PAR FAMILLE NE BRONCHE PAS : tous les
// apéritifs de la maison sont à 20 % (Martini, Ricard, Suze, Picon, Porto,
// Pastis 51) et un whisky aussi. C'est ce contrôle qui avait trouvé le Pago à
// 5,5 % parmi seize boissons à 10 % — le script le re-vérifie avant d'écrire
// plutôt que de s'en remettre au contrôle d'après coup.
//
// ⚠️ RIEN NE PART EN LIGNE AU PASSAGE : le garde-fou de
// `generer-visuels-sans-photo.mjs` tient sur `contient_alcool` et sur le
// point de vente, PAS sur la famille. Changer de famille ne peut donc pas
// mettre un alcool sur casatasia.fr.
//
//   node scripts/whiskies-en-aperitif-1610.mjs [--ecrire]
import fs from 'node:fs'

const CIBLES = ['Whisky 4 cl', 'Whisky premium 4 cl', 'Baby whisky 2 cl']
const FAMILLE = 'Apéritif'
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o,
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
               Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
               'Content-Type': 'application/json', Prefer: 'return=representation',
               ...(o.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} ${c} :: ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const zl = async (p, o = {}) => {
  let d = { status: 0, body: {} }
  for (let n = 1; n <= 4; n++) {
    const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
      headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                 'Content-Type': 'application/json', ...(o.headers || {}) } })
    d = { status: r.status, body: await r.json().catch(() => ({})) }
    if (r.status === 200) return d
    console.log(`   tentative ${n} sur ${p} → HTTP ${r.status}`)
    if (r.status !== 429 && r.status < 500) return d
    await new Promise(s => setTimeout(s, 4000 * n))
  }
  return d
}

console.log(`\n🥃 Les whiskies → famille « ${FAMILLE} »`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const liste = CIBLES.map(n => `"${n}"`).join(',')
const prod = await sb(`recettes?select=id,nom,categorie,tva,contient_alcool,actif&nom=in.(${liste})`)
const manquants = CIBLES.filter(n => !prod.some(p => p.nom === n))
if (manquants.length) throw new Error(`introuvable(s) : ${manquants.join(', ')} — rien écrit`)

// ⚠️ cohérence des taux DANS la famille d'arrivée : deux taux dans une même
// famille font rougir verifier-carte-zelty, et à raison.
const dejaLa = await sb(`recettes?select=nom,tva&categorie=eq.${encodeURIComponent(FAMILLE)}&actif=eq.true`)
const taux = new Set([...dejaLa.map(r => Number(r.tva)), ...prod.map(r => Number(r.tva))])
console.log(`   famille « ${FAMILLE} » : ${dejaLa.length} produits, taux présents ${[...new Set(dejaLa.map(r => r.tva))].join('/')} %`)
if (taux.size > 1) throw new Error(`le déplacement mettrait ${taux.size} taux différents dans « ${FAMILLE} » (${[...taux].join('/')}) — rien écrit`)
console.log(`   ✓ un seul taux après déplacement : ${[...taux][0]} %`)

for (const p of prod) console.log(`   ${p.nom.padEnd(22)} ${p.categorie} → ${FAMILLE}${p.actif ? '' : '  (inactif)'}`)
const dejaBon = prod.filter(p => p.categorie === FAMILLE)
if (dejaBon.length === prod.length) { console.log('\n   = déjà tous en ' + FAMILLE + '. Rien à faire.\n'); process.exit(0) }

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. LA CAISSE D'ABORD (0141) ───────────────────────────────────────
const cat = await zl('catalog/dishes?show_all=true&limit=0')
const plats = cat.body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien écrit`)
const tags = (await zl('catalog/tags')).body.tags ?? []
const tag = tags.find(t => t.name === FAMILLE)
if (!tag) throw new Error(`famille « ${FAMILLE} » inconnue de la caisse`)

const corps = []
for (const p of prod) {
  const z = plats.find(x => String(x.remote_id) === p.id)
  if (!z) throw new Error(`« ${p.nom} » n'a pas de contrepartie en caisse — rien écrit`)
  if (z.name == null || z.price == null || z.tax == null)
    throw new Error(`« ${p.nom} » : champ obligatoire manquant côté caisse — on ne construit pas`)
  // ⚠️ name / price / tax RECOPIÉS tels quels : cet upsert peut écraser le
  // prix imprimé sur les tickets. On ne touche QUE `tags`.
  corps.push({ id: z.id, name: z.name, price: z.price, tax: z.tax, tags: [tag.id] })
}
const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 250)}`)
console.log(`\n   ✓ caisse : ${corps.length} plats rangés en « ${FAMILLE} » (tag #${tag.id})`)

// ── 2. notre base ENSUITE : si la caisse refuse, rien n'est désynchronisé ──
await sb(`recettes?id=in.(${prod.map(p => p.id).join(',')})`, {
  method: 'PATCH', body: JSON.stringify({ categorie: FAMILLE }) })
console.log(`   ✓ base   : ${prod.length} produits en « ${FAMILLE} »`)

// ── 3. relecture ──────────────────────────────────────────────────────
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const relu = await sb(`recettes?select=nom,categorie&nom=in.(${liste})`)
let ok = true
for (const p of relu) {
  const z = apres.find(x => String(x.remote_id) === prod.find(q => q.nom === p.nom).id)
  const bon = p.categorie === FAMILLE && z?.tags?.includes(tag.id)
  if (!bon) ok = false
  console.log(`   ${bon ? '✓' : '✗'} ${p.nom.padEnd(22)} base=${p.categorie} caisse=${JSON.stringify(z?.tags)}`)
}
if (!ok) process.exit(1)
console.log('\n✅ Les deux côtés concordent.\n')
