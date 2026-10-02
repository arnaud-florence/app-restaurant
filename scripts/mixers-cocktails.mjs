// Les mixers à ACHETER, pas à vendre — demande du gérant, 02/10/2026.
//
// Ce qui entre dans un cocktail servi au verre (vodka Red Bull, vodka ananas,
// gin tonic) ou accompagne une bouteille, mais ne figure à la carte sous aucun
// nom. Il faut donc le STOCKER et le COMMANDER sans qu'aucune vente ne le
// désigne : c'est exactement le rôle de `ingredients.stocke` (0133).
//
// ⚠️ Sans ces lignes, ces bouteilles n'existent nulle part : ni à
// l'inventaire, ni au réassort, ni sur un bon de commande. On s'en aperçoit
// le samedi soir quand quelqu'un demande un gin tonic.
//
// ⚠️ LES PRIX VIENNENT DU DEVIS EURO-CASH, donc `prix_estime = true` (0165) :
// un devis est une proposition, une facture est une preuve.
//
// ⚠️⚠️ ON NE CRÉE QUE CE DONT LA BASE DE PRIX EST ÉTABLIE.
// `ingredients.prix_achat_ht` est NOT NULL : une matière sans prix s'y
// écrirait donc à 0, et le total du réassort ne met à part que les lignes
// dont le coût est NULL — un zéro y serait compté comme un prix, c'est-à-dire
// « gratuit ». Même faute que `statutFoodCost(0)` affiché en vert (0150). Les
// mixers qu'Euro-Cash n'a pas chiffrés partent donc à la RELANCE, pas en base.
//
//   node scripts/mixers-cocktails.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n == null ? '    —' : n.toFixed(2).replace('.', ',').padStart(5)

// nom chez nous · réf Euro-Cash · usage · base de prix
//
// ⚠️ RED BULL : c'est le 25 cl qu'on sert, pas le 47,3 cl. Euro-Cash n'a
// établi la base que du 47,3 cl (2,25 €) ; les trois formats tombent au MÊME
// prix au litre — 2,25/0,473 = 1,19/0,25 = 1,70/0,355 = 4,757 €/L. La base du
// 25 cl est donc ANCRÉE sur une ligne confirmée, pas devinée. C'est l'épreuve
// ② de `base-prix-eurocash.mjs`.
const CREER = [
  ['Red Bull 25 cl (pièce)',     '53000', 1.19, 'vodka Red Bull', 'ancrée sur le 47,3 cl — 4,757 €/L des deux côtés'],
  ['Indian Tonic 33 cl (pièce)', '52804', 0.68, 'gin tonic — le gin ne se sert pas sec', 'base établie par Euro-Cash'],
  ['Jus d’ananas 33 cl (pièce)', '52146', 0.80, 'vodka ananas, rhum ananas', 'base établie par Euro-Cash'],
  ['Jus d’orange 33 cl (pièce)', '52140', 0.70, 'vodka orange, tequila sunrise', 'base établie par Euro-Cash'],
]

// Ce qu'Euro-Cash n'a pas chiffré, ou dont la base reste illisible.
const A_RELANCER = [
  ['Pamplemousse',      '49965', '1,70 € sans base : 5,15 €/L en 33 cl (hors famille) ou 1,70 €/L en litre — deux lectures tenables'],
  ['Cranberry Classic', '50042', 'aucun prix'],
  ['Ginger Ale',        '50068', 'aucun prix'],
  ['Ginger Beer',       '50070', 'aucun prix'],
]

const [ec] = await sb('fournisseurs?nom=eq.Euro-Cash&select=id,nom')
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — mixers à acheter, pas à vendre ──\n`)
console.log('  À CRÉER\n')
console.log('  matière                        réf     prix   usage')
let n = 0
for (const [nom, ref, prix, usage, base] of CREER) {
  console.log(`  ${nom.padEnd(30)} ${ref}  ${f2(prix)} € ${usage}`)
  console.log(`  ${' '.repeat(30)}               ↳ ${base}`)
  const [deja] = await sb(`ingredients?nom=eq.${encodeURIComponent(nom)}&select=id`)
  if (deja) { console.log(`  ${' '.repeat(30)}               (existe déjà)`); continue }
  n++
  if (!ECRIRE) continue
  const [ing] = await sb('ingredients', { method: 'POST', body: JSON.stringify({
    nom, unite: 'pièce', categorie: 'Bar',
    prix_achat_ht: prix, prix_estime: true,
    stocke: true, actif: true,
    fournisseur_principal: ec.nom, reference_fournisseur: ref }) })
  // Rattacher la ligne de catalogue : sans `ingredient_id`, l'offre existe
  // mais ne pointe sur rien de chez nous, donc le réassort ne la voit pas.
  await sb(`catalogue_fournisseur?fournisseur_id=eq.${ec.id}&reference=eq.${ref}`,
    { method: 'PATCH', body: JSON.stringify({ ingredient_id: ing.id }) })
}
console.log(`\n  ${n} matière(s) ${ECRIRE ? 'créée(s)' : 'à créer'}\n`)
console.log('  À RELANCER CHEZ EURO-CASH — pas créées, et c’est voulu\n')
for (const [nom, ref, pourquoi] of A_RELANCER) console.log(`  ${nom.padEnd(20)} ${ref}  ${pourquoi}`)
console.log('\n  ⚠️ Les écrire à 0 € les ferait compter pour « gratuit » dans le total')
console.log('     du réassort. Un prix absent vaut mieux qu’un prix faux.')
console.log(ECRIRE ? '' : '\n  (essai à blanc — relancer avec --ecrire)\n')
