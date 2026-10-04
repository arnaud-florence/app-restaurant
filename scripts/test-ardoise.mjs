// L'ARDOISE DE LA SEMAINE — règles pures, aucune base, aucun réseau.
//
//   node scripts/test-ardoise.mjs
//
// ⚠️ Il IMPORTE la lib compilée plutôt que de recopier ses règles : une
// recopie se désynchronise, et ce fichier décide de ce qu'on achète.
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const OUT = '.next/cache/ardoise-lib'
execSync(`npx tsc src/lib/ardoise.ts --outDir ${OUT} --module esnext --target es2022 --moduleResolution bundler --skipLibCheck`, { stdio: 'pipe' })
fs.writeFileSync(`${OUT}/package.json`, '{"type":"module"}')
const A = await import(`../${OUT}/ardoise.js`)

let ok = 0, ko = 0
const t = (nom, cond) => { if (cond) { console.log(`  ✓ ${nom}`); ok++ } else { console.log(`  ✗ ${nom}`); ko++ } }
const titre = s => console.log(`\n── ${s} ──`)

// ── le décor : deux pizzas, deux plats, des matières partagées ──
const M = new Map([
  ['pate',  { id: 'pate',  nom: 'Pâton',       unite: 'pièce', prix_achat_ht: 0.50, conditionnement: 1 }],
  ['mozza', { id: 'mozza', nom: 'Mozzarella',  unite: 'kg',    prix_achat_ht: 8.00, conditionnement: 1 }],
  ['basil', { id: 'basil', nom: 'Basilic',     unite: 'botte', prix_achat_ht: 1.20, conditionnement: 1 }],
  ['steak', { id: 'steak', nom: 'Steak',       unite: 'pièce', prix_achat_ht: 2.00, conditionnement: 1 }],
  ['balsa', { id: 'balsa', nom: 'Balsamique',  unite: 'litre', prix_achat_ht: 12.5, conditionnement: 1 }],
  ['inconnu', { id: 'inconnu', nom: 'Sans prix', unite: 'kg',  prix_achat_ht: null, conditionnement: 1 }],
])
const marga = { id: 'p1', nom: 'Margherita', carte: 'PIZZA', composition: [
  { ingredient_id: 'pate', quantite: 1, unite: 'pièce' },
  { ingredient_id: 'mozza', quantite: 0.1, unite: 'kg' }] }
const reine = { id: 'p2', nom: 'Reine', carte: 'PIZZA', composition: [
  { ingredient_id: 'pate', quantite: 1, unite: 'pièce' },
  { ingredient_id: 'mozza', quantite: 0.1, unite: 'kg' },
  { ingredient_id: 'basil', quantite: 0.02, unite: 'botte' }] }
const burger = { id: 'b1', nom: 'Burger', carte: 'CUISINE', composition: [
  { ingredient_id: 'steak', quantite: 1, unite: 'pièce' },
  { ingredient_id: 'mozza', quantite: 0.03, unite: 'kg' }] }
const carpaccio = { id: 'b2', nom: 'Carpaccio', carte: 'CUISINE', composition: [
  { ingredient_id: 'balsa', quantite: 0.005, unite: 'litre' }] }

const V = { midi: 20, soirWeekEnd: 20, soirSemaine: 10, pizzasAEmporter: 0 }

titre('Le volume de la semaine')
const p = A.portionsSemaine(V)
t('midi 7 j × 20 + la moitié des soirs week-end → 160 couverts brasserie', p.CUISINE === 160)
t('soirs semaine + l’autre moitié des week-ends → 70 couverts pizzeria', p.PIZZA === 70)
t('⚠️ les pizzas à emporter s’AJOUTENT, elles ne sont pas des couverts assis',
  A.portionsSemaine({ ...V, pizzasAEmporter: 10 }).PIZZA === 70 + 70)
t('⚠️ … et elles ne touchent pas la brasserie',
  A.portionsSemaine({ ...V, pizzasAEmporter: 10 }).CUISINE === 160)

