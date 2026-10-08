// LES 16 PIZZAS, REBÂTIES SUR L'AFFICHE DU 12 OCTOBRE.
//
//   node scripts/fiches-pizzas-affiche.cjs [--ecrire]
//
// Essai à blanc par défaut.
//
// ⚠️⚠️ L'AFFICHE FAIT FOI, PAS LA BASE. Les 12 fiches existantes datent de
// septembre et s'écartent sérieusement de la carte imprimée :
//   • l'EMMENTAL est sur les 13 pizzas salées de l'affiche — il n'était
//     dans AUCUNE fiche ;
//   • l'ORIGAN de même ;
//   • les OLIVES manquaient sur sept pizzas qui les annoncent ;
//   • La Ferrage portait du REBLOCHON, absent de l'affiche ;
//   • L'Anastasie portait de la CRÈME DE BALSAMIQUE, absente de l'affiche ;
//   • La Naples portait de la crème fraîche en plus de la sauce tomate ;
//   • quatre pizzas n'avaient AUCUNE composition.
//
// Ce n'est pas un détail de coût : l'affiche est ce qu'on sert, ce qu'on
// facture, et la base de la déclaration d'ALLERGÈNES. Une fiche qui ne dit
// pas l'emmental sous-déclare du lait sur treize pizzas.
//
// ⚠️ LES GRAMMAGES SONT PROPOSÉS, PAS MESURÉS. Aucune pizza n'a encore été
// servie. Ils reprennent le gabarit des fiches de septembre (pâton 1,
// sauce 80 g, mozzarella 100 g) et se vérifient à la balance au premier
// service. Ce qui est CERTAIN vient de l'affiche : la LISTE des
// ingrédients. Ce qui est proposé : combien.
//
// ⚠️ On ne met QUE ce que l'affiche annonce. L'huile d'olive de cuisson
// figurait sur deux fiches sans être sur la carte : elle sort. Si elle
// doit revenir, c'est une décision — et l'affiche devra le dire aussi,
// parce que c'est elle que le client lit.
const fs = require('node:fs')
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })
const ECRIRE = process.argv.includes('--ecrire')

// Les matières qui manquent, avec un prix ESTIMÉ (0165 : le défaut est
// `prix_estime = true` tant qu'aucune facture ne l'a confirmé).
const A_CREER = [
  { nom: 'Aneth frais (botte)', unite: 'botte', prix: 1.20, cat: 'Pizzeria', note: 'repère : persil frais' },
  { nom: 'Pâte à tartiner chocolat-noisette', unite: 'kg', prix: 6.50, cat: 'Pizzeria', note: 'estimation — seau 3 kg' },
  { nom: 'Banane (pièce)', unite: 'pièce', prix: 0.30, cat: 'Pizzeria', note: 'estimation' },
  { nom: 'Noix de coco râpée', unite: 'kg', prix: 7.00, cat: 'Pizzeria', note: 'estimation' },
]

// ⚠️ RECOPIÉ DE L'AFFICHE, dans son ordre. Le libellé entre guillemets est
// celui de l'affiche ; le nom à droite est la matière en base.
const CARTE = {
  'La Marguerite':             [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.10],['Emmental râpé',.03],['Olives noires',.015],['Origan',.0008]],
  'La Tasia':                  [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.10],['Emmental râpé',.03],['Jambon blanc tranché',.06],['Champignons émincés (kg)',.05],['Olives noires',.015],['Origan',.0008]],
  'La Reine Tasia':            [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.10],['Emmental râpé',.03],['Jambon blanc tranché',.06],['Champignons émincés (kg)',.05],['Œuf (pièce)',1],['Olives noires',.015],['Origan',.0008]],
  'La Provençale':             [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.10],['Emmental râpé',.03],['Courgettes grillées (kg)',.04],['Aubergines grillées (kg)',.04],['Poivrons en lanières (kg)',.04],['Oignons rouges émincés (kg)',.02],['Olives noires',.015],['Origan',.0008]],
  'La Ferrage':                [['Pâton à pizza (pièce)',1],['Crème fraîche épaisse',.06],['Mozzarella râpée',.10],['Emmental râpé',.03],['Pommes de terre en rondelles (kg)',.08],['Lardons fumés (kg)',.05],['Oignons confits (kg)',.03],['Olives noires',.015],['Origan',.0008]],
  'La St-Quinis':              [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.10],['Emmental râpé',.03],['Chorizo tranché (kg)',.05],['Poivrons en lanières (kg)',.04],['Oignons rouges émincés (kg)',.02],['Olives noires',.015],['Origan',.0008]],
  "L'Issole":                  [['Pâton à pizza (pièce)',1],['Crème fraîche épaisse',.06],['Mozzarella râpée',.10],['Emmental râpé',.03],['Bûchette de chèvre',.3333],['Miel liquide',.015],['Cerneaux de noix (kg)',.015],['Roquette (kg)',.02],['Olives noires',.015],['Origan',.0008]],
  "L'Anastasie":               [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.10],['Emmental râpé',.03],['Tomates cerises (kg)',.05],['Jambon cru tranché (kg)',.04],['Roquette (kg)',.02],['Parmesan (kg)',.015],['Olives noires',.015],['Origan',.0008]],
  'La CasaTasia — Signature':  [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.08],['Emmental râpé',.03],['Burrata 125 g (pièce)',1],['Coppa tranchée (kg)',.04],['Tomates cerises (kg)',.05],['Pesto alla genovese',.015],['Roquette (kg)',.02],['Parmesan (kg)',.01],['Olives noires',.015],['Origan',.0008]],
  'La 4 Fromages':             [['Pâton à pizza (pièce)',1],['Crème fraîche épaisse',.06],['Mozzarella râpée',.10],['Emmental râpé',.03],['Bûchette de chèvre',.25],['Gorgonzola (kg)',.05],['Parmesan (kg)',.02],['Olives noires',.015],['Origan',.0008]],
  'La Naples':                 [['Pâton à pizza (pièce)',1],['Sauce tomate pizza (kg)',.08],['Mozzarella râpée',.10],['Emmental râpé',.03],['Viande hachée de bœuf (kg)',.08],['Poivrons en lanières (kg)',.04],['Olives noires',.015],['Origan',.0008]],
  'La Camembert':              [['Pâton à pizza (pièce)',1],['Crème fraîche épaisse',.06],['Mozzarella râpée',.10],['Emmental râpé',.03],['Pommes de terre en rondelles (kg)',.08],['Camembert 250 g (pièce)',.3333],['Jambon cru tranché (kg)',.04],['Olives noires',.015],['Origan',.0008]],
  "La Perle de l'Issole":      [['Pâton à pizza (pièce)',1],['Crème fraîche épaisse',.06],['Mozzarella râpée',.10],['Emmental râpé',.03],['Oignons confits (kg)',.03],['Saumon fumé tranché',.04],['Aneth frais (botte)',.08],['Citron (pièce)',.25],['Olives noires',.015],['Origan',.0008]],
  'Pizza Nutella':             [['Pâton à pizza (pièce)',1],['Pâte à tartiner chocolat-noisette',.08]],
  'Pizza Nutella banane':      [['Pâton à pizza (pièce)',1],['Pâte à tartiner chocolat-noisette',.08],['Banane (pièce)',1]],
  'Pizza Nutella banane coco': [['Pâton à pizza (pièce)',1],['Pâte à tartiner chocolat-noisette',.08],['Banane (pièce)',1],['Noix de coco râpée',.01]],
}

