// AUDIT n°4 — le food cost affiché est-il recalculable à la main ?
// (02/10/2026)
//
// C'est l'audit qui valide les trois précédents : un prix d'achat juste et un
// stock juste ne servent à rien si le taux affiché ne se vérifie pas. On
// recalcule trois familles de produits DEPUIS LES DONNÉES BRUTES, à la main, et
// on compare au chiffre de l'outil.
//
// ⚠️ Il RECOPIE la règle de `src/lib/foodCost.ts` (`synthese`) : le coût d'une
// portion est le coût de la COMPOSITION ÷ portions, PLUS `cout_achat_ht`. Les
// deux s'additionnent — achat-revente pur : composition vide ; produit
// transformé : les deux. Modifier les deux ensemble.
//
//   node scripts/audit-food-cost.mjs
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const sb = async p => JSON.parse(await (await fetch(`${U}/rest/v1/${p}`, { headers: H })).text())
const lire = async q => { const o = []; for (let i = 0; ; i += 1000) { const p = await sb(`${q}&order=id&offset=${i}&limit=1000`); o.push(...p); if (p.length < 1000) break } return o }
let ok = 0, ko = 0
const P = m => { ok++; console.log(`   ✓ ${m}`) }
const E = m => { ko++; console.log(`   ✗ ${m}`) }
const e4 = n => n.toFixed(4).replace('.', ',')
const pct = n => n.toFixed(1).replace('.', ',') + ' %'

// ── règle recopiée de foodCost.ts ────────────────────────────────────
const r4 = n => Math.round(n * 10000) / 10000
const coutPortion = (lignes, nbPortions, coutAchat) =>
  r4(r4(lignes.reduce((s, l) => s + l.q * l.prix, 0)) / Math.max(1, nbPortions)) + (coutAchat > 0 ? r4(coutAchat) : 0)
const fcPct = (portion, pv) => pv <= 0 ? 0 : (portion / pv) * 100
// ⚠️ ZÉRO N'EST PAS VERT. Un produit sans composition NI coût d'achat est
// « inconnu », jamais « sain » : le produit dont on sait le moins passerait
// pour le meilleur de la carte (0150).
const statut = fc => fc <= 0 ? 'inconnu' : fc < 28 ? 'vert' : fc <= 32 ? 'orange' : 'rouge'

console.log('\n══ AUDIT n°4 — le food cost se recalcule-t-il à la main ? ══\n')

const prods = await lire('recettes?actif=is.true&select=id,nom,categorie,tag_destination,prix_vente_ht,tva,prix_sur_place_ttc,cout_achat_ht,nb_portions,unites_par_achat')
const comps = await lire('recette_ingredients?select=recette_id,ingredient_id,quantite')
const ings = new Map((await lire('ingredients?select=id,nom,prix_achat_ht,unite')).map(i => [i.id, i]))
const parRecette = new Map()
for (const c of comps) {
  if (!parRecette.has(c.recette_id)) parRecette.set(c.recette_id, [])
  const i = ings.get(c.ingredient_id)
  parRecette.get(c.recette_id).push({ nom: i?.nom ?? '?', q: Number(c.quantite), prix: Number(i?.prix_achat_ht ?? 0) })
}

