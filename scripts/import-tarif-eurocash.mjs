#!/usr/bin/env node
// Le tarif Euro-Cash reçu le 26/09/2026 — 199 prix sur 1 292 références.
//
// ⚠️⚠️ LEUR FICHIER MÉLANGE TROIS BASES DE PRIX, et rien ne dit laquelle
// s'applique à quelle ligne. Mesuré sur leurs propres chiffres :
//
//   · « Pot Nutella c-2x3kg » à 49,78 € → le COLIS (notre colis : 52,92 €) ;
//   · « Perrier c-24x33cl » à 0,50 €    → l'UNITÉ (le colis ferait 12 €
//     pour 24 bouteilles, et nous la payons 0,939 €) ;
//   · « Multivitamine c-4x10x20cl » à 3,50 € → ni l'un ni l'autre : la
//     brique à 3,50 € est absurde, le colis de 40 donnerait 8 centimes
//     pièce. C'est le PACK INTÉRIEUR de 10.
//
// Trois bases dans le même rayon. Une règle automatique se tromperait donc
// d'un facteur 10 à 40 — et dans le mauvais sens elle ferait passer
// Euro-Cash pour deux fois moins cher que France Boissons sur toute la
// cannette, ce qui déclencherait un changement de fournisseur sur un
// chiffre faux.
//
// D'où la règle de ce script : **on importe TOUT, on ne compare QUE ce que
// le fichier PROUVE**. Une ligne dont la base est démontrée par notre
// propre prix (colonne « Notre prix actuel HT », renseignée sur 15 lignes)
// entre comparable ; les autres entrent visibles et marquées
// `base_a_confirmer` — elles n'ont pas de `cle_comparaison`, donc elles ne
// peuvent désigner personne comme « moins cher ».
//
//   node scripts/import-tarif-eurocash.mjs [--ecrire]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const FICHIER = 'data/tarif-eurocash-2026-09-23.csv'
const DATE = '2026-09-26'

if (!fs.existsSync(FICHIER)) {
  console.error(`✗ ${FICHIER} introuvable. Le tarif vit hors dépôt (conditions négociées).`)
  process.exit(1)
}

const euros = t => {
  const x = String(t ?? '').replace('€', '').replace(/ /g, '').replace(/\s/g, '').replace(',', '.')
  const v = Number(x)
  return x === '' || !Number.isFinite(v) ? null : v
}

/** Découpe un CSV point-virgule en respectant les guillemets. */
function lire(chemin) {
  const brut = fs.readFileSync(chemin, 'utf8').replace(/^﻿/, '')
  const lignes = brut.split(/\r?\n/).filter(l => l.trim())
  const entetes = lignes[0].split(';').map(h => h.trim())
  return lignes.slice(1).map(l => {
    const c = l.split(';')
    return Object.fromEntries(entetes.map((h, i) => [h, (c[i] ?? '').trim()]))
  })
}

const lignes = lire(FICHIER)
const chiffrees = lignes.filter(l => euros(l['VOTRE PRIX HT']) != null)

// ⚠️ LA PREUVE : notre propre prix, dans le même fichier, à la même ligne.
// Si leur prix est plus proche de notre prix UNITAIRE que de notre prix
// COLIS, c'est un prix unitaire — et réciproquement. C'est la seule
// décision que les données permettent de prendre seule.
const prouvees = []
const aConfirmer = []
for (const l of chiffrees) {
  const p = euros(l['VOTRE PRIX HT'])
  const unite = euros(l['Notre prix actuel HT'])
  const colis = euros(l['Prix colis à battre'])
  if (unite == null || colis == null || p == null) { aConfirmer.push(l); continue }
  const versUnite = Math.abs(Math.log((p || 1e-9) / (unite || 1e-9)))
  const versColis = Math.abs(Math.log((p || 1e-9) / (colis || 1e-9)))
  // ⚠️ Un écart de plus d'un facteur 3 des DEUX côtés ne prouve rien :
  // c'est peut-être une troisième base (le pack intérieur).
  if (Math.min(versUnite, versColis) > Math.log(3)) { aConfirmer.push(l); continue }
  prouvees.push({ ...l, base: versUnite < versColis ? 'unite' : 'colis', p, unite, colis })
}

console.log('\n══ TARIF EURO-CASH ══\n')
console.log(`${lignes.length} références envoyées · ${chiffrees.length} chiffrées par eux`)
console.log(`  base PROUVÉE par notre propre prix : ${prouvees.length}`)
console.log(`  base À CONFIRMER                   : ${aConfirmer.length}\n`)

