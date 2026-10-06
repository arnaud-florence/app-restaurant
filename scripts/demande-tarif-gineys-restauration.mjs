// Étendre nos conditions Gineys à la gamme RESTAURATION — 02/10/2026.
//
// Gineys est déjà notre fournisseur : 82 références facturées, toutes en
// boulangerie-pâtisserie. On ouvre la pizzeria et la brasserie, soit 62
// nouvelles références — et la question n'est PAS « avez-vous ces produits »,
// c'est « à quel prix nous les faites-vous ».
//
// ⚠️⚠️ CE QU'ON SAIT ET QU'ON NE DIT PAS. La mesure de la 0162 — 22,0 % de
// remise sur les 41 articles du contrat, 0,3 % sur les 404 autres, soit le
// tarif public — a été RETIRÉE du message sur décision du gérant (02/10).
// Elle reste vraie et elle reste notre meilleur argument, mais la dire
// apprendrait à Gineys qu'on a relevé ses 2 892 prix : c'est un arbitrage de
// relation, pas un calcul. Même raison que le retrait de leur prix portail du
// tableau — on ne donne aucun plancher.
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
import { comparer } from '../.next/cache/tarifs-lib/tarifs-fournisseurs.js'
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

// ── LE MEILLEUR TARIF QUE NOUS OBTENONS, SANS DIRE CHEZ QUI ──────────
//
// Demande du gérant : montrer le meilleur prix obtenu sur chaque référence,
// sans nommer le fournisseur. Là où Gineys est déjà le moins cher, c'est son
// prix qui s'affiche — il n'apprend rien qu'il ne sache.
//
// ⚠️ LE MEILLEUR PRIX SE CALCULE PAR `comparer()`, la même fonction que
// `/admin/tarifs-fournisseurs` et l'agent Stock. Un min/max brut opposerait un
// colis de 3 000 serviettes à un paquet de 200 et annoncerait « −97 % ».
//
// ⚠️ ET SON UNITÉ DOIT ÊTRE LA NÔTRE. Le comparateur a sorti les câpres et les
// cornichons en « €/pièce » : c'est un prix de CONTENANT lu comme une pièce.
// Envoyer « nous obtenons les câpres à 3,29 € la pièce » quand on les compte au
// kilo, c'est demander un alignement sur un chiffre qui ne veut rien dire.
const nomF = new Map((await lire('fournisseurs?select=id,nom')).map(x => [x.id, x.nom]))
const [g] = await lire('fournisseurs?nom=eq.Gineys%20(Nicolas)&select=id,nom,contact,email,telephone')
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
const f3 = n => n.toFixed(3).replace('.', ',')

// notre unité ramenée à sa base : « seau 1 L » → L, « boîte 1 kg » → kg
const base = u => {
  const t = String(u ?? '').toLowerCase()
  if (/\bkg\b|\bg\b/.test(t)) return 'kg'
  if (/\bl\b|litre|ml|cl/.test(t)) return 'L'
  if (/pi[eè]ce|piece|unit/.test(t)) return 'piece'
  return null
}
const tousLesTarifs = (await lire('catalogue_fournisseur?actif=is.true&select=id,fournisseur_id,reference,designation,unite,prix_ht,colis_quantite,colis_libelle,contenance_valeur,contenance_unite,cle_comparaison,ingredient_id,date_tarif,source,nature'))
  .map(x => ({ ...x, fournisseur_nom: nomF.get(x.fournisseur_id) ?? '?' }))
const groupes = comparer(tousLesTarifs)
/** Le meilleur prix obtenu sur cette matière, dans NOTRE unité, sans dire d'où. */
const meilleur = (i) => {
  const grp = groupes.find(x => x.lignes.some(l => l.ingredient_id === i.id) || x.cle === i.nom)
  if (!grp) return null
  const comp = grp.lignes.filter(l => l.ref)
  if (!comp.length) return null
  const u = comp[0].ref.unite, fmt = comp[0].ref.format ?? null
  const memeBase = comp.filter(l => l.ref.unite === u && (l.ref.format ?? null) === fmt)
  // ⚠️ l'unité du meilleur prix doit être celle dans laquelle NOUS comptons
  if (base(i.unite) && u !== base(i.unite)) return null
  const best = memeBase.slice().sort((a, b) => a.ref.prix - b.ref.prix)[0]
  const gin = memeBase.filter(l => l.fournisseur_nom === 'Gineys').sort((a, b) => a.ref.prix - b.ref.prix)[0]
  return {
    prix: best.ref.prix, unite: best.ref.unite, nature: best.nature,
    // ⚠️⚠️ VIENT-IL DE GINEYS ? Décision du gérant (02/10) : on ne lui renvoie
    // PAS son propre prix. Un fournisseur qui constate qu'il est déjà le moins
    // cher n'a aucune raison de descendre — alors qu'une ligne vide laisse la
    // question ouverte.
    deGineys: gin ? gin === best : false,
    ecartGineysPct: gin && gin !== best ? (gin.ref.prix - best.ref.prix) / best.ref.prix * 100 : null,
  }
}

