// Relier ce qui se VEND au bar à ce qui s'ACHÈTE.
//
// Le bar ouvre en septembre avec 36 produits tarifés et poussés en caisse —
// et pas un seul lien vers une matière. Conséquence : il s'allumerait aveugle.
// L'inventaire n'y verrait aucune bouteille, la commande conseillée ne
// proposerait rien, et la marge du bar serait celle d'estimations, pas d'un
// prix payé.
//
// On ne vend pas ce qu'on achète : on achète un fût de 30 L et on vend des
// demis, on achète une bouteille de 70 cl et on vend des doses de 4 cl.
// `nom_matiere` dit CE QU'ON COMPTE, `unites_par_achat` dit COMBIEN on en tire.
// C'est le même patron que « Panuozzi ← pâton » (0131/0132).
//
// ⚠️ `libelle_achat` n'est PAS renseigné ici, et c'est délibéré : c'est le
// texte LITTÉRAL du fournisseur sur sa facture, et nous n'avons pas encore
// reçu une seule facture France Boissons. L'inventer produirait une clé qui
// ne correspondrait à rien. Il s'apprendra au premier scan, ou se posera à la
// main dans /admin/correspondances — c'est exactement ce à quoi cet écran sert.
//
// ⚠️ Aucun PRIX n'est écrit. Les coûts par dose actuellement en base sont les
// estimations qui ont servi à bâtir la carte ; les remonter en prix de
// bouteille les transformerait en données mesurées. Ils viendront de la
// première facture.
//
//   node scripts/matieres-bar.mjs [--ecrire]

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

// [produit vendu, matière comptée, unités vendues par unité achetée]
//
// Les rendements sont ARITHMÉTIQUES, pas estimés : 30 L / 25 cl = 120.
// La mousse et les purges ne sont pas déduites — les inventer ferait un
// chiffre faux ; l'écart réel se lira dans la démarque, où il est une
// information (un fût qui rend 105 demis au lieu de 120 se règle au tirage).
const LIENS = [
  // ── Pression : un fût, deux contenances ──────────────────────────
  ['Demi pression',           'Fût de blonde 30 L',        120],   // 30 L / 25 cl
  ['Pinte pression',          'Fût de blonde 30 L',         60],   // 30 L / 50 cl
  ['Demi ambrée',             'Fût d\'ambrée 30 L',        120],

  // ── Bouteilles revendues telles quelles ──────────────────────────
  ['Bière bouteille 33 cl',   'Bière bouteille 33 cl',       1],
  ['Bière sans alcool 25 cl', 'Bière sans alcool 25 cl',     1],
  ['Desperados 33 cl',        'Desperados 33 cl',            1],
  ['Perrier 33 cl',           'Perrier 33 cl',               1],
  ['Limonade 25 cl',          'Limonade 25 cl',              1],
  ['Bouteille Coteaux Varois','Coteaux Varois 75 cl',        1],
  ['Crémant 75 cl',           'Crémant 75 cl',               1],

  // ── Spiritueux : dose de 4 cl dans une bouteille de 70 cl ────────
  ['Whisky 4 cl',             'Whisky 70 cl',             17.5],
  ['Whisky premium 4 cl',     'Whisky premium 70 cl',     17.5],
  ['Vodka 4 cl',              'Vodka 70 cl',              17.5],
  ['Gin 4 cl',                'Gin 70 cl',                17.5],
  ['Rhum 4 cl',               'Rhum 70 cl',               17.5],
  ['Digestif 4 cl',           'Digestif 70 cl',           17.5],

  // ── Apéritifs : contenances de service différentes ──────────────
  ['Pastis 2 cl',             'Pastis 1 L',                 50],
  ['Martini 4 cl',            'Martini 1 L',                25],
  ['Picon 4 cl',              'Picon 1 L',                  25],
  ['Suze 4 cl',               'Suze 1 L',                   25],
  ['Porto 6 cl',              'Porto 75 cl',              12.5],
  ['Muscat 6 cl',             'Muscat 75 cl',             12.5],

  // ── Vin au verre : 75 cl / 12 cl = 6 verres ─────────────────────
  ['Verre de rosé 12 cl',     'Vin rosé 75 cl',              6],
  ['Verre de blanc 12 cl',    'Vin blanc 75 cl',             6],
  ['Verre de rouge 12 cl',    'Vin rouge 75 cl',             6],

  // ── Sirop ────────────────────────────────────────────────────────
  ['Sirop à l\'eau',          'Sirop 1 L',                  50],   // dose 2 cl
]