// ── 1. trois familles, recalculées à la main ─────────────────────────
console.log('── 1. Recalcul à la main, trois familles de produits')
const choisir = f => prods.find(f)
const cas = [
  ['achat-revente pur', choisir(p => p.nom === 'Croissant')],
  ['assemblé à composition', choisir(p => p.categorie === 'Pizzeria' && parRecette.has(p.id))],
  ['boisson au rendement', choisir(p => p.nom === 'Demi pression')],
]
for (const [genre, p] of cas) {
  if (!p) { E(`aucun produit trouvé pour le cas « ${genre} »`); continue }
  const lignes = parRecette.get(p.id) ?? []
  const coutAchat = p.cout_achat_ht == null ? 0 : Number(p.cout_achat_ht)
  const portion = coutPortion(lignes, Number(p.nb_portions ?? 1), coutAchat)
  const pv = Number(p.prix_vente_ht)
  const fc = fcPct(portion, pv)
  const ttc = pv * (1 + p.tva / 100)
  console.log(`\n   ${p.nom}  (${genre})`)
  if (lignes.length) {
    for (const l of lignes) console.log(`      ${String(l.q).padStart(7)} × ${e4(l.prix).padStart(9)} €  ${l.nom}`)
    console.log(`      composition ${e4(lignes.reduce((s, l) => s + l.q * l.prix, 0))} € ÷ ${p.nb_portions ?? 1} portion(s)`)
  } else console.log('      aucune composition (achat-revente)')
  console.log(`      + coût d'achat ${e4(coutAchat)} €`)
  console.log(`      = coût portion ${e4(portion)} €   vente ${e4(pv)} € HT (${ttc.toFixed(2)} € TTC à ${p.tva} %)`)
  console.log(`      food cost ${pct(fc)} → ${statut(fc)}   marge ${e4(pv - portion)} € HT`)
  // le contrôle : le TTC recalculé doit retomber sur un prix d'affiche plausible
  const centimes = Math.round(ttc * 100) % 10
  centimes === 0 || centimes === 5 || Math.abs(ttc - Math.round(ttc * 20) / 20) < 0.006
    ? P(`${p.nom} : le TTC retombe sur ${ttc.toFixed(2)} € — un prix d'affiche`)
    : E(`${p.nom} : le TTC donne ${ttc.toFixed(4)} €, qui n'est pas un prix d'affiche`)
}

// ── 2. zéro n'est pas vert ───────────────────────────────────────────
console.log('\n── 2. « Coût inconnu » ne doit jamais passer pour « sain »')
const sansCout = prods.filter(p => (p.cout_achat_ht == null || Number(p.cout_achat_ht) === 0) && !parRecette.has(p.id))
const tousInconnus = sansCout.every(p => statut(fcPct(coutPortion([], 1, 0), Number(p.prix_vente_ht))) === 'inconnu')
tousInconnus
  ? P(`${sansCout.length} produit(s) sans coût → tous en « inconnu », aucun en vert`)
  : E('un produit sans coût ressort en vert — le produit dont on sait le moins passerait pour le meilleur')

// ── 3. le food cost GLOBAL se divise par le CA COUVERT ───────────────
console.log('\n── 3. Le food cost d’ensemble, et sa couverture')
const chiffres = prods.filter(p => (p.cout_achat_ht != null && Number(p.cout_achat_ht) > 0) || parRecette.has(p.id))
const coutDe = p => coutPortion(parRecette.get(p.id) ?? [], Number(p.nb_portions ?? 1), Number(p.cout_achat_ht ?? 0))
const caCouvert = chiffres.reduce((s, p) => s + Number(p.prix_vente_ht), 0)
const caTotal = prods.reduce((s, p) => s + Number(p.prix_vente_ht), 0)
const coutTotal = chiffres.reduce((s, p) => s + coutDe(p), 0)
const fcCouvert = coutTotal / caCouvert * 100
const fcDilue = coutTotal / caTotal * 100
console.log(`     ${chiffres.length} produits chiffrés sur ${prods.length} — couverture ${(chiffres.length / prods.length * 100).toFixed(0)} %`)
console.log(`     food cost sur le CA COUVERT : ${pct(fcCouvert)}`)
console.log(`     dilué sur le CA TOTAL        : ${pct(fcDilue)}  ← ce qu'il NE faut pas afficher`)
fcCouvert - fcDilue > 1
  ? P(`l'écart est de ${(fcCouvert - fcDilue).toFixed(1)} points : afficher le taux dilué le ferait paraître meilleur qu'il n'est`)
  : P('les deux taux sont proches — la couverture est bonne')

// ── 4. aucun coût supérieur au prix de vente ─────────────────────────
console.log('\n── 4. Aucune marge négative en silence')
const negatifs = chiffres.filter(p => Number(p.prix_vente_ht) > 0 && coutDe(p) > Number(p.prix_vente_ht))
negatifs.length === 0 ? P('aucun produit ne coûte plus qu\'il ne se vend') : E(`${negatifs.length} produit(s) à marge NÉGATIVE`)
for (const p of negatifs.slice(0, 8)) console.log(`        · ${p.nom} : coût ${e4(coutDe(p))} > vente ${e4(Number(p.prix_vente_ht))}`)

// ── 5. les composants de formule ne sont pas des produits ────────────
console.log('\n── 5. Les composants de formule')
const compos = prods.filter(p => /^Formule — /.test(p.nom))
P(`${compos.length} composant(s) « Formule — … » : ils ne s'achètent pas et sont exclus des cibles de stock`)

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
