// Plaza Grossiste — emballages CHR. Relevé public du 01/10/2026.
//
// ⚠️⚠️ LA BASE DE PRIX N'EST PAS ÉTABLIE : le site n'écrit NULLE PART si ses
// prix sont HT ou TTC — ni sur les fiches, ni sur les listes, ni dans les
// conditions de vente. Pris pour des HT alors qu'ils seraient TTC, chaque
// comparaison serait fausse de 20 %, et dans le sens qui fait paraître Plaza
// moins cher — sur l'écran qui déclenche les commandes.
//
// D'où : AUCUNE `cle_comparaison`. Les lignes entrent visibles et cherchables
// mais ne peuvent désigner personne comme « moins cher ». Même traitement que
// les 195 lignes Euro-Cash « base à confirmer ». Une question au fournisseur
// lève le doute, et les clés se posent le jour même.
//
// ⚠️ `tarif_negocie = false` : ce sont les prix PUBLICS du site. Le libellé
// dira « Tarif public — remise à demander ». Confondre « pas de remise » avec
// « remise refusée » ferait passer le sujet pour clos alors qu'il n'est même
// pas ouvert.
//
//   node scripts/import-plaza.mjs [--ecrire]
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
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const DATE = '2026-10-01'

// Relevé à l'écran. `n` = unités par colis, lu dans la désignation du site.
const LIGNES = [
  // ── Sacs à croissants : même numérotation que Gineys (101 à 107) ──
  ['SAC 101 Moulin', 'Sac à croissants MOULIN kraft imprimé 12+5x15 cm — carton de 1000', 8.59, 1000],
  ['SAC 102 Moulin', 'Sac à croissants MOULIN kraft imprimé 12+5x20 cm — carton de 1000', 9.59, 1000],
  ['SAC 103 Moulin', 'Sac à croissants MOULIN kraft imprimé 14+6x20 cm — carton de 1000', 11.49, 1000],
  ['SAC 104 Moulin', 'Sac à croissants MOULIN kraft imprimé 14+6x27 cm — carton de 1000', 13.90, 1000],
  ['SAC 105 Moulin', 'Sac à croissants MOULIN kraft imprimé 18+6.5x31 cm — carton de 1000', 19.49, 1000],
  ['SAC 106 Moulin', 'Sac à croissants MOULIN kraft imprimé 18+6.5x36 cm — carton de 1000', 21.49, 1000],
  ['SAC 107 Moulin', 'Sac à croissants MOULIN kraft imprimé 25+6.5x34 cm — carton de 500', 13.90, 500],
  ['S01KN',  'Sac à croissants kraft 12+5x15 cm — carton de 1000', 8.39, 1000],
  ['S01BLN', 'Sac à croissants kraft BLANC 12+5x15 cm — carton de 1000', 8.39, 1000],
  // ── Serviettes ──
  ['102.36',  'Serviette 1 pli 30x30 cm blanche — carton de 2400', 18.49, 2400],
  ['102.36P', 'Serviette 1 pli 30x30 cm blanche — pack de 100', 0.89, 100],
  ['102.38P', 'Serviette 1 pli 33x33 cm blanche — paquet de 100', 0.99, 100],
  // ── Boîtes à salade ──
  ['SKB 500',  'Boîte à salade carton KRAFT 500 ml — carton de 300', 26.90, 300],
  ['258.76',   'Boîte à salade carrée carton KRAFT 750 ml — carton de 300', 50.90, 300],
  ['240.10',   'Boîte à salade carton BLANC 750 ml — carton de 500', 64.49, 500],
  ['1010510',  'Combo boîte à salade KRAFT 500 ml + couvercle PET — pack de 25', 4.39, 25],
  // ── Sacs papier ──
  ['SKE06',            'Sac papier poignées plates 22+10x28 cm kraft — carton de 250', 14.90, 250],
  ['KB 22x10x28 BRUN', 'Sac papier poignées plates 22+10x28 cm kraft brun — carton de 250', 19.90, 250],
  ['SOS 18x11x35 BRUN S', 'Sac papier sans anses 18+11x35 cm kraft — carton de 500', 27.90, 500],
  ['SAC POULET',       'Sac poulet kraft blanc 18+6x34.5 cm — carton de 500', 28.29, 500],
  // ── Snacking ──
  ['274.03',  'Coque panini carton nano-micro vichy rouge 26.5x12.2x7 cm — carton de 300', 54.90, 300],
  ['BTE PIZZA 29X40', 'Boîte à pizza kraft imprimée 29x29x4 cm — pack de 100', 22.49, 100],
  ['253.36P', 'Boîte kraft macarons/sushi avec fenêtre 10x10x4 cm — paquet de 50', 7.59, 50],
  ['212.60P', 'Récipient carton double paroi + couvercle kraft 480 ml — paquet de 25', 5.29, 25],
  ['ECO 500 NOIRE PP', 'Boîte PP noire micro-ondable 500 ml — carton de 300', 30.90, 300],
  // ── Gobelets ──
  ['1011038',     'Gobelet carton blanc 12 cl — paquet de 50', 0.69, 50],
  ['POT FAST 25', 'Gobelet APET transparent 20/25 cl — paquet de 50', 2.49, 50],
  ['POT FAST 30', 'Gobelet APET transparent 25/30 cl — paquet de 50', 2.79, 50],
  ['POT FAST 35', 'Gobelet aPET transparent 30/35 cl — paquet de 50', 2.99, 50],
  // ── Divers comptoir ──
  ['PAC 3',     'Pot à sauce PET 30 ml + couvercle intégré — carton de 1000', 19.99, 1000],
  ['BOB 57x40', 'Rouleau papier thermique 57x40x12 mm — carton de 50 rouleaux', 11.99, 50],
  ['147.24',    'Support à pâtisserie rond OR Ø9 cm — pack de 100', 5.99, 100],
  // ── Sacs à pain et baguette ──
  ['280805', 'Sac à pain/baguette « Les mots » 9+4x60 cm — carton de 1000', 23.90, 1000],
  ['280810', 'Sac à pain/baguette « Les mots » 10+4x42 cm — carton de 1000', 16.49, 1000],
  ['280830', 'Sac à pain/baguette « Les mots » 14+5x60 cm — carton de 1000', 36.90, 1000],
  ['280840', 'Sac à pain/baguette « Les mots » 14+6x42 cm — carton de 1000', 24.90, 1000],
  ['280850', 'Sac à pain/baguette « Les mots » 19+7x42 cm — carton de 1000', 28.49, 1000],
  ['280860', 'Sac à pain « Les mots » 30+5x30 cm — carton de 1000', 26.49, 1000],
  ['255.79', 'Sac à pain/baguette kraft 9+3.5x46 cm — pack de 500', 10.90, 500],
  ['255.78', 'Sac à pain/baguette kraft 14+9x46 cm — pack de 500', 15.99, 500],
  // ── Sacs sandwich ──
  ['269.16',  'Sac sandwich Times 9+4x30 cm — pack de 500', 8.49, 500],
  ['269.17',  'Sac sandwich Times 12+4x26 cm — pack de 500', 9.39, 500],
  ['269.18',  'Sac sandwich Times 12+4x35 cm — pack de 500', 11.90, 500],
  ['252.59P', 'Étui roller pour sandwich 10.5x23 cm — paquet de 100', 9.39, 100],
  // ── Burger ──
  ['263.98', 'Sac burger Parole ALU 16x16.5 cm — pack de 500', 31.90, 500],
  ['270.42', 'Sac burger Parole ALU KRAFT 16x16.5 cm — pack de 500', 29.49, 500],
  // ── Boîtes pâtissières ──
  ['268.10', 'Boîte pâtissière MARRON 17x14x11.5 cm — paquet de 50', 16.49, 50],
  ['268.11', 'Boîte pâtissière BLANCHE 17x14x11.5 cm — paquet de 50', 16.49, 50],
  ['268.12', 'Boîte pâtissière blanche décorée 17x14x11.5 cm — paquet de 50', 16.49, 50],
  // ── Barquettes à frites ──
  ['BRK 6',  'Barquette à frites carton kraft 180 ml — carton de 1000', 41.90, 1000],
  ['BRK 10', 'Barquette à frites carton kraft 300 ml — carton de 1000', 46.90, 1000],
  ['BRK 13', 'Barquette à frites carton kraft 390 ml — carton de 500', 24.90, 500],
  ['BRK 23', 'Barquette à frites carton kraft 690 ml — carton de 500', 37.90, 500],
  ['BRK 32', 'Barquette à frites carton kraft 960 ml — carton de 500', 45.90, 500],
  ['234.85', 'Barquette à frites ondulé MARRON 7.4x4.8x3.3 cm — paquet de 200', 7.29, 200],
  ['252.18', 'Barquette à frites ondulé NOIR 10.6x7.2x5.2 cm — carton de 1200', 69.90, 1200],
  ['252.17', 'Barquette à frites ondulé NOIR 10x6.2x4.8 cm — carton de 1800', 90.90, 1800],
  // ── Boîtes à pizza : la gamme complète, pour l'ouverture de la pizzeria ──
  ['BTE PIZZA 26X40',  'Boîte à pizza kraft imprimée 26x26x4 cm — pack de 100', 18.90, 100],
  ['BTE PIZZA 31X40',  'Boîte à pizza kraft imprimée 31x31x4 cm — pack de 100', 23.49, 100],
  ['BTE PIZZA 33X40',  'Boîte à pizza kraft imprimée 33x33x4 cm — pack de 100', 25.90, 100],
  ['BTE PIZZA 34.5X40','Boîte à pizza kraft imprimée 34.5x34.5x4 cm — pack de 100', 29.90, 100],
  ['BTE PIZZA 40X40',  'Boîte à pizza kraft imprimée 40x40x4 cm — pack de 100', 36.90, 100],
  ['BTE PIZZA 50X40',  'Boîte à pizza kraft imprimée 50x50x4 cm — pack de 50', 32.90, 50],
  ['BTE PIZZA CALZONE','Boîte à pizza Calzone kraft imprimée 27x17x7 cm — pack de 200', 37.90, 200],
  ['TREPIED PIZZA',    'Trépied à pizza plastique blanc 3.8 cm — carton de 1000', 18.90, 1000],
]

