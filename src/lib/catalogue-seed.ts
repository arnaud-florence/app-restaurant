// Catalogue de démarrage : 5 fournisseurs + 50 ingrédients + 20 recettes typiques bistrot français.
// Utilisé par le seed CLI ET par la server action /admin/setup.

export const FOURNISSEURS_SEED = [
  { nom: 'Metro France',     contact: 'Service Pro',  telephone: '01 47 86 35 00', email: 'pro@metro.fr',     adresse: 'Nanterre',  delai_livraison_jours: 1, minimum_commande: 100 },
  { nom: 'Pomona TerreAzur', contact: 'Commercial',   telephone: '01 41 17 80 00', email: 'contact@pomona.fr', adresse: 'Nanterre', delai_livraison_jours: 2, minimum_commande: 200 },
  { nom: 'Sysco France',     contact: 'Commercial',   telephone: '04 78 56 23 00', email: 'contact@sysco.fr', adresse: 'Lyon',      delai_livraison_jours: 2, minimum_commande: 250 },
  { nom: 'Brake France',     contact: 'Service Pro',  telephone: '02 51 11 14 14', email: 'contact@brake.fr', adresse: 'Vendée',    delai_livraison_jours: 1, minimum_commande: 150 },
  { nom: 'Transgourmet',     contact: 'Commercial',   telephone: '01 64 17 54 00', email: 'pro@transgourmet.fr', adresse: 'Bondy', delai_livraison_jours: 1, minimum_commande: 200 },
] as const

