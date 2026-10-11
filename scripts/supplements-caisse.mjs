#!/usr/bin/env node
// Les SUPPLÉMENTS d'ingrédients, poussés dans la caisse Zelty.
//
//   node scripts/supplements-caisse.mjs [--ecrire]
//
// Essai à blanc par défaut : il affiche la grille, les coûts et le food cost
// de chaque supplément, et ne touche à rien.
//
// ─── CE QUI SE JOUE ICI ──────────────────────────────────────────────────
//
// Un supplément est une VENTE À MARGE PURE : le client le demande, personne
// ne l'a prévu, et il s'ajoute à un ticket déjà payé. Mais il n'existe que
// si la caisse sait le taper — sinon le serveur l'offre, ou pire, le refuse.
//
// ⚠️⚠️ ON NE PROPOSE QUE CE QU'ON A EN RÉSERVE. Chaque supplément est adossé
// à une ligne d'`ingredients` portant `stocke = true` : le script REFUSE de
// construire une valeur dont la matière n'existe pas ou n'est pas suivie.
// Un supplément sans matière, c'est un client à qui on dit non après l'avoir
// encaissé — et une sortie de stock que le réassort ne verra jamais venir.
//
// ⚠️ Les ROQUEFORT et CHANTILLY demandés par le gérant sont dans A_COMMANDER,
// PAS dans la grille : aucun des deux n'est en stock aujourd'hui. Ils sont
// chiffrés avec leur fournisseur, et basculeront dans la grille le jour de la
// livraison — une ligne à déplacer, rien de plus.
//
// ─── LE DANGER, ET IL EST CONNU ──────────────────────────────────────────
//
// Rattacher une option à un plat passe par `POST /catalog/dishes`, qui est un
// UPSERT exigeant `name`, `price` et `tax` (0141). Un objet incomplet écrase
// le prix imprimé sur les tickets. Donc, exactement comme
// `zelty/disponibilite.ts` : on RELIT le catalogue à l'instant, on RECOPIE
// ces trois champs tels quels, on ne touche QUE `options`, et on REFUSE de
// construire s'il en manque un. On n'invente jamais un prix.
//
// ⚠️ `POST /catalog/options` et `POST /catalog/dishes` prennent un TABLEAU NU,
// jamais `{options: [...]}` — l'API répond alors 400 en réclamant des champs
// qu'on a pourtant envoyés, et on cherche le mauvais problème (vécu le 25/09).
// Tout part en UN SEUL appel par endpoint : Zelty plafonne son débit et rend
// 429 au cinquième appel à la file.
//
// ⚠️ Une relecture rendant moins de 100 plats est une LECTURE RATÉE, pas un
// catalogue vide : on s'arrête sans rien écrire.
//
// ─── LES PRIX ────────────────────────────────────────────────────────────
//
// Prix en CENTIMES TTC, comme les plats. Tous les plats concernés sont à
// 10 %, donc aucun écueil de taux ici.
//
// Les prix sont des PALIERS ronds (1,00 / 1,50 / 2,00 / 2,50 / 3,00 / 4,00),
// pas un coût × coefficient : un supplément à 1,37 € ne se lit pas sur une
// ardoise et ne se rend pas en monnaie. Le script affiche le food cost de
// chacun pour que le palier se vérifie — aucun n'est au-dessus de 32 %.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ZKEY = env.ZELTY_API_KEY
if (!U || !K)  { console.error('✗ Supabase manquant dans .env.local'); process.exit(1) }
if (!ZKEY)     { console.error('✗ ZELTY_API_KEY manquante'); process.exit(1) }

const T = async p => {
  const out = []
  for (let d = 0; d < 60_000; d += 1000) {
    const r = await fetch(`${U}/rest/v1/${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`,
      { headers: { apikey: K, Authorization: 'Bearer ' + K } })
    const j = await r.json()
    if (!Array.isArray(j)) throw new Error(p + ' → ' + JSON.stringify(j).slice(0, 200))
    out.push(...j); if (j.length < 1000) break
  }
  return out
}