const csv = [[
  'Famille', 'Notre produit', 'Notre unité', 'Plats concernés',
  'MEILLEUR TARIF QUE NOUS OBTENONS', 'Unité de ce tarif', 'Nature de ce tarif',
  'Votre réf. (si on l’a trouvée)', 'Votre désignation',
  'VOTRE PRIX NET HT', 'Colisage', 'Unité facturée',
]]
let avecPiste = 0, avecTarif = 0, gineysDejaMoinsCher = 0, sansTarif = []
for (const l of lignes) {
  const ref = PISTES[l.nom]
  const c = ref ? cat.get(ref) : null
  if (c) avecPiste++
  const brut = meilleur(l)
  // ⚠️ Un tarif qui vient de Gineys n'est PAS montré : ce serait lui apprendre
  // qu'il est déjà au plancher. La ligne redevient vide, comme les 35 autres.
  const m = brut && !brut.deGineys ? brut : null
  if (brut?.deGineys) gineysDejaMoinsCher++
  if (m) avecTarif++; else sansTarif.push(l.nom)
  csv.push([
    l.categorie ?? '', l.nom, l.unite,
    l.plats.length <= 3 ? l.plats.join(', ') : `${l.plats.length} plats`,
    // ⚠️ LE PRIX, JAMAIS SA PROVENANCE. Le gérant a tranché : on montre le
    // meilleur tarif obtenu sans dire chez qui. Là où Gineys est déjà le moins
    // cher, c'est son propre prix qui s'affiche — il n'apprend rien.
    m ? f3(m.prix) : '',
    m ? `€/${m.unite}` : '',
    // ⚠️ La NATURE reste dite — elle ne révèle personne, et un devis n'est pas
    // un prix payé. La taire ferait passer une proposition pour un acquis.
    m ? (m.nature === 'facture' ? 'prix payé' : m.nature === 'portail' ? 'tarif affiché' : 'proposition reçue') : '',
    // ⚠️ LEUR PRIX PORTAIL EST RETIRÉ (décision du gérant). On garde leur
    // RÉFÉRENCE et leur DÉSIGNATION — elles servent à identifier le produit,
    // pas à ancrer le prix. Le leur rappeler leur donnerait un plancher.
    c ? ref : '', c ? c.designation : '',
    '', '', '',
  ])
}
const fichier = 'data/demande-tarif-gineys-restauration.csv'
fs.writeFileSync(fichier, '﻿' + csv.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'))

console.log(`\n── ${lignes.length} références, ${resto.size} plats ──`)
console.log(`   ${avecPiste} avec une référence Gineys identifiée · ${lignes.length - avecPiste} à chercher par eux`)
console.log(`   ${avecTarif} avec un meilleur tarif chiffré`)
console.log(`   ${gineysDejaMoinsCher} MASQUÉES : le meilleur tarif y vient de Gineys — on ne lui rend pas son propre prix`)
console.log(`   ${sansTarif.length} lignes vides au total (dont ces ${gineysDejaMoinsCher})`)
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

• pour les 62 : notre produit, notre unité et les plats concernés, pour vous
  donner l'idée des volumes ;
• sur ${avecTarif} lignes : LE MEILLEUR TARIF QUE NOUS OBTENONS aujourd'hui sur ce
  produit, dans l'unité où nous le comptons ;
• sur ${avecPiste} lignes — ce ne sont pas les mêmes — la référence de votre
  catalogue qui nous paraît correspondre, pour vous éviter de la chercher.

Nous vous laissons trois colonnes : VOTRE PRIX NET, le colisage et l'unité
facturée.

Trois précisions pour que l'échange soit utile :

• la colonne « meilleur tarif » est le prix le plus bas dont nous disposons sur
  chaque référence. Nous ne vous dirons pas d'où il vient : ce qui nous
  intéresse est votre prix, pas une comparaison publique.

• chaque tarif porte sa NATURE : « prix payé » quand une facture le confirme,
  « proposition reçue » quand c'est un devis, « tarif affiché » quand c'est un
  prix de catalogue. Un devis n'est pas un prix payé, et nous ne voudrions pas
  vous faire courir après un chiffre que nous n'avons pas honoré.

• sur les ${sansTarif.length} lignes restantes, la colonne « meilleur tarif » est VIDE : nous
  n'avons aucun tarif comparable dessus. Votre prix y sera notre seule
  référence, et c'est sans arrière-pensée.

Dernier point, et il vous concerne directement : nous n'avons pas trouvé
d'équivalent évident à votre catalogue pour ${lignes.length - avecPiste} de ces besoins :
parmesan, reblochon, gorgonzola, burrata, roquette, mesclun, tomates, œufs,
lardons, entrecôte, frites, gnocchis, câpres, cornichons. Si vous les
référencez, nous sommes preneurs — nous les achetons aujourd'hui ailleurs
faute de les avoir trouvés chez vous.

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
