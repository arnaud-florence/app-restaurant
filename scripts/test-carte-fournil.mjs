// Test d'intégration — carte réelle du Fournil (migration 0113).
//
// Vérifie que le catalogue en base correspond exactement aux 13 affiches
// CasaTasia : 60 produits, aux bons prix TTC, avec la bonne TVA et une photo
// qui existe réellement dans public/produits/.
//
// Lecture seule : ce test ne crée rien et n'a donc rien à nettoyer.
//
// Usage : node scripts/test-carte-fournil.mjs
//         PORT=3000 node scripts/test-carte-fournil.mjs   (ajoute le contrôle HTTP)

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const l of env.split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

let nbOk = 0, nbKo = 0
const fails = []
const ok = m => { console.log(`  ✓ ${m}`); nbOk++ }
const ko = (m, e) => { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m} : ${e}`) }
const step = async (n, fn) => {
  console.log(`\n→ ${n}`)
  try { await fn() } catch (e) { ko(`${n} (exception)`, e.message) }
}

// LES PRIX DE LA CARTE — la référence de ce test.
//
// ⚠️⚠️ CE NE SONT PLUS « LES AFFICHES DE SEPTEMBRE ». Le 04/10/2026 ce test
// sortait rouge sur 31 écarts, tous vers le haut (croissant 1,20 → 1,40 €,
// part de flan 2,50 → 3,80 €, tropézienne 2,50 → 3,80 €). Vérification faite
// auprès du gérant : **les nouvelles affiches sont les bonnes, les anciens
// prix ne le sont plus.** C'était donc la référence qui était périmée, pas la
// base.
//
// ⚠️ CE QUE CE TEST PROTÈGE A CHANGÉ DE NATURE, et il faut le dire : il ne
// contrôle plus « la base colle aux affiches » — on n'a aucune copie
// numérique des affiches — mais **« aucun prix ne bouge sans que quelqu'un
// mette cette liste à jour »**. C'est un garde-fou contre la DÉRIVE
// SILENCIEUSE : le miroir du catalogue Zelty, la propagation des factures et
// les scripts d'amorçage écrivent tous des prix, et aucun ne demande
// l'autorisation.
//
// ⚠️ Donc quand ce test rougit : on regarde D'ABORD si le changement était
// voulu. S'il l'était, on met cette liste à jour EN MÊME TEMPS que le prix —
// jamais après coup, sinon elle redevient un décor.
//
// Dernière confirmation par le gérant : 04/10/2026.
// ⚠️ Mise à jour du 06/10/2026, sur la facture Gineys 03777865 — la
// première livraison d'ouverture. « Pavé multicéréales » disparaît : c'est
// « Pavé Le Jeannot », le nom Arti'Pat de la référence 0071374, au même
// prix. Les huit produits ajoutés viennent de cette facture ou de décisions
// du gérant ; ils sont ici, et pas dans HORS_AFFICHE, parce qu'un prix
// ARRÊTÉ doit être protégé de la dérive silencieuse — c'est tout l'objet de
// cette liste.
const AFFICHES = {
  // Créés le 05/10/2026 depuis le catalogue Arti'Pat, puis rechiffrés sur la
  // facture du 06/10 : leur coût a baissé de 10 à 37 %, leur prix n'a pas
  // bougé.
  'Mini beignet nature': 1.2, 'Mini beignet chocolat': 1.7,
    // ⚠️ « Baguette Paris » et pas « Pain Paris » : la facture dit 50 cm pour
  // 280 g, c'est un format baguette. Corrigé le 06/10/2026 sur remarque du
  // gérant — le nom de vitrine doit décrire ce que le client achète.
  'Baguette Jeannette': 2.1, 'Baguette Paris': 3.0, 'Pavé Le Jeannot': 4.2,
  // ⚠️ Les deux focaccias se vendent à la PART : 8 parts par plaque,
  // décision du gérant du 06/10. Le prix est calé sur les pizzas à la
  // plaque — même format, même geste au comptoir.
  'Focaccia ail-basilic': 2.9, 'Focaccia tomate cerise': 2.9,
  'Donut fourré': 2.2,
  'Baguette classique': 1.2, 'Baguette Victoire': 1.5, 'Bâtard céréales': 3.2,
  'Bâtard maïs et graines': 3.2, 'Café allongé': 1.4, 'Café expresso': 1.4,
  'Café noisette': 1.5, 'Campestre multicéréales': 2, 'Cannelé': 1.5,
  'Cappuccino': 2.5, 'Chausson aux pommes': 1.5, 'Chocolat chaud': 2.5,
  'Coca-Cola 1,5 L': 3.5, 'Coca-Cola 33 cl': 2, 'Coca-Cola Zéro 1,5 L': 3.5,
  'Coca-Cola Zéro 33 cl': 2, 'Cookie chocolat': 2.9, 'Croissant': 1.4,
  'Eau gazeuse 50 cl': 2, 'Eau plate 50 cl': 1, 'Éclair au chocolat': 3.6,
  'Fondant au chocolat': 3.8, 'Formule Petit-déjeuner complet': 4.3, 'Formule salade + boisson': 5.8,
  'Formule salade + boisson + dessert': 8.1, 'Formule sandwich ou panini + boisson': 6.2, 'Formule sandwich ou panini + boisson + dessert': 8.5,
  'Formule Tartine': 4.4, 'Ice Tea 33 cl': 2, 'Ice Tea pêche 1,5 L': 3.5,
  'Jus d\'orange 33 cl': 2.2, 'Jus de pomme 33 cl': 2.2, 'Le Nordique': 5.5,
  'Le Parisien': 4.5, 'Le Poulet': 4.9, 'Le Rosette': 4.5,
  'Madeleine chocolat-noisette': 1.9, 'Muffin chocolat-noisette': 3.5, 'Muffin citron': 3.5,
  'Oasis tropical 1,5 L': 3.5, 'Orangina 1,5 L': 3.5, 'Orangina 33 cl': 2,
  'Pain au chocolat': 1.4, 'Pain aux raisins': 1.8, 'Pain complet': 2.6,
  'Pain lin-tournesol': 4.2, 'Panini chèvre-miel': 4.9, 'Panini jambon-fromage': 4.5,
  'Panini poulet-pesto': 4.9, 'Part de flan pâtissier': 3.8,
  'Perrier 33 cl': 2, 'Pizza à la plaque jambon-fromage': 2.9, 'Pizza à la plaque Margherita': 2.9,
  'Pizza ronde chèvre-miel': 3.9, 'Pizza ronde poulet-pesto': 3.9, 'Pizza ronde Reine': 3.9,
  'Sacristain': 3.2, 'Salade italienne': 5.4, 'Salade poulet-feta': 5.2,
  'Salade saumon': 6, 'Tarte aux pommes': 3.8, 'Tartelette citron meringuée': 3.8,
  'Thé': 2, 'Tiramisu individuel': 3.8, 'Tropézienne individuelle': 3.8,
}
// « Glace » est née le 28/08/2026 pour quatre produits arrivés par les tickets
// SumUp et qui ne se rangeaient nulle part. Vendues à emporter, elles suivent
// le taux réduit comme les autres gourmandises.
const TVA_REDUITE = new Set(['Pain', 'Viennoiserie', 'Pâtisserie', 'Gourmandise', 'Glace'])
// Produits indicatifs de la carte de démarrage 0095 : ne doivent plus être vendus.
const CARTE_0095 = ['Pain', 'Pain de campagne', 'Baguette tradition',
  'Brioche', 'Macaron', 'Mille-feuille', 'Tarte aux pommes (part)', 'Soda / Eau', 'Café crème',
  'Quiche lorraine (part)', 'Pizza fournil (part)', 'Sandwich jambon-beurre',
  'Sandwich poulet crudités']

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — carte réelle du Fournil (13 affiches)             ║')
console.log('╚══════════════════════════════════════════════════════════╝')

const { data: carte, error } = await sb.from('recettes')
  .select('id, nom, categorie, prix_vente_ht, tva, image_url, description, actif, vendable_online, etablissement_id')
  .eq('tag_destination', 'FOURNIL')
if (error) { console.error('Lecture des recettes impossible :', error.message); process.exit(1) }
const actifs = carte.filter(r => r.actif)

// Produits absents des affiches mais réellement vendus, découverts dans les
// tickets SumUp (cf. 0121). Ils n'ont ni photo ni panneau : c'est normal, ils
// n'ont jamais été imprimés. La caisse fait foi, pas l'affiche.
const HORS_AFFICHE = new Set([
  'Oasis 33 cl', 'Fanta 33 cl', 'Coca-Cola Cherry 33 cl', 'Ciao 33 cl',
  'Red Bull 25 cl', 'Salade',
  'Formule — sandwich ou panini', 'Formule — boisson', 'Formule — dessert',
  'Formule — croissant ou pain au chocolat', 'Formule — expresso ou allongé',
  // Arrivés par les tickets SumUp puis classés le 28/08/2026 : ils ne figurent
  // sur aucune affiche, ce qui ne les rend pas illégitimes.
  'Croque-monsieur', 'Paris-Brest', 'Moelleux au chocolat', 'Pain restaurant',
  'Panuozzi', 'Donuts', 'Cappuccino ou chocolat chaud',
  'Pago orange 20 cl', 'Pago pomme 20 cl', 'Pago pomme 33 cl', 'Red Bull Ice',
  'Sunroll', 'Fusée', 'Mario', 'Cône vanille',
  // Créés après coup, sur facture ou décision : ils ne figurent sur aucune
  // affiche, ce qui ne les rend pas illégitimes.
  'Pago orange 33 cl', 'Focaccia',
  // Remis en vente le 28/08/2026. Il n'a pas d'affiche : les trois pains aux
  // céréales imprimés sont le bâtard, le campestre et le pavé.
  'Pain aux céréales',
])

// Retirés du click & collect par la 0115 : une tasse ne voyage pas, et une
// formule « salade + boisson » ne dit pas laquelle.
const HORS_LIGNE_VOULU = new Set([
  'Café expresso', 'Café allongé', 'Café noisette', 'Cappuccino',
  'Chocolat chaud', 'Thé',
  'Formule salade + boisson', 'Formule sandwich ou panini + boisson',
  'Formule salade + boisson + dessert', 'Formule sandwich ou panini + boisson + dessert',
  'Formule Express', 'Formule Douceur chaude',
  'Formule Petit-déjeuner complet', 'Formule Tartine',
  ...HORS_AFFICHE,
])

await step('périmètre de la carte', async () => {
  // Les produits retirés de la vente ne comptent plus dans l'actif — qu'ils
  // viennent d'une affiche ou de la caisse. ⚠️ La règle ne valait que pour
  // les affiches : le 28/09/2026, les quatre Pago sortis de la carte ont
  // fait échouer ce test alors qu'ils avaient été retirés exprès. Un test
  // rouge sur une décision assumée finit par être ignoré.
  // ⚠️⚠️ LE COMPTE SE DÉDUIT DE LA BASE, PAS D'UNE SOUSTRACTION À LA MAIN.
  // L'ancienne formule faisait « AFFICHES − retirés + HORS_AFFICHE − retirés
  // caisse » : elle supposait que chaque nom des deux listes correspond à un
  // produit FOURNIL. Faux — « Moelleux au chocolat » y figure et appartient à
  // la CUISINE, ce qui décalait le total de un sans qu'on sache pourquoi.
  // Une assertion qu'on ne sait pas expliquer finit par être « ajustée »
  // jusqu'à passer, et elle ne protège plus de rien.
  //
  // Ce qui compte vraiment : AUCUN produit actif ne doit être hors des deux
  // listes. C'est ça qu'on vérifie, et le nombre en découle.
  const connus = new Set([...Object.keys(AFFICHES), ...HORS_AFFICHE])
  const inconnus = actifs.filter(r => !connus.has(r.nom)).map(r => r.nom)
  if (inconnus.length === 0) ok(`${actifs.length} produits actifs, tous connus de la référence`)
  else ko('produits hors référence', `${inconnus.length} inconnu(s) : ${inconnus.join(', ')}`)

  const enBase = new Set(actifs.map(r => r.nom))
  // Un produit d'affiche DÉSACTIVÉ n'est pas manquant : il a été retiré de la
  // vente et reste en base parce qu'il figure sur une commande passée.
  const tousNoms = new Set(carte.map(r => r.nom))
  const manquants = Object.keys(AFFICHES).filter(n => !enBase.has(n) && !tousNoms.has(n))
  const enTrop = [...enBase].filter(n => !(n in AFFICHES) && !HORS_AFFICHE.has(n))
  if (manquants.length === 0) ok('aucun produit d’affiche manquant')
  else ko('produits manquants', manquants.join(', '))
  if (enTrop.length === 0) ok('aucun produit inconnu (ni affiche, ni caisse)')
  else ko('produits inconnus', enTrop.join(', '))
})

await step('prix TTC conformes aux affiches', async () => {
  const ecarts = []
  for (const r of actifs) {
    const attendu = AFFICHES[r.nom]
    if (attendu === undefined) continue
    const ttc = Math.round(Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100) * 100) / 100
    if (Math.abs(ttc - attendu) > 0.011) ecarts.push(`${r.nom} : ${ttc} € au lieu de ${attendu} €`)
  }
  if (ecarts.length === 0) ok(`${actifs.length} prix TTC exacts (à 1 centime près)`)
  else ko('écarts de prix', ecarts.join(' | '))
})

await step('TVA par famille (vente à emporter)', async () => {
  const mauvais = actifs.filter(r => {
    // Un composant de formule suit le taux de ce qu'il contient, pas celui de
    // sa catégorie : « croissant ou pain au chocolat » reste de la
    // viennoiserie à 5,5 %, et c'est le taux que SumUp facture.
    if (HORS_AFFICHE.has(r.nom)) return false
    const attendue = TVA_REDUITE.has(r.categorie) ? 5.5 : 10
    return Number(r.tva) !== attendue
  })
  if (mauvais.length === 0) ok('5,5 % pain/viennoiserie/pâtisserie/gourmandise, 10 % ailleurs')
  else ko('TVA incorrecte', mauvais.map(r => `${r.nom} (${r.categorie} → ${r.tva} %)`).join(', '))
})

// Les produits nés des tickets échappent au contrôle « famille → taux » faute
// d'affiche de référence. Ce contrôle-ci ne dépend d'aucune référence : à
// l'intérieur d'une même famille, deux produits ne peuvent pas être à des taux
// différents. C'est ainsi qu'on attrape l'intrus — et un taux TROP BAS est le
// seul qui ne se rattrape pas.
await step('cohérence des taux au sein d’une famille', async () => {
  const parFamille = {}
  for (const r of actifs) {
    if (r.contient_alcool) continue
    // Un composant de formule suit le taux de ce qu'il contient, pas celui de
    // sa famille : « croissant ou pain au chocolat » est de la viennoiserie.
    if (r.nom.startsWith('Formule — ')) continue
    ;(parFamille[r.categorie] ??= new Map()).set(Number(r.tva),
      [...((parFamille[r.categorie].get(Number(r.tva))) ?? []), r.nom])
  }
  // Deux exceptions VRAIES, documentées plutôt que masquées :
  //  · « Bière » contient la bière SANS alcool, à 10 % — ce n'est pas une
  //    boisson alcoolique au sens fiscal, mais elle a sa place sur l'ardoise
  //    à côté des autres bières ;
  //  · « Formule » contient le composant viennoiserie à 5,5 %, dont le taux
  //    suit ce qu'il contient et non sa famille.
  const EXCEPTIONS = new Set(['Bière', 'Formule'])
  const melangees = Object.entries(parFamille)
    .filter(([c, m]) => m.size > 1 && !EXCEPTIONS.has(c))
  if (melangees.length === 0) ok(`${Object.keys(parFamille).length} familles à taux unique`)
  else ko('taux mélangés dans une même famille', melangees.map(([c, m]) =>
    `${c} : ` + [...m.entries()].map(([t, noms]) =>
      `${t} % (${noms.length === 1 ? noms[0] : noms.length + ' produits'})`).join(' vs ')).join(' | '))
})

await step('photos', async () => {
  const surAffiche = actifs.filter(r => !HORS_AFFICHE.has(r.nom))
  const sansPhoto = surAffiche.filter(r => !r.image_url)
  if (sansPhoto.length === 0) ok(`les ${surAffiche.length} produits d’affiche ont leur photo`)
  else ko('produits sans photo', sansPhoto.map(r => r.nom).join(', '))

  const relatives = actifs.filter(r => r.image_url && !r.image_url.startsWith('http'))
  if (relatives.length === 0) ok('toutes les URL sont absolues (indispensable pour le site vitrine)')
  else ko('URL relatives', relatives.map(r => r.nom).join(', '))

  const absents = actifs.filter(r => {
    const f = (r.image_url ?? '').split('/').pop()
    return f && !existsSync(`public/produits/${f}`)
  })
  if (absents.length === 0) ok('chaque photo existe dans public/produits/')
  else ko('fichiers photo manquants', absents.map(r => r.nom).join(', '))

  // On ne compte que les vraies URL : 11 produits sans photo partagent `null`,
  // ce qui n'est pas une photo réutilisée.
  const doublons = Object.entries(
    actifs.filter(r => r.image_url)
      .reduce((a, r) => { a[r.image_url] = (a[r.image_url] ?? 0) + 1; return a }, {}),
  ).filter(([, n]) => n > 1)
  if (doublons.length === 0) ok('aucune photo réutilisée sur deux produits')
  else ko('photos partagées', doublons.map(([u, n]) => `${u.split('/').pop()} ×${n}`).join(', '))
})

await step('mise en vente', async () => {
  const horsLigne = actifs.filter(r => !r.vendable_online)
  const inattendus = horsLigne.filter(r => !HORS_LIGNE_VOULU.has(r.nom))
  const enLigne = actifs.length - horsLigne.length
  if (inattendus.length === 0) ok(`${enLigne} produits commandables en ligne, ${horsLigne.length} au comptoir seulement (voulu)`)
  else ko('produits retirés de la vente en ligne sans raison', inattendus.map(r => r.nom).join(', '))

  const { data: etab } = await sb.from('etablissements').select('id').eq('slug', 'fournil').maybeSingle()
  const orphelins = actifs.filter(r => r.etablissement_id !== etab?.id)
  if (orphelins.length === 0) ok('tous rattachés au point de vente « fournil »')
  else ko('produits non rattachés', orphelins.map(r => r.nom).join(', '))
})

await step('purge de la carte de démarrage 0095', async () => {
  const restants = actifs.filter(r => CARTE_0095.includes(r.nom))
  if (restants.length === 0) ok('aucun article de test encore en vente')
  else ko('articles de test toujours actifs', restants.map(r => r.nom).join(', '))

  const desactives = carte.filter(r => !r.actif)
  if (desactives.length > 0) {
    console.log(`  ℹ ${desactives.length} ancien(s) produit(s) désactivé(s) plutôt que supprimé(s) `
      + `(déjà présents sur une commande) : ${desactives.map(r => r.nom).join(', ')}`)
  }
})

if (process.env.PORT) {
  await step(`API publique (http://localhost:${process.env.PORT}/api/public/menu)`, async () => {
    // ⚠️ L'API publique exige `x-api-key` — elle a été fermée après l'écriture
    // de ce test, qui appelait donc sans clé et échouait en 401 sur un
    // comportement CORRECT. Un test rouge en permanence finit par être
    // ignoré, et ce jour-là il ne protège plus rien.
    const res = await fetch(`http://localhost:${process.env.PORT}/api/public/menu`,
      { headers: { 'x-api-key': process.env.PUBLIC_API_KEY ?? '' } })
    if (!res.ok) { ko('appel API', `HTTP ${res.status}`); return }
    const { items } = await res.json()
    // ⚠️ Le champ s'appelle `tag` dans la réponse publique, pas
    // `tag_destination` : filtrer sur le nom interne rendait la liste VIDE
    // et faisait dire au test « 0 produit servi » alors que l'API en sert 89.
    const fournil = (items ?? []).filter(i => i.tag === 'FOURNIL')
    // ⚠️ Le menu public exige une PHOTO : les cinq composants « Formule — … »
    // n'en ont pas, et n'en auront pas — ce ne sont pas des produits
    // autonomes. Les attendre sur le site faisait échouer le test sur le
    // comportement voulu.
    const attendus = actifs.filter(r => r.image_url)
    if (fournil.length === attendus.length) ok(`${fournil.length} produits servis au site (${actifs.length - attendus.length} composants de formule exclus, sans photo)`)
    else ko('carte publique', `${fournil.length} produits servis, ${attendus.length} attendus`)
    const sansPhoto = fournil.filter(i => !i.image_url)
    if (sansPhoto.length === 0) ok('photos transmises au site')
    else ko('photos absentes de l’API', sansPhoto.map(i => i.nom).join(', '))
  })
}

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${nbOk} succès, ${nbKo} échec(s)`)
if (nbKo > 0) { console.log('\nÉchecs :'); fails.forEach(f => console.log(`  • ${f}`)) }
console.log('══════════════════════════════════════════════════════════')
process.exit(nbKo > 0 ? 1 : 0)
