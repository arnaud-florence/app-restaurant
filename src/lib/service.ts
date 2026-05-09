// Module 9A — Helpers partagés écrans de service.
// Pures fonctions + types + constants temps réel.

// ─── Types métier ────────────────────────────────────────────────────
export type StatutCommande = 'en_attente' | 'en_preparation' | 'pret' | 'servi' | 'encaisse' | 'annule'
export type StatutArticle  = 'en_attente' | 'en_preparation' | 'pret' | 'servi'
export type TagDestination = 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
export type SourceCommande = 'ONLINE' | 'TABLE' | 'COMPTOIR'
export type StatutTable    = 'libre' | 'occupee' | 'reservee' | 'a_encaisser'

export type CommandeService = {
  id: string
  numero: string
  source: SourceCommande
  numero_table: string | null
  statut: StatutCommande
  notes: string | null
  client_nom?: string | null
  serveur_nom?: string | null
  created_at: string
  articles: ArticleService[]
  // TVA / consommation (Module TVA multi-taux)
  montant_total_ttc?: number
  tva_total?: number
  consommation?: 'sur_place' | 'emporter'
}

export type ArticleService = {
  id: string
  commande_id: string
  recette_id: string | null
  recette_nom: string                 // joined
  quantite: number
  prix_unitaire_ht: number
  tag_destination: TagDestination
  commentaire: string | null
  allergenes_a_eviter: string[]       // Module 12 — alerte cuisine
  statut: StatutArticle
}

// ─── Statuts UI (libellés + couleurs) ────────────────────────────────
export const STATUT_ARTICLE_LABEL: Record<StatutArticle, { label: string; emoji: string; bg: string; text: string }> = {
  en_attente:     { label: 'En attente',     emoji: '🆕', bg: 'bg-blue-500',    text: 'text-white' },
  en_preparation: { label: 'En préparation', emoji: '🔥', bg: 'bg-amber-500',   text: 'text-white' },
  pret:           { label: 'Prêt',           emoji: '✓',  bg: 'bg-emerald-500', text: 'text-white' },
  servi:          { label: 'Servi',          emoji: '🍽', bg: 'bg-zinc-500',    text: 'text-white' },
}

export const STATUT_COMMANDE_LABEL: Record<StatutCommande, { label: string; emoji: string; cls: string }> = {
  en_attente:     { label: 'En attente',     emoji: '🆕', cls: 'bg-blue-100 text-blue-900 border-blue-300' },
  en_preparation: { label: 'En préparation', emoji: '🔥', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  pret:           { label: 'Prêt',           emoji: '✓',  cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  servi:          { label: 'Servi — à encaisser', emoji: '💰', cls: 'bg-red-100 text-red-900 border-red-300' },
  encaisse:       { label: 'Encaissée',      emoji: '✓',  cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  annule:         { label: 'Annulée',        emoji: '✗',  cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
}

export const TAG_DEST_LABEL: Record<TagDestination, { label: string; emoji: string; cls: string }> = {
  CUISINE:  { label: 'Cuisine',  emoji: '👨‍🍳', cls: 'bg-amber-100 text-amber-800' },
  SNACKING: { label: 'Snacking', emoji: '🥪', cls: 'bg-orange-100 text-orange-800' },
  PIZZA:    { label: 'Pizza',    emoji: '🍕', cls: 'bg-red-100 text-red-800' },
  BAR:      { label: 'Bar',      emoji: '🍷', cls: 'bg-violet-100 text-violet-800' },
}

export const SOURCE_LABEL: Record<SourceCommande, { label: string; emoji: string; bg: string; text: string }> = {
  ONLINE:   { label: 'ONLINE',  emoji: '🌐', bg: 'bg-emerald-500', text: 'text-white' },
  TABLE:    { label: 'TABLE',   emoji: '🪑', bg: 'bg-blue-500',    text: 'text-white' },
  COMPTOIR: { label: 'COMPTOIR',emoji: '🛒', bg: 'bg-violet-500',  text: 'text-white' },
}

export const STATUT_TABLE_STYLE: Record<StatutTable, { label: string; bg: string; ring: string; text: string }> = {
  libre:       { label: 'Libre',        bg: 'bg-emerald-500', ring: 'ring-emerald-300', text: 'text-white' },
  occupee:     { label: 'Occupée',      bg: 'bg-amber-500',   ring: 'ring-amber-300',   text: 'text-white' },
  reservee:    { label: 'Réservée',     bg: 'bg-blue-500',    ring: 'ring-blue-300',    text: 'text-white' },
  a_encaisser: { label: 'À encaisser',  bg: 'bg-red-600',     ring: 'ring-red-300',     text: 'text-white' },
}

// ─── Minuteur : couleur selon le temps écoulé (CLAUDE.md) ────────────
//   VERT   < 10 min
//   ORANGE 10–20 min
//   ROUGE  > 20 min
export type StatutMinuteur = 'vert' | 'orange' | 'rouge'

export function statutMinuteur(createdAt: string, now: number): StatutMinuteur {
  const diffMin = (now - new Date(createdAt).getTime()) / 60000
  if (diffMin < 10) return 'vert'
  if (diffMin <= 20) return 'orange'
  return 'rouge'
}

export const STATUT_MINUTEUR_STYLE: Record<StatutMinuteur, { bg: string; text: string; ring: string }> = {
  vert:   { bg: 'bg-emerald-500', text: 'text-white', ring: 'ring-emerald-300' },
  orange: { bg: 'bg-amber-500',   text: 'text-white', ring: 'ring-amber-300' },
  rouge:  { bg: 'bg-red-600',     text: 'text-white', ring: 'ring-red-300' },
}

export function formatEcoule(createdAt: string, now: number): string {
  const diffMs = now - new Date(createdAt).getTime()
  const min = Math.floor(diffMs / 60000)
  const sec = Math.floor((diffMs / 1000) % 60)
  if (min < 60) return `${min}:${String(sec).padStart(2, '0')}`
  const h = Math.floor(min / 60)
  return `${h}h${String(min % 60).padStart(2, '0')}`
}

// ─── Notification sonore (CLAUDE.md "Notification sonore à chaque
// nouvelle commande"). Web Audio API : son court "ding" sans dépendance
// externe ni fichier audio.
export function playDing() {
  if (typeof window === 'undefined') return
  try {
    const W = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    const Ctx = window.AudioContext ?? W.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.0001
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    o.start()
    o.stop(ctx.currentTime + 0.4)
    setTimeout(() => ctx.close().catch(() => {}), 600)
  } catch { /* silencieux */ }
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
