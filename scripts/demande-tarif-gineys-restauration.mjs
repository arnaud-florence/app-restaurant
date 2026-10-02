// Étendre nos conditions Gineys à la gamme RESTAURATION — 02/10/2026.
//
// Gineys est déjà notre fournisseur : 82 références facturées, toutes en
// boulangerie-pâtisserie. On ouvre la pizzeria et la brasserie, soit 62
// nouvelles références — et la question n'est PAS « avez-vous ces produits »,
// c'est « à quel prix nous les faites-vous ».
//
// ⚠️⚠️ CE QUI DONNE SA FORCE À CE MESSAGE EST MESURÉ, PAS SUPPOSÉ (0162) : en
// confrontant leur portail au catalogue IMPRIMÉ d'Arti'Pat, on a trouvé
// 22,0 % de remise moyenne sur les 41 articles de notre contrat et 0,3 % sur
// les 404 autres. Leur portail nous montre donc le TARIF PUBLIC hors contrat —
// 2 889 de leurs 3 066 lignes chez nous. Ce n'est pas un reproche, c'est le
// point de départ de la discussion.
//
// ⚠️ ON NE CITE QUE LES PISTES VÉRIFIÉES À L'ŒIL. Le rapprochement
// automatique proposait « KIT COUVERT 3 PIÈCES EN BOIS C=250 » pour un
// camembert 250 g, du BEURRE DE TOURAGE pour du beurre de cuisson et une
// TRANCHETTE DE SAUMON FUMÉ pour du lard fumé. Demander une remise sur le
// mauvais produit, c'est se la voir refusée — ou pire, accordée, et le
// découvrir à la livraison (0151).
//
//   node scripts/demande-tarif-gineys-restauration.mjs
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const lire = async q => { const o = []; for (let i = 0; ; i += 1000) { const p = JSON.parse(await (await fetch(`${U}/rest/v1/${q}&order=id&offset=${i}&limit=1000`, { headers: H })).text()); o.push(...p); if (p.length < 1000) break } return o }

// ── pistes RETENUES : notre matière → leur référence, vérifiée à l'œil ──
const PISTES = {
  'Aubergines grillées (kg)': '0062362', 'Courgettes grillées (kg)': '0062363',
  'Bûchette de chèvre': 'BUCHETTE CHEVRE LONG 180G C 6', 'Cerneaux de noix (kg)': '0067295',
  'Champignons émincés (kg)': '0057519', 'Cheddar en tranches (kg)': '0061392',
  'Chorizo tranché (kg)': '0063018', 'Coppa tranchée (kg)': '0063020',
  'Crème de balsamique (litre)': '0067464', 'Crème fraîche épaisse': '0061277',
  'Farine de blé T55': 'FARINE DE BLE T55 C 10X1KG', 'Jambon blanc tranché': '0063002',
  'Jambon cru tranché (kg)': '0063029', 'Miel liquide': '0067807',
  'Mozzarella râpée': '0061352', 'Oignons confits (kg)': '0067673',
  'Oignons jaunes émincés (kg)': '0057332', 'Oignons rouges émincés (kg)': '0057347',
  'Olives noires': 'OLIVE NOIRE A LA GRECQUE DENOYAUTEE SEAU 2 5KG',
  'Pain burger (pièce)': '0067208', 'Pesto alla genovese': '0062601',
  'Poivrons en lanières (kg)': '0057353', 'Pâton à pizza (pièce)': '0077902',
}
// ── pistes ÉCARTÉES, et pourquoi — à ne pas reproposer ───────────────
const ECARTEES = {
  'Camembert 250 g (pièce)': 'le rapprochement proposait « KIT COUVERT 3 PIÈCES EN BOIS C=250 » : le 250 est un nombre de couverts',
  'Beurre doux': '« BEURRE DE TOURAGE » est un beurre de feuilletage, pas un beurre de cuisson',
  'Lard fumé en tranches (kg)': '« TRANCHETTE DE SAUMON FUMÉ » — du poisson pour du porc',
  'Glace (boule)': '« CORNET À GLACE » est le contenant, pas la glace',
  'Huile d’olive': 'leur seule huile d’olive est une AOP Baux-de-Provence à 51 €/L : une huile d’assaisonnement, pas de cuisson',
  'Sauce burger maison (kg)': '« TACOS BŒUF HALAL SAUCE BURGER » est un plat préparé',
}

const [g] = await lire('fournisseurs?nom=eq.Gineys&select=id,nom,contact,email,telephone')
const cat = new Map((await lire(`catalogue_fournisseur?fournisseur_id=eq.${g.id}&select=reference,designation,prix_ht,unite,famille`))
  .map(c => [String(c.reference), c]))
const prods = await lire('recettes?actif=is.true&select=id,nom,tag_destination')
const comps = await lire('recette_ingredients?select=recette_id,ingredient_id')
const ings = new Map((await lire('ingredients?actif=is.true&select=id,nom,unite,categorie,prix_achat_ht,prix_estime')).map(i => [i.id, i]))
const resto = new Map(prods.filter(p => ['CUISINE', 'PIZZA'].includes(p.tag_destination)).map(p => [p.id, p]))
const cible = new Map()
for (const c of comps) {
  const p = resto.get(c.recette_id); if (!p) continue
  const i = ings.get(c.ingredient_id); if (!i) continue
  if (!cible.has(i.id)) cible.set(i.id, { ...i, plats: [] })
  cible.get(i.id).plats.push(p.nom)
}
const lignes = [...cible.values()].sort((a, b) =>
  (a.categorie ?? '').localeCompare(b.categorie ?? '', 'fr') || a.nom.localeCompare(b.nom, 'fr'))
