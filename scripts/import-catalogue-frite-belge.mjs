#!/usr/bin/env node
// Catalogue « La Frite Belge » — sauces Pauwels, graisse, frites et oignons.
//
// Source : `Catalogue sauce pauwels .pdf` (16 pages, tarifs professionnels),
// fourni par le gérant le 24/09/2026, plus trois prix donnés dans son message.
//
// ⚠️ LE FOURNISSEUR EST « LA FRITE BELGE », PAS « PAUWELS ». Pauwels est la
// MARQUE des sauces ; La Frite Belge (Var, 06 18 25 71 59) est le distributeur
// qu'on appelle pour commander. La leçon a déjà été payée avec Lavazza, qui
// figurait comme fournisseur alors que le café se commande chez France
// Boissons : tant que la marque tient la place du fournisseur, la comparaison
// désigne un interlocuteur qui n'en est pas un, et une commande partie de là
// va à la mauvaise adresse.
//
// ⚠️ UN TARIF N'EST PAS UNE FACTURE. Rien ici n'écrit dans
// `ingredients.prix_achat_ht` : c'est une proposition, pas une preuve. Faire
// entrer un tarif dans le prix payé ferait dériver tout le food cost sur de
// la marchandise jamais reçue.
//
// Usage : node scripts/import-catalogue-frite-belge.mjs [--ecrire]

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ECRIRE = process.argv.includes('--ecrire')
const DATE = '2026-09-24'
const SOURCE = 'Catalogue sauces Pauwels — tarifs professionnels'

const sb = (chemin, init = {}) => fetch(`${U}/rest/v1/${chemin}`, {
  ...init,
  headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
}).then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) }))

/** Clé pour une ligne SANS code article imprimé.
 *
 *  ⚠️ L'index unique de `catalogue_fournisseur` porte sur
 *  (fournisseur, référence, date) et il est TOTAL — il doit l'être, parce
 *  qu'`on_conflict` de PostgREST ne sait pas viser un index partiel (0134,
 *  0151). Revers de la médaille : plusieurs lignes à référence vide le même
 *  jour se heurtent, et l'insertion entière échoue en 23505.
 *
 *  Le préfixe `INT-` dit franchement que ce n'est PAS un code fournisseur.
 *  Le jour où La Frite Belge en communique un, il le remplace — et comme la
 *  clé change, l'ancienne ligne reste : à désactiver à la main, ce qui est
 *  préférable à un écrasement silencieux. */
const interne = (slug) => `INT-${slug}`

