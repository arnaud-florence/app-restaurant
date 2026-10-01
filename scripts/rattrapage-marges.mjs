// Rattrapage de marge — Fournil, 28/09/2026.
//
// Le passage de la viennoiserie en gamme Signature coûte 1 055 €/an assumés.
// Le balayage complet du food cost a montré que la viennoiserie n'était pas
// l'anomalie : 43 produits du Fournil sur 65 chiffrés dépassaient 32 %, dont
// des pâtisseries à 53-76 %.
//
// ⚠️ TROIS PRIX NE BOUGENT PAS, ET C'EST LA RÈGLE DE LA MAISON : le café
// (1,40 €), la baguette classique (1,20 €) et le demi (2,80 €) sont les prix
// que le village compare. La marge se fait sur ce qu'on ne compare pas — une
// part de flan, un Paris-Brest, un jus en bouteille. C'est exactement le
// raisonnement de la grille du bar de septembre, appliqué au Fournil.
//
// ⚠️ La cible n'est PAS 32 %. Ramener mécaniquement tout au seuil donnerait un
// tiramisu à 6 € et un moelleux à 4,20 € — des prix que personne ne paie, donc
// une marge qu'on ne touche jamais. On vise 38-45 % sur l'achat-revente, en
// prix ronds et cohérents entre voisins de vitrine.
//
// ⚠️ Le bar n'est PAS dans ce script. Sa grille a été arbitrée par le gérant le
// 21/09 sur un raisonnement explicite (« rien ne doit paraître cher à côté du
// demi ») ; ses écarts sont proposés à l'écran, pas appliqués d'office.
//
//   node scripts/rattrapage-marges.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')

// Prix TTC visés. Le HT se recalcule au taux DU produit.
const GRILLE = {
  // ── Pâtisseries et gourmandises : personne n'a de point de comparaison ──
  'Moelleux au chocolat': 2.50, 'Mario': 2.80, 'Sacristain': 3.20,
  'Muffin chocolat-noisette': 3.50, 'Muffin citron': 3.50,
  'Tiramisu individuel': 3.90, 'Tartelette citron meringuée': 3.50,
  'Cookie chocolat': 2.90, 'Paris-Brest': 3.90, 'Part de flan pâtissier': 2.90,
  'Tropézienne individuelle': 2.90, 'Éclair au chocolat': 3.60,
  'Madeleine chocolat-noisette': 1.90, 'Sunroll': 1.90, 'Fusée': 1.80,
  // ── Pains SPÉCIAUX. La baguette classique reste à 1,20 : prix-repère. ──
  'Baguette Victoire': 1.50, 'Campestre multicéréales': 2.00, 'Pain restaurant': 2.10,
  'Bâtard céréales': 3.20, 'Bâtard maïs et graines': 3.20, 'Pain complet': 2.60,
  'Pavé multicéréales': 4.20, 'Pain lin-tournesol': 4.20, 'Pain aux raisins': 1.80,
  // ── Boissons à emporter. Un jus coûte 50 % de plus qu'un soda et se
  //    vendait au même prix. ──
  "Jus d'orange 33 cl": 2.20, 'Jus de pomme 33 cl': 2.20,
  'Coca-Cola 33 cl': 2.00, 'Coca-Cola Zéro 33 cl': 2.00, 'Coca-Cola Cherry 33 cl': 2.20,
  'Fanta 33 cl': 2.00, 'Orangina 33 cl': 2.00, 'Oasis 33 cl': 2.00,
  'Eau gazeuse 50 cl': 2.00,
  // ── Salades : +0,50, elles restent sous le panini le plus cher. ──
  'Salade poulet-feta': 5.20, 'Salade italienne': 5.40, 'Salade saumon': 6.00,
}

// Volumes réels, pour chiffrer le gain.
const cmds = await sb('commandes?statut=eq.encaisse&select=id,created_at&limit=1000')
const JOURS = new Set(cmds.map(c => c.created_at.slice(0, 10))).size
const ids = cmds.map(c => c.id), li = []
for (let i = 0; i < ids.length; i += 100)
  li.push(...await sb(`commande_articles?select=recette_id,quantite&commande_id=in.(${ids.slice(i, i + 100).join(',')})`))
const vol = new Map()
for (const l of li) vol.set(l.recette_id, (vol.get(l.recette_id) ?? 0) + Number(l.quantite ?? 0))

const noms = Object.keys(GRILLE)
// ⚠️ BORNÉ AU FOURNIL. Quatre pâtisseries ont une JUMELLE en salle, créée le
// 27/09 pour la carte du restaurant : même nom, `nom_caisse` « … (salle) »,
// catégorie Dessert, prix salle plus élevé et food cost déjà sain (21-28 %).
// Cibler par le NOM seul les emportait toutes les deux — et un jour où la
// jumelle serait moins chère que la cible, on lui monterait son prix sans
// que rien ne le dise.
const prods = await sb(`recettes?tag_destination=eq.FOURNIL&nom=in.(${noms.map(n => `"${n}"`).join(',')})&select=id,nom,categorie,prix_vente_ht,tva,cout_achat_ht,nb_portions,prix_sur_place_ttc`)