const zelty = async (path, init = {}) => {
  for (let t = 0; t < 4; t++) {
    const r = await fetch('https://api.zelty.fr/2.11' + path, {
      ...init,
      headers: { Authorization: `Bearer ${ZKEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * (t + 1))); continue }
    const txt = await r.text()
    let body; try { body = JSON.parse(txt) } catch { body = txt }
    return { status: r.status, body }
  }
  throw new Error('Zelty injoignable : ' + path)
}

// ═══════════════════════════════════════════════════════════════════════
//  LA GRILLE
//
//  matiere  : le `nom` EXACT dans `ingredients` (le script refuse sinon)
//  portion  : exprimée dans l'UNITÉ DE LA MATIÈRE — la même convention que
//             `recette_ingredients`, donc aucune conversion, donc aucune
//             erreur de facteur mille (leçon du « SEL FIN SAC=25G »).
//  prix     : TTC en euros, palier rond.
//
//  Les portions sont celles des fiches techniques existantes, en général
//  ramenées à la portion de garniture d'un plat. Elles se corrigent à la
//  balance au premier service.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  LA GRILLE SE DÉRIVE DES CARTES, ELLE NE SE SAISIT PAS
//
//  ⚠️⚠️ Un supplément doit être un ingrédient QUI EST DÉJÀ SUR LA CARTE.
//  Une liste tapée à la main depuis le stock proposait au client des choses
//  que la cuisine ne pose sur rien (thon, feta, crevettes sur une pizza) et
//  OUBLIAIT ce qui y est vraiment (camembert, pommes de terre, banane,
//  noix de coco). La première version de ce fichier faisait exactement ça.
//
//  Donc : on lit `recette_ingredients` des plats visés, on prend la portion
//  MÉDIANE réellement pesée en cuisine, et on en retire trois choses — les
//  bases, les assaisonnements, et la protéine principale d'un plat.
//
//  ⚠️ CONSÉQUENCE VOULUE : quand la carte gagne un ingrédient, il apparaît
//  ici tout seul. Et s'il n'a pas de prix, le script REFUSE de le pousser et
//  le NOMME — il ne peut donc ni disparaître en silence, ni recevoir un prix
//  inventé. C'est le même raisonnement que « sans cible, aucune quantité
//  n'est proposée » du réassort (0163).
// ═══════════════════════════════════════════════════════════════════════

// Ce qui est sur la carte mais ne s'ajoute pas, et POURQUOI.
const BASES = {
  'supp-pizza': {
    'Pâton à pizza 350 g (pièce)': 'c’est la pizza elle-même',
    'Sauce tomate pizza (kg)':     'la base, pas une garniture',
    'Origan':                      'assaisonnement — offert',
    'Citron (pièce)':              'quartier de service du saumon',
    'Aneth frais (botte)':         'herbe de dressage',
  },
  'supp-plat': {
    'Focaccia (pièce)':            'le pain du plat',
    'Pain burger (pièce)':         'le pain du burger',
    'Gnocchis frais (kg)':         'la base du plat',
    'Pommes de terre (kg)':        'la garniture du plat — les frites tiennent ce rôle en supplément',
    'Graisse de bœuf (kg)':        'matière de friture',
    'Huile d’olive':               'matière de cuisson',
    'Beurre doux':                 'matière de cuisson',
    'Farine de blé T55':           'panure',
    'Vinaigrette (litre)':         'assaisonnement inclus',
    'Persil frais (botte)':        'herbe de dressage',
    'Citron (pièce)':              'quartier de service',
    'Sauce tomate pizza (kg)':     'base de cuisson',
    // ⚠️ les protéines qui FONT le plat : « supplément entrecôte » n'existe pas
    'Entrecôte de bœuf (kg)':      'c’est le plat',
    'Bœuf pour carpaccio (kg)':    'c’est le plat',
    'Bœuf haché au couteau (kg)':  'c’est le plat',
    'Andouillette (pièce)':        'c’est le plat',
    'Éperlans (kg)':               'c’est le plat',
    'Anneaux de calamars (kg)':    'c’est le plat',
  },
}

// ⚠️ Quand la fiche porte une portion de BASE et non de supplément.
// La mozzarella d'une pizza, c'est tout son fromage ; en supplément on en
// remet la moitié. Pareil pour un gratin ou une sauce de montage.
const PORTION_SUPP = {
  'supp-pizza': { 'Mélange râpé mozzarella 60 % / emmental 40 %': 0.065 },
  'supp-plat': {
    'Mozzarella râpée': 0.04, 'Reblochon (kg)': 0.06, 'Coppa tranchée (kg)': 0.05,
    'Lardons fumés (kg)': 0.05, 'Champignons de Paris frais (kg)': 0.06,
    'Jambon cru tranché (kg)': 0.04, 'Crème fraîche épaisse': 0.05,
    'Parmesan (kg)': 0.015, 'Cheddar en tranches (kg)': 0.03,
    'Camembert 250 g (pièce)': 0.3333,
    'Sauce moutarde (kg)': 0.03, 'Aïoli (kg)': 0.025, 'Sauce burger maison (kg)': 0.02,
    'Olives noires': 0.03,
  },
}

// Les desserts du Fournil sont de l'achat-revente : AUCUNE fiche chiffrée,
// donc rien à dériver. Les suppléments sucrés sont pris sur la carte des
// pizzas sucrées + la coupe de glace, qui sont les seules fiches sucrées.
// ⚠️ « Boule de glace » est SORTIE le 11/10/2026 : le gérant a retiré toutes
// les glaces de la carte (les quatre du Fournil et la coupe de glace en
// salle). Un supplément dont plus aucun produit n'est vendu se tape au
// comptoir, se facture, et la cuisine n'a rien à servir.
const DESSERT_DEPUIS_CARTE = ['Nutella (kg)', 'Banane (pièce)',
  'Noix de coco râpée', 'Cerneaux de noix (kg)', 'Miel liquide']
const PORTION_DESSERT = { 'Nutella (kg)': 0.05, 'Banane (pièce)': 1,
  'Noix de coco râpée': 0.01, 'Cerneaux de noix (kg)': 0.015, 'Miel liquide': 0.015 }

// ⚠️ HORS FICHES, et assumé : personne ne les a mises dans une recette, mais
// un client qui a des frites devant lui les demande. Elles sont en stock.
// Tout le reste de la grille vient des cartes ; ces deux-là sont nommées.
const HORS_FICHES = {
  'supp-plat': [
    ['Sauce ketchup',    'Sauce ketchup',    0.03],
    ['Sauce mayonnaise', 'Sauce mayonnaise', 0.03],
  ],
}

// Le nom affiché sur la caisse. Un libellé de stock (« Bûchette de chèvre »,
// « Mélange râpé mozzarella 60 % / emmental 40 % ») n'a rien à faire sur un
// écran de prise de commande.
const LIBELLE = {
  'Mélange râpé mozzarella 60 % / emmental 40 %': 'Mozzarella râpée',
  'Bûchette de chèvre': 'Chèvre', 'Camembert 250 g (pièce)': 'Camembert',
  'Burrata 125 g (pièce)': 'Burrata', 'Steak haché de bœuf 150 g (pièce)': 'Steak haché 150 g',
  'Œuf (pièce)': 'Œuf', 'Glace (boule)': 'Boule de glace', 'Banane (pièce)': 'Banane',
  'Nutella (kg)': 'Nutella', 'Miel liquide': 'Miel', 'Noix de coco râpée': 'Noix de coco',
  'Cerneaux de noix (kg)': 'Cerneaux de noix', 'Olives noires': 'Olives noires',
  'Crème fraîche épaisse': 'Crème fraîche', 'Jambon blanc tranché': 'Jambon blanc',
  'Jambon cru tranché (kg)': 'Jambon cru', 'Coppa tranchée (kg)': 'Coppa',
  'Chorizo tranché (kg)': 'Chorizo', 'Lardons fumés (kg)': 'Lardons fumés',
  'Lard fumé en tranches (kg)': 'Bacon', 'Saumon fumé tranché': 'Saumon fumé',
  'Crevettes décortiquées (kg)': 'Crevettes', 'Viande hachée de bœuf (kg)': 'Viande hachée',
  'Champignons de Paris frais (kg)': 'Champignons', 'Oignons rouges émincés (kg)': 'Oignons rouges',
  'Oignons jaunes émincés (kg)': 'Oignons', 'Oignons confits (kg)': 'Oignons confits',
  'Poivrons en lanières (kg)': 'Poivrons', 'Aubergines grillées (kg)': 'Aubergines grillées',
  'Courgettes grillées (kg)': 'Courgettes grillées', 'Tomates cerises (kg)': 'Tomates cerises',
  'Tomates (kg)': 'Tomates', 'Roquette (kg)': 'Roquette', 'Salade mesclun (kg)': 'Salade',
  'Pommes de terre (kg)': 'Pommes de terre', 'Frites belges 12×12 (kg)': 'Portion de frites',
  'Parmesan (kg)': 'Parmesan', 'Gorgonzola (kg)': 'Gorgonzola', 'Reblochon (kg)': 'Reblochon',
  'Cheddar en tranches (kg)': 'Cheddar', 'Mozzarella râpée': 'Mozzarella râpée',
  'Pesto alla genovese': 'Pesto', 'Câpres (kg)': 'Câpres', 'Cornichons (kg)': 'Cornichons',
  'Sauce moutarde (kg)': 'Sauce moutarde', 'Aïoli (kg)': 'Aïoli',
  'Sauce burger maison (kg)': 'Sauce burger maison', 'Sauce ketchup': 'Ketchup',
  'Sauce mayonnaise': 'Mayonnaise',
}

// ⚠️ LES PRIX SONT DES PALIERS RONDS, pas un coût × coefficient : un
// supplément à 1,37 € ne se lit pas sur une ardoise et ne se rend pas en
// monnaie. Le script imprime le food cost de chacun pour que le palier se
// vérifie. Un ingrédient de la carte ABSENT de cette table est REFUSÉ et
// nommé — jamais poussé à un prix deviné.
const PRIX = {
  'Olives noires': 1.00, 'Mélange râpé mozzarella 60 % / emmental 40 %': 1.50,
  'Mozzarella râpée': 1.00, 'Crème fraîche épaisse': 1.00, 'Poivrons en lanières (kg)': 1.00,
  'Roquette (kg)': 1.50, 'Parmesan (kg)': 1.50, 'Nutella (kg)': 2.50,
  'Jambon blanc tranché': 2.00, 'Champignons de Paris frais (kg)': 1.00,
  'Oignons rouges émincés (kg)': 1.00, 'Oignons jaunes émincés (kg)': 1.00,
  'Oignons confits (kg)': 1.00, 'Jambon cru tranché (kg)': 2.00,
  'Tomates cerises (kg)': 1.00, 'Tomates (kg)': 1.00, 'Bûchette de chèvre': 2.50,
  'Pommes de terre (kg)': 1.00, 'Banane (pièce)': 1.50, 'Chorizo tranché (kg)': 2.00,
  'Saumon fumé tranché': 3.00, 'Miel liquide': 0.50, 'Cerneaux de noix (kg)': 1.00,
  'Gorgonzola (kg)': 2.00, 'Lardons fumés (kg)': 1.50, 'Œuf (pièce)': 1.50,
  'Courgettes grillées (kg)': 1.50, 'Aubergines grillées (kg)': 1.00,
  'Camembert 250 g (pièce)': 2.50, 'Burrata 125 g (pièce)': 4.50,
  'Coppa tranchée (kg)': 2.50, 'Pesto alla genovese': 1.00,
  'Viande hachée de bœuf (kg)': 2.50, 'Noix de coco râpée': 0.50,
  'Salade mesclun (kg)': 1.50, 'Frites belges 12×12 (kg)': 2.50,
  'Steak haché de bœuf 150 g (pièce)': 4.50, 'Reblochon (kg)': 3.00,
  'Cheddar en tranches (kg)': 1.00, 'Lard fumé en tranches (kg)': 1.50,
  'Crevettes décortiquées (kg)': 3.00, 'Câpres (kg)': 1.00, 'Cornichons (kg)': 0.50,
  'Sauce moutarde (kg)': 0.50, 'Aïoli (kg)': 0.50, 'Sauce burger maison (kg)': 0.50,
  'Glace (boule)': 1.50, 'Sauce ketchup': 0.50, 'Sauce mayonnaise': 0.50,
}

// ⚠️ DEMANDÉS PAR LE GÉRANT, PAS EN STOCK. Chiffrés, pas poussés — et une
// `OptionValue` ne porte AUCUN drapeau `disable`, donc on ne peut pas « créer
// éteint ». Ne pas pousser est le seul moyen de ne pas vendre ce qu'on n'a pas.
const A_COMMANDER = [
  ['Roquefort', 'entrecôte, burger, salade', 'Félix Potin Provence',
   'ROQUEFORT AOP 31% LC BREBIS 1/2 1K35', '13,68 €/kg — soit 0,55 € les 40 g, à vendre 2,00 €'],
  ['Chantilly', 'coulant au chocolat, desserts', 'Félix Potin Provence',
   'CREME SUCREE S/PRESSION UHT AERO 32% 700ML DEBIC',
   '7,39 € la bombe de 700 ml — ~25 doses, soit 0,30 € la dose, à vendre 1,00 €'],
]

// Les groupes, et à quels plats ils se rattachent.
const GROUPES = [
  { cle: 'supp-pizza',   nom: 'Suppléments pizza',
    cible: r => r.tag_destination === 'PIZZA'   && r.categorie === 'Pizzeria' },
  { cle: 'supp-plat',    nom: 'Suppléments',
    cible: r => r.tag_destination === 'CUISINE' &&
                ['Burger', 'Plat', 'Grande salade', 'Planche'].includes(r.categorie) },
  { cle: 'supp-dessert', nom: 'Suppléments dessert',
    cible: r => r.tag_destination === 'CUISINE' && r.categorie === 'Dessert' },
]

const eur = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const pct = n => (n * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'

async function main() {
  // ─── 1. la grille, DÉRIVÉE DES CARTES ────────────────────────────────
  const ings = await T('ingredients?select=id,nom,unite,prix_achat_ht,prix_estime,stocke,actif&actif=eq.true')
  const parIngId = new Map(ings.map(i => [i.id, i]))
  const parNom   = new Map(ings.map(i => [i.nom, i]))
  const recs = await T('recettes?select=id,nom,categorie,tag_destination,actif')
  const ri   = await T('recette_ingredients?select=recette_id,ingredient_id,quantite')
  const fiches = {}
  for (const l of ri) (fiches[l.recette_id] = fiches[l.recette_id] || []).push(l)

  const mediane = a => { const t = [...a].sort((x, y) => x - y); return t[Math.floor(t.length / 2)] }
  const sansPrix = [], refus = []
  const construit = []

  for (const g of GROUPES) {
    const plats = recs.filter(g.cible)

    // Ce que la carte emploie RÉELLEMENT, et dans combien de plats.
    const vus = new Map()
    for (const p of plats) for (const l of (fiches[p.id] || [])) {
      const i = parIngId.get(l.ingredient_id); if (!i) continue
      if (!vus.has(i.nom)) vus.set(i.nom, { plats: 0, q: [] })
      const v = vus.get(i.nom); v.plats++; v.q.push(Number(l.quantite))
    }

    // ⚠️ Les desserts du Fournil sont de l'achat-revente : AUCUNE fiche
    // chiffrée, donc rien à dériver d'eux. Les suppléments sucrés viennent
    // des seules fiches sucrées de la maison — les pizzas Nutella et la
    // coupe de glace.
    let noms, portionDe
    if (g.cle === 'supp-dessert') {
      noms = [...DESSERT_DEPUIS_CARTE]
      portionDe = n => PORTION_DESSERT[n]
    } else {
      noms = [...vus.keys()].filter(n => !BASES[g.cle]?.[n])
      portionDe = n => PORTION_SUPP[g.cle]?.[n] ?? mediane(vus.get(n).q)
    }
    for (const h of (HORS_FICHES[g.cle] || [])) if (!noms.includes(h[0])) noms.push(h[0])

    const valeurs = []
    for (const nom of noms) {
      const i = parNom.get(nom)
      if (!i)        { refus.push(`${g.cle} / ${nom} : absent du catalogue des matières`); continue }
      if (!i.stocke) { refus.push(`${g.cle} / ${nom} : pas suivi en stock`); continue }
      const hf = (HORS_FICHES[g.cle] || []).find(h => h[0] === nom)
      const portion = hf ? hf[2] : portionDe(nom)
      const prix = PRIX[nom]
      // ⚠️ Pas de prix = pas de supplément, et on le NOMME. Un prix deviné
      // sur une marchandise jamais tarifée se découvre sur le ticket.
      if (prix == null) { sansPrix.push(`${g.cle} / ${nom} (${vus.get(nom)?.plats ?? 0} plat(s))`); continue }
      const cout = i.prix_achat_ht == null ? null : Number(i.prix_achat_ht) * portion
      valeurs.push({
        nom: LIBELLE[nom] ?? nom, matiere: nom, portion, unite: i.unite, prix, cout,
        estime: i.prix_estime !== false,
        surCarte: vus.get(nom)?.plats ?? 0,
        reduite: !hf && g.cle !== 'supp-dessert' && PORTION_SUPP[g.cle]?.[nom] != null,
        horsFiche: !!hf,
      })
    }
    valeurs.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    construit.push({ ...g, valeurs, plats, ecartes: Object.entries(BASES[g.cle] || {}) })
  }

  // ─── 2. la grille, à l'écran ──────────────────────────────────────────
  console.log('\n╔══ SUPPLÉMENTS — grille proposée ' + '═'.repeat(44))
  for (const g of construit) {
    console.log(`\n  ▸ ${g.nom}  (${g.valeurs.length} suppléments)`)
    console.log('    ' + 'supplément'.padEnd(22) + 'portion'.padStart(8) + '   ' +
                'unité'.padEnd(18) + 'coût'.padStart(8) + 'prix'.padStart(8) + '  f.cost  d\u2019où il vient')
    for (const v of g.valeurs) {
      const fc = v.cout == null ? '   —  ' : pct(v.cout / (v.prix / 1.10)).padStart(7)
      const src = v.horsFiche ? 'hors fiche'
        : v.surCarte === 0 ? 'fiches sucrées'
        : `${v.surCarte} plat${v.surCarte > 1 ? 's' : ''} de la carte`
      console.log('    ' + v.nom.padEnd(22) +
        String(v.portion).padStart(8) + (v.reduite ? '↓' : ' ') + '  ' + String(v.unite || '').padEnd(18) +
        (v.cout == null ? '     —' : eur(v.cout).padStart(8)) +
        eur(v.prix).padStart(8) + '  ' + fc + '  ' + src.padEnd(20) + (v.estime ? 'coût estimé' : ''))
    }
    if (g.ecartes.length) console.log('    ── écartés : ' +
      g.ecartes.map(([n, r]) => `${LIBELLE[n] ?? n} (${r})`).join(' · '))
  }

  if (sansPrix.length) {
    console.log('\n  ⚠ SUR LA CARTE MAIS SANS PRIX — refusés, jamais poussés à un prix deviné :')
    for (const r of sansPrix) console.log('    · ' + r)
  }

  if (refus.length) {
    console.log('\n  ⚠ ÉCARTÉS — la matière manque, donc le supplément n’existe pas :')
    for (const r of refus) console.log('    · ' + r)
  }

  console.log('\n  ⚠ DEMANDÉS MAIS PAS EN STOCK — chiffrés, PAS poussés en caisse :')
  for (const [nom, usage, fourn, ref, note] of A_COMMANDER)
    console.log(`    · ${nom} (${usage})\n      ${fourn} — ${ref}\n      ${note}`)

  // ─── 3. les plats visés ───────────────────────────────────────────────
  const corr = await T('correspondances_catalogue?select=recette_id,identifiant_externe&systeme=eq.zelty')
  const idCaisse = new Map(corr.map(c => [c.recette_id, String(c.identifiant_externe)]))

  console.log('\n╔══ PLATS VISÉS ' + '═'.repeat(62))
  const cibles = []            // { zeltyId, groupeCle, nomPlat }
  const sansLien = []
  for (const g of construit) {
    const plats = recs.filter(g.cible)
    const actifs = plats.filter(p => p.actif).length
    console.log(`\n  ▸ ${g.nom} → ${plats.length} plats (${actifs} actifs, ${plats.length - actifs} en pause)`)
    for (const p of plats) {
      const zid = idCaisse.get(p.id)
      if (!zid) { sansLien.push(`${p.nom} (${p.categorie})`); continue }
      cibles.push({ zeltyId: Number(zid), groupe: g.cle, nom: p.nom, actif: p.actif })
    }
    console.log('    ' + plats.map(p => p.nom + (p.actif ? '' : ' ⏸')).join(' · '))
  }
  if (sansLien.length) {
    console.log('\n  ⚠ Sans correspondance caisse — non rattachés (ils n’existent pas chez Zelty) :')
    for (const s of sansLien) console.log('    · ' + s)
  }

  if (!ECRIRE) {
    console.log('\n  ── essai à blanc. Rien n’a été écrit. `--ecrire` pour appliquer.\n')
    return
  }

  // ─── 4. les options, chez Zelty ───────────────────────────────────────
  console.log('\n╔══ ÉCRITURE ' + '═'.repeat(65))

  const avant = await zelty('/catalog/options?limit=0')
  if (avant.status !== 200) { console.error('✗ lecture des options : ' + avant.status); process.exit(1) }
  const dejaLa = new Map((avant.body.options || []).map(o => [o.remote_id, o]))
  console.log(`  options déjà en caisse : ${(avant.body.options || []).length}`)

  const charge = construit.map(g => {
    const existant = dejaLa.get(g.cle)
    const valeursEx = new Map(((existant?.values) || []).map(v => [v.remote_id, v]))
    return {
      ...(existant ? { id: existant.id } : {}),
      remote_id: g.cle,
      name: g.nom,
      min_choices: 0,                    // un supplément ne s'impose jamais
      max_choices: 6,
      pick_same_value: true,             // deux œufs, c'est deux œufs
      values: g.valeurs.map(v => {
        const cle = g.cle + '::' + v.nom
        const ex = valeursEx.get(cle)
        return {
          ...(ex ? { id: ex.id } : {}),
          remote_id: cle,
          name: v.nom,
          price: Math.round(v.prix * 100),   // centimes TTC
        }
      }),
    }
  })

  const po = await zelty('/catalog/options', { method: 'POST', body: JSON.stringify(charge) })
  if (po.status !== 200) {
    console.error('✗ POST /catalog/options → ' + po.status)
    console.error(JSON.stringify(po.body, null, 1).slice(0, 1500))
    process.exit(1)
  }
  console.log('  ✓ options écrites')

  const apres = await zelty('/catalog/options?limit=0')
  const idGroupe = new Map((apres.body.options || []).map(o => [o.remote_id, o.id]))
  for (const g of construit) {
    const id = idGroupe.get(g.cle)
    console.log(`    ${g.nom} → #${id ?? '???'} (${(apres.body.options || []).find(o => o.remote_id === g.cle)?.values?.length ?? 0} valeurs)`)
    if (!id) { console.error('✗ groupe « ' + g.cle + ' » introuvable après écriture — on s’arrête.'); process.exit(1) }
  }

  // ─── 5. rattachement aux plats, à la règle de la 0141 ─────────────────
  // ⚠️⚠️ `show_all=true` : sans lui l'API OMET les plats désactivés (192
  // contre 242 le 10/10/2026). Les 13 plats de brasserie en pause pour
  // l'ardoise n'auraient jamais reçu leurs suppléments — et personne ne
  // l'aurait vu, puisqu'ils ne sont pas à la carte cette semaine. Ils
  // seraient revenus sans suppléments, en silence.
  const gd = await zelty('/catalog/dishes?show_all=true&limit=0')
  const plats = gd.body.dishes || []
  if (plats.length < 100) {
    console.error(`✗ la caisse ne rend que ${plats.length} plats : c’est une LECTURE RATÉE, pas un catalogue vide. Rien n’est écrit.`)
    process.exit(1)
  }
  console.log(`\n  catalogue relu : ${plats.length} plats`)

  const parId = new Map(plats.map(p => [Number(p.id), p]))
  const majs = [], refusMaj = [], inchanges = []

  // un plat peut viser plusieurs groupes ; on agrège d'abord
  const voulu = new Map()
  for (const c of cibles) {
    const gid = idGroupe.get(c.groupe)
    if (!voulu.has(c.zeltyId)) voulu.set(c.zeltyId, { nom: c.nom, ids: new Set() })
    voulu.get(c.zeltyId).ids.add(gid)
  }

  for (const [zid, v] of voulu) {
    const p = parId.get(zid)
    if (!p) { refusMaj.push(`${v.nom} : #${zid} inconnu de la caisse`); continue }
    // Les trois champs obligatoires : recopiés, jamais inventés.
    if (!p.name || typeof p.name !== 'string')      { refusMaj.push(`${v.nom} : nom absent — refus`);  continue }
    if (p.price == null || !Number.isFinite(Number(p.price))) { refusMaj.push(`${v.nom} : prix absent — refus, un upsert l’écraserait`); continue }
    if (p.tax == null || !Number.isFinite(Number(p.tax)))     { refusMaj.push(`${v.nom} : TVA absente — refus`); continue }

    const actuelles = (p.options || []).map(o => Number(typeof o === 'object' ? o?.id : o)).filter(Number.isFinite)
    const cible = [...new Set([...actuelles, ...v.ids])]
    if (cible.length === actuelles.length && v.ids.size && [...v.ids].every(i => actuelles.includes(i))) {
      inchanges.push(v.nom); continue
    }
    majs.push({ id: Number(p.id), name: p.name, price: Number(p.price), tax: Number(p.tax), options: cible })
  }

  console.log(`  à rattacher : ${majs.length} · déjà bons : ${inchanges.length} · refusés : ${refusMaj.length}`)
  for (const r of refusMaj) console.log('    ⚠ ' + r)

  if (majs.length) {
    const pd = await zelty('/catalog/dishes', { method: 'POST', body: JSON.stringify(majs) })
    if (pd.status !== 200) {
      console.error('✗ POST /catalog/dishes → ' + pd.status)
      console.error(JSON.stringify(pd.body, null, 1).slice(0, 1500))
      process.exit(1)
    }
    console.log('  ✓ plats rattachés')
  }

  // ─── 6. contrôle ──────────────────────────────────────────────────────
  const verif = await zelty('/catalog/dishes?show_all=true&limit=0')
  const vp = verif.body.dishes || []
  let ok = 0, ko = []
  for (const [zid, v] of voulu) {
    const p = vp.find(x => Number(x.id) === zid)
    const has = (p?.options || []).map(o => Number(typeof o === 'object' ? o?.id : o))
    if ([...v.ids].every(i => has.includes(i))) ok++; else ko.push(v.nom)
  }
  console.log(`\n  CONTRÔLE : ${ok}/${voulu.size} plats portent bien leurs suppléments`)
  if (ko.length) console.log('    ✗ ' + ko.join(' · '))
  console.log('')
}

main().catch(e => { console.error('✗ ' + e.message); process.exit(1) })
