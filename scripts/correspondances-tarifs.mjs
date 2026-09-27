// Les correspondances de comparaison, posées À LA MAIN.
//
//   node scripts/correspondances-tarifs.mjs [--ecrire]
//
// ⚠️ RIEN N'EST RAPPROCHÉ AUTOMATIQUEMENT (0151). Chaque paire ci-dessous a
// été examinée : même produit, même travail, même format. La suggestion se
// calcule, la décision s'enregistre — et c'est ce fichier qui l'enregistre,
// pour qu'elle soit relisible et rejouable.
//
// ⚠️ Le danger n'est PAS d'écrire un faux prix — un rapprochement n'en
// déplace aucun — mais d'afficher un « moins cher » qui compare deux
// produits. « JAMBON CUIT SUP AC 8K » (pièce entière à trancher) et
// « Jambon blanc tranché » partagent presque tous leurs mots sans être le
// même produit : le prix au kilo est plus bas parce que le travail reste à
// faire.
//
// Chaque ligne porte la RAISON de la décision. Les paires ÉCARTÉES sont
// listées en bas, avec leur motif : sans ça, dans six mois, on ne saura
// plus si c'était un oubli.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

// [ début d'identifiant, clé de comparaison, raison ]
const RETENUES = [
  // ─── Le même produit, le même format, chez un autre fournisseur ────
  ['f2bf0127', 'Jambon blanc tranché', 'jambon cuit tranché au kilo des deux côtés'],
  ['89a94cb3', 'Miel',                 'miel mille fleurs — le seau de 5 kg contre notre boîte de 1 kg, comparable au kilo'],
  ['53bd1971', 'Pain aux raisins',     'PAC 110 g par 60, exactement notre format'],
  ['fd4747ce', 'Poivre noir moulu',    'poivre noir moulu, 1 kg des deux côtés'],
  ['2b64c877', 'Éclair au chocolat',   'éclair chocolat 115 g contre 120 g — même classe de poids'],
  ['46971175', 'Sauce ketchup',        'squeeze GYMA 950 g, même contenant que notre Saxo 1040 g'],
  ['cfbf4347', 'Sel fin',              'sel fin en 12×1 kg, comparable au kilo'],

  // ─── La Frite Belge : 52 tarifs, aucun rattaché jusqu'ici ──────────
  // Ses contenances sont en KILOS au catalogue, donc tout se ramène au kilo
  // sans rien deviner. On retient DEUX formats par sauce : le tube, qui est
  // notre usage actuel, et le gros contenant, qui est l'économie réelle —
  // l'écran montre alors ce que le format coûte.
  ['71944eb1', 'Sauce mayonnaise', 'La Frite Belge, tube 1 L — même usage que notre squeeze'],
  ['24a91bac', 'Sauce mayonnaise', 'La Frite Belge, BIB 2×5 L — même recette, en vrac'],
  ['17d6c78c', 'Sauce mayonnaise', 'La Frite Belge, seau 10 L « chef » — le chiffre déjà relevé à la main'],
  ['f3bc85c7', 'Sauce ketchup',    'La Frite Belge, tube 1 L'],
  ['c6beddc9', 'Sauce ketchup',    'La Frite Belge, PET 3 L'],
  ['46fa915d', 'Sauce ketchup',    'La Frite Belge, seau 10 L'],
  ['b56da7c5', 'Sauce barbecue',   'La Frite Belge, PET 3 L — seul format proposé'],
]

// ⚠️ À GARDER : sans ce relevé, on ne saura plus dans six mois si une paire
// manquante est un oubli ou une décision.
const ECARTEES = [
  ['Croissant ← MINI CROISSANT CRU 25G', 'un mini de 25 g n’est pas notre 70 g'],
  ['Crème fraîche ← CREME FRAICHE 15% LEGERE', '15 % allégée contre 30 % épaisse : autre produit'],
  ['Filet de poulet rôti ← FILET POULET IQF CRU', 'le nôtre est cuit et tranché — le travail diffère, comme le jambon 8 kg'],
  ['Bûchette de chèvre ← BUCHE CHEVRE 1 KG', 'portion de 180 g contre bûche d’un kilo : usages différents'],
  ['Muffin choco-noisette ← MUFFIN PÂTE À TARTINER 120 G', '120 g contre 150 g, et fourré au lieu de pépites'],
  ['Sauce burger ← Hamburger géant / triple / smokey', 'trois recettes de burger : rien ne dit laquelle vaut notre « suprême »'],
  ['Sauce ketchup ← KETCHUP LOUIS MARTIN BID=5L', 'facturé au litre quand le reste est au kilo : casserait la comparabilité du groupe'],
  ['Thé, Chocolat chaud, Orangina, Oasis, Ciao, Pommes', 'aucune contrepartie réelle — les candidats ne partageaient qu’un mot'],
]

// ⚠️ PostgREST plafonne à 1 000 lignes SANS le dire, et `limit=5000` n'y
// change rien. Première version écrite ainsi : trois correspondances sur
// quatorze « introuvables », alors qu'elles étaient simplement au-delà du
// millième rang. Le catalogue en compte plus de 3 300.
const lignes = []
for (let de = 0; de < 20000; de += 1000) {
  const lot = await sb(`catalogue_fournisseur?select=id,designation,cle_comparaison,fournisseur_id,prix_ht,unite&actif=eq.true&cle_comparaison=is.null&offset=${de}&limit=1000`)
  lignes.push(...lot)
  if (lot.length < 1000) break
}
const fourns = await sb('fournisseurs?select=id,nom')
const nomF = new Map(fourns.map(f => [f.id, f.nom]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · correspondances de comparaison ──\n`)

const aEcrire = []
for (const [debut, cle, raison] of RETENUES) {
  const cands = lignes.filter(l => l.id.startsWith(debut))
  if (cands.length !== 1) {
    console.log(`  ✗ ${debut} — ${cands.length} ligne(s) trouvée(s), on n'écrit pas dans le doute`)
    continue
  }
  const l = cands[0]
  console.log(`  ✓ ${cle.padEnd(22)} ← ${(nomF.get(l.fournisseur_id) ?? '').padEnd(21)} ${l.designation.slice(0, 40)}`)
  console.log(`      ${raison}`)
  aEcrire.push({ id: l.id, cle })
}

console.log(`\n  ${aEcrire.length} correspondance(s) à poser.`)
console.log(`\n  Écartées volontairement :`)
for (const [q, pourquoi] of ECARTEES) console.log(`   · ${q}\n       → ${pourquoi}`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

for (const { id, cle } of aEcrire) {
  await sb(`catalogue_fournisseur?id=eq.${id}`, {
    method: 'PATCH', body: JSON.stringify({ cle_comparaison: cle }),
    headers: { Prefer: 'return=minimal' },
  })
}
console.log(`\n✓ ${aEcrire.length} correspondance(s) posée(s).\n`)
