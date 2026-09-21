// Fiches techniques des 12 pizzas — composition, grammages, méthode.
//
// Base : pizza ronde de 31 cm sur le pâton Gineys (celui du Fournil, coût
// relevé sur facture). Grammages standard de pizzeria, à AJUSTER au premier
// service : c'est la fiche qui fait foi au poste, pas l'habitude de la main.
//
// ⚠️ PRIX DES INGRÉDIENTS — deux origines, et la différence compte :
//  · réutilisés tels quels quand ils viennent d'une facture Gineys et que
//    l'unité colle (mozzarella râpée, jambon blanc, olives, crème, chèvre,
//    miel, pesto, huile) — ce sont des prix MESURÉS ;
//  · créés avec une ESTIMATION de cash & carry pour tout le reste (burrata,
//    coppa, reblochon, légumes grillés…), marquée dans `fournisseur_principal`.
//    Le fournisseur de la pizzeria n'est pas encore choisi.
//
// ⚠️ Les ingrédients créés portent leur UNITÉ dans le nom (« Roquette (kg) »).
// Le rapprochement des factures cherche le nom de l'ingrédient DANS la ligne :
// un « Roquette » nu capterait « ROQUETTE BARQ 125G » et y écrirait un prix à
// la barquette dans un ingrédient au kilo — un coût faux, en silence. Avec
// l'unité dans le nom, il ne capte rien ; le lien se pose à la main dans
// /admin/correspondances quand le vrai fournisseur facture.
//
// Le coût = quantité × prix de l'unité de l'ingrédient (pas de conversion) :
// les quantités sont donc exprimées dans CETTE unité (0,12 kg, 1 pièce…).
//
//   node scripts/fiches-pizzas.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(`${p} → ${j?.message ?? r.status}`)
  return j
}

const ESTIM = 'ESTIMATION 21/09/2026 — à remplacer par la première facture'
// Ingrédients à créer : [nom, unité, prix HT de l'unité, allergènes, origine du prix]
const NOUVEAUX = [
  ['Pâton à pizza (pièce)',          'pièce', 0.4538, ['gluten'], 'Gineys — coût du pâton relevé sur facture (Fournil)'],
  ['Sauce tomate pizza (kg)',        'kg',    1.71,   [], 'Gineys — boîte 5/1 à 7,00 € ramenée au kg (≈ 4,1 kg nets, à vérifier)'],
  ['Champignons émincés (kg)',       'kg',    4.50,   [], ESTIM],
  ['Œuf (pièce)',                    'pièce', 0.25,   ['oeufs'], ESTIM],
  ['Courgettes grillées (kg)',       'kg',    7.00,   [], ESTIM],
  ['Aubergines grillées (kg)',       'kg',    7.00,   [], ESTIM],
  ['Poivrons en lanières (kg)',      'kg',    6.00,   [], ESTIM],
  ['Oignons rouges émincés (kg)',    'kg',    2.50,   [], ESTIM],
  ['Oignons confits (kg)',           'kg',    8.00,   [], ESTIM],
  ['Pommes de terre en rondelles (kg)', 'kg', 2.50,   [], ESTIM],
  ['Lardons fumés (kg)',             'kg',    7.50,   [], ESTIM],
  ['Reblochon (kg)',                 'kg',   15.00,   ['lait'], ESTIM],
  ['Chorizo tranché (kg)',           'kg',   12.00,   [], ESTIM],
  ['Huile pimentée (litre)',         'litre', 9.00,   [], ESTIM],
  ['Cerneaux de noix (kg)',          'kg',   15.00,   ['fruits_a_coque'], ESTIM],
  ['Roquette (kg)',                  'kg',   12.00,   [], ESTIM],
  ['Tomates cerises (kg)',           'kg',    5.00,   [], ESTIM],
  ['Parmesan (kg)',                  'kg',   22.00,   ['lait'], ESTIM],
  ['Crème de balsamique (litre)',    'litre',10.00,   ['sulfites'], ESTIM],
  ['Burrata 125 g (pièce)',          'pièce', 1.90,   ['lait'], ESTIM],
  ['Coppa tranchée (kg)',            'kg',   24.00,   [], ESTIM],
  ['Gorgonzola (kg)',                'kg',   13.00,   ['lait'], ESTIM],
  ['Jambon cru tranché (kg)',        'kg',   18.00,   [], ESTIM],
  ['Viande hachée de bœuf (kg)',     'kg',   11.00,   [], ESTIM],
  ['Camembert 250 g (pièce)',        'pièce', 2.20,   ['lait'], ESTIM],
]
// Déjà en base, prix de facture Gineys — l'unité est celle de la ligne de facture.
const EXISTANTS = ['Mozzarella râpée', 'Jambon blanc tranché', 'Olives noires', 'Crème fraîche épaisse',
  'Bûchette de chèvre', 'Miel liquide', 'Pesto alla genovese', 'Huile d’olive']

