// Demande de tarif à Krill sur TOUTE la restauration — 02/10/2026.
//
// Les 62 ingrédients qui entrent dans les 41 plats de la pizzeria et de la
// brasserie, avec NOS prix en face. Un fournisseur qui ignore ce qu'il doit
// battre propose son tarif public, et tout le monde y perd.
//
// ⚠️⚠️ 56 DE CES 62 PRIX SONT DES ESTIMATIONS (0165). Ils ont servi à bâtir la
// carte, aucune facture ne les a confirmés — la pizzeria et la brasserie
// n'ont jamais ouvert. Chaque ligne le DIT. Les présenter comme des prix payés
// fausserait la négociation dans les deux sens : il s'alignerait sur un
// chiffre inventé, et on croirait avoir gagné ou perdu quelque chose.
//
// ⚠️ AUCUN NOM DE FOURNISSEUR N'EST CITÉ. Divulguer chez qui on achète et à
// quel prix négocié est une décision de négociation, pas un automatisme. On
// donne NOTRE prix, jamais sa provenance.
//
// ⚠️ Une case VIDE plutôt qu'un zéro : un zéro se lit « gratuit ».
//
//   node scripts/demande-tarif-krill-restauration.mjs
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const lire = async q => { const o = []; for (let i = 0; ; i += 1000) { const p = JSON.parse(await (await fetch(`${U}/rest/v1/${q}&order=id&offset=${i}&limit=1000`, { headers: H })).text()); o.push(...p); if (p.length < 1000) break } return o }

const prods = await lire('recettes?actif=is.true&select=id,nom,categorie,tag_destination')
const comps = await lire('recette_ingredients?select=recette_id,ingredient_id')
const ings = new Map((await lire('ingredients?actif=is.true&select=id,nom,unite,categorie,prix_achat_ht,prix_estime')).map(i => [i.id, i]))
const catalogue = await lire('catalogue_fournisseur?actif=is.true&select=designation,cle_comparaison,fournisseur_id')

// ⚠️ Le périmètre est l'USAGE, pas la famille : un ingrédient compte s'il
// entre dans un plat CUISINE ou PIZZA. Les 100 lignes de démo du modèle
// restaurant n'entrent nulle part et restent donc dehors (leçon de Gel Var).
const resto = new Map(prods.filter(p => ['CUISINE', 'PIZZA'].includes(p.tag_destination)).map(p => [p.id, p]))
const utilises = new Map()
for (const c of comps) {
  const p = resto.get(c.recette_id); if (!p) continue
  const i = ings.get(c.ingredient_id); if (!i) continue
  if (!utilises.has(i.id)) utilises.set(i.id, { ...i, plats: [] })
  utilises.get(i.id).plats.push(p.nom)
}
// Krill le propose-t-il déjà ? Si oui, on le dit : il chiffrera plus vite.
const [krill] = await lire('fournisseurs?nom=eq.Krill&select=id')
const dejaKrill = new Set(catalogue.filter(c => c.fournisseur_id === krill?.id && c.cle_comparaison).map(c => c.cle_comparaison))

const lignes = [...utilises.values()].sort((a, b) =>
  (a.categorie ?? '').localeCompare(b.categorie ?? '', 'fr') || a.nom.localeCompare(b.nom, 'fr'))
const releves = lignes.filter(l => !l.prix_estime && l.prix_achat_ht > 0)
const estimes = lignes.filter(l => l.prix_estime && l.prix_achat_ht > 0)

