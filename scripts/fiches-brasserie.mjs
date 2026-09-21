// Fiches techniques de la brasserie — 18 plats + la formule.
//
// Même contrat que fiches-pizzas.mjs, relire son en-tête : grammages standard
// de brasserie à ajuster au premier service, prix Gineys quand l'unité colle,
// ESTIMATION marquée sinon, et l'unité dans le nom de chaque ingrédient créé
// pour qu'aucune ligne de facture ne s'y rattache par erreur.
//
// La FORMULE n'a pas de composition : elle sert le plat choisi, avec SA fiche.
// La chiffrer sur un plat fixe mentirait pour les trois autres — elle reste en
// « coût inconnu », et sa méthode renvoie aux fiches des plats.
//
//   node scripts/fiches-brasserie.mjs [--ecrire]
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

const FICHIER_COUTS = 'data/france-boissons-couts-unitaires-2026-09-21.json'
if (!fs.existsSync(FICHIER_COUTS)) { console.log(`✗ ${FICHIER_COUTS} absent — rien n'est écrit.`); process.exit(1) }
const COUTS_FB = JSON.parse(fs.readFileSync(FICHIER_COUTS, 'utf8'))
const ESTIM = 'ESTIMATION 21/09/2026 — à remplacer par la première facture'
// [nom, unité, prix HT de l'unité, allergènes, origine, poids d'une pièce en g]
const NOUVEAUX = [
  ['Steak haché de bœuf 150 g (pièce)', 'pièce', 1.60, [], ESTIM, 150],
  ['Pain burger (pièce)',            'pièce', 0.35, ['gluten', 'graines_sesame'], ESTIM, 80],
  ['Cheddar en tranches (kg)',       'kg',   11.00, ['lait'], ESTIM],
  ['Lard fumé en tranches (kg)',     'kg',   12.00, [], ESTIM],
  ['Salade mesclun (kg)',            'kg',    8.00, [], ESTIM],
  ['Tomates (kg)',                   'kg',    3.00, [], ESTIM],
  ['Sauce burger maison (kg)',       'kg',    6.00, ['oeufs', 'moutarde'], ESTIM],
  ['Frites surgelées (kg)',          'kg',    1.80, [], ESTIM],
  ['Huile de friture (litre)',       'litre', 2.50, [], ESTIM],
  ['Anneaux de calamars (kg)',       'kg',   11.00, ['mollusques'], ESTIM],
  ['Crevettes décortiquées (kg)',    'kg',   15.00, ['crustaces'], ESTIM],
  ['Éperlans (kg)',                  'kg',    9.00, ['poissons'], ESTIM],
  ['Aïoli (kg)',                     'kg',    9.00, ['oeufs'], ESTIM],
  ['Citron (pièce)',                 'pièce', 0.30, [], ESTIM, 0],
  ['Bœuf pour carpaccio (kg)',       'kg',   24.00, [], ESTIM],
  ['Andouillette (pièce)',           'pièce', 2.80, [], ESTIM, 180],
  ['Sauce moutarde (kg)',            'kg',    7.00, ['moutarde', 'lait'], ESTIM],
  ['Entrecôte de bœuf (kg)',         'kg',   24.00, [], ESTIM],
  ['Oignons jaunes émincés (kg)',    'kg',    1.80, [], ESTIM],
  ['Gnocchis frais (kg)',            'kg',    4.50, ['gluten'], ESTIM],
  ['Bœuf haché au couteau (kg)',     'kg',   16.00, [], ESTIM],
  ['Câpres (kg)',                    'kg',   10.00, [], ESTIM],
  ['Cornichons (kg)',                'kg',    6.00, [], ESTIM],
  ['Focaccia (pièce)',               'pièce', 0.698, ['gluten'], 'Gineys — colis de 36 à 25,12 € ramené à la pièce', 90],
  ['Vinaigrette (litre)',            'litre', 4.00, ['moutarde'], ESTIM],
  // Prix remisé France Boissons : lu dans le relevé local (conditions négociées, hors dépôt).
  ['Sirop (litre)',                  'litre', COUTS_FB['_ingredient:Sirop (litre)'], [], 'France Boissons — sirop Teisseire 1 L, prix remisé (relevé local)'],
  ['Glace (boule)',                  'pièce', 0.40, ['lait'], ESTIM, 60],
]
// Poids des pièces déjà créées ou existantes.
const POIDS_PIECE = { 'Bûchette de chèvre': 180, 'Burrata 125 g (pièce)': 125, 'Camembert 250 g (pièce)': 250, 'Œuf (pièce)': 50 }
for (const n of NOUVEAUX) if (n[5] != null) POIDS_PIECE[n[0]] = n[5]

