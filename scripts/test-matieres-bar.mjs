// Test — le bar sait ce qu'il achète (correspondance vendu ↔ acheté)
//
// Le bar ouvre avec 36 produits tarifés et poussés en caisse. Sans lien vers
// une matière, il s'allumerait AVEUGLE : aucune bouteille à l'inventaire,
// aucune commande conseillée, et une marge fondée sur des estimations.
//
// Ce que ce test protège surtout : qu'aucun produit ne soit ni rattaché ni
// justifié. Un oubli silencieux, ici, c'est une bouteille qui n'est jamais
// comptée — donc du stock qui disparaît sans que rien ne le dise.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT
const q = async p => {
  const r = await fetch(U + '/rest/v1/' + p, { headers: { apikey: K, Authorization: `Bearer ${K}` } })
  const j = await r.json(); if (!Array.isArray(j)) throw new Error(j.message); return j
}
let ok = 0, ko = 0
const T = (c, l, d = '') => { if (c) { ok++; console.log(`  ✓ ${l}`) } else { ko++; console.log(`  ✗ ${l}${d ? ' — ' + d : ''}`) } }

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — correspondance vendu ↔ acheté du bar              ║')
console.log('╚══════════════════════════════════════════════════════════╝')

const bar = await q('recettes?select=nom,categorie,nom_matiere,unites_par_achat,cout_achat_ht,contient_alcool,vendable_online&tag_destination=eq.BAR&actif=eq.true')

// Ces produits mélangent deux matières : les rattacher à une seule en
// oublierait l'autre, qui sortirait du stock sans que rien ne le signale.
const COMPOSITES = ['Kir', 'Kir royal', 'Spritz', 'Monaco', 'Panaché', 'Picon bière', 'Diabolo', 'Alcool + soft']
const A_TRANCHER = ['Pichet 25 cl', 'Pichet 50 cl']

console.log('\n── couverture ──')
T(bar.length >= 36, `${bar.length} produits actifs au bar`)
const rattaches = bar.filter(r => r.nom_matiere)
T(rattaches.length >= 26, `${rattaches.length} produits rattachés à une matière`)

const orphelins = bar.filter(r => !r.nom_matiere
  && !COMPOSITES.includes(r.nom) && !A_TRANCHER.includes(r.nom))
T(orphelins.length === 0,
  'aucun produit n\'est ni rattaché ni justifié',
  orphelins.map(r => r.nom).join(', '))

console.log('\n── les rendements sont arithmétiques ──')
const par = Object.fromEntries(bar.map(r => [r.nom, r]))
const attendus = [
  ['Demi pression',       'Fût de blonde 30 L', 120, '30 L / 25 cl'],
  ['Pinte pression',      'Fût de blonde 30 L',  60, '30 L / 50 cl'],
  ['Whisky 4 cl',         'Whisky 70 cl',      17.5, '70 cl / 4 cl'],
  ['Verre de rosé 12 cl', 'Vin rosé 75 cl',       6, '75 cl / 12 cl'],
  ['Pastis 2 cl',         'Pastis 1 L',          50, '1 L / 2 cl'],
]
for (const [nom, mat, n, calcul] of attendus) {
  const r = par[nom]
  T(r?.nom_matiere === mat && Number(r?.unites_par_achat) === n,
    `${nom} ← ${mat} × ${n} (${calcul})`,
    r ? `${r.nom_matiere} × ${r.unites_par_achat}` : 'produit absent')
}

console.log('\n── un fût nourrit DEUX contenances ──')
const surFut = rattaches.filter(r => r.nom_matiere === 'Fût de blonde 30 L')
T(surFut.length >= 2,
  `${surFut.length} produits tirent du même fût — c'est le cas du filter, pas du find`,
  'n\'en rattacher qu\'un laisserait l\'autre sans savoir d\'où vient son coût')

console.log('\n── les composites restent DEHORS ──')
for (const n of COMPOSITES) {
  const r = par[n]
  if (!r) continue
  T(!r.nom_matiere, `${n} n'est rattaché à aucune matière unique`,
    'un mélange rattaché à une seule matière en perdrait l\'autre en silence')
}

console.log('\n── ce que rien n\'a écrit, et c\'est voulu ──')
const avecLibelle = bar.filter(r => r.libelle_achat)
T(avecLibelle.length === 0,
  'aucun libelle_achat inventé',
  'c\'est le texte LITTÉRAL du fournisseur — aucune facture France Boissons reçue')
const fb = await q('fournisseurs?select=nom,actif&nom=eq.France Boissons')
T(fb.length === 1 && fb[0].actif, 'France Boissons existe comme fournisseur actif')

console.log('\n── la règle qui ne doit jamais céder ──')
const alcoolEnLigne = bar.filter(r => r.contient_alcool && r.vendable_online)
T(alcoolEnLigne.length === 0,
  'aucun alcool vendable en ligne',
  'pas de contrôle d\'âge sur le click & collect')

if (PORT) {
  console.log('\n── l\'écran d\'inventaire ──')
  const page = async u => (await fetch(`http://localhost:${PORT}${u}`)).text()
  const [fournil, barPage] = await Promise.all([page('/inventaire'), page('/inventaire?poste=bar')])
  const champs = h => (h.match(/type="number"/g) ?? []).length
  T(champs(barPage) >= 25, `${champs(barPage)} lignes à compter au bar`)
  T(champs(fournil) > champs(barPage), `le Fournil garde ses ${champs(fournil)} lignes`)
  T(barPage.includes('Fût de blonde') && !fournil.includes('Fût de blonde'),
    'le fût est au bar et NULLE PART ailleurs',
    'mélanger les deux postes rallongerait le comptage du matin pour rien')
  T(!barPage.includes('Kir</') , 'aucun cocktail dans les lignes de stock',
    'personne ne stocke des kirs')
} else {
  console.log('\n  (PORT non fourni — écran non testé)')
}

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${ok} succès, ${ko} échec(s)`)
console.log('══════════════════════════════════════════════════════════')
process.exit(ko === 0 ? 0 : 1)
