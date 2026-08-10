// Configuration des COMPTOIRS de prise de commande par point de vente.
//
// Modèle « caisse agréée » : notre app PREND la commande (attribuée au point de
// vente via etablissement_id), l'ENCAISSEMENT FISCAL se fait sur la caisse agréée.
// Aucun encaissement dans l'app sur ces écrans (≠ caisse / bar legacy).
//
// Un seul écran générique `/comptoir/[slug]` sert tous les points de vente vendeurs.
// Importé côté serveur (page + actions) ET client (ComptoirClient) → pas d'import server-only.

export type ComptoirAccent = 'amber' | 'violet' | 'blue' | 'emerald'
export type ComptoirTag = 'FOURNIL' | 'BAR' | 'SNACKING'

export type ComptoirDef = {
  /** slug de route = slug de l'établissement (etablissements.slug). */
  slug: string
  /** tag_destination des recettes vendues à ce comptoir. */
  tag: ComptoirTag
  label: string
  emoji: string
  accent: ComptoirAccent
  /** Préfixe du numéro de commande (ex: FRN, BAR, SNK). */
  prefix: string
  /** Sous-titre affiché sous le nom du point de vente. */
  sousTitre: string
}

export const COMPTOIRS: Record<string, ComptoirDef> = {
  fournil: {
    slug: 'fournil', tag: 'FOURNIL', label: 'Fournil', emoji: '🥖', accent: 'amber',
    prefix: 'FRN', sousTitre: 'Boulangerie · vente comptoir',
  },
  bar: {
    slug: 'bar', tag: 'BAR', label: 'Bar', emoji: '🍷', accent: 'violet',
    prefix: 'BAR', sousTitre: 'Boissons · vente comptoir',
  },
  'snack-emporter': {
    slug: 'snack-emporter', tag: 'SNACKING', label: 'Snack / Emporter', emoji: '🥪', accent: 'blue',
    prefix: 'SNK', sousTitre: 'Snacking · vente à emporter',
  },
}

export function getComptoir(slug: string): ComptoirDef | null {
  return COMPTOIRS[slug] ?? null
}

export function listComptoirSlugs(): string[] {
  return Object.keys(COMPTOIRS)
}

// ─── Classes Tailwind STATIQUES par accent ───────────────────────────
// Tailwind purge les classes dynamiques `bg-${x}-500` → on liste en clair.
export type AccentClasses = {
  headerIcon: string   // dégradé de l'icône d'en-tête
  kicker: string       // petit label "Point de vente"
  pillActive: string   // pilule catégorie active
  cardRing: string     // ring d'une carte produit dans le panier
  badge: string        // badge ×N sur une carte
  price: string        // prix produit
  totalPrice: string   // gros total TTC
  validate: string     // bouton valider
  panierCount: string  // pastille compteur panier (centre op n/a ici)
}

export const ACCENTS: Record<ComptoirAccent, AccentClasses> = {
  amber: {
    headerIcon: 'from-amber-500 to-amber-700',
    kicker: 'text-amber-400',
    pillActive: 'bg-amber-500 text-white shadow-lg shadow-amber-500/30',
    cardRing: 'ring-amber-500/60',
    badge: 'bg-amber-500',
    price: 'text-amber-300',
    totalPrice: 'text-amber-300',
    validate: 'bg-amber-500 hover:bg-amber-400',
    panierCount: 'bg-amber-500',
  },
  violet: {
    headerIcon: 'from-violet-500 to-violet-700',
    kicker: 'text-violet-400',
    pillActive: 'bg-violet-500 text-white shadow-lg shadow-violet-500/30',
    cardRing: 'ring-violet-500/60',
    badge: 'bg-violet-500',
    price: 'text-violet-300',
    totalPrice: 'text-violet-300',
    validate: 'bg-violet-500 hover:bg-violet-400',
    panierCount: 'bg-violet-500',
  },
  blue: {
    headerIcon: 'from-blue-500 to-blue-700',
    kicker: 'text-blue-400',
    pillActive: 'bg-blue-500 text-white shadow-lg shadow-blue-500/30',
    cardRing: 'ring-blue-500/60',
    badge: 'bg-blue-500',
    price: 'text-blue-300',
    totalPrice: 'text-blue-300',
    validate: 'bg-blue-500 hover:bg-blue-400',
    panierCount: 'bg-blue-500',
  },
  emerald: {
    headerIcon: 'from-emerald-500 to-emerald-700',
    kicker: 'text-emerald-400',
    pillActive: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30',
    cardRing: 'ring-emerald-500/60',
    badge: 'bg-emerald-500',
    price: 'text-emerald-300',
    totalPrice: 'text-emerald-300',
    validate: 'bg-emerald-500 hover:bg-emerald-400',
    panierCount: 'bg-emerald-500',
  },
}

export const CAT_EMOJI: Record<string, string> = {
  Pain: '🥖', Viennoiserie: '🥐', 'Pâtisserie': '🍰', Snacking: '🥪', Boisson: '☕', Autre: '🛒',
  // Bar
  Cocktails: '🍸', 'Cocktails classiques': '🍸', 'Cocktails sans alcool': '🍹',
  'Vins au verre': '🍷', 'Autres vins au verre': '🍷', 'Autres vins': '🍷', 'Vins de Provence': '🍷',
  'Bières pression': '🍺', 'Bières bouteille': '🍺', Softs: '🥤', Jus: '🧃',
  'Boissons chaudes': '☕', Boissons: '🥤', 'Apéritifs': '🥂', 'Digestifs': '🥃',
  // Snack
  'Les Burgers': '🍔', 'Les Tacos': '🌯', 'Les Sandwichs': '🥪', 'Les Salades': '🥗',
}
