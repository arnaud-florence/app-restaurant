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

// Prix TTC des affiches — la source de vérité de ce test.
const AFFICHES = {
  'Baguette classique': 1.20, 'Baguette Victoire': 1.40, 'Campestre multicéréales': 1.80,
  'Pain complet': 2.30, 'Bâtard céréales': 2.80, 'Bâtard maïs et graines': 2.80,
  'Pain lin-tournesol': 3.50, 'Pavé multicéréales': 3.50,
  'Croissant': 1.20, 'Pain au chocolat': 1.30, 'Pain aux raisins': 1.60, 'Chausson aux pommes': 1.50,
  'Part de flan pâtissier': 2.50, 'Tropézienne individuelle': 2.50, 'Tartelette citron meringuée': 2.90,
  'Éclair au chocolat': 3.20, 'Tiramisu individuel': 3.20,
  'Cannelé': 1.50, 'Madeleine chocolat-noisette': 1.50, 'Cookie chocolat': 2.40,
  'Sacristain': 2.50, 'Muffin chocolat-noisette': 2.80, 'Muffin citron': 2.80,
  'Le Parisien': 4.50, 'Le Poulet': 4.90, 'Le Rosette': 4.50, 'Le Nordique': 5.50,
  'Panini jambon-fromage': 4.50, 'Panini poulet-pesto': 4.90, 'Panini chèvre-miel': 4.90,
  'Salade poulet-feta': 4.50, 'Salade italienne': 4.90, 'Salade saumon': 5.50,
  'Pizza à la plaque Margherita': 2.90, 'Pizza à la plaque jambon-fromage': 2.90,
  'Pizza ronde Reine': 3.90, 'Pizza ronde poulet-pesto': 3.90, 'Pizza ronde chèvre-miel': 3.90,
  'Eau plate 50 cl': 1.00, 'Eau gazeuse 50 cl': 1.50, 'Coca-Cola 33 cl': 1.80,
  'Coca-Cola Zéro 33 cl': 1.80, 'Ice Tea 33 cl': 1.80, 'Orangina 33 cl': 1.80,
  "Jus d'orange 25 cl": 1.80, 'Jus de pomme 25 cl': 1.80,
  'Café expresso': 1.20, 'Café allongé': 1.20, 'Café noisette': 1.50,
  'Cappuccino': 2.50, 'Chocolat chaud': 2.50, 'Thé': 2.00,
  'Formule salade + boisson': 5.80, 'Formule sandwich ou panini + boisson': 6.20,
  'Formule salade + boisson + dessert': 8.10, 'Formule sandwich ou panini + boisson + dessert': 8.50,
  'Formule Express': 2.20, 'Formule Douceur chaude': 3.40,
  'Formule Petit-déjeuner complet': 3.80, 'Formule Tartine': 4.20,
}
const TVA_REDUITE = new Set(['Pain', 'Viennoiserie', 'Pâtisserie', 'Gourmandise'])
// Produits indicatifs de la carte de démarrage 0095 : ne doivent plus être vendus.
const CARTE_0095 = ['Pain', 'Pain de campagne', 'Pain aux céréales', 'Baguette tradition',
  'Brioche', 'Macaron', 'Mille-feuille', 'Tarte aux pommes (part)', 'Soda / Eau', 'Café crème',
  'Croque-monsieur', 'Quiche lorraine (part)', 'Pizza fournil (part)', 'Sandwich jambon-beurre',
  'Sandwich poulet crudités']

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — carte réelle du Fournil (13 affiches)             ║')
console.log('╚══════════════════════════════════════════════════════════╝')

const { data: carte, error } = await sb.from('recettes')
  .select('id, nom, categorie, prix_vente_ht, tva, image_url, description, actif, vendable_online, etablissement_id')
  .eq('tag_destination', 'FOURNIL')
if (error) { console.error('Lecture des recettes impossible :', error.message); process.exit(1) }
const actifs = carte.filter(r => r.actif)

await step('périmètre de la carte', async () => {
  const attendu = Object.keys(AFFICHES).length
  if (actifs.length === attendu) ok(`${attendu} produits actifs`)
  else ko('nombre de produits', `${actifs.length} en base, ${attendu} sur les affiches`)

  const enBase = new Set(actifs.map(r => r.nom))
  const manquants = Object.keys(AFFICHES).filter(n => !enBase.has(n))
  const enTrop = [...enBase].filter(n => !(n in AFFICHES))
  if (manquants.length === 0) ok('aucun produit d’affiche manquant')
  else ko('produits manquants', manquants.join(', '))
  if (enTrop.length === 0) ok('aucun produit hors affiches')
  else ko('produits hors affiches', enTrop.join(', '))
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
    const attendue = TVA_REDUITE.has(r.categorie) ? 5.5 : 10
    return Number(r.tva) !== attendue
  })
  if (mauvais.length === 0) ok('5,5 % pain/viennoiserie/pâtisserie/gourmandise, 10 % ailleurs')
  else ko('TVA incorrecte', mauvais.map(r => `${r.nom} (${r.categorie} → ${r.tva} %)`).join(', '))
})

await step('photos', async () => {
  const sansPhoto = actifs.filter(r => !r.image_url)
  if (sansPhoto.length === 0) ok('tous les produits ont une photo')
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

  const doublons = Object.entries(
    actifs.reduce((a, r) => { a[r.image_url] = (a[r.image_url] ?? 0) + 1; return a }, {}),
  ).filter(([, n]) => n > 1)
  if (doublons.length === 0) ok('aucune photo réutilisée sur deux produits')
  else ko('photos partagées', doublons.map(([u, n]) => `${u.split('/').pop()} ×${n}`).join(', '))
})

await step('mise en vente', async () => {
  const horsLigne = actifs.filter(r => !r.vendable_online)
  if (horsLigne.length === 0) ok('les 60 produits sont commandables en ligne')
  else ko('produits non vendables en ligne', horsLigne.map(r => r.nom).join(', '))

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
    const res = await fetch(`http://localhost:${process.env.PORT}/api/public/menu`)
    if (!res.ok) { ko('appel API', `HTTP ${res.status}`); return }
    const { items } = await res.json()
    const fournil = (items ?? []).filter(i => i.tag_destination === 'FOURNIL')
    if (fournil.length === actifs.length) ok(`${fournil.length} produits servis au site`)
    else ko('carte publique', `${fournil.length} produits servis, ${actifs.length} attendus`)
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