// ─── Le tarif, relevé page par page ────────────────────────────────────────
//
// Chaque ligne : [référence, poids net en kg, désignation, prix HT, format].
// ⚠️ Le poids est le POIDS NET imprimé au catalogue, pas la contenance
// nominale du contenant : un « tube 1 litre » de mayonnaise pèse 870 g, et
// c'est ce poids qui donne le vrai €/kg. Prendre 1 litre pour 1 kg gonflerait
// la mayonnaise de 15 %.
const TARIF = [
  // TUBE 1 LITRE
  ['41841',    0.870, 'Mayonnaise',                     4.99,  'Tube 1 L'],
  ['41836',    1.000, 'Ketchup',                        4.10,  'Tube 1 L'],
  ['41848',    0.875, 'Mayonnaise truffe',              6.99,  'Tube 1 L'],
  ['41829',    0.925, 'Curry',                          4.99,  'Tube 1 L'],
  ['41875',    0.925, 'Andalouse chef',                 4.99,  'Tube 1 L'],
  ['41828',    1.000, 'Curry ketchup',                  4.10,  'Tube 1 L'],
  ['61616',    0.945, 'Cheddar',                        4.99,  'Tube 1 L'],
  ['73002624', 0.950, 'Caesar',                         5.20,  'Tube 1 L'],
  ['41844',    0.880, 'Samouraï',                       4.99,  'Tube 1 L'],
  ['41845',    0.925, 'Happy',                          4.99,  'Tube 1 L'],
  ['41798',    0.520, 'Harissa',                        3.95,  'Tube 1 L'],
  ['41842',    0.925, 'Moutarde',                       4.25,  'Tube 1 L'],
  // TUBE 1 LITRE — sauces spéciales Remia
  // ⚠️ « 15 X 800 M » au catalogue est le COLISAGE (15 tubes de 800 ml), pas
  // une contenance unitaire : le prix 4,42 € est celui d'UN tube, cohérent
  // avec les autres lignes. Le lire comme 15 × 800 g donnerait 0,37 €/kg.
  ['41874',    0.800, 'Remia Rolling Roll creamy bacon', 4.42, 'Tube 800 ml'],
  ['41863',    0.800, 'Remia Black Jack smokey BBQ',     4.38, 'Tube 800 ml'],
  ['41647',    0.800, 'Remia frites sauce',              2.95, 'Tube 800 g'],
  // PET 3 LITRES
  ['40831',    3.000, 'Brazil',                         15.99, 'PET 3 L'],
  ['73002612', 3.000, 'BBQ',                            12.94, 'PET 3 L'],
  ['40843',    2.900, 'Aïoli',                          14.49, 'PET 3 L'],
  ['40847',    2.300, 'Pickles',                         9.45, 'PET 3 L'],
  ['40836',    2.800, 'Hamburger géant',                15.47, 'PET 3 L'],
  ['40830',    3.100, 'Barbecue snack',                 14.33, 'PET 3 L'],
  ['41876',    2.900, 'Andalouse chef',                 15.17, 'PET 3 L'],
  ['40833',    3.300, 'Curry ketchup',                  11.90, 'PET 3 L'],
  ['72408319', 3.000, 'Hannibal',                       15.08, 'PET 3 L'],
  ['73002613', 3.000, 'Hamburger smokey pepper',        14.99, 'PET 3 L'],
  ['40841',    3.300, 'Ketchup',                        11.90, 'PET 3 L'],
  ['40848',    2.300, 'Samouraï',                       15.53, 'PET 3 L'],
  ['40829',    3.100, 'Américaine',                     14.34, 'PET 3 L'],
  ['40846',    2.900, 'Poivre',                         15.16, 'PET 3 L'],
  ['40840',    3.000, 'Algérienne',                     14.91, 'PET 3 L'],
  // BAG IN BOX 2 × 5 LITRES — le prix est celui du CARTON de deux poches.
  ['61661',    9.400, 'Mayonnaise',                     42.71, 'BIB 2x5 L'],
  ['61660',   10.000, 'Ketchup',                        33.46, 'BIB 2x5 L'],
  ['61659',   10.000, 'Curry ketchup',                  33.46, 'BIB 2x5 L'],
  ['61662',    9.400, 'Samouraï',                       45.29, 'BIB 2x5 L'],
  // BAG IN BOX 5 LITRES
  ['40859',    5.000, 'Curry',                          21.38, 'BIB 5 L'],
  ['40852',    5.000, 'Américaine',                     20.79, 'BIB 5 L'],
  ['41877',    5.000, 'Andalouse chef',                 23.62, 'BIB 5 L'],
  ['40865',    5.000, 'Algérienne',                     24.21, 'BIB 5 L'],
  ['40863',    5.000, 'Hamburger triple',               24.19, 'BIB 5 L'],
  ['40873',    5.000, 'Poivre',                         23.62, 'BIB 5 L'],
  ['40869',    5.000, 'Mammouth',                       21.78, 'BIB 5 L'],
  ['73002497', 5.000, 'Hannibal',                       21.99, 'BIB 5 L'],
  ['40877',    4.900, 'Tartare de luxe',                24.70, 'BIB 5 L'],
  ['40861',    4.700, 'Hamburger géant',                24.19, 'BIB 5 L'],
  // SEAU 10 LITRES
  ['41878',    9.700, 'Andalouse chef',                 37.39, 'Seau 10 L'],
  ['41072',   10.000, 'Ketchup',                        27.50, 'Seau 10 L'],
  ['40388',    9.600, 'Mayonnaise chef',                28.73, 'Seau 10 L'],
  ['40391',    9.300, 'Samouraï',                       37.39, 'Seau 10 L'],
]

// Graisse de bœuf : carton de 4 × 2,5 kg. Le catalogue n'imprime pas de code
// pour cette ligne, d'où une clé interne (voir `interne()` plus bas).
const GRAISSE = [interne('graisse-boeuf-fribel'), 10.000, 'Graisse de bœuf Fribel', 24.00, 'Carton 4x2,5 kg']

// ─── Les trois prix du message du gérant ───────────────────────────────────
//
// ⚠️⚠️ L'UNITÉ N'EST PAS DONNÉE, ET ELLE NE SE DEVINE PAS. « 2,00 € » pour des
// oignons épluchés peut être le kilo, le sachet de 5 kg ou le colis — et
// l'écart entre les trois est d'un facteur cinq à dix. Chez un fournisseur de
// friterie, le kilo est le plus probable, mais « probable » n'écrit pas un
// prix d'achat : c'est la règle qui a évité le pain à burger à 64 €/kg et le
// croissant à 40 €.
//
// Ils sont donc enregistrés avec une unité MARQUÉE À CONFIRMER, et sans
// contenance — l'écran affichera « pas de prix de référence » plutôt qu'un
// €/kg inventé. Un mot du gérant, et on précise.
const MESSAGE = [
  [interne('oignons-jaunes-epluches'), 'Oignons jaunes épluchés', 2.00, 'à confirmer'],
  [interne('oignons-rouges-epluches'), 'Oignons rouges épluchés', 2.50, 'à confirmer'],
  [interne('frites-12x12-avec-peau'),  'Frites 12x12 avec peau',  1.50, 'à confirmer'],
]

