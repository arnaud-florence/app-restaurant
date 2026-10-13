// Un paquet de bonbons et un briquet au comptoir (13/10/2026).
//
// Demande du gérant. Le puff qu'il demandait aussi N'EST PAS CRÉÉ ICI : voir
// l'avertissement en fin de fichier.
//
// ⚠️ LES BONBONS VONT EN « GOURMANDISE », PAS EN « TABAC », et c'est la TVA
// qui décide : un bonbon est une denrée à 5,5 %, un briquet n'est pas
// alimentaire et reste à 20 %. `verifier-carte-zelty.mjs` refuse deux taux
// différents dans une même famille — c'est ce contrôle qui a trouvé le Pago à
// 5,5 % parmi seize boissons à 10 %. Les mettre ensemble le ferait rougir, et
// à raison.
//
// ⚠️ On ne crée PAS de famille « Confiserie » pour un seul article : la
// famille Gourmandise porte déjà les sucreries du comptoir au même taux, et
// une famille à un produit n'a pas sa place sur une caisse (règle posée en
// rangeant la Focaccia en Sandwich). Le jour où le rayon confiserie s'ouvre
// pour de bon — 94 pages du catalogue Euro-Cash, et c'est là que se joue le
// panier moyen d'un tabac — il méritera sa famille.
//
// ⚠️ Le BRIQUET rejoint « Tabac », créée hier pour les feuilles OCB : même
// taux, même rayon pipier, même nature non alimentaire.
//
// ⚠️ Aucun coût d'achat : Euro-Cash porte bien quatre briquets à son
// catalogue, mais tous à « prix sur demande » — le rayon pipier est l'un des
// 18 sur 21 qu'ils n'ont jamais chiffrés. Les bonbons n'y sont pas du tout.
// Les deux sortent en « coût inconnu », ce qui est la vérité.
//
//   node scripts/comptoir-bonbons-briquet-1310.mjs [--ecrire]
import { readFileSync } from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const NOUVEAUX = [
  { nom: 'Paquet de bonbons', gabarit: 'Donuts',                    ttc: 3.75, allerg: [] },
  { nom: 'Briquet',           gabarit: 'Feuilles OCB Slim Premium', ttc: 1.00, allerg: [] },
]

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const H = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (c, o = {}) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o, headers: H })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} :: ${t.slice(0, 320)}`)
  return t ? JSON.parse(t) : null
}
const zl = async (p, o = {}) => {
  for (let n = 1; n <= 5; n++) {
    await new Promise(s => setTimeout(s, 1400))
    const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
      headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
    const b = await r.json().catch(() => ({}))
    if (r.status === 200) return b
    console.log(`   (HTTP ${r.status}, essai ${n})`)
    if (r.status !== 429 && r.status < 500) throw new Error(JSON.stringify(b).slice(0, 250))
    await new Promise(s => setTimeout(s, 4000 * n))
  }
  throw new Error('abandon')
}
const cts = e => Math.round(e * 100)

console.log(`\n🍬 Bonbons et briquet${ECRIRE ? ' — ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)
const gabs = await sb(`recettes?nom=in.(${NOUVEAUX.map(n => `"${n.gabarit}"`).join(',')})&select=*`)
const gab = new Map(gabs.map(g => [g.nom, g]))
const deja = await sb(`recettes?nom=in.(${NOUVEAUX.map(n => `"${n.nom}"`).join(',')})&select=nom`)
const aFaire = NOUVEAUX.filter(n => !deja.some(d => d.nom === n.nom))
deja.forEach(d => console.log(`   = « ${d.nom} » existe déjà`))
for (const n of aFaire) {
  const g = gab.get(n.gabarit)
  if (!g) throw new Error(`gabarit « ${n.gabarit} » introuvable`)
  console.log(`   → ${n.nom.padEnd(22)} ${n.ttc.toFixed(2)} € · [${g.categorie}] TVA ${g.tva} % · ${g.tag_destination} · gabarit « ${n.gabarit} »`)
}
if (!aFaire.length) { console.log('\n   rien à créer.\n'); process.exit(0) }
if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

const crees = []
for (const n of aFaire) {
  const g = gab.get(n.gabarit)
  const { id: _i, created_at: _c, updated_at: _u, ...base } = g
  const [c] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
    ...base, id: crypto.randomUUID(), nom: n.nom, nom_caisse: n.nom,
    prix_vente_ht: Number((n.ttc / (1 + Number(g.tva) / 100)).toFixed(4)),
    prix_sur_place_ttc: null,
    // ⚠️ les champs d'achat du gabarit sont EFFACÉS : un scan de facture
    // écrirait sinon le prix du donut sur un paquet de bonbons.
    libelle_achat: null, cout_achat_ht: null, reference_fournisseur: null,
    nom_matiere: n.nom, unites_par_achat: 1,   // revendu tel quel, compté à l'unité
    image_url: null, actif: true, type_revenu: 'vente',
    vendable_online: false,     // ni photo, ni décision commerciale pour le site
    allergenes_complementaires: n.allerg,
    allergenes_valides_le: null, allergenes_valides_par: null,
  }]) })
  crees.push({ ...n, id: c.id, categorie: c.categorie, tva: Number(c.tva), alcool: c.contient_alcool })
  console.log(`   ✓ base : ${n.nom} (${c.id})`)
}

