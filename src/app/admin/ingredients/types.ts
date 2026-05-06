// Types + constantes du Module 3 — Gestion des ingrédients.

// 14 allergènes majeurs UE (règlement INCO).
export const ALLERGENES = [
  { key: 'gluten',           label: 'Gluten',          icon: '🌾' },
  { key: 'crustaces',        label: 'Crustacés',       icon: '🦐' },
  { key: 'oeufs',            label: 'Œufs',            icon: '🥚' },
  { key: 'poissons',         label: 'Poissons',        icon: '🐟' },
  { key: 'arachides',        label: 'Arachides',       icon: '🥜' },
  { key: 'soja',             label: 'Soja',            icon: '🌱' },
  { key: 'lait',             label: 'Lait',            icon: '🥛' },
  { key: 'fruits_a_coques',  label: 'Fruits à coques', icon: '🌰' },
  { key: 'celeri',           label: 'Céleri',          icon: '🥬' },
  { key: 'moutarde',         label: 'Moutarde',        icon: '🫙' },
  { key: 'sesame',           label: 'Sésame',          icon: '🌿' },
  { key: 'sulfites',         label: 'Sulfites',        icon: '🍷' },
  { key: 'lupin',            label: 'Lupin',           icon: '🟡' },
  { key: 'mollusques',       label: 'Mollusques',      icon: '🦪' },
] as const

export type AllergeneKey = typeof ALLERGENES[number]['key']
export const ALLERGENES_KEYS = ALLERGENES.map(a => a.key) as readonly string[]
export const labelAllergene = (k: string) => ALLERGENES.find(a => a.key === k)?.label ?? k
export const iconAllergene  = (k: string) => ALLERGENES.find(a => a.key === k)?.icon  ?? '⚠️'

// Catégories suggérées (champ libre, ces valeurs servent d'auto-complétion).
export const CATEGORIES_DEFAUT = [
  'Légumes', 'Fruits', 'Aromates',
  'Viandes', 'Charcuterie', 'Poissons', 'Crustacés',
  'Crémerie', 'Œufs',
  'Épicerie sèche', 'Surgelés', 'Conserves',
  'Boulangerie', 'Pâtisserie',
  'Boissons', 'Vins', 'Bières', 'Spiritueux', 'Café/Thé',
] as const

export const UNITES_DEFAUT = ['kg', 'g', 'L', 'cl', 'mL', 'pièce', 'botte', 'paquet', 'boîte'] as const

// ─── Modèles applicatifs (post-mapping depuis Supabase) ──────────────
export type Ingredient = {
  id: string
  nom: string
  categorie: string
  unite: string
  prix_achat_ht: number
  fournisseur_principal: string | null
  fournisseur_secondaire: string | null
  stock_actuel: number
  stock_minimum: number
  stock_maximum: number
  dlc_moyenne_jours: number
  allergenes: string[]
  actif: boolean
  created_at: string
  updated_at: string
}

export type HistoriquePrix = {
  id: string
  ingredient_id: string
  prix_achat_ht: number
  source: 'creation' | 'manuel' | 'livraison' | 'bon_commande'
  note: string | null
  created_at: string
}

// ─── Statut de stock (règle métier CLAUDE.md) ────────────────────────
//   ROUGE  : stock_actuel = 0
//   ORANGE : 0 < stock_actuel ≤ stock_minimum
//   VERT   : stock_actuel > stock_minimum
export type StatutStock = 'rouge' | 'orange' | 'vert'

export function statutStock(actuel: number, minimum: number): StatutStock {
  if (actuel <= 0) return 'rouge'
  if (actuel <= minimum) return 'orange'
  return 'vert'
}

export const STATUT_STOCK_STYLE: Record<StatutStock, { bg: string; text: string; border: string; label: string }> = {
  rouge:  { bg: 'bg-red-100',     text: 'text-red-800',     border: 'border-red-300',     label: 'Épuisé' },
  orange: { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-300',   label: 'Faible' },
  vert:   { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', label: 'OK' },
}

// ─── Defaults pour un nouvel ingrédient ──────────────────────────────
export function defaultIngredient(): Omit<Ingredient, 'id' | 'created_at' | 'updated_at'> {
  return {
    nom: '',
    categorie: CATEGORIES_DEFAUT[0],
    unite: 'kg',
    prix_achat_ht: 0,
    fournisseur_principal: '',
    fournisseur_secondaire: '',
    stock_actuel: 0,
    stock_minimum: 0,
    stock_maximum: 0,
    dlc_moyenne_jours: 0,
    allergenes: [],
    actif: true,
  }
}
