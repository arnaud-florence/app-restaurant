// Les quatre formules snacking à 9,90 € (gérant, 15/10/2026).
//
//   Panini / Salade / Focaccia / Sandwich  +  boisson CANETTE  +  dessert
//
// ⚠️⚠️ ON EN AVAIT SUPPRIMÉ NEUF LE 11/10. C'est une décision du gérant, pas
//    un retour en arrière accidentel : les anciennes étaient six formules
//    vendues plus trois composants « Formule — … » devenus sans objet. Les
//    quatre d'ici sont nommées court et distinctement, donc aucun conflit
//    avec les désactivées (qui gardent leur `nom_caisse`, règle du miroir).
//
// ⚠️ TVA 10 %, ET C'EST UN PANIER MIXTE. Un panini à 10 % et une pâtisserie
//    à 5,5 % dans le même prix : `recettes.tva` ne porte qu'un taux, et la
//    maison a tranché pour le taux HAUT (règle des formules petit-déjeuner)
//    — sur-collecter est rattrapable, sous-collecter ne l'est pas.
//    9,90 / 1,10 = 9,0000 € HT pile, aucun arrondi à craindre.
//
// ⚠️⚠️ AUCUNE COMPOSITION, ET AUCUN COÛT. Le contenu se CHOISIT : chiffrer
//    sur un panini fixe mentirait pour les deux autres — exactement la règle
//    de « Formule CasaTasia » et du menu enfant. Elles sortent donc en
//    « coût inconnu » (gris), ce qui est la vérité.
//    ⚠️ Et les coûts des composants manquent de toute façon : 0/3 paninis,
//    0/4 salades, 1/6 sandwichs sont chiffrés au 15/10/2026.
//
// ⚠️ LA BORNE EST DANS LA PROCÉDURE, et elle n'est pas décorative. Avec les
//    composants les moins chers (croque-monsieur 3,50 + eau 1,00 + mini
//    beignet 1,20 = 5,70 €), la formule coûterait 4,20 € DE PLUS que la
//    carte. Bornée à une CANETTE (2,00 €) et une PÂTISSERIE (3,80 €), elle
//    redevient avantageuse partout sauf sur le croque-monsieur.
//
// ⚠️ `vendable_online: false` — les formules sont hors click & collect
//    depuis la 0115, et « Formule » est déjà dans `JAMAIS_EN_LIGNE`.
//
//   node scripts/formules-snacking-1510.mjs [--ecrire]
import fs from 'node:fs'

const TTC = 9.90
const TVA = 10
const FAMILLE = 'Formule'
const GABARIT = 'Panini jambon-fromage'   // pour le point de vente et le tag
const FORMULES = [
  ['Formule Panini',   'un panini au choix'],
  ['Formule Salade',   'une salade au choix'],
  ['Formule Focaccia', 'une focaccia'],
  ['Formule Sandwich', 'un sandwich au choix'],
]
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
      'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
