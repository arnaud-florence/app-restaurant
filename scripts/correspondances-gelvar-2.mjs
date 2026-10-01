// Rattacher le devis Gel Var du 28/09 à nos matières.
//
// ⚠️ CHAQUE PAIRE EST UNE DÉCISION, JAMAIS UN RAPPROCHEMENT AUTOMATIQUE (0151).
// La méthode « racine de cinq lettres » range « Roquette » sous « ROQUEFORT »
// et « Citron » sous « GATEAU CITRON ROND ». La suggestion se calcule, la
// décision s'enregistre — et les paires ÉCARTÉES sont listées en bas avec leur
// motif : sans elles, dans six mois, on ne saura plus si une paire absente est
// un oubli ou un choix.
//
//   node scripts/correspondances-gelvar-2.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

// référence Gel Var → nom EXACT de notre matière. Motif obligatoire.
const PAIRES = [
  ['01303003', 'Champignons émincés (kg)',   'émincé des deux côtés, même travail'],
  ['01302034', 'Poivrons en lanières (kg)',  'lanières des deux côtés'],
  ['01302019', 'Aubergines grillées (kg)',   'grillée, 1 kg'],
  ['01302017', 'Courgettes grillées (kg)',   'grillée, 1 kg'],
  ['30450008', 'Mozzarella râpée',           'râpée, 2,5 kg'],
  ['03104040', 'Mozzarella cerise',          'bille de 5 g, seau d’1 kg — identique au Gineys'],
  ['03202089', 'Chorizo tranché (kg)',       'tranché, et « PIZZA » est notre usage'],
  ['03202013', 'Rosette de Lyon',            'tranchée, 500 g'],
  ['03203016', 'Coppa tranchée (kg)',        'tranchée, 250 g'],
  ['03201006', 'Jambon cru Serrano',         'serrano tranché interfolié, 500 g comme le nôtre'],
  ['03203005', 'Lardons fumés (kg)',         'allumettes fumées, 1 kg — même forme que le Félix Potin'],
  ['03411002', 'Jambon blanc tranché',       'jambon supérieur en tranches'],
  ['01005005', 'Saumon fumé tranché',        'tranché, 1 kg — AUCUN fournisseur ne le couvrait'],
  ['30460003', 'Emmental râpé',              'râpé 45 %, 1 kg'],
  ['03105006', 'Gorgonzola (kg)',            'AOC, 1,5 kg'],
  ['03106007', 'Reblochon (kg)',             'de Savoie, 520 g'],
  ['03003001', 'Beurre doux',                'doux, 250 g'],
  ['04207023', 'Miel liquide',               'liquide mille fleurs, 1 kg'],
  ['04203002', 'Câpres (kg)',                'fines au 4/4 — MÊME FORMAT de boîte que le Félix Potin'],
  ['04602025', 'Olives noires',              'même usage pizza ; ⚠️ BRISURE, à garder en tête'],
  ['04518014', 'Cerneaux de noix (kg)',      'cerneaux extra, 1,8 kg'],
  ['04509003', 'Huile d’olive',              'vierge extra, 5 L'],
  ['04209014', 'Huile de friture (litre)',   'friture, 5 L'],
  ['01304000', 'Frites surgelées (kg)',      '10/10 bi-température, comme la nôtre'],
  ['01305008', 'Gnocchis frais (kg)',        'gnocchi 1 kg'],
  ['04201001', 'Farine T55',                 'T55, 1 kg × 10'],
  ['03801032', 'Viande hachée de bœuf (kg)', 'hachée fraîche, 1,5 kg'],
  ['01101101', 'Bœuf pour carpaccio (kg)',        'carpaccio VBF, 1,4 kg'],
  ['04204042', 'Sauce barbecue',             'squeeze Colona, 950 ml'],
  ['04204022', 'Sauce kebab',                'squeeze Colona pita, 840 g'],
  ['04203066', 'Sauce mayonnaise',           'squeeze Colona, 830 g'],
  ['04203065', 'Sauce ketchup',              'squeeze, 1 L'],
  ['01101079', 'Entrecôte de bœuf (kg)',    'TRANCHÉE 280/320 g comme la nôtre — la Simmental 3/5 kg est une pièce entière'],
  ['03103011', 'Parmesan (kg)',             'Parmigiano Reggiano en bloc — AUCUN fournisseur ne le couvrait'],
  ['04203084', 'Cornichons (kg)',           '5/1, le format du Gineys — le 4/4 est une autre boîte'],
]

