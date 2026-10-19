// L'ARDOISE DU 19 AU 25 OCTOBRE 2026.
//
// Demande du gérant. Celle du 12-18 est périmée depuis hier, donc le réassort
// est retombé sur son repli — `stock_cible`, dimensionné sur la carte ENTIÈRE,
// soit le scénario le plus coûteux en reliquat (231 €/sem contre 133 €).
//
// ⚠️⚠️ POSER UNE ARDOISE MAL FAITE EST PIRE QUE PAS D'ARDOISE.
// `cibleMatiere()` met à ZÉRO toute matière de la Restauration absente de
// l'ardoise. Une ardoise amputée ne ferait donc pas « commander un peu
// moins » : elle ferait **cesser de commander** ce qui n'y figure pas, en
// silence. D'où la mesure avant/après plutôt qu'un simple insert.
//
// ⚠️ MÊME CONTRAT QUE `poserArdoise()` de `/admin/ardoise`, reproduit à la
// lettre : on REMPLACE les lignes de la semaine (`date_debut = debut` ET
// `date_fin = fin`), et on ne touche JAMAIS les lignes d'un JOUR précis
// (`date_debut = date_fin`) — ce sont les plats du jour, l'autre geste.
// La composition part AVANT la ligne : `on delete cascade` s'en chargerait,
// mais une suppression qui dépend d'une cascade est une suppression qu'on ne
// voit pas dans le code.
//
// ⚠️ LES 3 « Plat du jour » NE SONT PAS DANS L'ARDOISE HEBDO. Ce sont les
// SUPPORTS de caisse : leur composition est attachée à l'OCCURRENCE du jour
// (`plat_du_jour_ingredients`, 0167), pas au produit. Les mettre ici les
// ferait compter comme sept plats servis toute la semaine.
//
// ⚠️ LE MENU ENFANT EST ÉCARTÉ, et c'est documenté : il est PERMANENT (15/10),
// et `portionsSemaine()` répartit les portions UNIFORMÉMENT — l'ajouter
// fausserait le volume de tous les autres plats. Conséquence connue : son
// sirop tombe à zéro au réassort (~1 €), les trois autres matières étant
// couvertes par les plats de l'ardoise.
//
// ⚠️ SEPT PLATS ACTIFS N'ONT AUCUNE FICHE — American burger, Tortellini,
// Saint-Félicien, Grande salade italienne et les trois Plat du jour. Ils
// entrent dans l'ardoise parce qu'ils sont RÉELLEMENT SERVIS, mais ils ne
// pèsent rien au réassort : `recette_ingredients` est vide, donc aucune
// matière ne leur est imputée. C'est le chantier qui reste, et le script le
// DIT plutôt que de le laisser découvrir à la livraison.
//
//   node scripts/poser-ardoise-1910.mjs [--ecrire]
import fs from 'node:fs'

const DEBUT = '2026-10-19'   // lundi
const FIN   = '2026-10-25'   // dimanche
const ECRIRE = process.argv.includes('--ecrire')

// Les familles qui tournent à l'ardoise. `Menu` en est exclue (permanent).
const FAMILLES = ['Pizzeria', 'Burger', 'Plat', 'Grande salade', 'Planche']
// Supports de caisse, jamais à l'ardoise hebdo.
const SUPPORTS = ['Plat du jour 12,90 €', 'Plat du jour 13,90 €', 'Plat du jour 14,90 €']

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
      // ⚠️ un 4xx ne se corrigera pas en réessayant (leçon du PGRST204, 19/10)
      if (r.status < 500) { fatal = true; break }
    } catch (e) { der = e.cause?.code ?? e.message; console.log(`   base, tentative ${n} → ${der}`) }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(fatal ? der : `Supabase injoignable : ${der}`)
}

