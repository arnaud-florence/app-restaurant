// FEUILLETÉ ET QUICHE — les deux boutons qui manquaient à « Snacking salé »
// (19/10/2026).
//
// Le gérant : « je vois que croque monsieur dans snacking salés ». Exact : le
// rayon a été créé le matin avec le seul croque-monsieur, parce qu'il avait
// nommé « les feuilletés et quiches » au PLURIEL, sans liste — et inventer six
// parfums de jus avait coûté une création et un retrait le 12/10.
//
// ⚠️ MAIS LA MAISON A DÉJÀ LE PATRON, et il vaut mieux que la question : les
// SIX focaccias ont été fondues en UNE seule le 28/08 parce qu'elles « ne se
// distinguaient que par leur garniture, qui se choisit au comptoir ». Un
// feuilleté et une quiche sont exactement ce cas. Deux boutons génériques
// couvrent toute la vitrine, quelle que soit la garniture du jour — comme
// « Digestif 4 cl », « Alcool + soft » et le « Cocktail » du 17/10.
//
// ⚠️ GABARIT : le croque-monsieur. Même rayon, même point de vente, même TVA
// (10 %, le snacking du Fournil — pas le 5,5 % boulangerie), même modèle
// d'achat-revente.
//
// ⚠️⚠️ ON EFFACE SES CHAMPS D'ACHAT. Il porte `libelle_achat = « CROQUE
// MONSIEUR JAMBON TOASTE 180G CARIGEL C=26 »` et un coût de 0,7615 € : copiés
// tels quels, le prochain scan de facture Gineys écrirait **le prix du croque
// sur une quiche**, et une marge fausse ne se signale pas. Quatrième
// occurrence de ce piège après les desserts, le Cocktail et le sac de la
// veille — le script REFUSE de conclure si l'un d'eux a survécu.
//
// ⚠️ AUCUN COÛT, et pour une raison factuelle : on ne sait pas encore CE QU'ON
// ACHÈTE. Aucun feuilleté ni quiche ne figure dans nos factures, et la
// garniture varie. Ils sortent en « coût inconnu » (0150), jamais à zéro, qui
// se lirait « gratuit ». Pas de `libelle_achat` non plus : l'inventer
// produirait une clé qui ne correspondrait à rien (règle des matières du bar).
//
// ⚠️ ILS SERONT STOCKABLES, et c'est voulu : « Snacking salé » n'est PAS dans
// `CATEGORIES_ASSEMBLEES` — un feuilleté surgelé s'ACHÈTE, comme le croque.
// Ils apparaîtront donc au réassort en « à paramétrer », sans fournisseur :
// c'est la vérité, et c'est ce qui les rend visibles comme à compléter.
//
// ⚠️ ALLERGÈNES VRAIS PAR DÉFINITION, jamais par probabilité, et JAMAIS
// signés (`allergenes_valides_le` reste NULL, le public lit « information non
// disponible », 0138) :
//   · feuilleté → gluten (la pâte est de la farine). Le beurre est probable
//     mais une pâte feuilletée industrielle peut être à la margarine ;
//   · quiche → gluten (pâte) + œufs + lait : l'appareil à quiche EST un
//     mélange d'œufs et de crème, c'est sa définition même.
//
//   node scripts/snacking-sale-feuilletes-1910.mjs [--ecrire] [--prix=N]
import fs from 'node:fs'

const GABARIT = 'Croque-monsieur'
const FAMILLE = 'Snacking salé'
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const TTC = arg('prix', 3.80)
const ECRIRE = process.argv.includes('--ecrire')

const NOUVEAUX = [
  { nom: 'Feuilleté', alg: ['gluten'],                  desc: 'Feuilleté salé du jour.' },
  { nom: 'Quiche',    alg: ['gluten', 'oeufs', 'lait'], desc: 'Quiche du jour.' },
]

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