// Examinées et REFUSÉES. Le motif compte autant que la paire retenue.
const ECARTEES = [
  ['03104006', 'Mozzarella râpée',   'MAESTRELLA à 6,211 € contre 6,092 : même produit, on garde la moins chère des deux lignes Gel Var'],
  ['01105033', 'Filet de poulet rôti', '⚠️ « FILET ENTIER » à 10,859 €/kg — le nôtre est TRANCHÉ. Le travail diffère, comme le jambon en pièce face au jambon tranché'],
  ['03105003', 'Camembert 250 g (pièce)', '« NEUTRE » 240 g : c’est un camembert de CUISSON, pas celui de la planche'],
  ['03104022', 'Burrata 125 g (pièce)', '120 g contre 125 g, et vendue par 6 — le format ne concorde pas'],
  ['01101009', 'Steak haché de bœuf 150 g (pièce)', 'facturé au KILO, notre matière se compte à la PIÈCE : la conversion se ferait de tête'],
  ['10210010', 'Viande hachée de bœuf (kg)', '« ÉGRENÉE » à 9,45 € : viande cuite émiettée, pas de la hachée crue'],
  ['03203001', 'Lardons fumés (kg)', 'trois lignes de lardons ; on retient l’allumette, qui est notre forme'],
  ['04209026', 'Huile de friture (litre)', 'bidon de 15 L à 2,388 € — un centième de moins que le 5 L, mais il faut le stocker'],
  ['01502018', 'Pâton à pizza (pièce)', '350 g contre notre pâton — grammage à confirmer avant de comparer'],
  ['01101065', 'Entrecôte de bœuf (kg)', 'Simmental 3/5 kg : PIÈCE ENTIÈRE à trancher, pas le même travail'],
  ['03202060', 'Andouillette (pièce)', 'quantité 0,50 face à 3 × 190 g : la base de facturation ne concorde pas'],
  ['04203007', 'Cornichons (kg)', 'boîte 4/4 quand le Gineys est en 5/1 — deux formats'],
  ['01101065', 'Entrecôte de bœuf (kg)', 'Simmental 3/5 kg : PIÈCE ENTIÈRE à trancher, pas le même travail'],
  ['03202060', 'Andouillette (pièce)', 'quantité 0,50 face à 3 × 190 g : la base de facturation ne concorde pas'],
  ['04203007', 'Cornichons (kg)', 'boîte 4/4 quand le Gineys est en 5/1 — deux formats'],
]

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — Gel Var ↔ nos matières ──\n`)
const [gv] = await sb('fournisseurs?nom=ilike.*gel%20var*&select=id,nom')
const lignes = await sb(`catalogue_fournisseur?fournisseur_id=eq.${gv.id}&date_tarif=eq.2026-09-28&select=id,reference,designation,prix_ht,unite,contenance_valeur,contenance_unite`)
const parRef = new Map(lignes.map(l => [l.reference, l]))

let ok = 0, ko = 0
for (const [ref, matiere, motif] of PAIRES) {
  const l = parRef.get(ref)
  const [i] = await sb(`ingredients?nom=eq.${encodeURIComponent(matiere)}&select=id,nom,unite,prix_achat_ht,prix_estime`)
  if (!l) { console.log(`  ✗ ${ref} absente du devis`); ko++; continue }
  if (!i) { console.log(`  ✗ matière « ${matiere} » introuvable  (${l.designation})`); ko++; continue }
  console.log(`  ${matiere.slice(0, 28).padEnd(29)} ← ${l.designation.slice(0, 42).padEnd(43)} ${String(l.prix_ht).padStart(8)} €/${l.unite}`)
  console.log(`  ${' '.repeat(29)}   ${motif}`)
  ok++
  if (ECRIRE) await sb(`catalogue_fournisseur?id=eq.${l.id}`,
    { method: 'PATCH', body: JSON.stringify({ cle_comparaison: matiere, ingredient_id: i.id }) })
}

// ⚠️ Deux matières n'avaient AUCUN fournisseur. Gel Var couvre la première.
// On pose le fournisseur, PAS le prix : un devis est une proposition, une
// facture est une preuve (0151) — le coût attend la première livraison.
for (const [matiere, note] of [['Saumon fumé tranché', 'Gel Var — seul à le proposer, devis du 28/09/2026']]) {
  const [i] = await sb(`ingredients?nom=eq.${encodeURIComponent(matiere)}&select=id,nom,fournisseur_principal`)
  if (!i) continue
  console.log(`\n  ▸ ${matiere} : fournisseur ${i.fournisseur_principal ? `« ${i.fournisseur_principal} »` : 'ABSENT'} → Gel Var`)
  if (ECRIRE && !i.fournisseur_principal)
    await sb(`ingredients?id=eq.${i.id}`, { method: 'PATCH', body: JSON.stringify({ fournisseur_principal: note }) })
}

console.log(`\n── ${ECARTEES.length} paires examinées et ÉCARTÉES ──`)
for (const [ref, m, motif] of ECARTEES) console.log(`  ${ref} ${m.slice(0, 26).padEnd(27)} ${motif}`)

console.log(`\n  ${ok} rattachées, ${ko} en échec`)
console.log(ECRIRE ? '  ✓ écrit.\n' : '  (essai à blanc — relancer avec --ecrire)\n')
