// La cuisson des viandes en caisse (12/10/2026).
//
// Une entrecôte envoyée au grill sans cuisson est une assiette qui revient.
// Le serveur le demande au client de toute façon : si la caisse ne sait pas
// le taper, l'information se transmet à la voix, et elle se perd.
//
// ⚠️ CE N'EST PAS UN SUPPLÉMENT, et les réglages sont donc à l'opposé :
//   · prix 0 — une cuisson ne se facture pas ;
//   · `min_choices: 1` — elle est OBLIGATOIRE. Les suppléments sont à 0 :
//     on peut ne rien ajouter. Ici, ne rien choisir n'a pas de sens ;
//   · `max_choices: 1` — un seul degré, et `pick_same_value` absent : on ne
//     commande pas « deux fois saignant » sur la même pièce.
//
// ⚠️⚠️ DEUX GROUPES, PARCE QU'UN STEAK HACHÉ N'EST PAS UNE ENTRECÔTE.
// Le hachage répartit dans toute la masse ce qui n'était qu'en surface sur
// une pièce entière : la DGCCRF recommande une cuisson à cœur pour le bœuf
// haché, et « bleu » ne se sert pas sur un burger. Un seul groupe aurait mis
// « Bleu » sur les trois burgers — un choix qu'on n'aurait pas voulu voir
// tapé, offert par l'écran lui-même.
//
// ⚠️ Le MENU ENFANT porte le même steak haché 150 g et ne reçoit AUCUN
// groupe : l'enfant est précisément le public à risque, sa cuisson à cœur
// n'est pas une option. Proposer le choix serait proposer de mal faire.
//
// Écartés aussi, et chacun pour une raison : tartare et carpaccio sont CRUS,
// l'andouillette et La Naples cuisent à cœur par construction, la friture de
// la mer n'a pas de degré.
//
//   node scripts/cuisson-viandes.mjs [--ecrire]
import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

// Les quatre degrés, dans l'ordre du GRILL — pas l'alphabet. C'est l'ordre
// que le serveur a dans la tête et celui que la carte imprime.
const GROUPES = [
  { cle: 'cuisson', nom: 'Cuisson',
    valeurs: ['Bleu', 'Saignant', 'À point', 'Bien cuit'],
    plats: ['Entrecôte grillée'] },
  { cle: 'cuisson-burger', nom: 'Cuisson du burger',
    // pas de « Bleu » : voir l'avertissement en tête.
    valeurs: ['Saignant', 'À point', 'Bien cuit'],
    plats: ['Burger CasaTasia', 'Burger Chèvre-Miel', 'Burger Montagnard'] },
]

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async c => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`,
    { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                 Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} ${c} :: ${t.slice(0, 250)}`)
  return JSON.parse(t)
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

console.log(`\n🥩 Cuisson des viandes${ECRIRE ? ' — MODE ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)

// ── nos plats, et leur identifiant de caisse ──────────────────────────
const noms = GROUPES.flatMap(g => g.plats)
const nous = await sb(`recettes?nom=in.(${noms.map(n => `"${n}"`).join(',')})&select=id,nom,actif`)
const manquants = noms.filter(n => !nous.some(r => r.nom === n))
if (manquants.length) throw new Error(`introuvable(s) en base : ${manquants.join(', ')}`)
for (const r of nous) console.log(`   ${r.actif ? '✓' : '·pause'} ${r.nom}`)

const liens = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=in.(${nous.map(r => r.id).join(',')})&select=recette_id,identifiant_externe`)
const zidDe = new Map(liens.map(l => [l.recette_id, Number(l.identifiant_externe)]))
const sansLien = nous.filter(r => !zidDe.has(r.id))
if (sansLien.length) throw new Error(`sans correspondance de caisse : ${sansLien.map(r => r.nom).join(', ')}`)

// ── les groupes d'options ─────────────────────────────────────────────
// ⚠️ Zelty REMPLACE les `values` d'une option, il ne les fusionne pas : une
// relance avec une liste amputée EFFACE les degrés manquants sans rien dire.
const av = await zl('catalog/options?limit=0')
if (av.status !== 200) throw new Error(`lecture des options : ${av.status}`)
const existant = new Map((av.body.options ?? []).map(o => [o.remote_id, o]))
console.log(`\n   options en caisse : ${(av.body.options ?? []).length}`)

