// LE SUPPLÉMENT SIROP SUR TOUTES LES CATÉGORIES DE BOISSON — 16/10/2026.
//
// Demande du gérant : « met supplément sirop partout dans toutes les
// catégories de boisson ». Le 15/10, il n'existait que sur 7 bières.
//
// ⚠️⚠️ LE PRIX N'EST PAS LE MÊME PARTOUT, ET C'EST SA CARTE QUI LE DIT.
// Deux couples de SES propres produits donnent le trait de sirop, et ils ne
// tombent pas sur le même nombre :
//
//     Monaco 3,00 − Panaché 2,80         = 0,20 €   (dans un alcool)
//     Mauresque 2,20 − Ricard 2,00       = 0,20 €   (idem, deuxième témoin)
//     Diabolo 3,20 − Limonade 25 cl 2,80 = 0,40 €   (dans un soft)
//
// D'où DEUX groupes, comme « Cuisson » et « Cuisson du burger ». Un seul
// groupe à 0,20 € mettrait « Limonade + Sirop » à 3,00 € face au Diabolo à
// 3,20 € : un SECOND CHEMIN, MOINS CHER, vers exactement la même boisson —
// 0,20 € perdus à chaque verre, et le bouton Diabolo devient inutile. C'est
// la raison même qui a écarté Monaco et Panaché du supplément la veille.
//
// ⚠️ L'écart 0,20 / 0,40 est une incohérence de la CARTE, pas du script : le
// même trait de sirop vaut le double dans un Coca que dans une bière. Dit
// plutôt que tranché en silence — un mot suffit à l'unifier (en alignant le
// Diabolo à 3,00 €, ou les deux groupes sur 0,40 €).
//
// ⚠️⚠️ LA FENÊTRE NE S'OUVRE PAS D'ELLE-MÊME SUR LES SOFTS (`donotpresent`).
// Pour la bière c'était assumé : 7 produits, un bar en service posé, et un
// panaché est courant. Ici le groupe touche 8 boissons chaudes et 18 boissons
// fraîches, c'est-à-dire LES DEUX ARTICLES LES PLUS VENDUS DU COMPTOIR à
// 6 h 20. Une fenêtre à fermer sur chaque café vendu ralentit la file, et un
// sirop dans un café ou un Coca est l'exception. Le serveur l'ouvre quand le
// client demande. ⚠️ Contrepartie connue : le supplément n'est plus
// découvrable par quelqu'un qui ne connaît pas la caisse — à inverser d'un
// mot (`DONOTPRESENT_SOFT = false`) si le comptoir le réclame.
//
// ⚠️ UN SEUL SIROP, SANS PARFUM, et c'est mesuré : « Sirop (litre) » est la
// SEULE matière sirop suivie (`stocke = true`). Grenadine et menthe fraîche
// existent en base mais ne sont PAS suivies — proposer « grenadine » ou
// « menthe » mettrait au comptoir des bouteilles dont rien ne dit qu'elles
// sont en stock. Le script REFUSE de construire sans cette matière.
//
// ⚠️ QUATRE RAISONS D'EXCLURE, chacune nommée produit par produit ci-dessous.
// La plus importante : un produit DÉJÀ aromatisé créerait un second chemin
// vers la même boisson, à un autre prix.
//
// ⚠️ LE VIN EST EXCLU EN BLOC : vin + sirop, c'est un Kir, qui existe déjà en
// produit (comme le Kir royal). Et on ne verse pas de sirop dans un verre de
// Château La Lieue.
//
// ⚠️⚠️ ON FUSIONNE LES GROUPES D'UN PLAT, ON NE LES REMPLACE PAS. Écrire
// `options: [sirop]` sur une bière retirerait ses autres groupes sans un
// message (leçon des quatre plats à cuisson, 12/10).
//
// ⚠️⚠️ MAIS ZELTY REMPLACE LES `values` D'UNE OPTION — vérifié le 10/10. Le
// groupe bière existant est donc renvoyé avec SES valeurs recopiées telles
// quelles : les omettre EFFACERAIT le « Sirop » déjà en place.
//
// ⚠️ Le `remote_id` du groupe bière reste `supp-biere` alors que son nom
// change : c'est la CLÉ D'IDEMPOTENCE. Le changer créerait un second groupe,
// et les 7 bières resteraient accrochées à l'ancien.
//
//   node scripts/supplement-sirop-boissons-1610.mjs [--ecrire]
import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const MATIERE = 'Sirop (litre)'

// ── les deux groupes, chacun avec son ancrage ─────────────────────────
const DONOTPRESENT_SOFT = true
const GROUPES = {
  alcool: {
    remote_id: 'supp-biere',            // ⚠️ clé d'idempotence : ne pas changer
    name: 'Supplément sirop',
    prix: 0.20,
    ancrage: 'Monaco − Panaché, et Mauresque − Ricard',
    cout: 0.0358,                       // Monaco 0,8729 − Panaché 0,8371
    tva: 20,
    donotpresent: false,
    familles: ['Bière', 'Apéritif', 'Alcool'],
  },
  soft: {
    remote_id: 'supp-sirop-soft',
    name: 'Supplément sirop boisson',
    prix: 0.40,
    ancrage: 'Diabolo − Limonade 25 cl',
    cout: 0.0762,                       // Diabolo 0,8345 − Limonade
    tva: 10,
    donotpresent: DONOTPRESENT_SOFT,
    familles: ['Boisson fraîche', 'Boisson salle', 'Boisson chaude'],
  },
}

