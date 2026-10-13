// Chocolat chaud en deux tailles, et une Pinte Picon (13/10/2026).
//
// Demande du gérant : « chocolat chaud en petit et grand au lieu d'un seul,
// 2,30 et 2,80 », « pinte Picon à 5,80 ».
//
// ⚠️ LE PETIT HÉRITE DE LA FICHE EXISTANTE, il n'est pas recréé : elle porte
// son coût MESURÉ (0,5705 € = 25 g de poudre + 20 cl de lait, dose écrite
// dans `cafe-grains.mjs`), sa matière, ses allergènes et son historique de
// ventes. Créer deux fiches neuves et désactiver l'ancienne aurait jeté tout
// ça, et Zelty ne sait pas supprimer un plat.
//
// ⚠️⚠️ LE GRAND N'A PAS DE COÛT, ET C'EST VOULU. Sa dose n'est pas fixée :
// 30 cl ? 35 cl ? Le coût du petit se dérive d'une dose PESÉE ; celui du
// grand demanderait d'inventer un volume, et « une pondération inventée
// aurait l'air d'un savoir ». Il sort en « coût inconnu » (gris) jusqu'à ce
// que la dose soit pesée — exactement comme les 8 g de café, « réglage de
// départ qui se vérifie à la balance au premier service ».
// Sa MATIÈRE et son rendement sont ceux du petit : les deux tailles puisent
// la même boîte de poudre, donc une seule ligne de stock et de commande.
//
// ⚠️ LA PINTE PICON, elle, est DÉRIVÉE de chiffres mesurés, pas inventée :
//     Picon bière 1,1266 − Demi pression 0,9159 = 0,2107 de Picon (≈ 2 cl,
//     et Picon 4 cl coûte 0,4102, donc la moitié — ça concorde)
//     Pinte Picon = Pinte pression 1,8318 + 0,2107 = 2,0425 €
// Le dosage de Picon ne double PAS avec la bière : c'est l'hypothèse, et elle
// est dite. Food cost 42 % — exactement celui de la Pinte pression, donc dans
// la norme de la maison pour une pinte.
//
//   node scripts/choco-picon-1310.mjs [--ecrire]
import { readFileSync } from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const PETIT = 2.30, GRAND = 2.80, PINTE_PICON = 5.80

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
const ttc = r => Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100)
const cts = e => Math.round(e * 100)