const charge = GROUPES.map(g => ({
  remote_id: g.cle, name: g.nom,
  min_choices: 1, max_choices: 1,   // obligatoire, un seul degré
  ...(existant.has(g.cle) ? { id: Number(existant.get(g.cle).id) } : {}),
  values: g.valeurs.map(v => ({ remote_id: `${g.cle}::${v}`, name: v, price: 0 })),
}))
for (const g of GROUPES)
  console.log(`   → « ${g.nom} » ${existant.has(g.cle) ? 'existe' : 'à créer'} · ${g.valeurs.join(' / ')} · ${g.plats.length} plat(s)`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ⚠️ TABLEAU NU, et TOUT en un seul appel : Zelty plafonne son débit (429 au
// 5ᵉ appel d'affilée) et la documentation ne le dit pas.
const po = await zl('catalog/options', { method: 'POST', body: JSON.stringify(charge) })
if (po.status !== 200) throw new Error(`POST options : ${po.status} ${JSON.stringify(po.body).slice(0, 250)}`)
const ap = await zl('catalog/options?limit=0')
const idDe = new Map((ap.body.options ?? []).map(o => [o.remote_id, Number(o.id)]))
for (const g of GROUPES) {
  const id = idDe.get(g.cle)
  if (!id) throw new Error(`la caisse n'a rendu aucun identifiant pour « ${g.nom} »`)
  const n = (ap.body.options ?? []).find(o => o.remote_id === g.cle)?.values?.length ?? 0
  console.log(`   ✓ « ${g.nom} » #${id} · ${n} degrés`)
}

// ── rattacher aux plats ───────────────────────────────────────────────
// ⚠️⚠️ show_all=true : GET /catalog/dishes OMET les plats désactivés. DEUX
// burgers sur trois sont en PAUSE pour l'ardoise de la semaine 1 — sans ce
// drapeau ils ne recevraient pas leur cuisson, et ils reviendraient amputés
// le jour où le gérant rallume sa brasserie.
const cat = await zl('catalog/dishes?show_all=true&limit=0')
const plats = cat.body.dishes ?? []
if (plats.length < 100) throw new Error(`catalogue à ${plats.length} plats — lecture ratée, rien écrit`)
const parId = new Map(plats.map(p => [Number(p.id), p]))

const majs = []
for (const g of GROUPES) {
  const gid = idDe.get(g.cle)
  for (const nom of g.plats) {
    const zid = zidDe.get(nous.find(r => r.nom === nom).id)
    const p = parId.get(zid)
    if (!p) throw new Error(`« ${nom} » : plat #${zid} absent du catalogue`)
    // Les trois champs obligatoires sont RECOPIÉS, jamais recalculés : cet
    // upsert écraserait le prix qui s'imprime sur les tickets.
    if (!p.name || p.price == null || p.tax == null)
      throw new Error(`« ${nom} » : champ obligatoire manquant côté caisse — refus de construire`)
    // ⚠️⚠️ ON FUSIONNE LES GROUPES, on ne les remplace pas. Les burgers et
    // l'entrecôte portent déjà « Suppléments » : écrire `options: [cuisson]`
    // leur retirerait les 35 suppléments, sans un message.
    const avant = (p.options ?? []).map(o => Number(typeof o === 'object' ? o?.id : o)).filter(Number.isFinite)
    if (avant.includes(gid)) { console.log(`   = ${nom} : déjà rattaché`); continue }
    majs.push({ id: Number(p.id), name: p.name, price: Number(p.price), tax: Number(p.tax),
                options: [...new Set([...avant, gid])], _nom: nom, _avant: avant.length })
  }
}
if (!majs.length) { console.log('\n✅ Tout était déjà en place.\n'); process.exit(0) }
for (const m of majs) console.log(`   → ${m._nom} : ${m._avant} groupe(s) + cuisson = ${m.options.length}`)

const pd = await zl('catalog/dishes', { method: 'POST',
  body: JSON.stringify(majs.map(({ _nom, _avant, ...r }) => r)) })
if (pd.status !== 200) throw new Error(`POST dishes : ${pd.status} ${JSON.stringify(pd.body).slice(0, 250)}`)
console.log(`\n   ✓ ${majs.length} plat(s) rattaché(s)`)

// Contrôle : on RELIT, on ne croit pas le code de retour.
const ctl = await zl('catalog/dishes?show_all=true&limit=0')
let ko = 0
for (const g of GROUPES) for (const nom of g.plats) {
  const zid = zidDe.get(nous.find(r => r.nom === nom).id)
  const p = (ctl.body.dishes ?? []).find(x => Number(x.id) === zid)
  const has = (p?.options ?? []).map(o => Number(typeof o === 'object' ? o?.id : o))
  const ok = has.includes(idDe.get(g.cle))
  console.log(`   ${ok ? '✓' : '✗'} ${nom.padEnd(22)} ${has.length} groupe(s)`)
  if (!ok) ko++
}
console.log(ko ? `\n✗ ${ko} plat(s) sans cuisson\n` : '\n✅ Cuissons en place.\n')
process.exit(ko ? 1 : 0)