const kg = g => g / 1000
const FRITES = [['Frites surgelées (kg)', kg(180)], ['Huile de friture (litre)', 0.03]]
const SALADE = [['Salade mesclun (kg)', kg(40)], ['Vinaigrette (litre)', 0.01]]
const BURGER = [['Pain burger (pièce)', 1], ['Steak haché de bœuf 150 g (pièce)', 1]]

const DRESSER_FRITES = 'Frites : 180 g, cuisson 175 °C, 4 à 5 min, salées à la sortie. Salade 40 g + vinaigrette à côté.'
const BURGER_BASE = 'Toaster le pain à la plancha, face coupée. Steak à la plancha, 3 min par face (à point) — demander la cuisson au client.'

const PLATS = {
  'Burger Montagnard': { t: 8, lignes: [...BURGER, ['Reblochon (kg)', kg(60)], ['Lard fumé en tranches (kg)', kg(30)], ['Oignons confits (kg)', kg(30)], ['Salade mesclun (kg)', kg(20)], ...FRITES],
    etapes: [BURGER_BASE, 'Poser le reblochon (60 g) sur le steak la dernière minute, cloche pour fondre. Lard fumé (30 g) grillé à côté.', 'Montage : pain, salade (20 g), steak + reblochon, lard, oignons confits (30 g), chapeau.', 'Frites : 180 g, 175 °C, 4 à 5 min, salées à la sortie.'] },
  'Burger CasaTasia': { t: 8, lignes: [...BURGER, ['Cheddar en tranches (kg)', kg(40)], ['Salade mesclun (kg)', kg(20)], ['Tomates (kg)', kg(40)], ['Oignons confits (kg)', kg(30)], ['Sauce burger maison (kg)', kg(30)], ...FRITES],
    etapes: [BURGER_BASE, 'Cheddar (2 tranches, 40 g) sur le steak la dernière minute.', 'Montage : sauce CasaTasia (30 g) sur les deux faces, salade (20 g), tomate (2 rondelles, 40 g), steak + cheddar, oignons confits (30 g), chapeau.', 'Frites : 180 g, 175 °C, 4 à 5 min.'] },
  'Burger Chèvre-Miel': { t: 8, lignes: [...BURGER, ['Bûchette de chèvre', 1 / 3], ['Miel liquide', 0.015], ['Salade mesclun (kg)', kg(20)], ['Tomates (kg)', kg(40)], ['Oignons confits (kg)', kg(30)], ...FRITES],
    etapes: [BURGER_BASE, 'Chèvre (1/3 de bûchette, 3 rondelles) sur le steak, passer sous la salamandre 1 min, filet de miel (15 g).', 'Montage : salade (20 g), tomate (40 g), steak + chèvre, oignons confits (30 g), chapeau.', 'Frites : 180 g, 175 °C, 4 à 5 min.'] },
  'Friture de la mer': { t: 6, lignes: [['Anneaux de calamars (kg)', kg(100)], ['Crevettes décortiquées (kg)', kg(60)], ['Éperlans (kg)', kg(60)], ['Farine de blé T55', kg(40)], ['Huile de friture (litre)', 0.05], ['Salade mesclun (kg)', kg(40)], ['Citron (pièce)', 0.5], ['Aïoli (kg)', kg(40)], ['Vinaigrette (litre)', 0.01]],
    etapes: ['Égoutter et sécher calamars (100 g), crevettes (60 g) et éperlans (60 g). Fariner (40 g), secouer l’excédent.', 'Frire à 180 °C, 2 à 3 min, par petites quantités — ne pas surcharger le panier.', 'Égoutter sur papier, saler aussitôt.', 'Dresser avec salade (40 g), demi-citron, aïoli (40 g) en ramequin.'] },
  'Carpaccio CasaTasia': { t: 5, lignes: [['Bœuf pour carpaccio (kg)', kg(120)], ['Parmesan (kg)', kg(20)], ['Roquette (kg)', kg(30)], ['Pesto alla genovese', kg(15)], ['Huile d’olive', 0.01], ['Citron (pièce)', 0.25], ['Focaccia (pièce)', 1]],
    etapes: ['Bœuf (120 g) tranché très fin, bien froid, étalé sur assiette froide sans chevauchement.', 'Filet d’huile d’olive (10 ml), pesto (15 g) en points, jus d’un quart de citron.', 'Roquette (30 g) au centre, copeaux de parmesan (20 g), poivre du moulin.', 'Focaccia tiédie à côté. Servir tout de suite — le citron cuit la viande.'] },
  'Camembert rôti': { t: 15, lignes: [['Camembert 250 g (pièce)', 1], ['Jambon cru tranché (kg)', kg(60)], ['Pommes de terre en rondelles (kg)', kg(200)], ['Salade mesclun (kg)', kg(30)], ['Vinaigrette (litre)', 0.01], ['Focaccia (pièce)', 1]],
    etapes: ['Camembert entier dans sa boîte en bois (sans film), entailler le dessus en croix.', 'Four 200 °C, 12 à 15 min : cœur coulant.', 'Pommes de terre (200 g) rissolées ou au four en même temps.', 'Dresser : camembert au centre, jambon cru (60 g), pommes de terre, salade (30 g), focaccia pour tremper.'] },
  'Andouillette grillée': { t: 12, lignes: [['Andouillette (pièce)', 1], ['Sauce moutarde (kg)', kg(60)], ...FRITES, ...SALADE],
    etapes: ['Entailler légèrement l’andouillette, griller à la plancha ou au grill 10 à 12 min en la retournant — dorée, chaude à cœur.', 'Sauce moutarde (60 g) chaude en saucière.', DRESSER_FRITES] },
  'Entrecôte grillée': { t: 10, lignes: [['Entrecôte de bœuf (kg)', kg(200)], ['Beurre doux', kg(20)], ...FRITES, ...SALADE],
    etapes: ['Sortir l’entrecôte (200 g) 15 min avant. Saisir à feu très vif — saignant 2 min/face, à point 3 min/face. Demander la cuisson.', 'Laisser reposer 2 min, saler, poivrer.', 'Beurre aux herbes (20 g) en rondelle sur la viande au moment de servir.', DRESSER_FRITES] },
  'Tartiflette gratinée': { t: 20, lignes: [['Pommes de terre en rondelles (kg)', kg(300)], ['Lardons fumés (kg)', kg(80)], ['Oignons jaunes émincés (kg)', kg(50)], ['Crème fraîche épaisse', 0.08], ['Reblochon (kg)', kg(120)], ...SALADE],
    etapes: ['Faire revenir lardons (80 g) et oignons (50 g).', 'Plat individuel : pommes de terre cuites (300 g), lardons-oignons, crème (80 ml).', 'Reblochon (120 g) coupé en deux dans l’épaisseur, croûte dessus.', 'Four 220 °C, 12 à 15 min, jusqu’à gratiné. Salade (40 g) + vinaigrette à côté.'] },
  'Gnocchis CasaTasia': { t: 12, lignes: [['Gnocchis frais (kg)', kg(300)], ['Sauce tomate pizza (kg)', kg(120)], ['Mozzarella râpée', kg(80)], ['Parmesan (kg)', kg(15)], ['Pesto alla genovese', kg(15)]],
    etapes: ['Gnocchis (300 g) à l’eau bouillante salée, retirer dès qu’ils remontent.', 'Plat à gratin : gnocchis, sauce tomate (120 g), mozzarella (80 g), parmesan (15 g).', 'Four 220 °C (ou four à pizza), 6 à 8 min, jusqu’à gratiné.', 'Pesto (15 g) en filet à la sortie.'] },
  'Gnocchis quatre fromages': { t: 12, lignes: [['Gnocchis frais (kg)', kg(300)], ['Crème fraîche épaisse', 0.1], ['Mozzarella râpée', kg(60)], ['Bûchette de chèvre', 0.2], ['Gorgonzola (kg)', kg(40)], ['Parmesan (kg)', kg(20)]],
    etapes: ['Gnocchis (300 g) à l’eau bouillante salée, retirer dès qu’ils remontent.', 'Plat à gratin : gnocchis, crème (100 ml), gorgonzola (40 g) en morceaux, chèvre (1/5 de bûchette), mozzarella (60 g).', 'Parmesan (20 g) sur le dessus.', 'Four 220 °C, 6 à 8 min, jusqu’à gratiné.'] },
  'Tartare de bœuf': { t: 6, lignes: [['Bœuf haché au couteau (kg)', kg(180)], ['Câpres (kg)', kg(10)], ['Cornichons (kg)', kg(20)], ['Oignons rouges émincés (kg)', kg(20)], ['Œuf (pièce)', 1], ...FRITES, ...SALADE],
    etapes: ['Bœuf (180 g) haché au couteau à la commande, gardé au froid jusqu’au dernier moment (chaîne du froid : viande crue).', 'Mélanger câpres (10 g), cornichons (20 g) et oignons rouges (20 g) hachés, sel, poivre, un trait de Worcestershire.', 'Dresser à l’emporte-pièce, creux au centre, jaune d’œuf dans sa demi-coquille.', DRESSER_FRITES] },
  // Un seul jambon depuis le 21/09/2026 : jambon cru ET coppa portaient le
  // food cost à 37 %. La coppa (24 €/kg) est retirée — 31 %.
  'Salade Burrata': { t: 6, lignes: [['Salade mesclun (kg)', kg(80)], ['Burrata 125 g (pièce)', 1], ['Jambon cru tranché (kg)', kg(40)], ['Tomates (kg)', kg(80)], ['Pesto alla genovese', kg(15)], ['Roquette (kg)', kg(20)], ['Olives noires', kg(20)], ['Parmesan (kg)', kg(15)], ['Vinaigrette (litre)', 0.02]],
    etapes: ['Assiette creuse : salade (80 g) et roquette (20 g) assaisonnées (20 ml de vinaigrette).', 'Tomates (80 g) en quartiers, olives (20 g), jambon cru (40 g) en voiles.', 'Burrata entière au centre, ouverte en croix, pesto (15 g) dessus, copeaux de parmesan (15 g).'] },
  'Salade Chèvre chaud': { t: 6, lignes: [['Salade mesclun (kg)', kg(100)], ['Bûchette de chèvre', 0.5], ['Focaccia (pièce)', 0.5], ['Jambon cru tranché (kg)', kg(40)], ['Tomates (kg)', kg(80)], ['Cerneaux de noix (kg)', kg(20)], ['Miel liquide', 0.02], ['Vinaigrette (litre)', 0.02]],
    etapes: ['Toasts : demi-focaccia en 3 tranches, 3 rondelles de chèvre (1/2 bûchette) dessus, filet de miel, four 200 °C 5 min.', 'Salade (100 g) assaisonnée (20 ml), tomates (80 g), jambon cru (40 g), noix (20 g).', 'Toasts de chèvre chauds posés au dernier moment, reste de miel (20 g au total) en filet.'] },
  'Planche CasaTasia': { t: 5, lignes: [['Jambon cru tranché (kg)', kg(60)], ['Coppa tranchée (kg)', kg(50)], ['Bûchette de chèvre', 0.25], ['Gorgonzola (kg)', kg(50)], ['Parmesan (kg)', kg(40)], ['Olives noires', kg(50)], ['Focaccia (pièce)', 1.5]],
    etapes: ['Planche à partager (2 personnes). Sortir les fromages 20 min avant.', 'Charcuteries : jambon cru (60 g), coppa (50 g) en voiles.', 'Fromages : chèvre (1/4 de bûchette), gorgonzola (50 g), parmesan (40 g) en éclats.', 'Olives (50 g) en ramequin, focaccia (1,5 pièce) tiédie en bâtonnets.'] },
  'Planche de charcuteries': { t: 5, lignes: [['Jambon cru tranché (kg)', kg(100)], ['Coppa tranchée (kg)', kg(100)], ['Olives noires', kg(60)], ['Focaccia (pièce)', 1.5]],
    etapes: ['Planche à partager (2 personnes).', 'Jambon cru (100 g) et coppa (100 g) en voiles, jamais en tas.', 'Olives (60 g) en ramequin, focaccia (1,5 pièce) tiédie en bâtonnets.'] },
  'Planche de fromages': { t: 5, lignes: [['Bûchette de chèvre', 0.5], ['Gorgonzola (kg)', kg(80)], ['Parmesan (kg)', kg(70)], ['Olives noires', kg(60)], ['Focaccia (pièce)', 1.5]],
    etapes: ['Planche à partager (2 personnes). Sortir les fromages 20 min avant.', 'Chèvre (1/2 bûchette), gorgonzola (80 g), parmesan (70 g) en éclats.', 'Olives (60 g) en ramequin, focaccia (1,5 pièce) tiédie en bâtonnets.'] },
  'Menu enfant': { t: 8, lignes: [['Steak haché de bœuf 150 g (pièce)', 1], ['Frites surgelées (kg)', kg(150)], ['Huile de friture (litre)', 0.025], ['Sirop (litre)', 0.02], ['Glace (boule)', 1]],
    etapes: ['Steak haché à la plancha, BIEN CUIT à cœur (enfant).', 'Frites : 150 g, 175 °C, 4 à 5 min.', 'Boisson : sirop (2 cl) à l’eau, au choix.', 'Dessert : 1 boule de glace, servie après le plat.'] },
  'Formule CasaTasia': { t: 0, lignes: [],
    etapes: ['Le plat choisi (burger, gnocchis, tartiflette ou salade chèvre chaud) se prépare selon SA fiche technique — mêmes grammages, même dressage.', 'Dessert : au choix dans la vitrine du Fournil, ou un café.', 'En caisse : noter le plat choisi sur le ticket pour la cuisine.'] },
}
const EXISTANTS = ['Reblochon (kg)', 'Oignons confits (kg)', 'Bûchette de chèvre', 'Miel liquide', 'Farine de blé T55', 'Parmesan (kg)', 'Roquette (kg)',
  'Pesto alla genovese', 'Huile d’olive', 'Camembert 250 g (pièce)', 'Jambon cru tranché (kg)', 'Pommes de terre en rondelles (kg)', 'Beurre doux',
  'Lardons fumés (kg)', 'Crème fraîche épaisse', 'Sauce tomate pizza (kg)', 'Mozzarella râpée', 'Gorgonzola (kg)', 'Oignons rouges émincés (kg)',
  'Œuf (pièce)', 'Burrata 125 g (pièce)', 'Coppa tranchée (kg)', 'Olives noires', 'Cerneaux de noix (kg)']