for (const x of prouvees) {
  const ref = x.base === 'unite' ? x.unite : x.colis
  const ecart = ref ? (1 - x.p / ref) * 100 : 0
  console.log(`  ${x['Désignation'].slice(0, 26).padEnd(28)} ${(x.Colisage || '').padEnd(13)} `
    + `${x.p.toFixed(2).padStart(8)} € / ${x.base.padEnd(6)} `
    + `· nous ${ref.toFixed(3)} € → ${ecart >= 0 ? '−' : '+'}${Math.abs(ecart).toFixed(0)} %`)
}

const parRayon = {}
for (const l of aConfirmer) parRayon[l.Rayon] = (parRayon[l.Rayon] ?? 0) + 1
console.log('\n⚠️ À CONFIRMER auprès d’Euro-Cash — leur prix est-il à l’unité, au')
console.log('   pack intérieur ou au colis ? Par rayon :')
for (const [r, n] of Object.entries(parRayon).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${String(n).padStart(4)}  ${r}`)
}
console.log('\n   Ces lignes entrent au catalogue SANS clé de comparaison : elles')
console.log('   sont visibles et cherchables, mais ne peuvent désigner personne')
console.log('   comme « moins cher » tant que leur base n’est pas dite.')

if (!ECRIRE) {
  console.log('\n\n── ESSAI À BLANC — rien n’a été écrit. ──\n')
  process.exit(0)
}

const req = async (chemin, methode, corps) => {
  const r = await fetch(`${U}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json',
      Prefer: methode === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  if (!r.ok) throw new Error((await r.text()).slice(0, 250))
}

const fr = await (await fetch(`${U}/rest/v1/fournisseurs?select=id,nom&nom=eq.Euro-Cash`,
  { headers: { apikey: K, Authorization: 'Bearer ' + K } })).json()
if (!fr.length) { console.error('✗ Fournisseur Euro-Cash introuvable.'); process.exit(1) }
const fid = fr[0].id

// ⚠️ Les quatre lignes dont la base est PROUVÉE peuvent entrer dans la
// comparaison — mais seulement si elles portent une CONTENANCE, sinon
// `comparer()` ne sait pas les ramener à une base commune et le groupe
// ressort « non comparable ». Chaque contenance ci-dessous est LUE sur la
// désignation ou le colisage, jamais supposée.
const COMPARABLES = {
  // code : [clé de comparaison, valeur, unité]
  // ⚠️ `contenance_unite` n'admet que kg / L / piece (`UniteRef`) : les
  // 33 cl s'écrivent donc 0,33 L. Y laisser « cl » fait échouer l'insert
  // sur une contrainte CHECK, et l'échec porte sur la LIGNE ENTIÈRE.
  '57003': ['Perrier 33 cl', 0.33, 'L'],        // c-24x33cl, prix à l'unité
  '53850': ['Coca-Cola 33 cl', 0.33, 'L'],      // c-24x33cl, prix à l'unité
  '53860': ['Coca-Cola Zéro 33 cl', 0.33, 'L'], // ⚠️ clé DISTINCTE du Coca
  '28500': ['Nutella', 6, 'kg'],                // c-2x3kg, prix au colis
}

const charge = []
for (const l of chiffrees) {
  const prouvee = prouvees.find(p => p.Code === l.Code)
  charge.push({
    fournisseur_id: fid,
    // ⚠️ Le code article vient du PDF, il n'est jamais retapé (0151).
    reference: l.Code,
    designation: l['Désignation'],
    famille: l.Rayon || null,
    // ⚠️ L'unité DIT la base quand on la connaît, et dit qu'on l'ignore
    // sinon. Écrire « unité » par défaut ferait comparer un colis de 24
    // à une bouteille.
    unite: prouvee ? (prouvee.base === 'colis' ? 'colis' : 'unité') : 'base à confirmer',
    prix_ht: euros(l['VOTRE PRIX HT']),
    colis_libelle: l.Colisage || null,
    // ⚠️ PAS de clé de comparaison sur une base inconnue : sans elle, la
    // ligne ne peut désigner personne comme « moins cher ».
    cle_comparaison: COMPARABLES[l.Code]?.[0] ?? null,
    contenance_valeur: COMPARABLES[l.Code]?.[1] ?? null,
    contenance_unite: COMPARABLES[l.Code]?.[2] ?? null,
    nature: 'devis',
    date_tarif: DATE,
    source: 'Tarif Euro-Cash du 26/09/2026',
    actif: true,
  })
}

console.log('\n── ÉCRITURE ──\n')
for (let i = 0; i < charge.length; i += 200) {
  await req('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif', 'POST', charge.slice(i, i + 200))
}
console.log(`  ✓ ${charge.length} tarif(s) Euro-Cash importé(s).`)
console.log(`  ⚠️ ${aConfirmer.length} sans base de prix confirmée — hors comparaison.`)
