// Les bouteilles partent AVEC leurs softs, inclus dans le prix — et en
// BOUTEILLES d'un litre, pas en verres consignés. Décision du gérant,
// 02/10/2026.
//
// ⚠️⚠️ NOUS N'AVONS AUCUN SOFT EN GRAND FORMAT, ni à la carte ni au catalogue
// d'aucun des huit fournisseurs : tout est en 25 et 33 cl. Les bouteilles
// d'accompagnement sont donc à acheter — c'est précisément le rayon que DVB
// doit chiffrer, et celui qu'Euro-Cash a renvoyé vide.
//
// ⚠️ Le coût retenu est donc un MAJORANT, pas une mesure : deux litres
// facturés au tarif du 25 cl en verre consigné (le plus cher de la carte).
// Le litre en PET revient en pratique à trois ou quatre fois moins. Entre
// surestimer et sous-estimer, on surestime : un coût trop haut fait fixer un
// prix prudent, un coût trop bas fait vendre à perte. Et la conclusion ne
// bouge pas — à 69 €, la bouteille tient dans les deux lectures.
//
// ⚠️ INCLURE LES SOFTS AMÉLIORE LA MARGE, à condition d'ajuster le prix. Six
// softs valent 18 € à la carte et coûtent 6,77 € : facturés +10 €, ils
// rapportent 3,23 € de plus par bouteille ET font monter ce que le client
// économise de 33 % à 35 %. Les offrir au même prix aurait fait l'inverse —
// food cost à 39 %, marge en baisse, et personne n'aurait vu la différence.
//
// ⚠️ LE COÛT EST CELUI DU SOFT LE PLUS CHER (Coca 25 cl, 1,128 €), pas d'une
// moyenne : le client choisit, et une moyenne sous-estime le jour où il prend
// six Coca. Même règle que le composant de formule chiffré sur le croissant
// courbé — on retient le pire des cas possibles.
//
// ⚠️ TVA 20 % SUR L'ENSEMBLE, alors que les softs seuls sont à 10 %. C'est un
// panier mixte et `recettes.tva` ne porte qu'un taux ; on retient le HAUT,
// comme les formules petit-déjeuner (sur-collecter est rattrapable,
// sous-collecter ne l'est pas). Coût du choix : environ 1,50 € par bouteille.
//
//   node scripts/bouteilles-avec-softs.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')

// Deux bouteilles d'un litre. Mesuré en équivalent 25 cl faute de tarif réel.
const LITRES_SOFT = 2
const NB_SOFTS = LITRES_SOFT * 4          // équivalent 25 cl, pour le COÛT
const SOFT_TTC = 3.00                      // prix carte d'un 25 cl en salle
const NOUVEAU = { 59: 69, 79: 89 }

const [soft] = await sb('recettes?tag_destination=eq.BAR&categorie=eq.Boisson%20fra%C3%AEche&actif=eq.true&select=nom,cout_achat_ht&order=cout_achat_ht.desc&limit=1')
const COUT_SOFTS = Math.round(Number(soft.cout_achat_ht) * NB_SOFTS * 1e4) / 1e4
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — bouteilles avec ${NB_SOFTS} softs inclus ──\n`)
console.log(`  ⚠️ aucun soft en grand format en base — coût MAJORÉ sur l'équivalent 25 cl`)
console.log(`  base : ${soft.nom} à ${f2(Number(soft.cout_achat_ht))} €, le plus cher de la carte`)
console.log(`  ${LITRES_SOFT} bouteilles d'1 L ≈ ${NB_SOFTS} × 25 cl : ${f2(COUT_SOFTS)} € de coût majoré, ${f2(NB_SOFTS * SOFT_TTC)} € de valeur carte\n`)

const b = await sb('recettes?nom=like.Bouteille*&tag_destination=eq.BAR&actif=eq.true&select=id,nom,nom_caisse,prix_vente_ht,tva,cout_achat_ht,unites_par_achat,description,nom_matiere')
console.log('  bouteille                      prix      coût    food cost     marge   séparément   le client gagne')
const maj = []
for (const r of b.sort((a, z) => a.nom.localeCompare(z.nom))) {
  const ancienTtc = Math.round(Number(r.prix_vente_ht) * 1.2)
  const ttc = NOUVEAU[ancienTtc]
  if (!ttc) { console.log(`  ✗ ${r.nom} : prix ${ancienTtc} € hors grille`); continue }
  // ⚠️ Le coût de la bouteille SEULE se retrouve en retirant les softs s'ils
  // y sont déjà — sinon le script, rejoué, les compterait deux fois.
  const dejaAvecSofts = /soft/i.test(r.description ?? '')
  const coutSeul = dejaAvecSofts ? Number(r.cout_achat_ht) - COUT_SOFTS : Number(r.cout_achat_ht)
  const cout = Math.round((coutSeul + COUT_SOFTS) * 1e4) / 1e4
  const ht = Math.round(ttc / 1.2 * 1e4) / 1e4
  const doses = /Daniel/.test(r.nom) ? 17.5 : 17.5
  const verreTtc = /Daniel/.test(r.nom) ? 6.5 : 5
  const separement = doses * verreTtc + NB_SOFTS * SOFT_TTC
  console.log(`  ${r.nom.padEnd(30)}${f2(ttc).padStart(6)} € ${f2(cout).padStart(8)} € ${(cout / ht * 100).toFixed(1).replace('.', ',').padStart(8)} %  ${f2(ht - cout).padStart(7)} €  ${f2(separement).padStart(9)} €   ${('−' + Math.round((1 - ttc / separement) * 100) + ' %').padStart(6)}`)
  maj.push({ id: r.id, nom: r.nom, nom_caisse: r.nom_caisse, ttc, ht, cout,
    description: `${(r.description ?? '').replace(/\s*Servie avec.*$/, '').trim()} Servie avec ${LITRES_SOFT} bouteilles de soft d'1 L au choix.` })
}

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
for (const m of maj) await sb(`recettes?id=eq.${m.id}`, { method: 'PATCH',
  body: JSON.stringify({ prix_vente_ht: m.ht, cout_achat_ht: m.cout, description: m.description }) })
console.log(`\n  ✓ ${maj.length} bouteilles mises à jour`)

if (!Z) { console.log(''); process.exit(0) }
const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
  { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
if (plats.length < 100) { console.error(`  ✗ ${plats.length} plats lus — lecture ratée, caisse non touchée.`); process.exit(1) }
const parRemote = new Map(plats.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = []
for (const m of maj) {
  const d = parRemote.get(String(m.id)); if (!d) continue
  if (d.name == null || d.price == null || d.tax == null) { console.log(`  ✗ ${m.nom} : champ obligatoire manquant`); continue }
  const c = Math.round(m.ttc * 100)
  if (d.price === c && d.price_togo === c) continue
  corps.push({ id: d.id, name: d.name, price: c, price_togo: c, tax: d.tax, tax_takeaway: d.tax_takeaway })
}
if (corps.length) {
  const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes', { method: 'POST',
    headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  console.log(`  → caisse : HTTP ${r.status} · ${(j.dishes ?? []).length} plat(s) · errno ${j.errno}`)
}
console.log('')
