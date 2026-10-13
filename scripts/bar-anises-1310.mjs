// Les anisés de couleur sur base RICARD, et le Martini blanc gommé (13/10/2026).
//
// Demande du gérant : « ajoute mauresque ricard au lieu de pastis, perroquet,
// tomate, martini blanc gommé ».
//
// ⚠️ « Pastis 2 cl » EST DÉJÀ DU RICARD : sa matière est « Ricard 1 L », posée
// par `couts-france-boissons.mjs`. Le produit était donc mal nommé, et il
// voisinait « Pastis 51 2 cl » au MÊME prix — deux boutons « Pastis » à
// 2,50 € sur le même écran, qu'aucun serveur ne peut départager. Renommé
// « Ricard 2 cl » : au comptoir on commande un Ricard ou un 51, jamais « un
// pastis ».
//
// ⚠️ Et « Martini 4 cl » devient « Martini blanc 4 cl », par symétrie avec
// « Martini rouge 4 cl » déjà à la carte. Un nom qui ne dit pas sa couleur
// oblige à se souvenir que l'autre en porte une.
//
// ⚠️⚠️ LES COÛTS SONT DÉRIVÉS, PAS INVENTÉS. La part de sirop se LIT sur les
// coûts existants : Mauresque 0,5058 − Pastis 51 0,3755 = 0,1303 d'orgeat ;
// Tomate et Perroquet 0,4952 − 0,3755 = 0,1197. On rebase sur Ricard
// (0,3956 les 2 cl) en gardant ces parts mesurées.
//
// ⚠️⚠️ CES TROIS-LÀ ÉTAIENT ÉTEINTS PARCE QUE LES SIROPS MANQUAIENT
// (`carte-bar-selon-panier.mjs` : « orgeat manquant », « menthe manquante »,
// « grenadine manquante »). Le gérant les demande, donc il a ou commande les
// sirops — mais l'ORGEAT n'est dans AUCUN catalogue fournisseur des 4 888
// références, contrairement à la menthe et la grenadine Teisseire (4,98 €/L).
// Le réassort ne saura donc pas le commander : c'est DIT, pas masqué.
//
//   node scripts/bar-anises-1310.mjs [--ecrire]
import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

// Coûts mesurés, relus en base avant de dériver — rien n'est recopié de tête.
const PART_SIROP = { Mauresque: 0.1303, Tomate: 0.1197, Perroquet: 0.1197 }
const GOMME = 0.0498   // 1 cl de sirop Teisseire à 4,98 €/L

