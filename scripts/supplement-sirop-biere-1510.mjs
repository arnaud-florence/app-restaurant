// Un supplément SIROP sur les bières (gérant, 15/10/2026).
//
// ⚠️⚠️ LE PRIX N'EST PAS UN PALIER INVENTÉ : LA CARTE LE DIT DÉJÀ.
//    Panaché 2,80 € · Monaco 3,00 € → le sirop dans une bière vaut 0,20 €.
//    Le mettre à 0,50 € (le palier habituel des suppléments) ferait payer
//    « demi + sirop » 3,30 € quand le Monaco est à 3,00 € au même comptoir :
//    deux prix pour la même boisson, et c'est le client qui le voit.
//    Coût mesuré sur les mêmes fiches : 0,8729 − 0,8371 = 0,0358 € de sirop.
//
// ⚠️ CE QUE LE SUPPLÉMENT DÉBLOQUE, c'est la PINTE : il n'existe ni « Pinte
//    Monaco » ni « Pinte panachée » à la carte. Sans lui, un client qui veut
//    une pinte au sirop oblige le serveur à bricoler — ou à l'offrir.
//
// ⚠️ QUATRE BIÈRES SONT EXCLUES, et chacune pour la même raison : elles sont
//    DÉJÀ aromatisées. Monaco (bière + limonade + grenadine) et Panaché
//    (bière + limonade) existent en produits ; y ajouter « sirop » créerait
//    un second chemin vers la même boisson, à un prix différent. Picon bière
//    et Pinte Picon portent déjà leur Picon.
//
// ⚠️ UN SEUL supplément « Sirop », sans parfum — comme le « Diabolo », qui
//    n'en porte pas non plus dans son nom. Inventer une liste de parfums
//    (grenadine, menthe, pêche…) mettrait au comptoir des bouteilles dont
//    rien ne dit qu'elles sont en stock : seule « Sirop (litre) » est une
//    matière suivie.
//
// ⚠️ La dose NE DOUBLE PAS sur une pinte — même hypothèse, dite, que pour la
//    Pinte Picon (13/10). Un seul prix, un seul groupe.
//
//   node scripts/supplement-sirop-biere-1510.mjs [--ecrire]
import fs from 'node:fs'