console.log(`\n📋 L'ardoise du ${DEBUT} au ${FIN}`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const prod = await sb(`recettes?select=id,nom,categorie,prix_vente_ht,tva,recette_ingredients(ingredient_id)&actif=eq.true&categorie=in.(${FAMILLES.map(f => JSON.stringify(f)).join(',')})&order=categorie,nom`)
const retenus = prod.filter(p => !SUPPORTS.includes(p.nom))
const ecartes = prod.filter(p => SUPPORTS.includes(p.nom))

// ── ce que l'ardoise va piloter ──────────────────────────────────────
const matieres = new Set()
let sansFiche = []
for (const p of retenus) {
  const ing = p.recette_ingredients ?? []
  if (!ing.length) sansFiche.push(p.nom)
  for (const i of ing) matieres.add(i.ingredient_id)
}
let fam = ''
for (const p of retenus) {
  if (p.categorie !== fam) { fam = p.categorie; console.log(`  ── ${fam} ──`) }
  const n = (p.recette_ingredients ?? []).length
  console.log(`   ${n ? '✓' : '✗'} ${p.nom.padEnd(28)} ${(p.prix_vente_ht * (1 + p.tva / 100)).toFixed(2)} €  ${n ? n + ' ingrédients' : 'AUCUNE fiche — ne pèse rien au réassort'}`)
}
console.log(`\n   ${retenus.length} plats à l'ardoise · ${retenus.length - sansFiche.length} avec fiche · ${sansFiche.length} sans`)
console.log(`   ${matieres.size} matières distinctes seront considérées comme SERVIES`)
console.log(`   écartés (supports de caisse) : ${ecartes.map(p => p.nom).join(', ') || '—'}`)
console.log(`   écarté (permanent)           : Menu enfant`)

// ── les matières de la restauration qui tomberont à ZÉRO ─────────────
const tous = await sb('recette_ingredients?select=ingredient_id,recettes!inner(actif,categorie,etablissement_id)&recettes.actif=eq.true')
const etResto = new Set()
const matResto = new Set()
for (const l of tous) {
  const c = l.recettes?.categorie
  if (!FAMILLES.includes(c) && c !== 'Menu') continue
  matResto.add(l.ingredient_id)
  if (l.recettes?.etablissement_id) etResto.add(l.recettes.etablissement_id)
}
const aZero = [...matResto].filter(m => !matieres.has(m))
if (aZero.length) {
  const noms = await sb(`ingredients?select=nom,stocke,stock_cible&id=in.(${aZero.join(',')})`)
  const suivies = noms.filter(n => n.stocke)
  console.log(`\n   ⚠ ${aZero.length} matière(s) de la restauration PAS servie(s) cette semaine → cible 0`)
  if (suivies.length) console.log(`     dont ${suivies.length} suivie(s) au stock : ${suivies.map(n => n.nom).join(', ')}`)
}

// ── l'ardoise actuellement posée sur cette semaine ───────────────────
const deja = await sb(`plats_du_jour?select=id,recette_id,titre&date_debut=eq.${DEBUT}&date_fin=eq.${FIN}`)
console.log(`\n   lignes déjà posées sur cette semaine : ${deja.length}`)
const jours = await sb(`plats_du_jour?select=date_debut,titre&date_debut=gte.${DEBUT}&date_debut=lte.${FIN}&date_debut=eq.date_fin`)
  .catch(() => null)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. remplacer : la composition d'abord, puis les lignes ───────────
if (deja.length) {
  const ids = deja.map(d => d.id)
  await sb(`plat_du_jour_ingredients?plat_du_jour_id=in.(${ids.join(',')})`, { method: 'DELETE' })
  await sb(`plats_du_jour?id=in.(${ids.join(',')})`, { method: 'DELETE' })
  console.log(`\n   ✓ ${ids.length} ancienne(s) ligne(s) de cette semaine retirée(s)`)
}
const pose = await sb('plats_du_jour', { method: 'POST', body: JSON.stringify(
  retenus.map((p, i) => ({ recette_id: p.id, date_debut: DEBUT, date_fin: FIN, ordre: i, actif: true }))) })
console.log(`   ✓ ${pose.length} plats posés du ${DEBUT} au ${FIN}`)

// ── 2. relecture ─────────────────────────────────────────────────────
const relu = await sb(`plats_du_jour?select=recette_id,actif,recettes(nom)&date_debut=eq.${DEBUT}&date_fin=eq.${FIN}&order=ordre`)
console.log(`\n   relu : ${relu.length} ligne(s), ${relu.filter(r => r.actif).length} active(s)`)
const manquants = retenus.filter(p => !relu.some(r => r.recette_id === p.id))
if (manquants.length) { console.log(`   ✗ absents après écriture : ${manquants.map(p => p.nom).join(', ')}`); process.exit(1) }
// ⚠️ les plats du jour d'un JOUR précis ne doivent pas avoir bougé
const apresJours = await sb(`plats_du_jour?select=date_debut,titre&titre=not.is.null&order=date_debut.desc&limit=10`)
console.log(`   plats du jour (lignes d'un seul jour) intacts : ${apresJours.length} en base, le plus récent ${apresJours[0]?.date_debut ?? '—'}`)
console.log('\n✅ Ardoise posée.\n')
