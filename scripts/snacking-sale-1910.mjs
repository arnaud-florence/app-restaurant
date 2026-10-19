// LA FAMILLE « SNACKING SALÉ », À 3,80 € — 19/10/2026.
//
// Demande du gérant : « ajoute les feuilletés et quiches et croque monsieur
// dans la catégorie snacking salées que tu créera à 3,80 pour chaque produit ».
//
// ⚠️⚠️ LE CROQUE-MONSIEUR EXISTE DÉJÀ — en « Sandwich », à 3,50 €, avec sa
// photo, son coût (0,7615 €) et son libellé d'achat « CROQUE MONSIEUR JAMBON
// TOASTE 180G CARIGEL C=26 ». On le DÉPLACE et on le repasse à 3,80 € ; le
// recréer aurait coupé en deux son CA et son historique, et Zelty ne sait pas
// supprimer un plat.
//
// ⚠️⚠️ CE DÉPLACEMENT LE REND STOCKABLE, et c'est une CORRECTION, pas un effet
// de bord. « Sandwich » est dans `CATEGORIES_ASSEMBLEES` parce qu'un sandwich
// s'ASSEMBLE (0133) — mais un croque-monsieur Carigel s'ACHÈTE surgelé : il a
// un `libelle_achat` et un `cout_achat_ht`. Rangé en Sandwich, il n'apparaissait
// ni à l'inventaire ni au réassort, alors qu'il faut bien le commander.
// « Snacking salé » n'entre donc PAS dans `CATEGORIES_ASSEMBLEES`.
// ⚠️ Conséquence : il arrive au réassort en « à paramétrer » — sa cible reste à
// poser. Sans cible, aucune quantité n'est proposée (0163), donc rien n'est
// commandé à tort.
//
// ⚠️ DEUX LISTES de code suivent, chacune cassait quelque chose :
//  · `ORDRE` (pousser-familles-zelty) — sans elle, famille inconnue de la
//    caisse, donc BOUTON SANS FAMILLE, introuvable au comptoir ;
//  · `RAYONS` (catalogue-achats) — sans elle, la ligne tombe dans « Autres ».
// ⚠️ PAS dans `JAMAIS_EN_LIGNE` : le croque est `vendable_online` et doit le
// rester, c'est du snacking de comptoir. PAS dans `TVA_REDUITE` du test : le
// snacking est à 10 %, pas 5,5 %.
//
// ⚠️⚠️ IL SORT DE LA « FORMULE SANDWICH » À 9,90 €, qui sert les produits de la
// famille Sandwich. Le croque n'en fait plus partie. Et son panier à la carte
// passe de 9,30 € à 9,60 € : la formule reste plus chère de 0,30 € au lieu de
// 0,60 €. C'est noté dans CLAUDE.md comme « la seule exception » — à relire.
//
// ⚠️ LES FEUILLETÉS ET LES QUICHES NE SONT PAS CRÉÉS ICI : le gérant les a
// nommés au PLURIEL, sans liste. Inventer six parfums de jus a déjà coûté une
// création et un retrait le 12/10 ; « le etc d'un gérant pressé n'est pas une
// liste ». Ils entreront ici dès qu'il aura dit lesquels.
//
//   node scripts/snacking-sale-1910.mjs [--ecrire] [--prix=N]
import fs from 'node:fs'

const FAMILLE = 'Snacking salé'
const CIBLES = ['Croque-monsieur']
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const TTC = arg('prix', 3.80)
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  let der, fatal = false
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
      // ⚠️⚠️ UN 4xx NE SE CORRIGERA PAS EN RÉESSAYANT, et le `throw` d'ici
      // était attrapé par le `catch` juste en dessous : un PGRST204 (colonne
      // inconnue) était rejoué cinq fois, puis annoncé « Supabase injoignable »
      // — trente secondes perdues et un message qui désigne la mauvaise cause.
      if (r.status < 500) { fatal = true; break }
    } catch (e) { der = e.cause?.code ?? e.message; console.log(`   base, tentative ${n} → ${der}`) }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(fatal ? der : `Supabase injoignable : ${der}`)
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

