// Helper centralisé : retourne la photo d'un ingrédient avec fallback Unsplash
// thématique selon sa catégorie. Permet d'avoir une photo partout, même si
// l'utilisateur n'a pas uploadé d'image, sans toucher la DB.

export type IngredientPhotoInput = {
  photo_url?: string | null
  categorie?: string | null
  nom?: string | null
  allergenes?: string[] | null
}

// Helper URL Unsplash optimisée
const u = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=75`

// Placeholders Unsplash thématiques par catégorie d'ingrédient.
const FALLBACKS_CATEGORIE: Record<string, string> = {
  // Légumes
  legume:        u('1542838132-92c53300491e'),
  legumes:       u('1542838132-92c53300491e'),
  vegetable:     u('1542838132-92c53300491e'),
  vegetables:    u('1542838132-92c53300491e'),
  salade:        u('1512621776951-a57141f2eefd'),
  salades:       u('1512621776951-a57141f2eefd'),
  herbe:         u('1505371684632-77c5fa9c5b07'),
  herbes:        u('1505371684632-77c5fa9c5b07'),
  aromate:       u('1505371684632-77c5fa9c5b07'),
  aromates:      u('1505371684632-77c5fa9c5b07'),

  // Fruits
  fruit:         u('1610832958506-aa56368176cf'),
  fruits:        u('1610832958506-aa56368176cf'),

  // Viandes & charcuterie
  viande:        u('1544025162-d76694265947'),
  viandes:       u('1544025162-d76694265947'),
  boeuf:         u('1544025162-d76694265947'),
  bœuf:          u('1544025162-d76694265947'),
  porc:          u('1602471122073-8e0e9d77b97e'),
  agneau:        u('1544025162-d76694265947'),
  volaille:      u('1604503468506-a8da13d82791'),
  poulet:        u('1604503468506-a8da13d82791'),
  canard:        u('1604503468506-a8da13d82791'),
  charcuterie:   u('1551782450-a2132b4ba21d'),
  jambon:        u('1551782450-a2132b4ba21d'),

  // Poisson & fruits de mer
  poisson:       u('1535140728325-a4d3707eee94'),
  poissons:      u('1535140728325-a4d3707eee94'),
  saumon:        u('1485921325833-c519f76c4927'),
  thon:          u('1535140728325-a4d3707eee94'),
  crevette:      u('1565680018434-b513d5e5fd47'),
  crevettes:     u('1565680018434-b513d5e5fd47'),
  fruits_de_mer: u('1565680018434-b513d5e5fd47'),

  // Produits laitiers
  fromage:       u('1486297678162-eb2a19b0a32d'),
  fromages:      u('1486297678162-eb2a19b0a32d'),
  laitier:       u('1550583724-b2692b85b150'),
  laitiers:      u('1550583724-b2692b85b150'),
  lait:          u('1550583724-b2692b85b150'),
  beurre:        u('1589985270826-4b7bb135bc9d'),
  creme:         u('1550583724-b2692b85b150'),
  crème:         u('1550583724-b2692b85b150'),
  yaourt:        u('1488477181946-6428a0291777'),
  oeuf:          u('1582722872445-44dc5f7e3c8f'),
  œuf:           u('1582722872445-44dc5f7e3c8f'),
  oeufs:         u('1582722872445-44dc5f7e3c8f'),
  œufs:          u('1582722872445-44dc5f7e3c8f'),

  // Épicerie
  farine:        u('1574323347407-f5e1ad6d020b'),
  cereale:       u('1574323347407-f5e1ad6d020b'),
  céréale:       u('1574323347407-f5e1ad6d020b'),
  riz:           u('1586201375761-83865001e31c'),
  pates:         u('1551183053-bf91a1d81141'),
  pâtes:         u('1551183053-bf91a1d81141'),
  pain:          u('1509440159596-0249088772ff'),
  sucre:         u('1573890958516-6116ef10c8be'),
  sel:           u('1614575810000-6f0e80a0e0e0'),
  epice:         u('1596040033229-a9821ebd058d'),
  épice:         u('1596040033229-a9821ebd058d'),
  epices:        u('1596040033229-a9821ebd058d'),
  épices:        u('1596040033229-a9821ebd058d'),
  huile:         u('1474979266404-7eaacbcd87c5'),
  vinaigre:      u('1485962398930-c1d1f8c2c01a'),
  conserve:      u('1607690424560-35d967d6ad7f'),
  conserves:     u('1607690424560-35d967d6ad7f'),
  sauce:         u('1472476443507-c7a5948772fc'),
  sauces:        u('1472476443507-c7a5948772fc'),

  // Boissons (cas particulier — ingrédients liquides)
  boisson:       u('1622483767028-3f66f32aef97'),
  boissons:      u('1622483767028-3f66f32aef97'),
  vin:           u('1510812431401-41d2bd2722f3'),
  vins:          u('1510812431401-41d2bd2722f3'),
  biere:         u('1535958636474-b021ee887b13'),
  bière:         u('1535958636474-b021ee887b13'),
  alcool:        u('1551024506-0bccd828d307'),
  alcools:       u('1551024506-0bccd828d307'),
  spiritueux:    u('1551024506-0bccd828d307'),
}

const FALLBACK_DEFAUT = u('1542838132-92c53300491e') // légumes génériques

/** Retourne la meilleure URL photo pour un ingrédient.
 *  Priorité : photo_url → fallback catégorie → fallback nom (heuristique) → défaut. */
export function getIngredientPhoto(ingredient: IngredientPhotoInput): string {
  if (ingredient.photo_url && ingredient.photo_url.trim()) return ingredient.photo_url

  // Normalisation : lowercase + supprime accents
  const cat = (ingredient.categorie ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')
  for (const [key, url] of Object.entries(FALLBACKS_CATEGORIE)) {
    if (cat.includes(key)) return url
  }

  // Heuristique sur le nom si la catégorie n'a pas matché (ex: "Tomate" dans cat "Frais")
  const nom = (ingredient.nom ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [key, url] of Object.entries(FALLBACKS_CATEGORIE)) {
    if (nom.includes(key)) return url
  }

  return FALLBACK_DEFAUT
}
