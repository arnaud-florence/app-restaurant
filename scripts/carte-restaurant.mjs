// Carte de la pizzeria et de la brasserie — saisie depuis les affiches
// CasaTasia (septembre 2026), aux prix des affiches.
//
// Tout est créé `actif = true` : l'activation par activité (TAGS_PAR_MODULE)
// tient ces produits hors du site tant que « Ouvrir le restaurant » n'a pas
// été cliqué. Pizzas en PIZZA, plats en CUISINE, point de vente Restauration.
//
// ⚠️ AUCUN COÛT n'est écrit : ce sont des produits ASSEMBLÉS, leur coût vient
// de la fiche technique (composition + grammage), pas d'un prix d'achat. Ils
// apparaissent en « coût inconnu » (gris) jusqu'à ce qu'elle soit remplie —
// c'est voulu, un 0 % en vert serait un mensonge.
//
// ⚠️ Allergènes PROPOSÉS, jamais signés, et seulement ce qui est vrai par
// définition de la recette affichée (pâte → gluten, mozzarella → lait, noix →
// fruits à coque…). allergenes_valides_le reste NULL.
//
//   node scripts/carte-restaurant.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const BASE_IMG = 'https://app-restaurant-livid.vercel.app/produits/'
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); return t ? JSON.parse(t) : null
}
const slug = s => s.replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const G = 'gluten', L = 'lait', O = 'oeufs', N = 'fruits_a_coque', M = 'moutarde'
// [nom, famille, tag, TTC, description, allergènes, en ligne, photo découpée ?]
const CARTE = [
  ['La Marguerite',          'Pizzeria', 'PIZZA', 9.90,  'Sauce tomate, mozzarella, olives, origan', [G, L], true, true],
  ['La Tasia',               'Pizzeria', 'PIZZA', 11.90, 'Sauce tomate, mozzarella, jambon blanc, champignons, olives, origan', [G, L], true, true],
  ['La Reine Tasia',         'Pizzeria', 'PIZZA', 12.90, 'Sauce tomate, mozzarella, jambon blanc, champignons, œuf, olives, origan', [G, L, O], true, true],
  ['La Provençale',          'Pizzeria', 'PIZZA', 13.50, 'Sauce tomate, mozzarella, courgettes, aubergines, poivrons, oignons rouges, olives', [G, L], true, true],
  ['La Ferrage',             'Pizzeria', 'PIZZA', 14.90, 'Crème fraîche, mozzarella, pommes de terre, lardons, oignons confits, reblochon', [G, L], true, true],
  ['La St-Quinis',           'Pizzeria', 'PIZZA', 13.90, 'Sauce tomate, mozzarella, chorizo, poivrons, oignons rouges, olives, piment', [G, L], true, true],
  ["L'Issole",               'Pizzeria', 'PIZZA', 14.50, 'Crème fraîche, mozzarella, chèvre, miel, noix, roquette', [G, L, N], true, true],
  ["L'Anastasie",            'Pizzeria', 'PIZZA', 15.90, 'Sauce tomate, mozzarella, tomates cerises, jambon cru, roquette, parmesan, balsamique', [G, L, 'sulfites'], true, true],
  ['La CasaTasia Signature', 'Pizzeria', 'PIZZA', 17.50, 'Sauce tomate, mozzarella, burrata, coppa, tomates cerises, pesto, roquette, parmesan', [G, L], true, true],
  ['La Quatre Fromages',     'Pizzeria', 'PIZZA', 14.90, 'Crème fraîche, mozzarella, chèvre, gorgonzola, parmesan', [G, L], true, true],
  ['La Naples',              'Pizzeria', 'PIZZA', 14.50, 'Sauce tomate, viande hachée, poivrons, fromage, crème fraîche', [G, L], true, true],
  ['La Camembert',           'Pizzeria', 'PIZZA', 15.90, 'Crème fraîche, mozzarella, pommes de terre, camembert, jambon cru, oignons confits', [G, L], true, true],

  ['Burger Montagnard',      'Burger', 'CUISINE', 17.90, 'Steak haché de bœuf, reblochon, lard fumé, oignons confits, salade et frites', [G, L], false, false],
  ['Burger CasaTasia',       'Burger', 'CUISINE', 16.90, 'Steak haché de bœuf, cheddar, salade, tomate, oignons confits, sauce CasaTasia et frites', [G, L], false, false],
  ['Burger Chèvre-Miel',     'Burger', 'CUISINE', 17.50, 'Steak haché de bœuf, chèvre, miel, salade, tomate, oignons confits et frites', [G, L], false, false],
  ['Friture de la mer',      'Plat', 'CUISINE', 18.90, 'Calamars, crevettes et petits poissons croustillants, salade, citron et aïoli', ['crustaces', 'mollusques', 'poissons', O], false, false],
  ['Carpaccio CasaTasia',    'Plat', 'CUISINE', 17.90, 'Bœuf finement tranché, parmesan, roquette, pesto, citron et focaccia', [G, L], false, false],
  ['Camembert rôti',         'Plat', 'CUISINE', 18.90, 'Camembert chaud, jambon cru, pommes de terre et focaccia', [G, L], false, false],
  ['Andouillette grillée',   'Plat', 'CUISINE', 17.90, 'Andouillette grillée, sauce moutarde, frites et salade', [M], false, false],
  ['Entrecôte grillée',      'Plat', 'CUISINE', 19.90, "Entrecôte de bœuf d'environ 180-200 g, beurre aux herbes, frites et salade", [L], false, false],
  ['Tartiflette gratinée',   'Plat', 'CUISINE', 16.90, 'Pommes de terre, lardons fumés, oignons, crème, reblochon et salade', [L], false, false],
  ['Gnocchis CasaTasia',     'Plat', 'CUISINE', 15.90, 'Sauce tomate, mozzarella, parmesan et pesto, gratinés au four', [G, L], false, false],
  ['Gnocchis quatre fromages', 'Plat', 'CUISINE', 16.50, 'Crème, mozzarella, chèvre, gorgonzola et parmesan, gratinés au four', [G, L], false, false],
  ['Tartare de bœuf',        'Plat', 'CUISINE', 18.90, "Bœuf préparé au couteau, câpres, cornichons, oignons rouges, jaune d'œuf, frites et salade", [O], false, false],
  ['Salade Burrata',         'Grande salade', 'CUISINE', 18.90, 'Salade, burrata, jambon cru, tomates, pesto, roquette, olives et parmesan', [L], false, false],
  ['Salade Chèvre chaud',    'Grande salade', 'CUISINE', 16.90, 'Salade, chèvre chaud, jambon cru, tomates, noix et miel', [L, N], false, false],
  ['Planche CasaTasia',      'Planche', 'CUISINE', 19.90, 'Assortiment individuel de charcuteries et de fromages, olives et focaccia', [G, L], false, false],
  ['Planche de charcuteries', 'Planche', 'CUISINE', 19.90, 'Jambon cru, coppa, olives et focaccia', [G], false, false],
  ['Planche de fromages',    'Planche', 'CUISINE', 19.90, 'Chèvre, gorgonzola, parmesan, olives et focaccia', [G, L], false, false],
  // La formule est UN bouton : le plat choisi se note à la commande. Son coût
  // dépend du plat — il restera « inconnu » tant qu'on ne ventile pas.
  ['Formule CasaTasia',      'Menu', 'CUISINE', 19.90, "Un plat au choix — burger, gnocchis, tartiflette ou salade chèvre chaud — et un dessert du Fournil ou un café", [], false, false],
  ['Menu enfant',            'Menu', 'CUISINE', 11.90, 'Steak haché, frites, sirop et glace', [], false, true],
]