// ── ce qui est EXCLU, et pourquoi ────────────────────────────────────
const EXCLUS = {
  'déjà aromatisé — un second chemin vers la même boisson': [
    'Monaco', 'Panaché', 'Gommé', 'Picon bière', 'Pinte Picon',
    'Mauresque', 'Tomate', 'Perroquet', 'Spritz',
    'Diabolo', "Sirop à l'eau", 'Alcool + soft',
  ],
  'digestif bu sec — personne n’y verse de sirop': [
    'Baileys 4 cl', 'Cognac 4 cl', 'Cointreau 4 cl', 'Digestif 4 cl',
    'Limoncello 4 cl', 'Marc de Provence 4 cl',
  ],
}
// familles entières écartées
const FAMILLES_HORS = ['Vin']
// motifs : contenant vendu fermé, qu'on n'ouvre pas au comptoir
const MOTIFS_HORS = [
  [/^Bouteille /, 'bouteille entière vendue fermée'],
  [/1,5 L/,       'format familial à emporter'],
]

// ── coûts de référence, RELUS avant toute dérivation ─────────────────
const ATTENDU = {
  'Demi pression': 0.9159, 'Panaché': 0.8371, 'Monaco': 0.8729,
  'Ricard 2 cl': 0.3957, 'Mauresque': 0.5259, 'Diabolo': 0.8345,
}

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
// ⚠️ annonce le code à chaque tour : un helper qui avale le statut fait
// soupçonner un plafond de débit là où c'est un 500 (vécu le 12/10).
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

console.log('\n🍹 Supplément sirop sur toutes les catégories de boisson')
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

// ── 1. la matière doit exister ET être suivie ───────────────────────
const [mat] = await sb(`ingredients?select=nom,stocke,prix_achat_ht,unite&nom=eq.${encodeURIComponent(MATIERE)}`)
if (!mat) throw new Error(`matière « ${MATIERE} » introuvable — rien écrit`)
if (!mat.stocke) throw new Error(`« ${MATIERE} » n'est pas suivie au stock — un supplément sans matière, c'est un client à qui on dit non après l'avoir encaissé. Rien écrit`)
console.log(`   ✓ matière « ${mat.nom} » suivie, ${Number(mat.prix_achat_ht).toFixed(2)} €/${mat.unite}`)

// ── 2. les deux ancrages, confirmés en base ─────────────────────────
const refs = await sb(`recettes?select=nom,cout_achat_ht&nom=in.(${Object.keys(ATTENDU).map(n => JSON.stringify(n)).join(',')})`)
const parNom = Object.fromEntries(refs.map(r => [r.nom, Number(r.cout_achat_ht)]))
for (const [n, a] of Object.entries(ATTENDU)) {
  if (parNom[n] === undefined) throw new Error(`« ${n} » introuvable — l'ancrage ne tient plus, rien écrit`)
  if (Math.abs(parNom[n] - a) > 0.0001)
    throw new Error(`coût de « ${n} » : ${parNom[n]} attendu ${a} — l'ancrage ne tient plus, rien écrit`)
}
console.log(`   ✓ les 6 coûts d'ancrage confirmés en base`)

// ── 3. le périmètre ─────────────────────────────────────────────────
const horsListe = new Map()
for (const [raison, noms] of Object.entries(EXCLUS)) for (const n of noms) horsListe.set(n, raison)

const toutes = [...new Set(Object.values(GROUPES).flatMap(g => g.familles))]
const prod = await sb(`recettes?select=id,nom,categorie,prix_vente_ht,prix_sur_place_ttc,tva&actif=eq.true&categorie=in.(${toutes.map(f => JSON.stringify(f)).join(',')})&order=categorie,nom`)

const cibles = {}, ecartes = []
for (const cle of Object.keys(GROUPES)) cibles[cle] = []
for (const p of prod) {
  const cle = Object.keys(GROUPES).find(k => GROUPES[k].familles.includes(p.categorie))
  if (horsListe.has(p.nom)) { ecartes.push([p.nom, horsListe.get(p.nom)]); continue }
  const motif = MOTIFS_HORS.find(([re]) => re.test(p.nom))
  if (motif) { ecartes.push([p.nom, motif[1]]); continue }
  cibles[cle].push(p)
}