// Raccourcis : quantités dans l'unité de l'ingrédient. g → kg / 1000.
const kg = g => g / 1000
const B = [['Pâton à pizza (pièce)', 1]]
const TOMATE = [['Sauce tomate pizza (kg)', kg(80)]]
const CREME = [['Crème fraîche épaisse', 0.06]]            // seau 1 L → 60 ml
const MOZZA = g => [['Mozzarella râpée', kg(g)]]
const OLIVES = [['Olives noires', kg(15)]]
const HUILE = [['Huile d’olive', 0.005]]                  // un filet, 5 ml

// Étapes communes. Les ingrédients « après cuisson » ne passent PAS au four :
// la roquette y brûle, la burrata y fond, le jambon cru y durcit.
const ETALER = "1. Sortir le pâton 30 min avant (température ambiante), l'étaler à la main en disque de 31 cm, bord de 1,5 cm."
const CUIRE = 'Enfourner : four à 300 °C, 6 à 8 min — fond doré, bord soufflé et tacheté. (Ajuster au four réel au premier service.)'
const DECOUPE = 'Couper en 6 parts, servir immédiatement.'

const PIZZAS = {
  'La Marguerite': {
    lignes: [...B, ...TOMATE, ...MOZZA(120), ...OLIVES, ...HUILE],
    etapes: ['Étaler la sauce tomate (80 g) en spirale, jusqu’à 1,5 cm du bord.', 'Répartir la mozzarella (120 g), puis les olives (15 g).', CUIRE, 'Sortie du four : filet d’huile d’olive, pincée d’origan.'] },
  'La Tasia': {
    lignes: [...B, ...TOMATE, ...MOZZA(120), ['Jambon blanc tranché', kg(60)], ['Champignons émincés (kg)', kg(50)], ...OLIVES],
    etapes: ['Sauce tomate (80 g), mozzarella (120 g).', 'Jambon blanc (60 g) en morceaux, champignons (50 g), olives (15 g).', CUIRE, 'Sortie du four : pincée d’origan.'] },
  'La Reine Tasia': {
    lignes: [...B, ...TOMATE, ...MOZZA(120), ['Jambon blanc tranché', kg(60)], ['Champignons émincés (kg)', kg(50)], ['Œuf (pièce)', 1], ...OLIVES],
    etapes: ['Sauce tomate (80 g), mozzarella (120 g).', 'Jambon (60 g), champignons (50 g), olives (15 g) — laisser un creux au centre.', 'Casser l’œuf au centre, dans le creux.', CUIRE + ' Le blanc doit être pris, le jaune coulant.', 'Pincée d’origan.'] },
  'La Provençale': {
    lignes: [...B, ...TOMATE, ...MOZZA(120), ['Courgettes grillées (kg)', kg(40)], ['Aubergines grillées (kg)', kg(40)], ['Poivrons en lanières (kg)', kg(40)], ['Oignons rouges émincés (kg)', kg(20)], ...OLIVES],
    etapes: ['Sauce tomate (80 g), mozzarella (120 g).', 'Courgettes (40 g), aubergines (40 g), poivrons (40 g), oignons rouges (20 g), olives (15 g) — bien répartir, pas d’amas au centre.', CUIRE] },
  'La Ferrage': {
    lignes: [...B, ...CREME, ...MOZZA(100), ['Pommes de terre en rondelles (kg)', kg(80)], ['Lardons fumés (kg)', kg(50)], ['Oignons confits (kg)', kg(30)], ['Reblochon (kg)', kg(80)]],
    etapes: ['Base crème fraîche (60 ml), mozzarella (100 g).', 'Pommes de terre cuites en rondelles (80 g), lardons (50 g), oignons confits (30 g).', 'Reblochon (80 g) en tranches, croûte vers le haut, sur le dessus.', CUIRE] },
  'La St-Quinis': {
    lignes: [...B, ...TOMATE, ...MOZZA(120), ['Chorizo tranché (kg)', kg(50)], ['Poivrons en lanières (kg)', kg(40)], ['Oignons rouges émincés (kg)', kg(20)], ...OLIVES, ['Huile pimentée (litre)', 0.003]],
    etapes: ['Sauce tomate (80 g), mozzarella (120 g).', 'Chorizo (50 g), poivrons (40 g), oignons rouges (20 g), olives (15 g).', CUIRE, 'Sortie du four : quelques gouttes d’huile pimentée (3 ml) — prévenir le client, c’est piquant.'] },
  "L'Issole": {
    lignes: [...B, ...CREME, ...MOZZA(100), ['Bûchette de chèvre', 1 / 3], ['Miel liquide', 0.015], ['Cerneaux de noix (kg)', kg(15)], ['Roquette (kg)', kg(20)]],
    etapes: ['Base crème fraîche (60 ml), mozzarella (100 g).', 'Chèvre : 1/3 de bûchette en 6 rondelles.', CUIRE, 'Sortie du four : filet de miel (15 g), noix concassées (15 g), roquette (20 g) au centre.'] },
  "L'Anastasie": {
    lignes: [...B, ...TOMATE, ...MOZZA(120), ['Tomates cerises (kg)', kg(50)], ['Jambon cru tranché (kg)', kg(40)], ['Roquette (kg)', kg(20)], ['Parmesan (kg)', kg(15)], ['Crème de balsamique (litre)', 0.005]],
    etapes: ['Sauce tomate (80 g), mozzarella (120 g), tomates cerises coupées en deux (50 g).', CUIRE, 'Sortie du four : roquette (20 g), jambon cru (40 g) en voiles, copeaux de parmesan (15 g), trait de crème de balsamique (5 ml).'] },
  'La CasaTasia Signature': {
    lignes: [...B, ...TOMATE, ...MOZZA(80), ['Tomates cerises (kg)', kg(50)], ['Burrata 125 g (pièce)', 1], ['Coppa tranchée (kg)', kg(40)], ['Pesto alla genovese', kg(15)], ['Roquette (kg)', kg(20)], ['Parmesan (kg)', kg(10)]],
    etapes: ['Sauce tomate (80 g), mozzarella (80 g — moins que les autres : la burrata apporte le fromage), tomates cerises (50 g).', CUIRE, 'Sortie du four : roquette (20 g), coppa (40 g) en voiles, burrata entière (125 g) posée au centre, ouverte en croix.', 'Pesto (15 g) en filet sur la burrata, copeaux de parmesan (10 g). La burrata ne passe JAMAIS au four.'] },
  'La Quatre Fromages': {
    lignes: [...B, ...CREME, ...MOZZA(100), ['Bûchette de chèvre', 0.25], ['Gorgonzola (kg)', kg(50)], ['Parmesan (kg)', kg(20)]],
    etapes: ['Base crème fraîche (60 ml), mozzarella (100 g).', 'Chèvre (1/4 de bûchette en rondelles), gorgonzola (50 g) en petits morceaux.', 'Parmesan râpé (20 g) sur l’ensemble.', CUIRE] },
  'La Naples': {
    lignes: [...B, ...TOMATE, ['Viande hachée de bœuf (kg)', kg(80)], ['Poivrons en lanières (kg)', kg(40)], ...MOZZA(100), ['Crème fraîche épaisse', 0.03]],
    etapes: ['Sauce tomate (80 g).', 'Viande hachée (80 g) émiettée crue en petits morceaux, poivrons (40 g).', 'Mozzarella (100 g), puis crème fraîche (30 ml) en points.', CUIRE + ' Vérifier la cuisson de la viande au cœur.'] },
  'La Camembert': {
    lignes: [...B, ...CREME, ...MOZZA(100), ['Pommes de terre en rondelles (kg)', kg(80)], ['Camembert 250 g (pièce)', 1 / 3], ['Oignons confits (kg)', kg(30)], ['Jambon cru tranché (kg)', kg(40)]],
    etapes: ['Base crème fraîche (60 ml), mozzarella (100 g).', 'Pommes de terre en rondelles (80 g), oignons confits (30 g), camembert (1/3, en tranches).', CUIRE, 'Sortie du four : jambon cru (40 g) en voiles.'] },
}

