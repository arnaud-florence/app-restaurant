// Types Module 4 — Recettes & food cost.

export const TAGS_DESTINATION = ['CUISINE', 'SNACKING', 'PIZZA', 'BAR', 'FOURNIL'] as const
export type TagDestination = typeof TAGS_DESTINATION[number]

export const TAG_STYLE: Record<TagDestination, { label: string; emoji: string; cls: string }> = {
  CUISINE:  { label: 'Cuisine',  emoji: '👨‍🍳', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  SNACKING: { label: 'Snacking', emoji: '🥪', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  PIZZA:    { label: 'Pizza',    emoji: '🍕', cls: 'bg-red-100 text-red-800 border-red-300' },
  BAR:      { label: 'Bar',      emoji: '🍷', cls: 'bg-violet-100 text-violet-800 border-violet-300' },
  FOURNIL:  { label: 'Fournil',  emoji: '🥖', cls: 'bg-amber-100 text-amber-900 border-amber-400' },
}

export const CATEGORIES_RECETTE_DEFAUT = [
  'Entrées', 'Plats', 'Desserts',
  'Pizzas', 'Burgers', 'Salades', 'Sandwichs',
  'Boissons', 'Vins', 'Cocktails',
  'Sauces', 'Accompagnements',
] as const

// ─── Modèles applicatifs ─────────────────────────────────────────────
export type Recette = {
  id: string
  nom: string
  categorie: string
  tag_destination: TagDestination
  description: string | null
  temps_preparation: number
  nb_portions: number
  prix_vente_ht: number
  /** Achat-revente : prix d'achat HT du produit fini (surgelé), par unité vendue */
  cout_achat_ht: number | null
  /** Libellé fournisseur à reconnaître sur les factures (0131) */
  libelle_achat: string | null
  /** Nom de la matière telle qu'on la compte en stock (0132) */
  nom_matiere: string | null
  /** Unités vendues tirées d'une unité achetée (flan entier → 10 parts) */
  unites_par_achat: number
  tva: number
  contient_alcool: boolean
  actif: boolean
  photo_url: string | null
  vendable_online: boolean        // Phase 0 : recette proposée sur le site web ?
  image_url: string | null        // Phase 0 : photo HD pour la vitrine (différente de photo_url interne)
  created_at: string
  updated_at: string
}

// Ligne d'ingrédient dans une recette, avec les champs joints depuis ingredients.
export type RecetteIngredient = {
  id: string                        // UUID DB ou 'new-…' tant que non sauvegardé
  ingredient_id: string
  quantite: number
  unite: string

  // Champs joints (read-only)
  ingredient_nom: string
  ingredient_categorie: string
  ingredient_unite: string
  ingredient_prix_achat_ht: number
  ingredient_allergenes: string[]
  ingredient_actif: boolean
}

export type RecetteWithIngredients = Recette & {
  ingredients: RecetteIngredient[]
}

// ─── Defaults ────────────────────────────────────────────────────────
export function defaultRecette(): Omit<Recette, 'id' | 'created_at' | 'updated_at'> {
  return {
    nom: '',
    categorie: 'Plats',
    tag_destination: 'CUISINE',
    description: '',
    temps_preparation: 15,
    nb_portions: 1,
    prix_vente_ht: 0,
    cout_achat_ht: null,
    libelle_achat: '',
    nom_matiere: '',
    unites_par_achat: 1,
    tva: 10,
    contient_alcool: false,
    actif: true,
    photo_url: '',
    vendable_online: false,
    image_url: '',
  }
}

export const isNewId = (id: string) => id.startsWith('new-')
export const newLocalId = () =>
  'new-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
