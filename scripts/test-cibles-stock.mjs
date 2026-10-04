#!/usr/bin/env node
// Contrat des cibles de stock : ce qui se stocke, ce qui se regroupe, et
// d'où vient chaque cible.
//
// ⚠️ Ce test RECOPIE les règles de `src/lib/reassort.ts` (la source est en
// TS) : modifier les deux ensemble.

let ok = 0, ko = 0
const t = (nom, cond) => { if (cond) { ok++; console.log('  ✓', nom) } else { ko++; console.log('  ✗', nom) } }

// ─── recopie de src/lib/reassort.ts ─────────────────────────────────────
const CATEGORIES_ASSEMBLEES = new Set([
  'Sandwich', 'Panini', 'Salade', 'Formule',
  'Pizzeria', 'Burger', 'Plat', 'Planche', 'Grande salade', 'Menu',
  'Formule petit-déjeuner',
  'Plat du jour',
])
const estStockable = p => {
  if (p.categorie && CATEGORIES_ASSEMBLEES.has(p.categorie)) return false
  if (p.nom.startsWith('Formule —')) return false
  if (p.tag_destination === 'BAR' && !p.nom_matiere) return false
  return true
}
const cleMatiere = p => p.nom_matiere ?? p.libelle_achat ?? p.nom

// ─── recopie des règles d'arrondi de scripts/cibles-stock.mjs ───────────
const haut = n => Math.max(1, Math.ceil(n - 1e-9))
const AU_POIDS = new Set(['kg', 'litre', 'l', 'g'])
const arrondi = (n, u) => AU_POIDS.has(String(u || '').toLowerCase()) ? Math.ceil(n * 10) / 10 : haut(n)
const norme = u => {
  const x = String(u ?? '').trim().toLowerCase()
  if (['kg', 'kilo', 'kilogramme'].includes(x)) return 'kg'
  if (['l', 'litre', 'litres'].includes(x)) return 'litre'
  if (['pce', 'pièce', 'piece', 'u', 'unité', 'unite'].includes(x)) return 'pièce'
  return x || '?'
}

console.log('\n── Ce qui ne se stocke pas ──')
t('une pizza est un plat assemblé',
  !estStockable({ nom: 'La Marguerite', categorie: 'Pizzeria', tag_destination: 'PIZZA' }))
t('un burger aussi',
  !estStockable({ nom: 'Burger CasaTasia', categorie: 'Burger', tag_destination: 'CUISINE' }))
t('une planche aussi',
  !estStockable({ nom: 'Planche CasaTasia', categorie: 'Planche', tag_destination: 'CUISINE' }))
t('un sandwich reste exclu (règle 0133)',
  !estStockable({ nom: 'Le Poulet', categorie: 'Sandwich', tag_destination: 'FOURNIL' }))
t('un composant de formule est exclu par son nom',
  !estStockable({ nom: 'Formule — viennoiserie', categorie: 'Viennoiserie', tag_destination: 'FOURNIL' }))

t('une formule du matin est un lot, pas un stock',
  !estStockable({ nom: 'Formule Express', categorie: 'Formule petit-déjeuner', tag_destination: 'FOURNIL' }))
// ⚠️⚠️ TROISIÈME CATÉGORIE À AVOIR DÉBORDÉ CETTE LISTE. « Plat du jour »
// (0167) a été créée le 04/10/2026 et s'est retrouvée dans la commande
// d'ouverture, sans prix d'achat. Le motif se répète : on ajoute une
// catégorie au catalogue, personne ne pense au réassort, et il commande un
// plat au lieu de ses composants.
t('⚠️ « Plat du jour » ne se stocke pas — ce sont ses composants qui se stockent',
  !estStockable({ nom: 'Plat du jour', categorie: 'Plat du jour', tag_destination: 'CUISINE' }))