const eur = n => n == null || n <= 0 ? '' : String(n).replace('.', ',')
const csv = [[
  'Famille', 'Produit', 'Notre unité', 'Notre prix HT', 'Base de notre prix',
  'Plats concernés', 'Déjà à votre catalogue ?',
  'VOTRE code article', 'VOTRE désignation', 'VOTRE colisage', 'VOTRE prix HT', 'Unité facturée',
], ...lignes.map(l => [
  l.categorie ?? '', l.nom, l.unite, eur(l.prix_achat_ht),
  // ⚠️ La base est dite sur CHAQUE ligne, pas une fois en tête : un tableau
  // se lit ligne à ligne, et un commercial ne remonte pas à l'en-tête.
  l.prix_achat_ht > 0 ? (l.prix_estime ? 'ESTIMATION, à confirmer' : 'prix payé') : '',
  l.plats.length <= 3 ? l.plats.join(', ') : `${l.plats.length} plats`,
  dejaKrill.has(l.nom) ? 'oui, déjà chiffré' : '', '', '', '', '', '',
])]
const fichier = 'data/demande-tarif-krill-restauration.csv'
fs.writeFileSync(fichier, '﻿' + csv.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'))

console.log(`\n── ${lignes.length} références, ${resto.size} plats couverts ──`)
console.log(`   ${releves.length} prix PAYÉS · ${estimes.length} ESTIMATIONS · ${lignes.length - releves.length - estimes.length} sans prix`)
const parCat = {}
for (const l of lignes) parCat[l.categorie ?? '—'] = (parCat[l.categorie ?? '—'] ?? 0) + 1
console.log(`   ${Object.entries(parCat).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`   → ${fichier}\n`)

const MAIL = `Objet : CASATASIA — demande de tarif sur notre gamme restauration (62 références)

Bonjour Monsieur Gracianette,

Merci pour votre proposition 056/260178 du 2 octobre. Nous l'avons intégrée à
notre comparateur d'achats : vous êtes le moins cher sur la sauce tartare
(5,00 €/kg contre 7,73 € chez notre fournisseur actuel) et au même niveau sur
l'oignon rouge émincé. Nous reviendrons vers vous sur ces deux lignes.

Nous ouvrons notre pizzeria et notre brasserie le samedi 3 octobre, et nous
cherchons un fournisseur capable de couvrir l'essentiel de la gamme plutôt que
quelques références. Vous trouverez en pièce jointe les 62 produits qui
entrent dans nos 41 plats — charcuterie, crémerie, fromages, légumes préparés,
épicerie — avec, en face, le prix auquel nous les avons budgétés.

Deux précisions importantes sur ces prix, pour que votre chiffrage soit utile :

• 6 d'entre eux sont des prix RÉELLEMENT PAYÉS, marqués « prix payé » ;
• les 56 autres sont des ESTIMATIONS, marquées comme telles. La pizzeria
  n'ayant pas encore ouvert, aucune facture ne les a confirmés. Nous préférons
  vous le dire plutôt que de vous laisser vous aligner sur un chiffre que nous
  n'avons pas payé.

Nous avons laissé cinq colonnes vides par ligne : votre code article, votre
désignation exacte, le colisage, le prix HT et l'unité facturée. La
désignation nous importe autant que le prix : un produit mariné, tranché ou
précuit ne se compare pas à un produit nature, et nous ne voudrions pas
retenir une offre sur un malentendu.

Si une référence n'existe pas à votre catalogue, laissez la ligne vide — c'est
une information en soi.

Deux questions à part :

1. Votre flan pâtissier épais CUIT 28 cm 2 kg (673491) est à 8,98 €, quand
   nous payons 10,79 € un flan CRU du même format. Un produit cuit moins cher
   qu'un cru nous surprend : s'agit-il bien d'un flan prêt à trancher ?

2. Votre Paris-Brest 80 g (670157) à 0,90 € la pièce est nettement en dessous
   de notre tarif actuel sur le même grammage. Quel est le colisage, et la
   fréquence de livraison possible ?

Nous livrez-vous à Sainte-Anastasie-sur-Issole, et sous quel délai ?
Y a-t-il un minimum de commande ?

Bien cordialement,

Arnaud Florence
CASATASIA, 23 rue Notre Dame, 83136 Sainte-Anastasie-sur-Issole
`
fs.writeFileSync('data/mail-krill-restauration.txt', MAIL)
console.log('─'.repeat(72))
console.log(MAIL)
console.log('─'.repeat(72))
console.log(`\n   → data/mail-krill-restauration.txt`)
console.log(`\n   ⚠️ RIEN N'EST ENVOYÉ. Krill n'a aucune adresse e-mail en base, et`)
console.log(`      un envoi est un geste humain : un commercial relancé`)
console.log(`      automatiquement cesse de répondre.\n`)