const tags = (await zl('catalog/tags?limit=0')).tags ?? []
const idTag = new Map(tags.map(t => [t.name, Number(t.id)]))
// ⚠️ La TVA SUR PLACE suit la LOI : 10 % pour une denrée, mais le TAUX DU
// PRODUIT pour ce qui n'est pas alimentaire (le briquet reste à 20 % dans les
// deux modes, comme les feuilles OCB). C'est la règle `NON_ALIMENTAIRE` de
// verifier-carte-zelty.mjs — et c'est en écrivant 10 % en dur ce matin sur la
// Pinte Picon que j'ai produit une sous-collecte.
const NON_ALIMENTAIRE = new Set(['Tabac'])
const corps = crees.map(c => {
  const tag = idTag.get(c.categorie)
  if (!tag) throw new Error(`famille « ${c.categorie} » inconnue de la caisse — refus`)
  const surPlace = NON_ALIMENTAIRE.has(c.categorie) || c.alcool ? c.tva * 100 : 1000
  return { remote_id: c.id, name: c.nom, price: cts(c.ttc), price_togo: cts(c.ttc),
           tax: surPlace, tax_takeaway: c.tva * 100, tags: [tag] }
})
await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
const ap = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
for (const c of corps) {
  const v = ap.find(x => String(x.remote_id) === String(c.remote_id))
  if (!v) { console.log(`   ⚠ ${c.name} : aucun identifiant rendu — relancer`); continue }
  await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{
    systeme: 'zelty', identifiant_externe: String(v.id), recette_id: c.remote_id, libelle_externe: c.name }]) })
  console.log(`   ✓ caisse : ${c.name} #${v.id} · tax ${v.tax} / emporter ${v.tax_takeaway} · famille [${(v.tags ?? []).join(', ')}]`)
}

// ─────────────────────────────────────────────────────────────────────
// ⚠️⚠️ LE PUFF N'EST PAS CRÉÉ, ET CE N'EST PAS UN OUBLI.
// La vente des cigarettes électroniques JETABLES (« puffs ») est INTERDITE
// en France : la loi visant à les interdire a été définitivement adoptée en
// février 2025 et son interdiction est entrée en application la même année.
// Créer le bouton rendrait la vente tapable par n'importe qui au comptoir,
// sans que l'équipe sache que c'est prohibé.
// Ce fichier projet notait déjà, en septembre, que « CBD, e-liquides et
// cigarettes électroniques restent à trancher avant vitrine ».
// → À confirmer par le gérant. S'il s'agit d'un modèle RECHARGEABLE (donc
//   hors interdiction) ou d'un stock antérieur dont la revente lui est
//   confirmée possible, le produit se crée en une ligne dans NOUVEAUX,
//   famille « Tabac », 20 %.
// ─────────────────────────────────────────────────────────────────────
console.log('\n⚠ Le puff n\'est pas créé — voir l\'avertissement en fin de fichier.\n')