const [pdv] = await sb('etablissements?select=id&slug=eq.le-relais-des-saveurs')
if (!pdv) { console.log('✗ point de vente Restauration introuvable'); process.exit(1) }
const deja = new Set(((await sb('recettes?select=nom')) ?? []).map(r => r.nom))
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const lignes = []
for (const [nom, cat, tag, ttc, desc, allerg, enLigne, photo] of CARTE) {
  if (deja.has(nom)) { console.log(`  = ${nom} existe déjà`); continue }
  console.log(`  + ${cat.padEnd(14)} ${nom.padEnd(26)} ${ttc.toFixed(2).replace('.', ',').padStart(6)} €${photo ? '  📷' : ''}`)
  lignes.push({
    nom, nom_caisse: nom, categorie: cat, tag_destination: tag, etablissement_id: pdv.id,
    tva: 10, prix_vente_ht: Math.round(ttc / 1.1 * 10000) / 10000, description: desc,
    contient_alcool: false, actif: true, vendable_online: enLigne,
    nb_portions: 1, temps_preparation: 0, type_revenu: 'vente',
    allergenes_complementaires: allerg,
    // Photo découpée dans l'affiche ; sinon NULL — la plaque typographique
    // est posée ensuite par generer-visuels-sans-photo.mjs.
    image_url: photo ? BASE_IMG + slug(nom) + '.jpg' : null,
  })
}
console.log(`\n  ${lignes.length} à créer`)
if (ECRIRE && lignes.length) {
  const r = await sb('recettes', { method: 'POST', body: JSON.stringify(lignes) })
  if (!Array.isArray(r)) { console.log('  ✗ refusé :', JSON.stringify(r)); process.exit(1) }
  console.log(`  → ${r.length} produit(s) créé(s)`)
} else if (!ECRIRE) console.log('  (rien écrit — relancer avec --ecrire)')