const tous = await sb('ingredients?select=id,nom,unite,prix_achat_ht')
const parNom = new Map(tous.map(i => [i.nom, i]))
for (const n of EXISTANTS) if (!parNom.has(n)) { console.log('✗ ingrédient introuvable : ' + n); process.exit(1) }
const aCreer = NOUVEAUX.filter(([n]) => !parNom.has(n))
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n\n  ingrédients à créer : ${aCreer.length} / ${NOUVEAUX.length}`)
if (ECRIRE && aCreer.length) {
  const r = await sb('ingredients', { method: 'POST', body: JSON.stringify(aCreer.map(([nom, unite, prix, allergenes, origine]) => ({
    nom, unite, prix_achat_ht: prix, allergenes, categorie: 'Restaurant', fournisseur_principal: origine, actif: true, stocke: false }))) })
  for (const i of r) parNom.set(i.nom, i)
} else for (const [nom, unite, prix] of aCreer) parNom.set(nom, { id: null, nom, unite, prix_achat_ht: prix })

const plats = await sb(`recettes?select=id,nom,prix_vente_ht&tag_destination=eq.CUISINE&actif=eq.true`)
const f2 = n => n.toFixed(2).replace('.', ',')
console.log('\n  plat                          coût    prix HT   food cost   poids')
for (const p of plats) {
  const def = PLATS[p.nom]; if (!def) { console.log('  ⚠️ pas de fiche : ' + p.nom); continue }
  let cout = 0, poids = 0
  const lignes = def.lignes.map(([nom, q]) => {
    const i = parNom.get(nom); if (!i) throw new Error('ingrédient inconnu : ' + nom)
    cout += q * Number(i.prix_achat_ht)
    // L'huile de friture s'absorbe : elle coûte, elle ne pèse pas dans l'assiette.
    if (!nom.startsWith('Huile de friture')) poids += i.unite === 'pièce' || nom === 'Bûchette de chèvre'
      ? (POIDS_PIECE[nom] ?? 0) * q : ['kg', 'litre', 'seau 1 L', 'boîte 1 kg'].includes(i.unite) ? q * 1000 : 0
    return { ingredient_id: i.id, quantite: Math.round(q * 10000) / 10000, unite: i.unite }
  })
  const ht = Number(p.prix_vente_ht)
  console.log(`  ${p.nom.padEnd(28)} ${lignes.length ? f2(cout).padStart(5) + ' €' : '   — '}  ${f2(ht).padStart(6)} €  ${lignes.length ? f2(cout / ht * 100).padStart(6) + ' %' : '  inconnu'}   ${lignes.length ? Math.round(poids) + ' g' : ''}`)
  if (!ECRIRE) continue
  await sb('recette_ingredients?recette_id=eq.' + p.id, { method: 'DELETE' })
  if (lignes.length) await sb('recette_ingredients', { method: 'POST', body: JSON.stringify(lignes.map(l => ({ ...l, recette_id: p.id }))) })
  await sb('recettes?id=eq.' + p.id, { method: 'PATCH', body: JSON.stringify({
    procedure: def.etapes.map((e, k) => `${k + 1}. ${e}`).join('\n'),
    poids_portion_g: lignes.length ? Math.round(poids) : null, temps_preparation: def.t, nb_portions: 1,
  }) })
}
if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)')