// `synthese()` ADDITIONNE composition et coût d'achat (0126) : les salades
// n'ont que la première, et sans elle leur food cost s'affiche « — ».
const compo = await sb('recette_ingredients?select=recette_id,quantite,ingredient:ingredients(prix_achat_ht)&limit=1000')
const cc = new Map()
for (const c of compo) cc.set(c.recette_id, (cc.get(c.recette_id) ?? 0) + Number(c.quantite ?? 0) * Number(c.ingredient?.prix_achat_ht ?? 0))
const coutDe = r => {
  const v = Number(r.cout_achat_ht ?? 0) + (cc.get(r.id) ?? 0) / Math.max(1, Number(r.nb_portions ?? 1))
  return v > 0 ? v : null
}
const absents = noms.filter(n => !prods.some(p => p.nom === n))
if (absents.length) { console.error(`  ✗ introuvables : ${absents.join(', ')}`); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — rattrapage de marge (${JOURS} jours de vente de référence) ──\n`)
console.log('  produit                          TTC → TTC    coût   FC avant → après   ventes/an     €/an')
let gainTotal = 0
const patchs = [], cibles = []
for (const p of prods.sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom))) {
  const ttc = GRILLE[p.nom], tva = Number(p.tva)
  const htAv = Number(p.prix_vente_ht), htAp = Math.round(ttc / (1 + tva / 100) * 1e4) / 1e4
  // ⚠️ Un produit déjà au bon prix dans l'outil doit QUAND MÊME être
  // synchronisé : la caisse porte DEUX prix (salle et emporter) et peut
  // diverger sur l'un sans que l'autre bouge. Sauter la caisse parce que la
  // base n'a pas changé laissait six boissons à 2,00 € en salle au lieu de
  // 2,80 — une deuxième exécution ne corrigeait rien et se disait au vert.
  const cible = { id: p.id, nom: p.nom, ht: htAp, salle: p.prix_sur_place_ttc == null ? null : Number(p.prix_sur_place_ttc) }
  cibles.push(cible)
  if (htAp <= htAv) { console.log(`  ${p.nom.slice(0, 30).padEnd(31)} — déjà au prix visé dans l'outil, caisse resynchronisée`); continue }
  const c = coutDe(p)
  const an = (vol.get(p.id) ?? 0) / JOURS * 365
  const gain = (htAp - htAv) * an
  gainTotal += gain
  patchs.push(cible)
  console.log(`  ${p.nom.slice(0, 30).padEnd(31)}${f2(htAv * (1 + tva / 100)).padStart(5)} →${f2(ttc).padStart(6)} ${(c == null ? '—' : f2(c)).padStart(7)}  ` +
    `${(c == null ? '  —' : (c / htAv * 100).toFixed(0) + '%').padStart(5)} → ${(c == null ? '  —' : (c / htAp * 100).toFixed(0) + '%').padStart(5)}   ` +
    `${(an ? String(Math.round(an)) : '—').padStart(8)} ${(gain ? f2(gain) : '—').padStart(9)}`)
}
console.log(`\n  ${patchs.length} prix · gain annuel estimé à volume constant : ${f2(gainTotal)} €`)
console.log(`  (le trou de la gamme Signature est de 1 055 €/an)`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
for (const p of patchs) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: p.ht }) })
console.log(`\n  ✓ ${patchs.length} prix écrits (le trigger 0146 trace chacun).`)

// ── Caisse ──────────────────────────────────────────────────────────
if (!Z) { console.log('  (caisse ignorée — ZELTY_API_KEY absente)\n'); process.exit(0) }
const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
  { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
if (plats.length < 100) { console.error(`  ✗ ${plats.length} plats lus — lecture ratée, la caisse n'est pas touchée.`); process.exit(1) }
const parRemote = new Map(plats.filter(d => d.remote_id).map(d => [String(d.remote_id), d]))
const corps = [], refus = []
for (const p of cibles) {
  const d = parRemote.get(String(p.id))
  if (!d) { refus.push(`${p.nom} : sans correspondance`); continue }
  // UPSERT : name, price et tax sont obligatoires et recopiés tels quels.
  if (d.name == null || d.price == null || d.tax == null) { refus.push(`${p.nom} : champ obligatoire manquant — refus`); continue }
  // ⚠️ `price` est le prix SALLE, `price_togo` celui de l'emporter, et ils
  // diffèrent pour tout ce qui se sert en verre consigné (0144) : six boissons
  // du Fournil sont à 2,80 € à table. Pousser le prix d'emporter dans `price`
  // ferait perdre 80 centimes à chaque verre servi, sans erreur visible.
  const emporter = Math.round(GRILLE[p.nom] * 100)
  const salle = p.salle == null ? emporter : Math.round(p.salle * 100)
  if (d.price === salle && d.price_togo === emporter) continue
  corps.push({ id: d.id, name: d.name, price: salle, price_togo: emporter, tax: d.tax, tax_takeaway: d.tax_takeaway })
}
if (refus.length) { console.log('\n  refusés :'); refus.forEach(l => console.log('   ' + l)) }
if (corps.length) {
  const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes',
    { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  console.log(`  → caisse : HTTP ${r.status} · ${(j.dishes ?? []).length} plats · errno ${j.errno}`)
}
console.log('')