const GROUPE = 'Suppléments bière'
const RID = 'supp-biere'
const VALEUR = 'Sirop'
const PRIX_C = 20                 // centimes TTC — l'écart Monaco/Panaché
const COUT = 0.0358               // mesuré, pas estimé
const MATIERE = 'Sirop (litre)'   // la seule matière sirop réellement suivie
const CIBLES = [
  'Demi pression', 'Pinte pression',
  'Demi Affligem', 'Pinte Affligem',
  'Heineken bouteille 33 cl', 'Heineken canette 33 cl', 'Desperados 33 cl',
]
const EXCLUES = { 'Monaco': 'déjà bière + limonade + grenadine',
  'Panaché': 'déjà bière + limonade — + sirop = un Monaco, qui existe',
  'Picon bière': 'déjà aromatisée', 'Pinte Picon': 'déjà aromatisée' }
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async c => (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, {
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } })).json()
const zl = async (c, o = {}, essai = 1) => {
  const r = await fetch(`https://api.zelty.fr/2.11/${c}`, { ...o,
    headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
  const t = await r.text()
  const body = (() => { try { return JSON.parse(t) } catch { return null } })()
  if (r.status === 429 && essai < 4) {
    console.log(`      caisse 429, nouvel essai ${essai + 1}/4…`)
    await new Promise(s => setTimeout(s, 2500 * essai)); return zl(c, o, essai + 1)
  }
  return { status: r.status, body, texte: t }
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
console.log(`   « ${VALEUR} » à ${(PRIX_C / 100).toFixed(2)} € — l'écart Monaco (3,00) / Panaché (2,80)`)
console.log(`   coût ${COUT.toFixed(4)} € · food cost ${(COUT / (PRIX_C / 100 / 1.2) * 100).toFixed(0)} % (bière à 20 %)\n`)

// ⚠️ chaque supplément est adossé à une matière SUIVIE : sans ça c'est une
// sortie de stock que le réassort ne voit jamais venir.
const [m] = await sb(`ingredients?nom=eq.${encodeURIComponent(MATIERE)}&select=nom,stocke`)
if (!m?.stocke) { console.log(`✗ « ${MATIERE} » n'est pas une matière suivie — on n'ajoute pas un supplément qu'on ne commande pas`); process.exit(1) }
console.log(`   matière : ${m.nom} (suivie) ✓`)

// ⚠️ `show_all=true` OBLIGATOIRE : sans lui les plats désactivés sont omis.
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).body?.dishes ?? []
if (plats.length < 100) { console.log(`✗ la caisse rend ${plats.length} plats — lecture ratée`); process.exit(1) }
const cibles = CIBLES.map(n => plats.find(p => p.name === n)).filter(Boolean)
console.log(`\n   rattachement : ${cibles.length}/${CIBLES.length}`)
for (const n of CIBLES) if (!plats.find(p => p.name === n)) console.log(`      ⚠ introuvable en caisse : ${n}`)
for (const c of cibles) console.log(`      ${c.name.padEnd(26)} options actuelles [${(c.options || []).join(',') || '—'}]`)
console.log('\n   écartées, et pourquoi :')
for (const [n, r] of Object.entries(EXCLUES)) console.log(`      ${n.padEnd(14)} ${r}`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

// ── le groupe d'options ───────────────────────────────────────────────
// ⚠️ TABLEAU NU, et `max_choices` est obligatoire. ⚠️ Zelty REMPLACE les
// `values` — une relance avec une liste amputée les effacerait sans rien dire.
let opts = (await zl('catalog/options?limit=0')).body?.options ?? []
let g = opts.find(o => o.remote_id === RID)
const charge = [{
  ...(g ? { id: g.id } : {}),
  remote_id: RID, name: GROUPE,
  min_choices: 0, max_choices: 1,   // un sirop ne s'impose pas, et un seul
  values: [{ remote_id: `${RID}::${VALEUR}`, name: VALEUR, price: PRIX_C }],
}]
const ro = await zl('catalog/options', { method: 'POST', body: JSON.stringify(charge) })
if (ro.status !== 200) { console.log(`✗ options : ${ro.status} ${ro.texte.slice(0, 250)}`); process.exit(1) }
opts = (await zl('catalog/options?limit=0')).body?.options ?? []
g = opts.find(o => o.remote_id === RID)
if (!g) { console.log('✗ le groupe n\'est pas revenu après écriture'); process.exit(1) }
console.log(`\n   ✓ groupe #${g.id} « ${g.name} » · ${(g.values || []).length} valeur(s)`)

// ── rattachement : ON FUSIONNE, on ne remplace pas ────────────────────
// ⚠️ Écrire `options: [g.id]` sur un plat qui en porte déjà lui RETIRERAIT
// les autres, sans un message (leçon des quatre plats à cuisson, 12/10).
// ⚠️ UPSERT : on recopie name/price/tax TELS QUELS et on REFUSE sans eux.
const envoi = []
for (const c of cibles) {
  if (c.name == null || c.price == null || c.tax == null) { console.log(`   ✗ ${c.name} : name/price/tax incomplet — ignoré`); continue }
  const fusion = [...new Set([...(c.options || []), g.id])]
  envoi.push({ id: c.id, name: c.name, price: c.price, tax: c.tax, options: fusion })
}
const rp = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(envoi) })
if (rp.status !== 200) { console.log(`✗ rattachement : ${rp.status} ${rp.texte.slice(0, 250)}`); process.exit(1) }

const relu = (await zl('catalog/dishes?show_all=true&limit=0')).body?.dishes ?? []
console.log('\n   relecture :')
for (const c of cibles) {
  const p = relu.find(x => x.id === c.id)
  console.log(`      ${c.name.padEnd(26)} options=[${(p?.options || []).join(',')}]  prix ${p?.price} ct  tax ${p?.tax}`)
}
console.log('\n✅ Le sirop se tape sur les bières, pintes comprises.\n')
