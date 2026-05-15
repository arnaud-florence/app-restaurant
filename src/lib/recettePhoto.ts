// Helper centralisé : retourne la photo d'une recette avec fallback Unsplash
// thématique selon le tag_destination + la catégorie. Permet d'avoir une photo
// partout, même si l'utilisateur n'a pas uploadé d'image, sans toucher la DB.

export type RecettePhotoInput = {
  photo_url?: string | null
  image_url?: string | null
  tag_destination?: string | null
  categorie?: string | null
  nom?: string | null
}

// Placeholders Unsplash thématiques pour chaque tag/catégorie.
// Sélectionnées pour leur qualité éditoriale + cohérence.
const FALLBACKS_PAR_TAG: Record<string, string> = {
  CUISINE:  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=75', // plat raffiné
  PIZZA:    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=75', // pizza
  BAR:      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=75', // cocktails bar
  SNACKING: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=75', // burger snack
}

const FALLBACKS_PAR_CATEGORIE: Record<string, string> = {
  // Entrées
  entree:     'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=75',
  entrees:    'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=75',
  starter:    'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=75',
  salade:     'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=75',
  salades:    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=75',

  // Plats
  plat:       'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=75',
  plats:      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=75',
  viande:     'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=75',
  viandes:    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=75',
  poisson:    'https://images.unsplash.com/photo-1535140728325-a4d3707eee94?auto=format&fit=crop&w=600&q=75',
  poissons:   'https://images.unsplash.com/photo-1535140728325-a4d3707eee94?auto=format&fit=crop&w=600&q=75',
  pates:      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=75',
  pâtes:      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=75',
  burger:     'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=75',
  burgers:    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=75',

  // Desserts
  dessert:    'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=600&q=75',
  desserts:   'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=600&q=75',
  patisserie: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=600&q=75',
  pâtisserie: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=600&q=75',
  glace:      'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=600&q=75',
  glaces:     'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=600&q=75',

  // Boissons
  vin:        'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=75',
  vins:       'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=75',
  biere:      'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=600&q=75',
  bière:      'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=600&q=75',
  bieres:     'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=600&q=75',
  cocktail:   'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=75',
  cocktails:  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=75',
  soft:       'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=75',
  cafe:       'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=600&q=75',
  café:       'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=600&q=75',

  // Pizza catégories
  pizza:      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=75',
  pizzas:     'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=75',
}

const FALLBACK_PAR_DEFAUT = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=75'

/** Retourne la meilleure URL photo pour une recette.
 *  Priorité : photo_url → image_url → fallback catégorie → fallback tag → défaut. */
export function getRecettePhoto(recette: RecettePhotoInput): string {
  if (recette.photo_url && recette.photo_url.trim()) return recette.photo_url
  if (recette.image_url && recette.image_url.trim()) return recette.image_url

  // Fallback par catégorie (normalisée : lowercase + supprime accents)
  const cat = (recette.categorie ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [key, url] of Object.entries(FALLBACKS_PAR_CATEGORIE)) {
    if (cat.includes(key)) return url
  }

  // Fallback par tag_destination
  const tag = (recette.tag_destination ?? '').toUpperCase()
  if (tag in FALLBACKS_PAR_TAG) return FALLBACKS_PAR_TAG[tag]

  return FALLBACK_PAR_DEFAUT
}