// ─── Le fournisseur ────────────────────────────────────────────────────────
const NOM = 'La Frite Belge'
let { data: trouves } = await sb(`fournisseurs?select=id,nom&nom=ilike.${encodeURIComponent('%frite belge%')}`)
let fournisseurId = trouves?.[0]?.id ?? null

if (!fournisseurId) {
  console.log(`fournisseur « ${NOM} » : à créer`)
  if (ECRIRE) {
    const r = await sb('fournisseurs', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        nom: NOM,
        telephone: '06 18 25 71 59',
        email: 'lafritebelge83@gmail.com',
        actif: true,
        // ⚠️ `fournisseurs` n'a ni `site_web` ni `notes` : la remarque va dans
        // `conditions_tarifaires`, la seule colonne libre de cette table.
        conditions_tarifaires:
          'www.lafritebelge.fr — distributeur des sauces Pauwels (Var). '
          + '⚠️ Pauwels est la MARQUE, La Frite Belge le fournisseur qu\'on appelle. '
          + 'Vend aussi frites, oignons épluchés et graisse de bœuf.',
      }),
    })
    if (!r.ok) { console.error('création impossible :', JSON.stringify(r.data)); process.exit(1) }
    fournisseurId = r.data[0].id
    console.log('  créé :', fournisseurId)
  }
} else {
  console.log(`fournisseur « ${trouves[0].nom} » : déjà présent (${fournisseurId})`)
}

// ─── Les lignes ────────────────────────────────────────────────────────────
const lignes = []
for (const [ref, kg, nom, prix, format] of [...TARIF, GRAISSE]) {
  lignes.push({
    fournisseur_id: fournisseurId,
    reference: ref,
    designation: `${nom} — ${format}`,
    famille: format.startsWith('Carton') ? 'Graisse' : 'Sauce',
    // L'unité de FACTURATION est le contenant : on achète un tube, un seau,
    // un BIB — pas un kilo. Le €/kg se recalcule depuis la contenance.
    unite: format,
    prix_ht: prix,
    contenance_valeur: kg,
    contenance_unite: 'kg',
    date_tarif: DATE,
    source: SOURCE,
    nature: 'devis',
    actif: true,
  })
}
for (const [ref, nom, prix, unite] of MESSAGE) {
  lignes.push({
    fournisseur_id: fournisseurId,
    reference: ref,
    designation: nom,
    famille: nom.toLowerCase().includes('frite') ? 'Frites' : 'Légumes',
    unite,
    prix_ht: prix,
    // ⚠️ Pas de contenance : l'unité elle-même est inconnue.
    contenance_valeur: null,
    contenance_unite: null,
    date_tarif: DATE,
    source: 'Message du fournisseur du 24/09/2026 — ⚠️ unité à confirmer',
    nature: 'devis',
    actif: true,
  })
}

console.log(`\n${lignes.length} ligne(s) à importer :`)
console.log(`  · ${TARIF.length} sauces Pauwels`)
console.log('  · 1 graisse de bœuf')
console.log(`  · ${MESSAGE.length} du message (⚠️ unité à confirmer)`)

// Contrôle : le €/kg doit rester plausible. Une sauce au-delà de 15 €/kg ou
// en dessous de 1 €/kg trahirait une contenance mal lue.
const suspects = lignes.filter(l => l.contenance_valeur)
  .map(l => ({ d: l.designation, kg: +(l.prix_ht / l.contenance_valeur).toFixed(2) }))
  .filter(x => x.kg > 15 || x.kg < 1)
if (suspects.length) {
  console.log('\n⚠️ prix au kilo hors de la fourchette plausible :')
  suspects.forEach(s => console.log(`   ${s.d} → ${s.kg} €/kg`))
} else {
  console.log('\n✓ tous les prix au kilo sont dans une fourchette plausible (1 à 15 €/kg)')
}

const mini = lignes.filter(l => l.contenance_valeur)
  .map(l => ({ d: l.designation, kg: l.prix_ht / l.contenance_valeur }))
  .sort((a, b) => a.kg - b.kg).slice(0, 3)
console.log('\nles moins chers au kilo :')
mini.forEach(m => console.log(`   ${m.kg.toFixed(2)} €/kg — ${m.d}`))

if (!ECRIRE) {
  console.log('\n(essai à blanc — relancer avec --ecrire)')
  process.exit(0)
}

// Toutes les lignes portent une clé — celle du catalogue, ou une clé interne
// pour les quatre qui n'en ont pas. L'upsert peut donc être fait en une fois,
// et rejouer le script corrige au lieu de dupliquer.
const r = await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(lignes),
})
console.log(`\n${lignes.length} ligne(s) :`, r.ok ? 'écrites' : JSON.stringify(r.data))
console.log('\n→ /admin/tarifs-fournisseurs')