console.log(`\n☕ Chocolat chaud petit/grand · Pinte Picon${ECRIRE ? ' — ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)

const [choco] = await sb('recettes?nom=eq.Chocolat%20chaud&select=*')
const [picon] = await sb('recettes?nom=eq.Picon%20bi%C3%A8re&select=*')
const [demi] = await sb('recettes?nom=eq.Demi%20pression&select=cout_achat_ht')
const [pinte] = await sb('recettes?nom=eq.Pinte%20pression&select=cout_achat_ht')
if (!choco || !picon || !demi || !pinte) throw new Error('produit de référence introuvable')

// ⚠️ La dérivation est CONTRÔLÉE : la part de Picon doit retomber sur la
// moitié d'un Picon 4 cl. Si un coût de départ a bougé, on ne dérive pas.
const partPicon = Number((Number(picon.cout_achat_ht) - Number(demi.cout_achat_ht)).toFixed(4))
const [p4] = await sb('recettes?nom=eq.Picon%204%20cl&select=cout_achat_ht')
const attendu = Number(picon.cout_achat_ht) - Number(demi.cout_achat_ht)
if (Math.abs(partPicon - Number(p4.cout_achat_ht) / 2) > 0.02)
  throw new Error(`part de Picon ${partPicon} incohérente avec un Picon 4 cl à ${p4.cout_achat_ht} — dérivation refusée`)
const coutPintePicon = Number((Number(pinte.cout_achat_ht) + partPicon).toFixed(4))
console.log(`   part de Picon mesurée : ${partPicon.toFixed(4)} € (≈ moitié d'un 4 cl à ${Number(p4.cout_achat_ht).toFixed(4)}) ✓`)

const htP = PETIT / (1 + Number(choco.tva) / 100), htG = GRAND / (1 + Number(choco.tva) / 100)
const htPic = PINTE_PICON / (1 + Number(picon.tva) / 100)
console.log(`\n   « Chocolat chaud » ${ttc(choco).toFixed(2)} € → « Chocolat chaud petit » ${PETIT.toFixed(2)} €`)
console.log(`      coût conservé ${Number(choco.cout_achat_ht).toFixed(4)} (25 g + 20 cl) · food cost ${(Number(choco.cout_achat_ht)/htP*100).toFixed(0)} %`)
console.log(`   « Chocolat chaud grand » ${GRAND.toFixed(2)} € — créé, coût INCONNU (dose à peser)`)
console.log(`   « Pinte Picon » ${PINTE_PICON.toFixed(2)} € — coût dérivé ${coutPintePicon.toFixed(4)} · marge ${(htPic-coutPintePicon).toFixed(2)} € · food cost ${(coutPintePicon/htPic*100).toFixed(0)} %`)
console.log(`      (repère : Pinte pression ${(Number(pinte.cout_achat_ht)/(5.20/1.2)*100).toFixed(0)} %)`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── la caisse d'abord ─────────────────────────────────────────────────
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
if (plats.length < 100) throw new Error(`catalogue à ${plats.length} plats — lecture ratée`)
const parZ = new Map(plats.map(p => [Number(p.id), p]))
const tags = (await zl('catalog/tags?limit=0')).tags ?? []
const idTag = new Map(tags.map(t => [t.name, Number(t.id)]))

const liens = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=in.(${choco.id})&select=id,identifiant_externe`)
const pc = parZ.get(Number(liens[0].identifiant_externe))
if (!pc || pc.name == null || pc.tax == null) throw new Error('chocolat chaud : plat ou champ absent côté caisse — refus')
const tgC = (pc.tags ?? []).map(x => Number(typeof x === 'object' ? x?.id : x)).filter(Number.isFinite)
await zl('catalog/dishes', { method: 'POST', body: JSON.stringify([{
  id: Number(pc.id), name: 'Chocolat chaud petit', price: cts(PETIT), price_togo: cts(PETIT), tax: pc.tax,
  ...(pc.tax_takeaway != null ? { tax_takeaway: pc.tax_takeaway } : {}),
  ...(tgC.length ? { tags: tgC } : {}), ...(pc.image ? { image: pc.image } : {}) }]) })
console.log('\n   ✓ caisse : renommé « Chocolat chaud petit »')
await sb(`recettes?id=eq.${choco.id}`, { method: 'PATCH', body: JSON.stringify({
  nom: 'Chocolat chaud petit', nom_caisse: 'Chocolat chaud petit',
  prix_vente_ht: Number(htP.toFixed(4)) }) })
await sb(`correspondances_catalogue?id=eq.${liens[0].id}`, { method: 'PATCH',
  body: JSON.stringify({ libelle_externe: 'Chocolat chaud petit' }) })
console.log('   ✓ base : petit à ' + PETIT.toFixed(2) + ' €')

// ── les deux créations ────────────────────────────────────────────────
const { id: _a, created_at: _b, updated_at: _c2, ...baseC } = choco
const { id: _d, created_at: _e, updated_at: _f, ...baseP } = picon
const neufs = [
  { nom: 'Chocolat chaud grand', base: baseC, ttc: GRAND, cout: null, cat: choco.categorie },
  { nom: 'Pinte Picon',          base: baseP, ttc: PINTE_PICON, cout: coutPintePicon, cat: picon.categorie,
    // Un Picon bière n'a pas de matière (composite bière + Picon) : la pinte
    // non plus, par cohérence avec son frère.
    upa: 1 },
]
const crees = []
for (const n of neufs) {
  const [dj] = await sb(`recettes?nom=eq.${encodeURIComponent(n.nom)}&select=id`)
  if (dj) { console.log(`   = « ${n.nom} » existe déjà`); continue }
  const [c] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
    ...n.base, id: crypto.randomUUID(), nom: n.nom, nom_caisse: n.nom,
    prix_vente_ht: Number((n.ttc / (1 + Number(n.base.tva) / 100)).toFixed(4)),
    cout_achat_ht: n.cout,
    ...(n.upa ? { unites_par_achat: n.upa } : {}),
    // ⚠️ jamais le libellé d'achat du gabarit : un scan écrirait son prix ici
    libelle_achat: null, reference_fournisseur: null,
    image_url: null, actif: true,
  }]) })
  crees.push({ ...n, id: c.id })
  console.log(`   ✓ base : « ${n.nom} » ${n.ttc.toFixed(2)} € (${c.id})`)
}
if (crees.length) {
  const corps = crees.map(c => {
    const tag = idTag.get(c.cat)
    if (!tag) throw new Error(`famille « ${c.cat} » inconnue de la caisse`)
    // ⚠️⚠️ LA TVA SUR PLACE SUIT LA LOI, ET L'ALCOOL EST À 20 % DANS LES
    // DEUX MODES. Une première version écrivait `tax: 1000` pour tout —
    // recopié du script des desserts, juste pour une denrée, FAUX pour une
    // bière : c'est une SOUS-COLLECTE, la seule erreur de TVA qui ne se
    // rattrape pas. Attrapé par verifier-carte-zelty, avant toute vente.
    const taxSurPlace = c.base.contient_alcool ? 2000 : 1000
    return { remote_id: c.id, name: c.nom, price: cts(c.ttc), price_togo: cts(c.ttc),
             tax: taxSurPlace, tax_takeaway: Number(c.base.tva) * 100, tags: [tag] }
  })
  await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
  const ap = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
  for (const c of corps) {
    const v = ap.find(x => String(x.remote_id) === String(c.remote_id))
    if (!v) { console.log(`   ⚠ ${c.name} : aucun identifiant rendu — relancer`); continue }
    await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{
      systeme: 'zelty', identifiant_externe: String(v.id), recette_id: c.remote_id, libelle_externe: c.name }]) })
    console.log(`   ✓ caisse : ${c.name} #${v.id}, famille [${(v.tags ?? []).join(', ')}]`)
  }
}
console.log('\n✅ Terminé.\n')