// ── Ingrédients ─────────────────────────────────────────────────────
const tous = await sb('ingredients?select=id,nom,unite,prix_achat_ht')
const parNom = new Map(tous.map(i => [i.nom, i]))
for (const n of EXISTANTS) if (!parNom.has(n)) { console.log('✗ ingrédient Gineys introuvable : ' + n); process.exit(1) }
const aCreer = NOUVEAUX.filter(([n]) => !parNom.has(n))
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n\n  ingrédients à créer : ${aCreer.length} / ${NOUVEAUX.length}`)
if (ECRIRE && aCreer.length) {
  const r = await sb('ingredients', { method: 'POST', body: JSON.stringify(aCreer.map(([nom, unite, prix, allergenes, origine]) => ({
    nom, unite, prix_achat_ht: prix, allergenes, categorie: 'Pizzeria', fournisseur_principal: origine, actif: true, stocke: false })) ) })
  for (const i of r) parNom.set(i.nom, i)
} else for (const [nom, unite, prix] of aCreer) parNom.set(nom, { id: null, nom, unite, prix_achat_ht: prix })

// ── Fiches ──────────────────────────────────────────────────────────
const pizzas = await sb(`recettes?select=id,nom,prix_vente_ht&tag_destination=eq.PIZZA&actif=eq.true`)
const f2 = n => n.toFixed(2).replace('.', ',')
console.log('\n  pizza                       coût    prix HT   food cost   poids')
for (const p of pizzas) {
  const def = PIZZAS[p.nom]; if (!def) { console.log('  ⚠️ pas de fiche : ' + p.nom); continue }
  let cout = 0, poids = 0
  const lignes = def.lignes.map(([nom, q]) => {
    const i = parNom.get(nom); if (!i) throw new Error('ingrédient inconnu : ' + nom)
    cout += q * Number(i.prix_achat_ht)
    // Poids assemblé : le pâton compte 250 g ; les unités « pièce » de fromage
    // ou d'œuf à leur poids courant ; ml ≈ g.
    poids += nom.startsWith('Pâton') ? 250 : nom.startsWith('Œuf') ? 50 * q : nom.startsWith('Burrata') ? 125 * q
      : nom.startsWith('Camembert') ? 250 * q : nom === 'Bûchette de chèvre' ? 180 * q
      : ['kg', 'litre'].includes(i.unite) ? q * 1000 : ['seau 1 L', 'boîte 1 kg'].includes(i.unite) ? q * 1000 : 0
    return { ingredient_id: i.id, quantite: Math.round(q * 10000) / 10000, unite: i.unite }
  })
  const ht = Number(p.prix_vente_ht)
  console.log(`  ${p.nom.padEnd(26)} ${f2(cout).padStart(5)} €  ${f2(ht).padStart(6)} €  ${f2(cout / ht * 100).padStart(6)} %   ${Math.round(poids)} g`)
  if (!ECRIRE) continue
  await sb('recette_ingredients?recette_id=eq.' + p.id, { method: 'DELETE' })
  await sb('recette_ingredients', { method: 'POST', body: JSON.stringify(lignes.map(l => ({ ...l, recette_id: p.id }))) })
  await sb('recettes?id=eq.' + p.id, { method: 'PATCH', body: JSON.stringify({
    procedure: [ETALER, ...def.etapes.map((e, k) => `${k + 2}. ${e}`), `${def.etapes.length + 2}. ${DECOUPE}`].join('\n'),
    poids_portion_g: Math.round(poids), temps_preparation: 3, nb_portions: 1,
  }) })
}
if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)')