const RENOMMAGES = [
  ['Pastis 2 cl',  'Ricard 2 cl',       'sa matière EST « Ricard 1 L » ; deux « Pastis » à 2,50 € étaient indépartageables'],
  ['Martini 4 cl', 'Martini blanc 4 cl', 'symétrie avec « Martini rouge 4 cl »'],
]
const REVEILS = ['Mauresque', 'Tomate', 'Perroquet']
const CREATION = { nom: 'Martini blanc gommé 4 cl', gabarit: 'Martini 4 cl', ttc: 3.00 }

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
  if (!r.ok) throw new Error(`Supabase ${r.status} :: ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const zl = async (p, o = {}) => {
  let d = { s: 0, b: {} }
  for (let n = 1; n <= 4; n++) {
    await new Promise(s => setTimeout(s, 1200))
    const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
      headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                 'Content-Type': 'application/json', ...(o.headers || {}) } })
    d = { s: r.status, b: await r.json().catch(() => ({})) }
    if (r.s === 200 || d.s === 200) return d
    console.log(`   tentative ${n} sur ${p} → HTTP ${d.s}`)
    if (d.s !== 429 && d.s < 500) return d
    await new Promise(s => setTimeout(s, 4000 * n))
  }
  return d
}
const ttcDe = r => Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100)

console.log(`\n🍹 Anisés de couleur + Martini gommé${ECRIRE ? ' — ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)

// ── socle : le Ricard et le Pastis 51 ─────────────────────────────────
const noms = [...RENOMMAGES.map(r => r[0]), ...REVEILS, 'Pastis 51 2 cl', 'Martini rouge 4 cl']
const prods = await sb(`recettes?nom=in.(${noms.map(n => `"${n}"`).join(',')})&select=id,nom,categorie,actif,prix_vente_ht,tva,cout_achat_ht,nom_matiere,unites_par_achat,etablissement_id,tag_destination,contient_alcool,prix_sur_place_ttc`)
const par = new Map(prods.map(r => [r.nom, r]))
const ricard = par.get('Pastis 2 cl'), p51 = par.get('Pastis 51 2 cl')
if (!ricard || !p51) throw new Error('Ricard (« Pastis 2 cl ») ou Pastis 51 introuvable')
const coutRicard = Number(ricard.cout_achat_ht)
const coutP51 = Number(p51.cout_achat_ht)
console.log(`   base Ricard 2 cl : ${coutRicard.toFixed(4)} € · Pastis 51 2 cl : ${coutP51.toFixed(4)} €`)

// ⚠️ On CONTRÔLE la part de sirop au lieu de la croire : elle doit retomber
// sur l'écart mesuré en base. Un coût de départ qui aurait bougé invaliderait
// la dérivation sans rien dire.
for (const n of REVEILS) {
  const r = par.get(n); if (!r) throw new Error(`« ${n} » introuvable`)
  const part = Number((Number(r.cout_achat_ht) - coutP51).toFixed(4))
  if (Math.abs(part - PART_SIROP[n]) > 0.0002)
    throw new Error(`part de sirop de « ${n} » : ${part} en base, ${PART_SIROP[n]} attendu — dérivation invalide`)
}
console.log('   ✓ parts de sirop confirmées contre la base')

console.log('\n   ── renommages ──')
for (const [av, ap, pq] of RENOMMAGES) {
  const r = par.get(av)
  if (!r) { console.log(`   ⚠ « ${av} » introuvable — ignoré`); continue }
  console.log(`   ${av} → « ${ap} » (${pq})`)
}
console.log('\n   ── réveils, rebasés sur Ricard ──')
for (const n of REVEILS) {
  const r = par.get(n)
  const nouveau = Number((coutRicard + PART_SIROP[n]).toFixed(4))
  const t = ttcDe(r), fc = nouveau / (t / (1 + Number(r.tva) / 100)) * 100
  console.log(`   ${n.padEnd(12)} ${t.toFixed(2)} € · coût ${Number(r.cout_achat_ht).toFixed(4)} → ${nouveau.toFixed(4)} · food cost ${fc.toFixed(0)} %`)
}
const mb = par.get('Martini 4 cl')
const coutGomme = Number((Number(mb.cout_achat_ht) + GOMME).toFixed(4))
console.log(`\n   ── création ──\n   ${CREATION.nom} ${CREATION.ttc.toFixed(2)} € · coût ${coutGomme.toFixed(4)} (Martini ${Number(mb.cout_achat_ht).toFixed(4)} + 1 cl de gomme)`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── la caisse d'abord pour les renommages (si elle refuse, rien n'est désynchronisé)
const cat = await zl('catalog/dishes?show_all=true&limit=0')
const plats = cat.b.dishes ?? []
if (plats.length < 100) throw new Error(`catalogue à ${plats.length} plats — lecture ratée`)
const liens = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=in.(${prods.map(r => r.id).join(',')})&select=id,recette_id,identifiant_externe`)
const zidDe = new Map(liens.map(l => [l.recette_id, Number(l.identifiant_externe)]))
const parZid = new Map(plats.map(p => [Number(p.id), p]))

const majZ = [], suite = []
for (const [av, ap] of RENOMMAGES) {
  const r = par.get(av); if (!r) continue
  const p = parZid.get(zidDe.get(r.id))
  if (!p) { console.log(`   ⚠ « ${av} » sans plat en caisse — renommage sauté`); continue }
  if (p.price == null || p.tax == null) throw new Error(`« ${av} » : prix ou TVA absent côté caisse — refus`)
  majZ.push({ id: Number(p.id), name: ap, price: p.price, tax: p.tax })
  suite.push({ r, ap, lien: liens.find(l => l.recette_id === r.id) })
}
if (majZ.length) {
  const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(majZ) })
  if (rep.s !== 200) throw new Error(`renommage caisse : ${rep.s} ${JSON.stringify(rep.b).slice(0, 220)}`)
  console.log(`   ✓ caisse : ${majZ.length} renommage(s)`)
}
for (const { r, ap, lien } of suite) {
  await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ nom: ap, nom_caisse: ap }) })
  if (lien) await sb(`correspondances_catalogue?id=eq.${lien.id}`, { method: 'PATCH', body: JSON.stringify({ libelle_externe: ap }) })
  console.log(`   ✓ base : « ${r.nom} » → « ${ap} »`)
}

// ── les réveils : LA CAISSE D'ABORD ───────────────────────────────────
// ⚠️⚠️ DÉFAUT VÉCU LE 13/10/2026 : ce script rallumait en BASE puis en caisse,
// et il a planté entre les deux (sur la création). Les trois produits sont
// restés actifs chez nous et désactivés en caisse — le miroir du catalogue a
// relu « produit inactif » et les a RE-ÉTEINTS chez nous, en silence. C'est la
// boucle que la 0141 décrit, par l'autre bout.
// La caisse passe donc en premier : si elle refuse, rien n'est désynchronisé.
{
  const liensR = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=in.(${REVEILS.map(n => par.get(n).id).join(',')})&select=recette_id,identifiant_externe`)
  const zr = new Map(liensR.map(l => [l.recette_id, Number(l.identifiant_externe)]))
  const corps = []
  for (const n of REVEILS) {
    const p = parZid.get(zr.get(par.get(n).id))
    if (!p) { console.log(`   ⚠ ${n} : aucun plat en caisse`); continue }
    if (p.name == null || p.price == null || p.tax == null)
      throw new Error(`${n} : champ obligatoire absent côté caisse — refus de construire`)
    const tg = (p.tags ?? []).map(x => Number(typeof x === 'object' ? x?.id : x)).filter(Number.isFinite)
    const op = (p.options ?? []).map(x => Number(typeof x === 'object' ? x?.id : x)).filter(Number.isFinite)
    corps.push({ id: Number(p.id), name: p.name, price: p.price, tax: p.tax, disable: false,
      ...(tg.length ? { tags: tg } : {}), ...(op.length ? { options: op } : {}) })
  }
  if (corps.length) {
    const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
    if (rep.s !== 200) throw new Error(`rallumage caisse : ${rep.s} — base NON touchée`)
    console.log(`   ✓ caisse : ${corps.length} rallumage(s)`)
  }
}
for (const n of REVEILS) {
  const r = par.get(n)
  await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({
    actif: true, cout_achat_ht: Number((coutRicard + PART_SIROP[n]).toFixed(4)) }) })
  console.log(`   ✓ base : ${n} actif, coût rebasé sur Ricard`)
}