const ou = (r, q) => { if (r.error) { console.error(`ÉCHEC ${q} : ${r.error.message}`); process.exit(1) } return r.data ?? [] }

;(async () => {
  console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — les 16 pizzas d'après l'affiche du 12 octobre\n`)

  const ings = ou(await sb.from('ingredients').select('id, nom, unite, prix_achat_ht').eq('actif', true), 'ingredients')
  const parNom = new Map(ings.map(i => [i.nom, i]))

  // ① Les matières qui manquent
  for (const m of A_CREER) {
    if (parNom.has(m.nom)) { console.log(`   = ${m.nom} existe déjà`); continue }
    console.log(`   + CRÉER  ${m.nom.padEnd(36)} ${String(m.prix).padStart(6)} €/${m.unite}  (${m.note})`)
    if (!ECRIRE) { parNom.set(m.nom, { id: 'FICTIF-' + m.nom, nom: m.nom, unite: m.unite }); continue }
    const [row] = ou(await sb.from('ingredients').insert({
      nom: m.nom, unite: m.unite, categorie: m.cat,
      prix_achat_ht: m.prix, prix_estime: true, stocke: true, actif: true,
      // ⚠️ L'hypothèse reste LISIBLE dans la fiche : un prix estimé qui ne
      // dit pas d'où il vient se relit dans six mois comme une mesure.
      fournisseur_principal: null,
    }).select('id, nom, unite').limit(1), 'création matière')
    parNom.set(row.nom, row)
  }

  // ② Les compositions
  let creees = 0, remplacees = 0, lignes = 0
  const manquantes = new Set()
  for (const [pizza, compo] of Object.entries(CARTE)) {
    const [p] = ou(await sb.from('recettes').select('id, nom').eq('nom', pizza).eq('actif', true).limit(1), 'recette')
    if (!p) { console.log(`   ⚠️ pizza INTROUVABLE : ${pizza}`); continue }
    const avant = ou(await sb.from('recette_ingredients').select('id').eq('recette_id', p.id), 'compo')
    const payload = []
    for (const [nom, q] of compo) {
      const m = parNom.get(nom)
      if (!m) { manquantes.add(nom); continue }
      payload.push({ recette_id: p.id, ingredient_id: m.id, quantite: q, unite: m.unite })
    }
    if (payload.length !== compo.length) {
      console.log(`   ⚠️ ${pizza} : ${compo.length - payload.length} matière(s) introuvable(s) — RIEN n'est écrit pour cette pizza`)
      continue
    }
    console.log(`   ${avant.length ? '↻' : '+'} ${pizza.padEnd(28)} ${String(avant.length).padStart(2)} → ${payload.length} ingrédients`)
    lignes += payload.length
    if (avant.length) remplacees++; else creees++
    if (!ECRIRE) continue
    // ⚠️ On REMPLACE, on ne complète pas : un ingrédient retiré de l'affiche
    // doit disparaître de la fiche, sinon on continue de le commander et il
    // reste déclaré aux allergènes.
    if (avant.length) ou(await sb.from('recette_ingredients').delete().eq('recette_id', p.id).select('id'), 'purge')
    ou(await sb.from('recette_ingredients').insert(payload).select('id'), 'insert compo')
  }

  console.log(`\n   ${creees} fiche(s) créée(s), ${remplacees} remplacée(s), ${lignes} lignes au total`)
  if (manquantes.size) console.log(`   ⚠️ matières introuvables : ${[...manquantes].join(', ')}`)
  if (!ECRIRE) console.log('\n   Rien n\'a été écrit. Relancer avec --ecrire.')
  console.log()
})()