console.log('\n── Un comptage périmé n’est pas un stock ──')
// ⚠️ RECOPIE de PEREMPTION_COMPTAGE_JOURS (src/lib/reassort.ts).
const PEREMPTION_JOURS = 30
const perime = (le, ref) => (ref - new Date(le + 'T00:00:00Z').getTime()) / 86_400_000 > PEREMPTION_JOURS
const REF = new Date('2026-09-27T00:00:00Z').getTime()
t('le comptage du 24 août est périmé au 27 septembre', perime('2026-08-24', REF))
t('un comptage d’avant-hier ne l’est pas', !perime('2026-09-25', REF))
t('pile 30 jours n’est pas encore périmé', !perime('2026-08-28', REF))
t('31 jours l’est', perime('2026-08-27', REF))

console.log('\n── Le bar : un composite mélange deux matières ──')
t('un Kir ne se stocke pas',
  !estStockable({ nom: 'Kir', categorie: 'Apéritif', tag_destination: 'BAR', nom_matiere: null }))
t('un Spritz non plus',
  !estStockable({ nom: 'Spritz', categorie: 'Apéritif', tag_destination: 'BAR', nom_matiere: null }))
t('mais le demi se stocke — il porte sa matière',
  estStockable({ nom: 'Demi pression', categorie: 'Bière', tag_destination: 'BAR', nom_matiere: 'Fût Moretti 20 L' }))
t('la règle ne vise QUE le bar : un produit Fournil sans matière se stocke',
  estStockable({ nom: 'Croissant', categorie: 'Viennoiserie', tag_destination: 'FOURNIL', nom_matiere: null }))

console.log('\n── Le regroupement par matière ──')
const demi = { nom: 'Demi pression', nom_matiere: 'Fût Moretti 20 L' }
const pinte = { nom: 'Pinte pression', nom_matiere: 'Fût Moretti 20 L' }
t('demi et pinte tombent sur la même clé — un seul fût commandé',
  cleMatiere(demi) === cleMatiere(pinte))
t('à défaut de matière, le libellé d’achat fait la clé',
  cleMatiere({ nom: 'Panuozzi', libelle_achat: 'PATON A PIZZA' }) === 'PATON A PIZZA')
t('à défaut des deux, le nom',
  cleMatiere({ nom: 'Croissant' }) === 'Croissant')
t('la matière prime sur le libellé d’achat',
  cleMatiere({ nom: 'X', nom_matiere: 'Pâton à pizza', libelle_achat: 'PATON A PIZZA' }) === 'Pâton à pizza')

console.log('\n── L’arrondi d’une cible ──')
t('on ne commande pas 2,4 fûts : on arrondit AU-DESSUS',
  arrondi(2.4, 'unité d’achat') === 3)
t('un besoin infime donne quand même une unité — la carte le promet',
  arrondi(0.02, 'pièce') === 1)
t('au poids, une décimale suffit : 0,4 kg est une cible valable',
  arrondi(0.34, 'kg') === 0.4)
t('et le poids ne se force jamais à 1 kg',
  arrondi(0.34, 'kg') < 1)
t('un litre se comporte comme un kilo',
  arrondi(1.21, 'litre') === 1.3)

console.log('\n── La comparaison n’oppose que des unités qui concordent ──')
t('colis de 3000 et paquet de 200 ne se comparent pas',
  norme('colis 3000') !== norme('piece'))
t('kg et Kg se comparent',
  norme('kg') === norme('Kg'))
t('litre et L se comparent',
  norme('litre') === norme('L'))
t('pièce et Pce se comparent',
  norme('pièce') === norme('Pce'))
t('« contenant » ne concorde avec aucune de nos unités précisées',
  norme('contenant') !== norme('barquette 500 g'))

console.log('\n── Les origines sont distinctes, et elles doivent le rester ──')
const ORIGINES = ['MESURÉ', 'DÉRIVÉ', 'PLANCHER']
t('trois origines, pas une de plus', new Set(ORIGINES).size === 3)
t('une cible mesurée n’est jamais un plancher', !ORIGINES.includes('MESURÉ_PLANCHER'))

console.log(`\n${ko === 0 ? '✓' : '✗'} ${ok} réussite(s), ${ko} échec(s).\n`)
process.exit(ko === 0 ? 0 : 1)
