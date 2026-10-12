// Les feuilles OCB Slim Premium en caisse — 1,20 € (12/10/2026).
//
// Premier article NON ALIMENTAIRE de la carte, et ça décide trois choses :
//
// ⚠️ TVA 20 %, et c'est le cas où elle est JUSTE. Le fichier projet avertit
//    que « 20 % sur une denrée alimentaire est presque toujours une erreur de
//    caisse » — des feuilles à rouler n'en sont pas une.
//
// ⚠️⚠️ ELLES VONT AU FOURNIL, PAS À L'ÉTABLISSEMENT « TABAC ». Celui-ci porte
//    `inclus_ca_principal = false` : il est modélisé pour la COMMISSION, la
//    remise du buraliste sur un prix imposé par l'État. Les feuilles, elles,
//    s'achètent et se revendent avec NOTRE marge — les rattacher au Tabac les
//    ferait disparaître du chiffre d'affaires, sans le moindre message.
//    Même raison pour `type_revenu = 'vente'` : rien n'est imposé ici.
//
// ⚠️ FAMILLE NOUVELLE, et il en faut une. Aucune famille du comptoir ne les
//    accueille, et les ranger en « Gourmandise » (5,5 %) ferait rougir le
//    contrôle de cohérence des taux par famille de verifier-carte-zelty.mjs.
//    Une famille à un seul produit n'a normalement pas sa place sur une
//    caisse — celle-ci est l'exception assumée : le rayon pipier d'Euro-Cash
//    (briquets, allumettes) viendra la remplir.
//
//   node scripts/ocb-slim-premium.mjs [--ecrire]
import fs from 'node:fs'

const NOM = 'Feuilles OCB Slim Premium'
const TTC = 1.20
const TVA = 20
const FAMILLE = 'Tabac'
const GABARIT = 'Coca-Cola 33 cl'   // pour le point de vente et le tag du comptoir
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
  // ⚠️ Zelty plafonne son débit sans le documenter. On réessaie sur 429 et
  // 5xx, en annonçant le code : un helper qui avale le statut m'a déjà fait
  // soupçonner un plafond là où c'était un 500.
  let dernier = { status: 0, body: {} }
  for (let essai = 1; essai <= 4; essai++) {
    const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
      headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                 'Content-Type': 'application/json', ...(o.headers || {}) } })
    dernier = { status: r.status, body: await r.json().catch(() => ({})) }
    if (r.status === 200) return dernier
    console.log(`   tentative ${essai} sur ${p} → HTTP ${r.status}`)
    if (r.status !== 429 && r.status < 500) return dernier
    await new Promise(s => setTimeout(s, 4000 * essai))
  }
  return dernier
}

