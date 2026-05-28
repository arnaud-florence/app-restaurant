// Utilitaires Module 7 — Gestion des stocks.
// Pures fonctions partagées server / client.

import { type Ingredient, statutStock, STATUT_STOCK_STYLE } from '@/app/admin/ingredients/types'

export { statutStock, STATUT_STOCK_STYLE }
export type { Ingredient }

// ─── Mouvements ─────────────────────────────────────────────────────
export const TYPES_MOUVEMENT = ['entree', 'sortie', 'perte', 'inventaire'] as const
export type TypeMouvement = typeof TYPES_MOUVEMENT[number]

export const TYPE_MOUVEMENT_LABEL: Record<TypeMouvement, { label: string; emoji: string; cls: string; signe: '+' | '-' | '±' }> = {
  entree:     { label: 'Livraison',    emoji: '📥', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', signe: '+' },
  sortie:     { label: 'Sortie',       emoji: '📤', cls: 'bg-blue-100    text-blue-800    border-blue-300',    signe: '-' },
  perte:      { label: 'Perte/casse',  emoji: '⚠️', cls: 'bg-red-100     text-red-800     border-red-300',     signe: '-' },
  inventaire: { label: 'Inventaire',   emoji: '📊', cls: 'bg-violet-100  text-violet-800  border-violet-300',  signe: '±' },
}

export type Mouvement = {
  id: string
  ingredient_id: string
  ingredient_nom?: string         // joint
  ingredient_unite?: string       // joint
  type: TypeMouvement
  quantite: number                // positive — le signe est implicite via le type
  prix_unitaire_ht: number
  motif: string | null
  fournisseur: string | null
  date_peremption: string | null
  commande_id: string | null
  employe_id: string | null
  created_at: string
}

// ─── Calculs ─────────────────────────────────────────────────────────
export function valeurStock(ingredients: Ingredient[]): number {
  return ingredients.reduce((s, i) => s + i.stock_actuel * i.prix_achat_ht, 0)
}

export function alertesDLC(mouvements: Mouvement[], joursAvant = 3): Mouvement[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today.getTime() + joursAvant * 86400000)
  return mouvements
    .filter(m => m.type === 'entree' && m.date_peremption)
    .filter(m => {
      const d = new Date(m.date_peremption!)
      return d >= today && d <= cutoff
    })
    .sort((a, b) => new Date(a.date_peremption!).getTime() - new Date(b.date_peremption!).getTime())
}

export type LigneCourse = {
  ingredient_id: string
  nom: string
  unite: string
  stock_actuel: number
  stock_minimum: number
  stock_maximum: number
  qte_a_commander: number
  cout_estime: number
  fournisseur: string | null
}

/**
 * Liste de courses : tous les ingrédients dont stock_actuel <= stock_minimum,
 * avec une suggestion de quantité pour atteindre stock_maximum.
 * (<= pour rester cohérent avec le seuil d'alerte orange de statutStock.)
 */
export function listeCourses(ingredients: Ingredient[]): LigneCourse[] {
  return ingredients
    .filter(i => i.actif && i.stock_actuel <= i.stock_minimum)
    .map(i => {
      const cible = i.stock_maximum > 0 ? i.stock_maximum : i.stock_minimum * 2
      const qte = Math.max(0, cible - i.stock_actuel)
      return {
        ingredient_id: i.id,
        nom: i.nom,
        unite: i.unite,
        stock_actuel: i.stock_actuel,
        stock_minimum: i.stock_minimum,
        stock_maximum: i.stock_maximum,
        qte_a_commander: Math.round(qte * 1000) / 1000,
        cout_estime: Math.round(qte * i.prix_achat_ht * 100) / 100,
        fournisseur: i.fournisseur_principal,
      }
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

export function totalListeCourses(items: LigneCourse[]): number {
  return items.reduce((s, l) => s + l.cout_estime, 0)
}

/** Génère un texte copiable pour la liste de courses (clipboard / email). */
export function listeCoursesEnTexte(items: LigneCourse[]): string {
  if (items.length === 0) return 'Aucun ingrédient en alerte stock.'
  const par_fournisseur = new Map<string, LigneCourse[]>()
  for (const l of items) {
    const k = l.fournisseur ?? '— fournisseur non défini —'
    if (!par_fournisseur.has(k)) par_fournisseur.set(k, [])
    par_fournisseur.get(k)!.push(l)
  }
  const lines: string[] = ['Liste de courses', new Date().toLocaleDateString('fr-FR'), '']
  for (const [fournisseur, lignes] of par_fournisseur.entries()) {
    lines.push(`▸ ${fournisseur}`)
    for (const l of lignes) {
      lines.push(`  • ${l.nom} : ${l.qte_a_commander} ${l.unite}  (~ ${l.cout_estime.toFixed(2)} €)`)
    }
    lines.push('')
  }
  const total = totalListeCourses(items)
  lines.push(`Total estimé : ${total.toFixed(2)} €`)
  return lines.join('\n')
}

// ─── Invendus du mois (pertes) ──────────────────────────────────────
export type BilanInvendus = {
  total_quantites: number     // somme des quantités perdues (ne fait pas grand sens cross-unités, mais OK pour info)
  total_cout: number          // valeur en € des pertes
  par_ingredient: { ingredient_id: string; nom: string; qte: number; cout: number }[]
}

export function bilanInvendusMois(mouvements: Mouvement[]): BilanInvendus {
  const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0)
  const pertesMois = mouvements.filter(m => m.type === 'perte' && new Date(m.created_at) >= debutMois)
  const map = new Map<string, { nom: string; qte: number; cout: number }>()
  for (const p of pertesMois) {
    const k = p.ingredient_id
    const v = map.get(k) ?? { nom: p.ingredient_nom ?? 'Ingrédient', qte: 0, cout: 0 }
    v.qte += p.quantite
    v.cout += p.quantite * p.prix_unitaire_ht
    map.set(k, v)
  }
  const par_ingredient = Array.from(map.entries())
    .map(([ingredient_id, v]) => ({ ingredient_id, ...v }))
    .sort((a, b) => b.cout - a.cout)
  return {
    total_quantites: pertesMois.reduce((s, p) => s + p.quantite, 0),
    total_cout:      par_ingredient.reduce((s, x) => s + x.cout, 0),
    par_ingredient,
  }
}

// ─── Format ──────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtQte = (n: number) =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 1000) / 1000).toLocaleString('fr-FR')