// ── le Martini gommé ─────────────────────────────────────────────────
const [deja] = await sb(`recettes?nom=eq.${encodeURIComponent(CREATION.nom)}&select=id`)
let idG = deja?.id
if (!idG) {
  const ht = CREATION.ttc / (1 + Number(mb.tva) / 100)
  const [c] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
    id: crypto.randomUUID(), nom: CREATION.nom, nom_caisse: CREATION.nom,
    categorie: mb.categorie, tag_destination: mb.tag_destination,
    etablissement_id: mb.etablissement_id,
    prix_vente_ht: Number(ht.toFixed(4)), prix_sur_place_ttc: null,
    tva: mb.tva, contient_alcool: true,
    vendable_online: false,                 // l'alcool n'est JAMAIS en ligne (0144)
    cout_achat_ht: coutGomme,
    nom_matiere: null, unites_par_achat: null,  // composite : deux matières
    image_url: null, actif: true, type_revenu: 'vente',
    allergenes_complementaires: ['sulfites'],   // vermouth, comme le Martini
  }]) })
  idG = c.id
  console.log(`   ✓ base : « ${CREATION.nom} » créé ${idG}`)
} else console.log(`   = « ${CREATION.nom} » existait déjà`)

// ── pousser la création en caisse ─────────────────────────────────────
const apres = await sb(`recettes?nom=in.(${[...REVEILS, CREATION.nom].map(n => `"${n}"`).join(',')})&select=id,nom,prix_vente_ht,tva`)
const liens2 = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=in.(${apres.map(r => r.id).join(',')})&select=recette_id,identifiant_externe`)
const z2 = new Map(liens2.map(l => [l.recette_id, Number(l.identifiant_externe)]))
const aPousser = [], aCreer = []
for (const r of apres) {
  const zid = z2.get(r.id)
  const ttc = Math.round(Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100) * 100)
  if (zid && parZid.get(zid)) {
    const p = parZid.get(zid)
    if (p.price == null || p.tax == null) { console.log(`   ⚠ ${r.nom} : champ obligatoire absent — sauté`); continue }
    aPousser.push({ id: Number(p.id), name: p.name, price: p.price, tax: p.tax, disable: false })
  } else if (!zid) {
    aCreer.push({ remote_id: r.id, name: r.nom, price: ttc, price_togo: ttc,
                  tax: Number(r.tva) * 100, tax_takeaway: Number(r.tva) * 100 })
  }
}
if (aPousser.length) {
  const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(aPousser) })
  console.log(`   ${rep.s === 200 ? '✓' : '✗'} caisse : ${aPousser.length} rallumage(s) → HTTP ${rep.s}`)
}
if (aCreer.length) {
  const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(aCreer) })
  if (rep.s !== 200) throw new Error(`création caisse : ${rep.s} ${JSON.stringify(rep.b).slice(0, 220)}`)
  const ap2 = (await zl('catalog/dishes?show_all=true&limit=0')).b.dishes ?? []
  for (const c of aCreer) {
    const cree = ap2.find(x => String(x.remote_id) === String(c.remote_id))
    if (!cree) { console.log(`   ⚠ ${c.name} : aucun identifiant rendu — lien NON posé, relancer`); continue }
    await sb('correspondances_catalogue', { method: 'POST', body: JSON.stringify([{
      systeme: 'zelty', identifiant_externe: String(cree.id), recette_id: c.remote_id, libelle_externe: c.name }]) })
    console.log(`   ✓ caisse : « ${c.name} » créé #${cree.id}, lien enregistré`)
  }
}
console.log('\n✅ Terminé.\n')