// ⚠️ réessaie sur 429 EN ANNONÇANT le code : un helper qui avale le statut
// fait soupçonner un plafond de débit là où c'est un 500 (vécu le 12/10).
const zl = async (c, o = {}, essai = 1) => {
  const r = await fetch(`https://api.zelty.fr/2.11/${c}`, { ...o,
    headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
  const t = await r.text()
  const body = (() => { try { return JSON.parse(t) } catch { return null } })()
  if (r.status === 429 && essai < 4) {
    console.log(`      caisse 429, nouvel essai ${essai + 1}/4…`)
    await new Promise(s => setTimeout(s, 2500 * essai))
    return zl(c, o, essai + 1)
  }
  return { status: r.status, body, texte: t }
}

const ht = TTC / (1 + TVA / 100)
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
console.log(`   ${TTC.toFixed(2)} € TTC · TVA ${TVA} % · ${ht.toFixed(4)} € HT · famille « ${FAMILLE} »\n`)

const [g] = await sb(`recettes?nom=eq.${encodeURIComponent(GABARIT)}&select=tag_destination,etablissement_id`)
if (!g) throw new Error(`gabarit « ${GABARIT} » introuvable`)

// ⚠️ ON REPREND SUR LA CORRESPONDANCE DE CAISSE, PAS SUR LE NOM. Un produit
// peut exister chez nous et pas en caisse (POST échoué, 429 au mauvais
// moment) : juger sur le nom le ferait sortir « existe déjà » pour toujours,
// et il resterait invisible du comptoir.
const plan = []
for (const [nom, quoi] of FORMULES) {
  const [ex] = await sb(`recettes?nom=eq.${encodeURIComponent(nom)}&select=id,actif`)
  const lien = ex ? (await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=eq.${ex.id}&select=id`))[0] : null
  plan.push({ nom, quoi, base: ex ?? null, enCaisse: !!lien })
  console.log(`   ${nom.padEnd(18)} base ${ex ? '✓' : '—'}   caisse ${lien ? '✓' : '—'}   ${quoi}`)
}
const aFaire = plan.filter(p => !p.base || !p.enCaisse)
if (!aFaire.length) { console.log('\n   tout est déjà en place — rien à faire.\n'); process.exit(0) }
console.log(`\n   à traiter : ${aFaire.length}`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

const tags = (await zl('catalog/tags?limit=0')).body?.tags ?? []
const tag = tags.find(t => t.name === FAMILLE)
if (!tag) throw new Error(`famille « ${FAMILLE} » absente de la caisse — la créer avec pousser-familles-zelty`)

const PROC = quoi => [
  `${quoi[0].toUpperCase()}${quoi.slice(1)} + une boisson en CANETTE + un dessert.`,
  '',
  "⚠️ La formule n'est avantageuse que bornée ainsi. Avec les composants les",
  'moins chers de la carte (croque-monsieur, eau, mini beignet), le client',
  'paierait 9,90 € ce qui lui coûterait 5,70 € à la carte.',
  '',
  "⚠️ Le coût n'est PAS chiffré : le contenu se choisit. Le food cost affiché",
  'est donc inconnu, et non pas bon.',
].join('\n')

// ── base ──────────────────────────────────────────────────────────────
for (const p of aFaire.filter(x => !x.base)) {
  p.id = crypto.randomUUID()
  await sb('recettes', { method: 'POST', body: JSON.stringify([{
    id: p.id, nom: p.nom, nom_caisse: p.nom,
    categorie: FAMILLE, tag_destination: g.tag_destination, etablissement_id: g.etablissement_id,
    prix_vente_ht: Number(ht.toFixed(4)), prix_sur_place_ttc: null,
    tva: TVA, contient_alcool: false,
    vendable_online: false,
    cout_achat_ht: null,            // contenu au choix — rien à chiffrer
    nom_matiere: null, unites_par_achat: 1,
    image_url: null, actif: true, type_revenu: 'vente',
    allergenes_complementaires: [], // dépendent du contenu choisi
    procedure: PROC(p.quoi),
  }]) })
  console.log(`   ✓ base : ${p.nom}`)
}
for (const p of aFaire.filter(x => x.base)) p.id = p.base.id

// ── caisse, UN SEUL POST groupé ───────────────────────────────────────
const avant = (await zl('catalog/dishes?show_all=true&limit=0')).body?.dishes ?? []
if (avant.length < 100) throw new Error(`catalogue caisse à ${avant.length} plats — lecture ratée`)
const r = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(
  aFaire.map(p => ({
    remote_id: p.id, name: p.nom,
    price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
    tax: TVA * 100, tax_takeaway: TVA * 100,   // ⚠️ MILLIÈMES : 1000 = 10 %
    tags: [tag.id],
  })),
) })
if (r.status !== 200) throw new Error(`caisse : ${r.status} ${r.texte.slice(0, 300)}`)

const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body?.dishes ?? []
for (const p of aFaire) {
  const plat = apres.find(x => String(x.remote_id) === p.id)
  if (!plat) { console.log(`   ⚠ ${p.nom} : aucun identifiant rendu — lien NON enregistré, relancer`); continue }
  if (!p.enCaisse) await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{
    systeme: 'zelty', identifiant_externe: String(plat.id), recette_id: p.id, libelle_externe: p.nom }]) })
  console.log(`   ✓ caisse : ${p.nom} #${plat.id} · ${plat.price} ct · tax ${plat.tax}`)
}
console.log('\n✅ En vente au comptoir.\n')