console.log(`\n🚬 « ${NOM} » — ${TTC.toFixed(2)} € TTC`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

// ── le produit existe-t-il déjà, même désactivé ? ─────────────────────
// Trois fois ce mois-ci, le produit « à créer » existait et n'était que
// désactivé (jus d'orange, jus de pomme, Monaco). On regarde d'abord.
const voisins = await sb(`recettes?or=(nom.ilike.*OCB*,nom.ilike.*feuille*)&select=id,nom,actif,prix_vente_ht,tva`)
console.log(`   homonymes en base : ${voisins.length ? voisins.map(v => `${v.nom} (${v.actif ? 'actif' : 'DÉSACTIVÉ'})`).join(', ') : 'aucun'}`)

// ⚠️⚠️ REPRISE : on juge sur la CORRESPONDANCE DE CAISSE, pas sur le nom.
// Zelty plafonne son débit (429 au 5ᵉ appel d'affilée) : la base peut être
// écrite et la caisse non. Un script qui s'arrête sur « le nom existe » ne
// repart jamais, et le produit reste invisible du comptoir — vécu sur les six
// jus Euro-Cash le 12/10/2026.
const exact = voisins.find(v => v.nom === NOM)
let reprise = null
if (exact) {
  const [lien] = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=eq.${exact.id}&select=id`)
  if (lien) { console.log(`\n   = déjà en base ET en caisse. Rien à faire.\n`); process.exit(0) }
  reprise = exact
  console.log(`   ↻ en base (${exact.id}) mais ABSENT de la caisse — reprise de la seule poussée`)
} else if (voisins.length) {
  console.log('\n   → un produit proche existe sous un autre nom : à réveiller plutôt qu\'à créer. Rien fait.\n')
  process.exit(0)
}

const [g] = await sb(`recettes?nom=eq.${encodeURIComponent(GABARIT)}&select=id,etablissement_id,tag_destination`)
if (!g) throw new Error(`gabarit « ${GABARIT} » introuvable`)
const etab = await sb(`etablissements?id=eq.${g.etablissement_id}&select=nom,inclus_ca_principal`)
console.log(`   point de vente : ${etab[0].nom} · inclus au CA principal : ${etab[0].inclus_ca_principal ? 'oui' : 'NON'}`)
if (!etab[0].inclus_ca_principal)
  throw new Error('le point de vente retenu est hors CA principal — une vente à marge propre n\'y a pas sa place')

// ── ce que le catalogue fournisseur sait de l'OCB ─────────────────────
const offres = await sb(`catalogue_fournisseur?designation=ilike.*OCB*&select=designation,prix_ht,reference`)
const chiffrees = offres.filter(o => o.prix_ht != null)
console.log(`   offres OCB au catalogue : ${offres.length}, dont chiffrées : ${chiffrees.length}`)
// ⚠️ cout_achat_ht reste NULL. Les 4 lignes OCB d'Euro-Cash sont à « prix sur
// demande », et aucune n'est une Slim Premium. Un coût inventé ferait un food
// cost faux qui ne se signale pas ; « coût inconnu » se voit, lui.
const ht = TTC / (1 + TVA / 100)

console.log(`\n   → base   : ${NOM} · HT ${ht.toFixed(4)} · TVA ${TVA} % · famille ${FAMILLE} · ${g.tag_destination}`)
console.log(`   → caisse : famille « ${FAMILLE} » à créer, puis le plat à ${TTC.toFixed(2)} €`)
console.log(`   → coût d'achat : NULL (aucune Slim Premium chiffrée chez un fournisseur)`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. la famille côté caisse ─────────────────────────────────────────
// En FIN d'ordre : ajoutée après coup, elle ne décale pas les familles
// existantes, et à 6 h 20 on vend du pain, pas des feuilles.
let tags = (await zl('catalog/tags')).body.tags ?? []
let tag = tags.find(t => t.name === FAMILLE)
if (!tag) {
  const r = await zl('catalog/tags', { method: 'POST',
    body: JSON.stringify([{ name: FAMILLE, remote_id: FAMILLE, o: 99 }]) })
  if (r.status !== 200) throw new Error(`création de la famille : ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
  tags = (await zl('catalog/tags')).body.tags ?? []
  tag = tags.find(t => t.name === FAMILLE)
  if (!tag) throw new Error('la caisse n\'a rendu aucun identifiant de famille')
  console.log(`   ✓ caisse : famille « ${FAMILLE} » créée #${tag.id}`)
} else console.log(`   = caisse : famille « ${FAMILLE} » existait déjà #${tag.id}`)

// ── 2. le produit chez nous ───────────────────────────────────────────
const id = reprise?.id ?? crypto.randomUUID()
if (!reprise) await sb('recettes', { method: 'POST', body: JSON.stringify([{
  id, nom: NOM, nom_caisse: NOM,
  categorie: FAMILLE, tag_destination: g.tag_destination, etablissement_id: g.etablissement_id,
  prix_vente_ht: Number(ht.toFixed(4)), prix_sur_place_ttc: null,
  tva: TVA, contient_alcool: false,
  vendable_online: false,        // rien de tout ça ne se vend sans comptoir
  cout_achat_ht: null,           // aucune Slim Premium chiffrée
  nom_matiere: NOM, unites_par_achat: 1,   // on compte des carnets
  image_url: null, actif: true, type_revenu: 'vente',
  allergenes_complementaires: [],
}]) })
console.log(reprise ? `   = base : déjà là ${id}` : `   ✓ base : créé ${id}`)

// ── 3. le plat en caisse ──────────────────────────────────────────────
// ⚠️ lecture d'abord : moins de 100 plats = lecture ratée, pas catalogue vide.
const avant = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (avant.length < 100) throw new Error(`catalogue caisse à ${avant.length} plats — lecture ratée`)
// ⚠️ tableau NU, et PAS de id_fabrication_place sur une création (Zelty 500).
const r = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify([{
  remote_id: id, name: NOM,
  price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
  tax: TVA * 100, tax_takeaway: TVA * 100,   // ⚠️ MILLIÈMES : 2000 = 20 %
  tags: [tag.id],
}]) })
if (r.status !== 200) throw new Error(`caisse : ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`)

const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const plat = apres.find(x => String(x.remote_id) === id)
if (!plat) { console.log('   ⚠ aucun identifiant rendu par la caisse — lien NON enregistré, relancer'); process.exit(1) }
await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{
  systeme: 'zelty', identifiant_externe: String(plat.id), recette_id: id, libelle_externe: NOM }]) })
console.log(`   ✓ caisse : plat #${plat.id} dans « ${FAMILLE} », lien enregistré`)
console.log('\n✅ En vente au comptoir.\n')