console.log(`\n🥧 « ${FAMILLE} » : ${NOUVEAUX.map(n => n.nom).join(' et ')} à ${TTC.toFixed(2)} €`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const [gab] = await sb(`recettes?select=*&nom=eq.${encodeURIComponent(GABARIT)}`)
if (!gab) throw new Error(`gabarit « ${GABARIT} » introuvable — rien écrit`)
if (gab.categorie !== FAMILLE) throw new Error(`« ${GABARIT} » est en « ${gab.categorie} », pas « ${FAMILLE} » — le gabarit ne convient pas`)
if (Number(gab.tva) !== 10) throw new Error(`« ${GABARIT} » est à ${gab.tva} % — le snacking est à 10 %, rien écrit`)

const ht = Number((TTC / (1 + gab.tva / 100)).toFixed(4))
console.log(`   famille ${FAMILLE} · ${gab.tag_destination} · TVA ${gab.tva} % · ${TTC.toFixed(2)} € = ${ht.toFixed(4)} € HT`)
console.log(`   effacés du gabarit : coût ${Number(gab.cout_achat_ht).toFixed(4)}, libelle_achat « ${String(gab.libelle_achat).slice(0, 38)}… », reference_fournisseur, nom_matiere, fournisseur_id, allergènes ${JSON.stringify(gab.allergenes_complementaires ?? [])}`)
console.log(`   en ligne ${gab.vendable_online} (repris du gabarit) · stockable OUI — « ${FAMILLE} » n'est pas une catégorie assemblée`)

const etat = []
for (const n of NOUVEAUX) {
  const [p] = await sb(`recettes?select=id,nom,actif&nom=eq.${encodeURIComponent(n.nom)}`)
  etat.push({ ...n, deja: p })
  console.log(`\n   ${p ? `= existe déjà (${p.actif ? 'actif' : 'INACTIF'})` : 'nouveau'}  ${n.nom}`)
  console.log(`     allergènes ${JSON.stringify(n.alg)} — vrais par DÉFINITION, NON signés`)
  console.log(`     coût : AUCUN — rien de tel dans nos factures, et la garniture varie`)
}

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. la base (le remote_id de la caisse est notre uuid) ────────────
const aPousser = []
for (const n of etat) {
  let p = n.deja
  if (!p) {
    const { id, created_at, updated_at, ...b } = gab
    const [cree] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
      ...b,
      nom: n.nom, nom_caisse: n.nom, categorie: FAMILLE, actif: true,
      prix_vente_ht: ht, prix_sur_place_ttc: null,
      cout_achat_ht: null, libelle_achat: null, reference_fournisseur: null,
      // ⚠⚠ CINQUIÈME champ d'achat, et je l'avais OUBLIÉ au premier passage :
      // le croque porte `fournisseur_id` = Gineys (Nicolas), parce qu'une LIGNE
      // DE FACTURE le prouve. Copié, il attribuait le feuilleté et la quiche à
      // Gineys sans qu'aucun fait ne l'étaye — et un bon serait parti là-bas
      // pour un produit qu'on n'y achète peut-être pas (0164 : trois sources
      // factuelles, jamais une déduction).
      fournisseur_id: null,
      nom_matiere: null, unites_par_achat: 1,
      allergenes_complementaires: n.alg, allergenes_valides_le: null, allergenes_valides_par: null,
      description: n.desc, procedure: null, poids_portion_g: null,
      image_url: null, rupture_le: null, stock_cible: null, stock_minimum: 0,
    }]) })
    p = cree
    console.log(`   ✓ base : « ${p.nom} » créé`)
  } else console.log(`   = base : « ${p.nom} » existe déjà`)
  aPousser.push({ p, n })
}

// ── 2. la caisse, reprise sur la CORRESPONDANCE pas sur le nom ───────
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien poussé`)
const tags = (await zl('catalog/tags')).body.tags ?? []
const tag = tags.find(t => t.name === FAMILLE)
if (!tag) throw new Error(`famille « ${FAMILLE} » inconnue de la caisse — rien poussé`)
const zg = plats.find(x => String(x.remote_id) === gab.id)
if (!zg || zg.tax == null) throw new Error(`gabarit « ${GABARIT} » illisible en caisse — rien poussé`)

const creations = []
for (const { p, n } of aPousser) {
  if (plats.some(x => String(x.remote_id) === p.id)) { console.log(`   = caisse : « ${n.nom} » déjà là`); continue }
  // ⚠️ tax en MILLIÈMES, RECOPIÉS du gabarit — le taux sur place suit la loi,
  // pas le panneau. ⚠️ PAS de id_fabrication_place sur une création (500).
  creations.push({ name: n.nom, remote_id: p.id, tags: [tag.id],
    price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
    tax: zg.tax, tax_takeaway: zg.tax_takeaway ?? zg.tax, disable: false })
}
if (creations.length) {
  const r = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(creations) })
  if (r.status !== 200) throw new Error(`caisse : ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  console.log(`   ✓ caisse : ${creations.length} plat(s) créé(s)`)
}

// ── 3. relecture ─────────────────────────────────────────────────────
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const T = Object.fromEntries(tags.map(t => [t.id, t.name]))
let ok = true
console.log('')
for (const { p, n } of aPousser) {
  const [b] = await sb(`recettes?id=eq.${p.id}&select=nom,categorie,prix_vente_ht,tva,cout_achat_ht,libelle_achat,nom_matiere,fournisseur_id,vendable_online,allergenes_complementaires,allergenes_valides_le`)
  const z = apres.find(x => String(x.remote_id) === p.id)
  const ttc = b.prix_vente_ht * (1 + b.tva / 100)
  const bon = z && !z.disable && b.categorie === FAMILLE && Math.abs(ttc - TTC) < 0.005
    && z.price === Math.round(TTC * 100) && b.cout_achat_ht == null && b.libelle_achat == null
    && b.fournisseur_id == null && b.allergenes_valides_le == null
  if (!bon) ok = false
  console.log(`   ${bon ? '✓' : '✗'} ${b.nom.padEnd(12)} ${ttc.toFixed(2)} € · caisse ${z ? (z.price / 100).toFixed(2) + ' € ' + JSON.stringify((z.tags ?? []).map(t => T[t])) : 'ABSENT'} · coût ${b.cout_achat_ht ?? 'AUCUN'} · libelle_achat ${b.libelle_achat ?? 'AUCUN'} · fournisseur ${b.fournisseur_id ?? 'AUCUN'} · ${JSON.stringify(b.allergenes_complementaires)} signé ${b.allergenes_valides_le ?? 'non'}`)
}
if (!ok) process.exit(1)
console.log(`\n✅ « ${FAMILLE} » compte maintenant ${1 + aPousser.length} boutons.\n`)