for (const [cle, g] of Object.entries(GROUPES)) {
  const ht = g.prix / (1 + g.tva / 100)
  console.log(`\n── « ${g.name} » · ${g.prix.toFixed(2)} € TTC · ${cibles[cle].length} produits ──`)
  console.log(`   ancré sur : ${g.ancrage}`)
  console.log(`   coût ${g.cout.toFixed(4)} € · food cost ${(g.cout / ht * 100).toFixed(0)} % (à ${g.tva} %)`)
  console.log(`   fenêtre à chaque vente : ${g.donotpresent ? 'NON (le serveur l’ouvre)' : 'oui'}`)
  for (const f of g.familles) {
    const l = cibles[cle].filter(p => p.categorie === f)
    console.log(`   · ${f.padEnd(16)} ${String(l.length).padStart(2)} : ${l.map(p => p.nom).join(', ') || '—'}`)
  }
}
console.log(`\n── écartés (${ecartes.length} + toute la famille ${FAMILLES_HORS.join('/')}) ──`)
const parRaison = {}
for (const [n, r] of ecartes) (parRaison[r] ??= []).push(n)
for (const [r, l] of Object.entries(parRaison)) console.log(`   ${r} :\n      ${l.join(', ')}`)
console.log(`   famille ${FAMILLES_HORS.join('/')} : vin + sirop = un Kir, qui existe déjà en produit`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 4. LA CAISSE D'ABORD (0141) ─────────────────────────────────────
const cat = await zl('catalog/dishes?show_all=true&limit=0')
const plats = cat.body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien écrit`)
const optAvant = (await zl('catalog/options')).body.options ?? []

// 4a. les groupes. ⚠️ `values` est REMPLACÉ par Zelty : on recopie les
// valeurs existantes telles quelles, sinon le « Sirop » déjà posé disparaît.
const corpsOpt = []
for (const g of Object.values(GROUPES)) {
  const ex = optAvant.find(o => o.remote_id === g.remote_id)
  const val = ex?.values?.find(v => v.name === 'Sirop')
  corpsOpt.push({
    ...(ex ? { id: ex.id } : {}),
    remote_id: g.remote_id, name: g.name,
    min_choices: 0, max_choices: 1,
    pick_same_value: true, donotpresent: g.donotpresent,
    values: [{ ...(val ?? {}), name: 'Sirop',
               price: Math.round(g.prix * 100),
               remote_id: `${g.remote_id}::Sirop` }],
  })
}
const rO = await zl('catalog/options', { method: 'POST', body: JSON.stringify(corpsOpt) })
if (rO.status !== 200) throw new Error(`options : ${rO.status} ${JSON.stringify(rO.body).slice(0, 300)}`)
const optApres = (await zl('catalog/options')).body.options ?? []
const ids = {}
for (const [cle, g] of Object.entries(GROUPES)) {
  const o = optApres.find(x => x.remote_id === g.remote_id)
  if (!o) throw new Error(`groupe « ${g.name} » introuvable après écriture — rien rattaché`)
  if (!o.values?.some(v => v.name === 'Sirop')) throw new Error(`« ${g.name} » n'a plus de valeur « Sirop » — ARRÊT`)
  ids[cle] = o.id
  console.log(`\n   ✓ groupe #${o.id} « ${o.name} » · ${o.values.find(v => v.name === 'Sirop').price} cts · fenêtre ${o.donotpresent ? 'à la demande' : 'à chaque vente'}`)
}

// 4b. rattachement des plats, PAR FUSION
const corps = [], absents = []
for (const [cle, liste] of Object.entries(cibles)) {
  for (const p of liste) {
    const z = plats.find(x => String(x.remote_id) === p.id)
    if (!z) { absents.push(p.nom); continue }
    if (z.name == null || z.price == null || z.tax == null)
      throw new Error(`« ${p.nom} » : champ obligatoire manquant côté caisse — on ne construit pas`)
    const fusion = [...new Set([...(z.options ?? []), ids[cle]])]
    if (fusion.length === (z.options ?? []).length) continue   // déjà rattaché
    // ⚠️ name / price / tax RECOPIÉS tels quels : cet upsert peut écraser le
    // prix imprimé sur les tickets. On ne touche QUE `options`.
    corps.push({ id: z.id, name: z.name, price: z.price, tax: z.tax, options: fusion })
  }
}
if (absents.length) console.log(`\n   ⚠ sans contrepartie en caisse, NON rattachés : ${absents.join(', ')}`)
if (!corps.length) { console.log('\n   = tous déjà rattachés.\n'); process.exit(0) }

const rD = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
if (rD.status !== 200) throw new Error(`plats : ${rD.status} ${JSON.stringify(rD.body).slice(0, 300)}`)
console.log(`   ✓ ${corps.length} plats rattachés`)

// ── 5. relecture : l'écran de confirmation ne prouve rien ───────────
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
let ok = 0, ko = []
for (const [cle, liste] of Object.entries(cibles)) {
  for (const p of liste) {
    const z = apres.find(x => String(x.remote_id) === p.id)
    if (!z) continue
    if (z.options?.includes(ids[cle])) ok++; else ko.push(p.nom)
  }
}
console.log(`\n   relu : ${ok} plats portent le supplément${ko.length ? `, ✗ ${ko.join(', ')}` : ''}`)
if (ko.length) process.exit(1)
console.log('\n✅ Les deux groupes sont en place.\n')
