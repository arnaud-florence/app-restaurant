// Module 26 — Affichage dynamique salle : helpers types + format.

export type SectionMenu = 'entree' | 'plat' | 'dessert' | 'boisson' | 'autre'

export const SECTION_INFO: Record<SectionMenu, { label: string; emoji: string; ordre: number }> = {
  entree:  { label: 'Entrées',   emoji: '🥗', ordre: 1 },
  plat:    { label: 'Plats',     emoji: '🍽️', ordre: 2 },
  dessert: { label: 'Desserts',  emoji: '🍰', ordre: 3 },
  boisson: { label: 'Boissons',  emoji: '🍷', ordre: 4 },
  autre:   { label: 'Autre',     emoji: '✨', ordre: 5 },
}

export type MotifAppel = 'eau' | 'addition' | 'aide' | 'autre'

export const MOTIF_INFO: Record<MotifAppel, { label: string; emoji: string; cls: string }> = {
  eau:      { label: 'Eau',          emoji: '💧', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  addition: { label: 'Addition',     emoji: '🧾', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  aide:     { label: 'Aide',         emoji: '🆘', cls: 'bg-red-100    text-red-900    border-red-300' },
  autre:    { label: 'Autre',        emoji: '👋', cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export type StatutAppel = 'en_attente' | 'pris_en_charge' | 'annule'

export const STATUT_APPEL_INFO: Record<StatutAppel, { label: string; cls: string }> = {
  en_attente:     { label: 'En attente',     cls: 'bg-red-100      text-red-900      border-red-300 animate-pulse' },
  pris_en_charge: { label: 'Pris en charge', cls: 'bg-emerald-100  text-emerald-900  border-emerald-300' },
  annule:         { label: 'Annulé',         cls: 'bg-zinc-100     text-zinc-700     border-zinc-300' },
}

// ─── Format ─────────────────────────────────────────────────────
export const fmtPrix = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ageMin(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
}

// ─── Types DB ───────────────────────────────────────────────────
export type MenuItem = {
  id: string
  jour: string
  section: SectionMenu
  titre: string
  description: string | null
  prix: number | null
  ordre: number
  actif: boolean
}

export type Promo = {
  id: string
  titre: string
  description: string | null
  image_url: string | null
  periode_debut: string | null
  periode_fin: string | null
  actif: boolean
  ordre: number
}

export type AppelServeur = {
  id: string
  table_id: string | null
  table_numero: string | null
  motif: MotifAppel
  message: string | null
  statut: StatutAppel
  pris_par_id: string | null
  pris_le: string | null
  created_at: string
}