const eur = n => n == null || n <= 0 ? '' : String(n).replace('.', ',')

const csv = [[
  'Famille', 'Notre produit', 'Notre unité', 'Notre prix HT', 'Base de notre prix', 'Plats concernés',
  'Votre réf. (si on l’a trouvée)', 'Votre désignation', 'Votre prix PORTAIL HT',
  'VOTRE PRIX NET HT', 'Colisage', 'Unité facturée',
]]
let avecPiste = 0
for (const l of lignes) {
  const ref = PISTES[l.nom]
  const c = ref ? cat.get(ref) : null
  if (c) avecPiste++
  csv.push([
    l.categorie ?? '', l.nom, l.unite, eur(l.prix_achat_ht),
    // ⚠️ La base est répétée sur CHAQUE ligne : un commercial lit un tableau
    // ligne à ligne, il ne remonte pas à l'en-tête.
    l.prix_achat_ht > 0 ? (l.prix_estime ? 'ESTIMATION, à confirmer' : 'prix payé') : '',
    l.plats.length <= 3 ? l.plats.join(', ') : `${l.plats.length} plats`,
    c ? ref : '', c ? c.designation : '', c ? eur(c.prix_ht) : '',
    '', '', '',
  ])
}
const fichier = 'data/demande-tarif-gineys-restauration.csv'
fs.writeFileSync(fichier, '﻿' + csv.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'))

const releves = lignes.filter(l => !l.prix_estime && l.prix_achat_ht > 0).length
console.log(`\n── ${lignes.length} références, ${resto.size} plats ──`)
console.log(`   ${avecPiste} avec une référence Gineys identifiée · ${lignes.length - avecPiste} à chercher par eux`)
console.log(`   ${releves} prix payés · ${lignes.length - releves} estimations`)
console.log(`   → ${fichier}`)
console.log(`\n   ${Object.keys(ECARTEES).length} pistes ÉCARTÉES, à ne pas reproposer :`)
for (const [k, v] of Object.entries(ECARTEES)) console.log(`      ${k.padEnd(28)} ${v}`)

const MAIL = `Objet : CASATASIA — nos conditions sur la gamme restauration (62 références)

Bonjour Monsieur Boiral,

Nous travaillons avec vous depuis l'ouverture du Fournil, sur la boulangerie et
la pâtisserie — une petite centaine de références facturées à ce jour, et nous
en sommes satisfaits.

Nous ouvrons la pizzeria et la brasserie, et cela représente 62 nouvelles
références : charcuterie, crémerie, fromages, légumes préparés, épicerie.
Nous souhaitons vous les confier plutôt que de multiplier les fournisseurs,
mais il nous faut d'abord connaître vos conditions sur cette gamme.

Vous trouverez le détail en pièce jointe. Nous avons rempli ce que nous
savons :

• notre produit, notre unité et le prix auquel nous l'avons budgété ;
• pour ${avecPiste} d'entre eux, la référence de votre catalogue qui nous paraît
  correspondre, avec le prix que votre portail nous affiche aujourd'hui ;
• les plats concernés, pour vous donner une idée des volumes.

Nous vous laissons deux colonnes : VOTRE PRIX NET et le colisage.

Deux précisions pour que l'échange soit utile :

• sur ces 62 prix, ${releves} seulement sont des prix réellement payés. Les
  ${lignes.length - releves} autres sont des ESTIMATIONS, marquées comme telles dans le tableau :
  la pizzeria n'a pas encore ouvert, aucune facture ne les a confirmés. Nous
  préférons vous le dire plutôt que de vous laisser vous aligner sur un chiffre
  que nous n'avons pas payé.

• nous avons comparé votre portail au catalogue imprimé Arti'Pat, référence par
  référence. Sur les articles de notre contrat, la remise moyenne est de 22 % ;
  sur les autres, de 0,3 % — c'est-à-dire le tarif public. Nous le comprenons :
  ces lignes ne sont pas négociées. C'est précisément l'objet de ce courrier.

Enfin, ${lignes.length - avecPiste} de nos besoins n'ont pas d'équivalent évident à votre
catalogue — parmesan, reblochon, gorgonzola, burrata, roquette, mesclun,
tomates, œufs, lardons, entrecôte, frites, gnocchis, câpres, cornichons. Si
vous les référencez, nous sommes preneurs : nous les achetons aujourd'hui
ailleurs faute de les avoir trouvés chez vous.

Deux questions pratiques : votre fréquence de livraison sur
Sainte-Anastasie-sur-Issole peut-elle couvrir le frais, et y a-t-il un minimum
de commande différent de celui de la boulangerie ?

Bien cordialement,

Arnaud Florence
CASATASIA, 23 rue Notre Dame, 83136 Sainte-Anastasie-sur-Issole
`
fs.writeFileSync('data/mail-gineys-restauration.txt', MAIL)
console.log('\n' + '─'.repeat(72))
console.log(MAIL)
console.log('─'.repeat(72))
console.log(`\n   → data/mail-gineys-restauration.txt`)
console.log(`\n   ⚠️⚠️ L'ADRESSE EN BASE EST UNE BOÎTE DE FACTURATION`)
console.log(`      (${g.email}) : un`)
console.log(`      message commercial n'y sera pas lu. Contact : ${g.contact ?? '—'}, ${g.telephone ?? '—'}.`)
console.log(`      Lui demander son adresse directe avant d'envoyer.`)
console.log(`\n   ⚠️ Le paragraphe sur les 22 % / 0,3 % est un levier de négociation,`)
console.log(`      pas un automatisme : il DIT qu'on a mesuré leurs prix. À garder ou`)
console.log(`      à couper selon la relation — c'est une décision, pas un calcul.\n`)