console.log(`\n🥪 Famille « ${FAMILLE} » à ${TTC.toFixed(2)} €`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const prod = await sb(`recettes?select=id,nom,categorie,prix_vente_ht,tva,cout_achat_ht,libelle_achat,vendable_online,image_url&nom=in.(${CIBLES.map(n => JSON.stringify(n)).join(',')})`)
const absents = CIBLES.filter(n => !prod.some(p => p.nom === n))
if (absents.length) throw new Error(`introuvable(s) : ${absents.join(', ')} — rien écrit`)

// ⚠️ cohérence des taux : tout le snacking du Fournil est à 10 %
const taux = new Set(prod.map(p => Number(p.tva)))
if (taux.size > 1 || ![...taux][0] === 10) console.log(`   ⚠ taux hétérogènes : ${[...taux].join('/')} %`)
console.log(`   taux : ${[...taux].join('/')} % — le snacking du Fournil, pas le 5,5 % boulangerie`)

const lib = fs.readFileSync('src/lib/reassort.ts', 'utf8')
const assemblees = [...(lib.match(/CATEGORIES_ASSEMBLEES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
for (const p of prod) {
  const ht = Number((TTC / (1 + p.tva / 100)).toFixed(4))
  const c = Number(p.cout_achat_ht)
  console.log(`\n   ${p.nom}`)
  console.log(`     ${p.categorie} → ${FAMILLE}`)
  console.log(`     ${(p.prix_vente_ht * (1 + p.tva / 100)).toFixed(2)} € → ${TTC.toFixed(2)} €  (HT ${ht.toFixed(4)})`)
  if (Number.isFinite(c)) {
    const av = c / (p.prix_vente_ht), ap = c / ht
    console.log(`     coût ${c.toFixed(4)} € · food cost ${(av * 100).toFixed(0)} % → ${(ap * 100).toFixed(0)} %`)
  } else console.log(`     coût inconnu`)
  const avant = assemblees.includes(p.categorie), apres = assemblees.includes(FAMILLE)
  if (avant !== apres) console.log(`     ⚠ stockable : ${avant ? 'non' : 'oui'} → ${apres ? 'non' : 'OUI'}`
    + (!apres ? ` — c'est une CORRECTION : il a un libelle_achat « ${String(p.libelle_achat).slice(0, 34)}… », donc il s'achète` : ''))
  console.log(`     en ligne ${p.vendable_online} · photo ${p.image_url ? 'oui' : 'NON'} — inchangés`)
}

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. la famille côté caisse ───────────────────────────────────────
let tags = (await zl('catalog/tags')).body.tags ?? []
let tag = tags.find(t => t.name === FAMILLE)
if (!tag) {
  // ⚠️ l'ordre place le rayon avec le snacking du Fournil, pas en queue
  const ref = tags.find(t => t.name === 'Pizza')
  const o = ref ? Number(ref.o) + 1 : Math.max(0, ...tags.map(t => Number(t.o) || 0)) + 1
  const r = await zl('catalog/tags', { method: 'POST', body: JSON.stringify([{ name: FAMILLE, remote_id: FAMILLE, o }]) })
  if (r.status !== 200) throw new Error(`famille : ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`)
  tags = (await zl('catalog/tags')).body.tags ?? []
  tag = tags.find(t => t.name === FAMILLE)
  if (!tag) throw new Error(`famille « ${FAMILLE} » absente après création — rien poussé`)
  console.log(`\n   ✓ famille « ${FAMILLE} » créée (#${tag.id}, ordre ${o})`)
} else console.log(`\n   = famille « ${FAMILLE} » déjà en caisse (#${tag.id})`)

// ── 2. LA CAISSE D'ABORD : famille ET prix en un seul upsert ────────
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien écrit`)
const corps = []
for (const p of prod) {
  const z = plats.find(x => String(x.remote_id) === p.id)
  if (!z) throw new Error(`« ${p.nom} » n'a pas de contrepartie en caisse — rien écrit`)
  if (z.name == null || z.tax == null) throw new Error(`« ${p.nom} » : champ obligatoire manquant — on ne construit pas`)
  // ⚠️ `name` et `tax` recopiés tels quels ; `options` omis donc préservé.
  corps.push({ id: z.id, name: z.name, tax: z.tax, tags: [tag.id],
               price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100) })
}
const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 250)}`)
console.log(`   ✓ caisse : ${corps.length} plat(s) en « ${FAMILLE} » à ${TTC.toFixed(2)} €`)

// ── 3. notre base ENSUITE ──────────────────────────────────────────
for (const p of prod) {
  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({
    categorie: FAMILLE, prix_vente_ht: Number((TTC / (1 + p.tva / 100)).toFixed(4)) }) })
}
console.log(`   ✓ base   : ${prod.length} produit(s)`)

// ── 4. relecture ───────────────────────────────────────────────────
const T = Object.fromEntries(tags.map(t => [t.id, t.name]))
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const relu = await sb(`recettes?select=id,nom,categorie,prix_vente_ht,tva,vendable_online&nom=in.(${CIBLES.map(n => JSON.stringify(n)).join(',')})`)
let ok = true
for (const r of relu) {
  const z = apres.find(x => String(x.remote_id) === r.id)
  const fams = (z?.tags ?? []).map(t => T[typeof t === 'object' ? t?.id : t])
  const ttc = r.prix_vente_ht * (1 + r.tva / 100)
  const bon = r.categorie === FAMILLE && fams.includes(FAMILLE)
    && Math.abs(ttc - TTC) < 0.005 && z?.price === Math.round(TTC * 100) && r.vendable_online === true
  if (!bon) ok = false
  console.log(`   ${bon ? '✓' : '✗'} ${r.nom.padEnd(18)} base=${r.categorie} ${ttc.toFixed(2)} € · caisse=${JSON.stringify(fams)} ${(z?.price / 100).toFixed(2)}/${(z?.price_togo / 100).toFixed(2)} · en ligne ${r.vendable_online}`)
}
if (!ok) process.exit(1)
console.log('\n✅ Les deux côtés concordent.\n')