// ⚠️ RELEVÉES MAIS NON IMPORTÉES, faute de conditionnement lisible à l'écran :
// « Barquette Hot Dog vichy rouge 23.5x10x3.5 » (279.92, 39,90 €), la même en
// kraft (279.91, 41,90 €), les boîtes pâtissières décorées 18x18 et 20x20
// (BTE PAT 18X5 / 20X5 DECOR, 10,49 et 12,29 €) et la 21x21 blanche et noire
// (274.00, 19,49 €). Sans le nombre d'unités, aucun prix à la pièce n'est
// calculable — et un conditionnement supposé donnerait un écart faux sur
// l'écran qui déclenche les commandes. À relever sur leur fiche produit.

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — Plaza Grossiste, relevé public du ${DATE} ──\n`)

let [f] = await sb('fournisseurs?nom=eq.Plaza%20Grossiste&select=id,nom')
if (!f) {
  console.log('  fournisseur absent → création')
  if (ECRIRE) [f] = await sb('fournisseurs', { method: 'POST', body: JSON.stringify({
    nom: 'Plaza Grossiste', actif: true,
    conditions_tarifaires: 'plaza-grossiste.com — emballages et équipements CHR. Vente en ligne, livraison offerte dès 299 €, '
      + `express 24/72 h sur une sélection. Relevé public du ${DATE}. `
      + '⚠️ BASE DE PRIX NON ÉTABLIE : le site n’indique nulle part si ses prix sont HT ou TTC. '
      + '⚠️ Aucune remise demandée à ce jour — à négocier.' }) })
  else f = { id: '(à créer)', nom: 'Plaza Grossiste' }
}
console.log(`  fournisseur : ${f.nom}\n`)

console.log('  référence            unités  prix      à l’unité   désignation')
for (const [ref, des, prix, n] of LIGNES)
  console.log(`  ${ref.padEnd(21)}${String(n).padStart(5)}  ${prix.toFixed(2).padStart(6)} €  ${(prix / n).toFixed(4).padStart(8)} €  ${des.slice(0, 54)}`)
console.log(`\n  ${LIGNES.length} références`)

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

const charge = LIGNES.map(([reference, designation, prix_ht, n]) => ({
  fournisseur_id: f.id, reference, designation, famille: 'EMBALLAGE',
  // ⚠️ `prix_ht` est le prix du COLIS, et `contenance` son nombre d'unités :
  // c'est ce qui permettra de comparer à l'unité le jour où la base sera
  // connue. On ne divise pas ici — le prix stocké reste celui qu'on lit.
  unite: 'colis', prix_ht, colis_quantite: n, colis_libelle: 'Col',
  contenance_valeur: n, contenance_unite: 'piece',
  cle_comparaison: null,            // ⚠️ base HT/TTC inconnue — voir l'en-tête
  nature: 'catalogue', tarif_negocie: false, date_tarif: DATE, actif: true,
  source: `Site public plaza-grossiste.com, relevé du ${DATE}. `
    + '⚠️ BASE À CONFIRMER : HT ou TTC non précisé par le site. Aucune remise demandée.',
}))
// ⚠️ `on_conflict` n'est PAS honoré ici — l'index unique de la table est
// partiel, et PostgREST ne sait pas le viser (piège déjà payé sur
// `inventaires`, 0134). Un simple upsert échoue en 23505 à la deuxième
// exécution. On efface donc le relevé DU JOUR pour CE fournisseur, puis on
// insère : rejouable, et sans dépendre de la forme de l'index.
await sb(`catalogue_fournisseur?fournisseur_id=eq.${f.id}&date_tarif=eq.${DATE}`,
  { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
await sb('catalogue_fournisseur',
  { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(charge) })
console.log(`\n  ✓ ${charge.length} références écrites chez ${f.nom}.\n`)
