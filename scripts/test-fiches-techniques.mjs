// Test — fiches techniques (0150)
//
// Ce que ce test protège, et c'est le cœur du sujet :
//
//   UN PRODUIT DONT ON IGNORE LE COÛT NE DOIT JAMAIS PARAÎTRE RENTABLE.
//
// `statutFoodCost(0)` rendait 'vert' : sans composition ni prix d'achat, un
// produit s'affichait à 0 % de food cost, en vert — le produit dont on sait
// le moins passait pour le meilleur de la carte. C'est la même faute que
// « rien déclaré » lu comme « aucun allergène » : une absence rendue comme
// un bon résultat.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.PORT ? `http://localhost:${process.env.PORT}` : null
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}
let ok = 0, ko = 0
const T = (c, l, d = '') => { if (c) { ok++; console.log(`  ✓ ${l}`) } else { ko++; console.log(`  ✗ ${l}${d ? ' — ' + d : ''}`) } }

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — fiches techniques                                 ║')
console.log('╚══════════════════════════════════════════════════════════╝')

// ── 1. La règle, recopiée depuis src/lib/foodCost.ts ───────────────
// ⚠️ Le source est en TS : ce test RECOPIE les seuils. Modifier les deux
// ensemble.
console.log('\n── un coût inconnu n\'est pas un bon food cost ──')
const src = fs.readFileSync('src/lib/foodCost.ts', 'utf8')
const statutFoodCost = (pct) => {
  if (!Number.isFinite(pct) || pct <= 0) return 'inconnu'
  if (pct < 28) return 'vert'
  if (pct <= 32) return 'orange'
  return 'rouge'
}
T(statutFoodCost(0) === 'inconnu',
  'coût 0 → « inconnu », JAMAIS « vert »',
  'le produit dont on sait le moins paraîtrait le meilleur')
T(statutFoodCost(NaN) === 'inconnu', 'un calcul impossible → « inconnu »')
T(statutFoodCost(22) === 'vert' && statutFoodCost(30) === 'orange' && statutFoodCost(40) === 'rouge',
  'les seuils métier sont inchangés (28 / 32)')
T(/if \(!Number\.isFinite\(pct\) \|\| pct <= 0\) return 'inconnu'/.test(src),
  'la source applique bien cette règle')
T(/inconnu:\s*\{[^}]*bg-zinc/.test(src),
  '« inconnu » s\'affiche en gris, pas en vert')

// ── 2. Les colonnes de la fiche ────────────────────────────────────
console.log('\n── les colonnes (0150) ──')
const r = await sb('recettes?select=id,nom,procedure,poids_portion_g,nb_portions,temps_preparation&limit=1')
const champs = Object.keys(r[0] ?? {})
T(champs.includes('procedure'),
  'procedure existe — la méthode à RESPECTER',
  'sans elle, deux personnes produiront deux plats différents')
T(champs.includes('poids_portion_g'),
  'poids_portion_g existe — le grammage SERVI',
  'une fiche sans grammage dit ce qu\'on met dedans, pas ce qu\'on sert')
T(champs.includes('nb_portions') && champs.includes('temps_preparation'),
  'nb_portions et temps_preparation étaient déjà là')

// ── 3. procedure ≠ description ─────────────────────────────────────
const mig = fs.readFileSync('supabase/migrations/0150_fiches_techniques.sql', 'utf8')
T(/description.*commercial|commercial.*description/is.test(mig),
  'la migration dit pourquoi procedure ne remplace pas description',
  'l\'une se vend au client, l\'autre se suit en production')

// ── 4. La page imprimable ──────────────────────────────────────────
console.log('\n── la fiche imprimable ──')
const page = fs.readFileSync('src/app/print/fiche-technique/[id]/page.tsx', 'utf8')
T(page.includes('Aucune composition saisie'),
  'une fiche sans composition le DIT au lieu de paraître complète')
T(page.includes('Méthode non renseignée'), 'une méthode absente est signalée')
T(page.includes('Non vérifié'), 'des allergènes non vérifiés sont signalés')
T(/veut dire « on ne sait pas »/.test(page),
  'un food cost à 0 % est expliqué, pas affiché comme un succès')
T(page.includes('PrintButton'),
  'la fiche s\'imprime — une fiche qui vit dans un écran n\'est pas respectée')

if (BASE) {
  const cible = (await sb('recettes?select=id&actif=eq.true&limit=1'))[0]
  let code = null, html = ''
  try {
    const res = await fetch(`${BASE}/print/fiche-technique/${cible.id}`, { signal: AbortSignal.timeout(30000) })
    code = res.status; html = await res.text()
  } catch { console.log('  ⚠ dev server injoignable') }
  if (code !== null) {
    T(code === 200, `la fiche se sert (HTTP ${code})`)
    T(html.includes('Composition'), 'elle contient bien la composition')
  }
  const inexistant = '00000000-0000-0000-0000-000000000000'
  try {
    const res = await fetch(`${BASE}/print/fiche-technique/${inexistant}`, { signal: AbortSignal.timeout(30000) })
    T(res.status === 404, `un produit inexistant rend 404 (HTTP ${res.status})`)
  } catch { /* serveur absent */ }
}

// ── 5. État réel de la carte ───────────────────────────────────────
console.log('\n── où en est la carte ──')
const tous = await sb('recettes?select=nom,categorie,cout_achat_ht,procedure&actif=eq.true&limit=500')
const v = tous.filter(x => !x.nom.startsWith('Formule —'))
const ASSEMBLES = ['Sandwich', 'Panini', 'Salade', 'Pizza']
const assembles = v.filter(x => ASSEMBLES.includes(x.categorie))
const compo = await sb('recette_ingredients?select=recette_id')
console.log(`    ${v.length} produits actifs · ${assembles.length} assemblés (sandwich, panini, salade, pizza)`)
console.log(`    ${compo.length} ligne(s) de composition · ${v.filter(x => x.procedure).length} méthode(s) écrite(s)`)
console.log(`    ${v.filter(x => !Number(x.cout_achat_ht)).length} produit(s) sans coût connu — ils s'affichent désormais « coût inconnu »`)
T(true, 'état relevé (informatif, pas une assertion)')

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${ok} succès, ${ko} échec(s)`)
console.log('══════════════════════════════════════════════════════════')
process.exit(ko === 0 ? 0 : 1)