titre('Le besoin se répartit sur les plats de l’ardoise')
const b1 = A.besoinSemaine([marga], V)
t('une seule pizza porte les 70 portions', b1.get('pate') === 70)
const b2 = A.besoinSemaine([marga, reine], V)
t('⚠️ deux pizzas se PARTAGENT les mêmes 70 portions, elles n’en créent pas',
  b2.get('pate') === 70)
t('… et le basilic, propre à la Reine, n’en reçoit que la moitié',
  Math.abs(b2.get('basil') - 0.02 * 35) < 1e-9)
t('une carte vide ne consomme rien', A.besoinSemaine([], V).size === 0)
t('⚠️ une ardoise SANS pizza ne consomme aucun pâton — c’est tout l’objet',
  !A.besoinSemaine([burger], V).has('pate'))

titre('La casse vient du conditionnement, pas du besoin')
const l = A.listeAchat([marga, reine, burger, carpaccio], V, M)
const balsa = l.find(x => x.ingredient_id === 'balsa')
t('le balsamique n’est utilisé que par 1 plat', balsa.plats === 1)
t('⚠️ on en a besoin de 0,4 L et on achète 1 L — la casse est là',
  balsa.achat === 1 && balsa.besoin < 1 && balsa.perte > 0)
t('… et elle est chiffrée', balsa.perteHT > 0)
const mozza = l.find(x => x.ingredient_id === 'mozza')
t('la mozzarella est dans 3 plats : c’est du socle', mozza.plats === 3)
t('les lignes sortent triées par casse décroissante',
  l.every((x, i) => i === 0 || (l[i - 1].perteHT ?? 0) >= (x.perteHT ?? 0)))

titre('Socle et spécifiques')
const sp = A.specifiques(l).map(x => x.ingredient_id)
t('⚠️ le balsamique est SPÉCIFIQUE : il part avec son plat', sp.includes('balsa'))
t('la mozzarella n’est pas spécifique', !sp.includes('mozza'))
t('le seuil du socle est 4 plats', A.SEUIL_SOCLE === 4)
t('⚠️ retirer le carpaccio retire le balsamique de la liste',
  !A.listeAchat([marga, reine, burger], V, M).some(x => x.ingredient_id === 'balsa'))

titre('⚠️ Un prix inconnu ne vaut pas zéro')
const avecTrou = { id: 'b3', nom: 'Mystère', carte: 'CUISINE', composition: [
  { ingredient_id: 'inconnu', quantite: 1, unite: 'kg' }] }
const lt = A.listeAchat([avecTrou], V, M)
t('la ligne existe, son coût est NULL', lt[0].coutHT === null && lt[0].perteHT === null)
const cm = A.coutMarginal([marga], avecTrou, V, M)
t('⚠️⚠️ et le coût marginal se tait plutôt que d’annoncer un total faux',
  cm.deltaAchatHT === null && cm.deltaPerteHT === null)
t('… mais il compte quand même les références nouvelles', cm.referencesNouvelles === 1)

titre('Le coût d’ajouter un plat')
const cm2 = A.coutMarginal([marga, reine], burger, V, M)
t('le burger amène 1 référence nouvelle (le steak)', cm2.referencesNouvelles === 1)
const cm3 = A.coutMarginal([marga], reine, V, M)
t('⚠️ ajouter une pizza au même socle n’amène que le basilic', cm3.referencesNouvelles === 1)
t('⚠️⚠️ … et n’augmente PAS l’achat de pâtons : les portions se redistribuent',
  A.listeAchat([marga], V, M).find(x => x.ingredient_id === 'pate').achat
  === A.listeAchat([marga, reine], V, M).find(x => x.ingredient_id === 'pate').achat)

titre('Ce que le modèle REFUSE de deviner')
t('⚠️ une matière sans conditionnement connu s’achète par 1, jamais par 0',
  A.listeAchat([marga], V, new Map([['pate', { id: 'pate', nom: 'Pâton', unite: 'pièce', prix_achat_ht: 0.5 }],
    ['mozza', M.get('mozza')]]))
    .find(x => x.ingredient_id === 'pate').achat === 70)
t('⚠️ une matière absente du référentiel est IGNORÉE, pas inventée',
  A.listeAchat([marga], V, new Map()).length === 0)

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