// Ingrédients : nom, catégorie, unité (kg/L/pièce), prix HT, fournisseur principal, allergènes
export const INGREDIENTS_SEED = [
  // Viandes
  { nom: 'Magret de canard',    categorie: 'Viande',    unite: 'kg', prix: 24.50, fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Filet de bœuf',       categorie: 'Viande',    unite: 'kg', prix: 42.00, fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Steak haché 15%',     categorie: 'Viande',    unite: 'kg', prix: 12.50, fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Poulet fermier',      categorie: 'Viande',    unite: 'kg', prix: 9.80,  fournisseur: 'Brake France',     allergenes: [] },
  { nom: 'Lardons',             categorie: 'Viande',    unite: 'kg', prix: 11.20, fournisseur: 'Brake France',     allergenes: [] },
  { nom: 'Jambon blanc',        categorie: 'Viande',    unite: 'kg', prix: 14.50, fournisseur: 'Brake France',     allergenes: [] },

  // Poissons & fruits de mer
  { nom: 'Saumon fumé',         categorie: 'Poisson',   unite: 'kg', prix: 28.00, fournisseur: 'Pomona TerreAzur', allergenes: ['poisson'] },
  { nom: 'Filet de saumon',     categorie: 'Poisson',   unite: 'kg', prix: 22.50, fournisseur: 'Pomona TerreAzur', allergenes: ['poisson'] },
  { nom: 'Crevettes décortiquées', categorie: 'Poisson', unite: 'kg', prix: 26.00, fournisseur: 'Pomona TerreAzur', allergenes: ['crustaces'] },

  // Légumes
  { nom: 'Tomate rouge',        categorie: 'Légume',    unite: 'kg', prix: 2.80,  fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Tomate cerise',       categorie: 'Légume',    unite: 'kg', prix: 4.50,  fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Salade verte',        categorie: 'Légume',    unite: 'kg', prix: 3.20,  fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Roquette',            categorie: 'Légume',    unite: 'kg', prix: 12.00, fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Pommes de terre',     categorie: 'Légume',    unite: 'kg', prix: 1.20,  fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Oignon rouge',        categorie: 'Légume',    unite: 'kg', prix: 1.80,  fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Ail',                 categorie: 'Légume',    unite: 'kg', prix: 6.00,  fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Basilic frais',       categorie: 'Légume',    unite: 'kg', prix: 25.00, fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Champignons de Paris', categorie: 'Légume',  unite: 'kg', prix: 5.80,  fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Courgette',           categorie: 'Légume',    unite: 'kg', prix: 2.40,  fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Aubergine',           categorie: 'Légume',    unite: 'kg', prix: 2.90,  fournisseur: 'Pomona TerreAzur', allergenes: [] },
  { nom: 'Poivron rouge',       categorie: 'Légume',    unite: 'kg', prix: 3.80,  fournisseur: 'Pomona TerreAzur', allergenes: [] },

  // Produits laitiers
  { nom: 'Mozzarella di bufala', categorie: 'Laitier', unite: 'kg', prix: 16.50, fournisseur: 'Metro France',     allergenes: ['lait'] },
  { nom: 'Mozzarella standard',  categorie: 'Laitier', unite: 'kg', prix: 8.50,  fournisseur: 'Sysco France',     allergenes: ['lait'] },
  { nom: 'Parmesan râpé',       categorie: 'Laitier',  unite: 'kg', prix: 22.00, fournisseur: 'Metro France',     allergenes: ['lait'] },
  { nom: 'Crème liquide 30%',   categorie: 'Laitier',  unite: 'L',  prix: 4.50,  fournisseur: 'Sysco France',     allergenes: ['lait'] },
  { nom: 'Beurre doux',         categorie: 'Laitier',  unite: 'kg', prix: 8.00,  fournisseur: 'Sysco France',     allergenes: ['lait'] },
  { nom: 'Œufs frais',          categorie: 'Laitier',  unite: 'piece', prix: 0.30, fournisseur: 'Sysco France',  allergenes: ['oeufs'] },
  { nom: 'Chèvre frais',        categorie: 'Laitier',  unite: 'kg', prix: 18.00, fournisseur: 'Pomona TerreAzur', allergenes: ['lait'] },

  // Épicerie sèche
  { nom: 'Farine T55',          categorie: 'Épicerie',  unite: 'kg', prix: 1.20,  fournisseur: 'Metro France',     allergenes: ['gluten'] },
  { nom: 'Farine T00 (pizza)',  categorie: 'Épicerie',  unite: 'kg', prix: 1.80,  fournisseur: 'Metro France',     allergenes: ['gluten'] },
  { nom: 'Pain burger artisanal', categorie: 'Épicerie', unite: 'piece', prix: 0.90, fournisseur: 'Brake France',  allergenes: ['gluten','sesame'] },
  { nom: 'Spaghetti',           categorie: 'Épicerie',  unite: 'kg', prix: 2.50,  fournisseur: 'Metro France',     allergenes: ['gluten'] },
  { nom: 'Tagliatelle',         categorie: 'Épicerie',  unite: 'kg', prix: 3.00,  fournisseur: 'Metro France',     allergenes: ['gluten'] },
  { nom: 'Sauce tomate',        categorie: 'Épicerie',  unite: 'L',  prix: 2.80,  fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Huile d\'olive',      categorie: 'Épicerie',  unite: 'L',  prix: 7.50,  fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Vinaigre balsamique', categorie: 'Épicerie',  unite: 'L',  prix: 8.00,  fournisseur: 'Metro France',     allergenes: ['sulfites'] },
  { nom: 'Sel fin',             categorie: 'Épicerie',  unite: 'kg', prix: 0.80,  fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Poivre noir moulu',   categorie: 'Épicerie',  unite: 'kg', prix: 22.00, fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Sucre semoule',       categorie: 'Épicerie',  unite: 'kg', prix: 1.50,  fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Levure boulangère',   categorie: 'Épicerie',  unite: 'kg', prix: 12.00, fournisseur: 'Metro France',     allergenes: [] },
  { nom: 'Pignons de pin',      categorie: 'Épicerie',  unite: 'kg', prix: 38.00, fournisseur: 'Metro France',     allergenes: ['fruits_a_coque'] },

  // Boissons
  { nom: 'Coca-Cola 33cl',      categorie: 'Boisson',   unite: 'piece', prix: 0.85, fournisseur: 'Brake France',  allergenes: [] },
  { nom: 'Coca Zero 33cl',      categorie: 'Boisson',   unite: 'piece', prix: 0.85, fournisseur: 'Brake France',  allergenes: [] },
  { nom: 'Eau Évian 50cl',      categorie: 'Boisson',   unite: 'piece', prix: 0.45, fournisseur: 'Brake France',  allergenes: [] },
  { nom: 'Eau Perrier 33cl',    categorie: 'Boisson',   unite: 'piece', prix: 0.65, fournisseur: 'Brake France',  allergenes: [] },
  { nom: 'Café grain',          categorie: 'Boisson',   unite: 'kg', prix: 18.00, fournisseur: 'Transgourmet',     allergenes: [] },
  { nom: 'Vin rouge AOC verre', categorie: 'Boisson',   unite: 'L',  prix: 6.50,  fournisseur: 'Transgourmet',     allergenes: ['sulfites'] },
  { nom: 'Vin blanc AOC verre', categorie: 'Boisson',   unite: 'L',  prix: 6.50,  fournisseur: 'Transgourmet',     allergenes: ['sulfites'] },
  { nom: 'Bière pression 25cl', categorie: 'Boisson',   unite: 'piece', prix: 0.55, fournisseur: 'Transgourmet',  allergenes: ['gluten'] },

  // Produits sucrés
  { nom: 'Mascarpone',          categorie: 'Laitier',   unite: 'kg', prix: 9.50,  fournisseur: 'Sysco France',    allergenes: ['lait'] },
  { nom: 'Cacao en poudre',     categorie: 'Épicerie',  unite: 'kg', prix: 14.00, fournisseur: 'Metro France',    allergenes: [] },
  { nom: 'Biscuits boudoirs',   categorie: 'Épicerie',  unite: 'kg', prix: 6.50,  fournisseur: 'Metro France',    allergenes: ['gluten','oeufs'] },
] as const

// Recettes : nom, catégorie, tag, prix vente HT, ingrédients [{nom_ingredient, quantite, unite}]
// Le prix vente HT vise une marge brute ~70% (food cost ~30%).
export const RECETTES_SEED = [
  // ─── PIZZAS ────────────────────────────────────────────
  {
    nom: 'Pizza Margherita', categorie: 'Pizzas', tag: 'PIZZA', prix: 11.50,
    contient_alcool: false, temps_prep: 12, nb_portions: 1,
    description: 'La classique : sauce tomate, mozzarella, basilic frais, huile d\'olive.',
    ingredients: [
      { nom: 'Farine T00 (pizza)', q: 0.25, u: 'kg' },
      { nom: 'Sauce tomate', q: 0.10, u: 'L' },
      { nom: 'Mozzarella standard', q: 0.12, u: 'kg' },
      { nom: 'Basilic frais', q: 0.005, u: 'kg' },
      { nom: 'Huile d\'olive', q: 0.01, u: 'L' },
    ],
  },
  {
    nom: 'Pizza 4 Fromages', categorie: 'Pizzas', tag: 'PIZZA', prix: 13.50,
    contient_alcool: false, temps_prep: 14, nb_portions: 1,
    description: 'Mozzarella, parmesan, chèvre, et touche italienne.',
    ingredients: [
      { nom: 'Farine T00 (pizza)', q: 0.25, u: 'kg' },
      { nom: 'Sauce tomate', q: 0.08, u: 'L' },
      { nom: 'Mozzarella standard', q: 0.10, u: 'kg' },
      { nom: 'Parmesan râpé', q: 0.04, u: 'kg' },
      { nom: 'Chèvre frais', q: 0.05, u: 'kg' },
    ],
  },
  {
    nom: 'Pizza Reine', categorie: 'Pizzas', tag: 'PIZZA', prix: 12.50,
    contient_alcool: false, temps_prep: 13, nb_portions: 1,
    description: 'Sauce tomate, mozzarella, jambon blanc, champignons frais.',
    ingredients: [
      { nom: 'Farine T00 (pizza)', q: 0.25, u: 'kg' },
      { nom: 'Sauce tomate', q: 0.10, u: 'L' },
      { nom: 'Mozzarella standard', q: 0.12, u: 'kg' },
      { nom: 'Jambon blanc', q: 0.06, u: 'kg' },
      { nom: 'Champignons de Paris', q: 0.05, u: 'kg' },
    ],
  },
  {
    nom: 'Pizza Bufala', categorie: 'Pizzas', tag: 'PIZZA', prix: 14.50,
    contient_alcool: false, temps_prep: 14, nb_portions: 1,
    description: 'Tomates cerises, mozzarella di bufala AOP, basilic, huile d\'olive vierge.',
    ingredients: [
      { nom: 'Farine T00 (pizza)', q: 0.25, u: 'kg' },
      { nom: 'Tomate cerise', q: 0.08, u: 'kg' },
      { nom: 'Mozzarella di bufala', q: 0.12, u: 'kg' },
      { nom: 'Basilic frais', q: 0.005, u: 'kg' },
      { nom: 'Huile d\'olive', q: 0.015, u: 'L' },
    ],
  },

  // ─── BURGERS ───────────────────────────────────────────
  {
    nom: 'Burger Maison', categorie: 'Burgers', tag: 'CUISINE', prix: 14.00,
    contient_alcool: false, temps_prep: 12, nb_portions: 1,
    description: 'Steak haché 150g, salade, tomate, oignon rouge confit, sauce maison.',
    ingredients: [
      { nom: 'Pain burger artisanal', q: 1, u: 'piece' },
      { nom: 'Steak haché 15%', q: 0.15, u: 'kg' },
      { nom: 'Salade verte', q: 0.04, u: 'kg' },
      { nom: 'Tomate rouge', q: 0.05, u: 'kg' },
      { nom: 'Oignon rouge', q: 0.03, u: 'kg' },
    ],
  },
  {
    nom: 'Cheeseburger', categorie: 'Burgers', tag: 'CUISINE', prix: 15.00,
    contient_alcool: false, temps_prep: 12, nb_portions: 1,
    description: 'Notre burger maison + tranche de mozzarella fondue.',
    ingredients: [
      { nom: 'Pain burger artisanal', q: 1, u: 'piece' },
      { nom: 'Steak haché 15%', q: 0.15, u: 'kg' },
      { nom: 'Mozzarella standard', q: 0.04, u: 'kg' },
      { nom: 'Salade verte', q: 0.04, u: 'kg' },
      { nom: 'Tomate rouge', q: 0.05, u: 'kg' },
    ],
  },

  // ─── SALADES ───────────────────────────────────────────
  {
    nom: 'Salade César', categorie: 'Salades', tag: 'CUISINE', prix: 12.00,
    contient_alcool: false, temps_prep: 8, nb_portions: 1,
    description: 'Salade verte, poulet rôti, parmesan, croûtons, sauce César.',
    ingredients: [
      { nom: 'Salade verte', q: 0.15, u: 'kg' },
      { nom: 'Poulet fermier', q: 0.12, u: 'kg' },
      { nom: 'Parmesan râpé', q: 0.02, u: 'kg' },
    ],
  },
  {
    nom: 'Salade Chèvre Chaud', categorie: 'Salades', tag: 'CUISINE', prix: 13.00,
    contient_alcool: false, temps_prep: 9, nb_portions: 1,
    description: 'Roquette, chèvre chaud, tomates cerises, miel, vinaigre balsamique.',
    ingredients: [
      { nom: 'Roquette', q: 0.12, u: 'kg' },
      { nom: 'Chèvre frais', q: 0.08, u: 'kg' },
      { nom: 'Tomate cerise', q: 0.06, u: 'kg' },
      { nom: 'Vinaigre balsamique', q: 0.01, u: 'L' },
    ],
  },

  // ─── PASTA ─────────────────────────────────────────────
  {
    nom: 'Spaghetti Carbonara', categorie: 'Pasta', tag: 'CUISINE', prix: 13.50,
    contient_alcool: false, temps_prep: 11, nb_portions: 1,
    description: 'Spaghetti, lardons, jaune d\'œuf, parmesan, poivre noir.',
    ingredients: [
      { nom: 'Spaghetti', q: 0.12, u: 'kg' },
      { nom: 'Lardons', q: 0.08, u: 'kg' },
      { nom: 'Œufs frais', q: 1, u: 'piece' },
      { nom: 'Parmesan râpé', q: 0.03, u: 'kg' },
    ],
  },
  {
    nom: 'Tagliatelle Saumon', categorie: 'Pasta', tag: 'CUISINE', prix: 16.00,
    contient_alcool: false, temps_prep: 12, nb_portions: 1,
    description: 'Tagliatelle, saumon frais, crème, parmesan.',
    ingredients: [
      { nom: 'Tagliatelle', q: 0.12, u: 'kg' },
      { nom: 'Filet de saumon', q: 0.10, u: 'kg' },
      { nom: 'Crème liquide 30%', q: 0.10, u: 'L' },
      { nom: 'Parmesan râpé', q: 0.02, u: 'kg' },
    ],
  },

  // ─── PLATS ─────────────────────────────────────────────
  {
    nom: 'Magret de canard miel', categorie: 'Plats', tag: 'CUISINE', prix: 22.00,
    contient_alcool: false, temps_prep: 18, nb_portions: 1,
    description: 'Magret rosé, sauce miel, pommes de terre sautées.',
    ingredients: [
      { nom: 'Magret de canard', q: 0.18, u: 'kg' },
      { nom: 'Pommes de terre', q: 0.20, u: 'kg' },
      { nom: 'Beurre doux', q: 0.02, u: 'kg' },
    ],
  },
  {
    nom: 'Pavé de bœuf grillé', categorie: 'Plats', tag: 'CUISINE', prix: 26.00,
    contient_alcool: false, temps_prep: 14, nb_portions: 1,
    description: 'Filet de bœuf grillé, pommes de terre sautées, légumes du jour.',
    ingredients: [
      { nom: 'Filet de bœuf', q: 0.18, u: 'kg' },
      { nom: 'Pommes de terre', q: 0.20, u: 'kg' },
      { nom: 'Courgette', q: 0.10, u: 'kg' },
    ],
  },
  {
    nom: 'Saumon grillé', categorie: 'Plats', tag: 'CUISINE', prix: 21.00,
    contient_alcool: false, temps_prep: 12, nb_portions: 1,
    description: 'Pavé de saumon grillé, légumes du jour, riz.',
    ingredients: [
      { nom: 'Filet de saumon', q: 0.18, u: 'kg' },
      { nom: 'Courgette', q: 0.10, u: 'kg' },
      { nom: 'Aubergine', q: 0.08, u: 'kg' },
    ],
  },

  // ─── DESSERTS ──────────────────────────────────────────
  {
    nom: 'Tiramisu maison', categorie: 'Desserts', tag: 'CUISINE', prix: 7.50,
    contient_alcool: false, temps_prep: 0, nb_portions: 1,
    description: 'Mascarpone, biscuits boudoirs imbibés de café, cacao.',
    ingredients: [
      { nom: 'Mascarpone', q: 0.12, u: 'kg' },
      { nom: 'Œufs frais', q: 1, u: 'piece' },
      { nom: 'Sucre semoule', q: 0.04, u: 'kg' },
      { nom: 'Biscuits boudoirs', q: 0.06, u: 'kg' },
      { nom: 'Café grain', q: 0.02, u: 'kg' },
      { nom: 'Cacao en poudre', q: 0.005, u: 'kg' },
    ],
  },
  {
    nom: 'Crème brûlée', categorie: 'Desserts', tag: 'CUISINE', prix: 7.00,
    contient_alcool: false, temps_prep: 5, nb_portions: 1,
    description: 'Crème vanillée, croûte de sucre caramélisé.',
    ingredients: [
      { nom: 'Crème liquide 30%', q: 0.20, u: 'L' },
      { nom: 'Œufs frais', q: 2, u: 'piece' },
      { nom: 'Sucre semoule', q: 0.05, u: 'kg' },
    ],
  },

  // ─── BAR (boissons servies) ────────────────────────────
  {
    nom: 'Coca-Cola', categorie: 'Boissons', tag: 'BAR', prix: 3.50,
    contient_alcool: false, temps_prep: 1, nb_portions: 1,
    description: 'Coca-Cola servi frais avec glaçons.',
    ingredients: [{ nom: 'Coca-Cola 33cl', q: 1, u: 'piece' }],
  },
  {
    nom: 'Eau plate Évian', categorie: 'Boissons', tag: 'BAR', prix: 3.00,
    contient_alcool: false, temps_prep: 0, nb_portions: 1,
    description: 'Eau Évian 50cl en bouteille.',
    ingredients: [{ nom: 'Eau Évian 50cl', q: 1, u: 'piece' }],
  },
  {
    nom: 'Café espresso', categorie: 'Boissons', tag: 'BAR', prix: 2.50,
    contient_alcool: false, temps_prep: 1, nb_portions: 1,
    description: 'Café espresso italien serré.',
    ingredients: [{ nom: 'Café grain', q: 0.008, u: 'kg' }],
  },
  {
    nom: 'Verre de vin rouge', categorie: 'Vins', tag: 'BAR', prix: 5.50,
    contient_alcool: true, temps_prep: 1, nb_portions: 1,
    description: 'Verre de vin rouge AOC du jour (15 cl).',
    ingredients: [{ nom: 'Vin rouge AOC verre', q: 0.15, u: 'L' }],
  },
  {
    nom: 'Bière pression', categorie: 'Boissons', tag: 'BAR', prix: 4.00,
    contient_alcool: true, temps_prep: 1, nb_portions: 1,
    description: 'Bière blonde pression 25 cl.',
    ingredients: [{ nom: 'Bière pression 25cl', q: 1, u: 'piece' }],
  },
] as const