// Ces produits mélangent DEUX matières ou plus. Un seul `nom_matiere` les
// rattacherait à l'une en oubliant l'autre — la seconde disparaîtrait du
// stock sans que rien ne le signale. Ils relèvent d'une composition, pas
// d'une correspondance d'achat.
const COMPOSITES = {
  'Kir':          'vin blanc + crème de cassis',
  'Kir royal':    'crémant + crème de cassis',
  'Spritz':       'Apérol + prosecco + eau gazeuse',
  'Monaco':       'bière pression + limonade + grenadine',
  'Panaché':      'bière pression + limonade',
  'Picon bière':  'bière pression + Picon',
  'Diabolo':      'sirop + limonade',
  'Alcool + soft':'spiritueux + soda',
}

// Ambigu tant que le gérant n'a pas tranché : un pichet ne dit pas sa couleur.
const A_TRANCHER = {
  'Pichet 25 cl': 'quelle couleur ? (3 pichets par bouteille de 75 cl)',
  'Pichet 50 cl': 'quelle couleur ? (1,5 pichet par bouteille de 75 cl)',
}

const bar = await sb('recettes?select=id,nom,nom_matiere,unites_par_achat,libelle_achat&tag_destination=eq.BAR&actif=eq.true')
const parNom = new Map(bar.map(r => [r.nom, r]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)

const plan = [], absents = []
for (const [produit, matiere, unites] of LIENS) {
  const r = parNom.get(produit)
  if (!r) { absents.push(produit); continue }
  if (r.nom_matiere === matiere && Number(r.unites_par_achat) === unites) continue
  plan.push({ id: r.id, produit, matiere, unites })
}

const parMatiere = {}
for (const p of plan) (parMatiere[p.matiere] ??= []).push(`${p.produit} ×${p.unites}`)
for (const [m, ps] of Object.entries(parMatiere)) console.log(`  ${m.padEnd(26)} ← ${ps.join(', ')}`)

console.log(`\n  liens à poser        : ${plan.length}`)
console.log(`  matières distinctes  : ${new Set(LIENS.map(l => l[1])).size}`)
if (absents.length) console.log(`  ⚠️ produits introuvables : ${absents.join(', ')}`)

console.log(`\n  Laissés de côté — COMPOSITES (deux matières ou plus) :`)
for (const [n, quoi] of Object.entries(COMPOSITES)) console.log(`    · ${n.padEnd(16)} ${quoi}`)
console.log(`\n  Laissés de côté — À TRANCHER :`)
for (const [n, quoi] of Object.entries(A_TRANCHER)) console.log(`    · ${n.padEnd(16)} ${quoi}`)

const restants = bar.filter(r => !r.nom_matiere
  && !LIENS.some(l => l[0] === r.nom) && !COMPOSITES[r.nom] && !A_TRANCHER[r.nom])
if (restants.length) console.log(`\n  ⚠️ Ni traités ni justifiés : ${restants.map(r => r.nom).join(', ')}`)

console.log(`\n  Aucun prix n'est écrit : ils viendront de la première facture.`)
console.log(`  Aucun libelle_achat non plus : c'est le texte du fournisseur, on ne l'a pas encore.`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
for (const p of plan) {
  await sb('recettes?id=eq.' + p.id, {
    method: 'PATCH',
    body: JSON.stringify({ nom_matiere: p.matiere, unites_par_achat: p.unites }),
  })
}
console.log(`\n  → ${plan.length} lien(s) posé(s).\n`)
