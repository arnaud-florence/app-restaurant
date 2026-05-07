// Module 27 — Formation : types, helpers progression, scoring quiz.

export type Poste =
  | 'cuisine' | 'pizzaiolo' | 'bar' | 'salle'
  | 'serveur' | 'manager'   | 'plonge' | 'autre' | 'tous'

export const POSTE_INFO: Record<Poste, { label: string; emoji: string; cls: string }> = {
  cuisine:    { label: 'Cuisine',    emoji: '👨‍🍳', cls: 'bg-amber-100   text-amber-900   border-amber-300' },
  pizzaiolo:  { label: 'Pizzaiolo',  emoji: '🍕',   cls: 'bg-red-100     text-red-900     border-red-300' },
  bar:        { label: 'Bar',        emoji: '🍷',   cls: 'bg-violet-100  text-violet-900  border-violet-300' },
  salle:      { label: 'Salle',      emoji: '🪑',   cls: 'bg-blue-100    text-blue-900    border-blue-300' },
  serveur:    { label: 'Serveur',    emoji: '🛎️',   cls: 'bg-blue-100    text-blue-900    border-blue-300' },
  manager:    { label: 'Manager',    emoji: '🧑‍💼', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  plonge:     { label: 'Plonge',     emoji: '🧽',   cls: 'bg-cyan-100    text-cyan-900    border-cyan-300' },
  autre:      { label: 'Autre',      emoji: '•',    cls: 'bg-zinc-100    text-zinc-700    border-zinc-300' },
  tous:       { label: 'Tous postes', emoji: '👥',  cls: 'bg-stone-100   text-stone-800   border-stone-300' },
}

export type StatutFormation = 'non_commence' | 'en_cours' | 'quiz_a_passer' | 'reussi' | 'echoue'

export const STATUT_INFO: Record<StatutFormation, { label: string; emoji: string; cls: string }> = {
  non_commence:   { label: 'Non commencé',  emoji: '○',  cls: 'bg-zinc-100    text-zinc-600    border-zinc-300' },
  en_cours:       { label: 'En cours',      emoji: '⏳', cls: 'bg-blue-100    text-blue-900    border-blue-300' },
  quiz_a_passer:  { label: 'Quiz à passer', emoji: '📝', cls: 'bg-amber-100   text-amber-900   border-amber-300' },
  reussi:         { label: 'Réussi',        emoji: '✅', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  echoue:         { label: 'Échoué',        emoji: '❌', cls: 'bg-red-100     text-red-900     border-red-300' },
}

// ─── Types DB ────────────────────────────────────────────────────
export type Guide = {
  id: string
  titre: string
  description: string | null
  poste: Poste
  ordre: number
  actif: boolean
  seuil_reussite_pct: number
  duree_minutes: number | null
  created_at: string
}

export type Etape = {
  id: string
  guide_id: string
  ordre: number
  titre: string
  contenu: string
  image_url: string | null
  video_url: string | null
}

export type Question = {
  id: string
  guide_id: string
  ordre: number
  question: string
  choix: string[]
  bonne_reponse_idx: number
  explication: string | null
}

export type Progression = {
  id: string
  guide_id: string
  employe_id: string
  etapes_vues_ids: string[]
  dernier_score_pct: number | null
  derniere_tentative_le: string | null
  statut: StatutFormation
  termine_le: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────
/** % d'étapes vues sur le total d'étapes du guide. */
export function pctEtapesVues(progression: Progression | null, totalEtapes: number): number {
  if (!progression || totalEtapes === 0) return 0
  return Math.round((progression.etapes_vues_ids.length / totalEtapes) * 100)
}

/** Calcule le score d'un quiz depuis les réponses utilisateur (idx) et les questions. */
export function calculerScoreQuiz(reponses: number[], questions: Question[]): { score_pct: number; bonnes: number; total: number } {
  const total = questions.length
  if (total === 0) return { score_pct: 0, bonnes: 0, total: 0 }
  let bonnes = 0
  questions.forEach((q, i) => {
    if (reponses[i] === q.bonne_reponse_idx) bonnes++
  })
  return { score_pct: Math.round((bonnes / total) * 100), bonnes, total }
}

/** Définit le nouveau statut d'une progression après une tentative de quiz. */
export function statutApresQuiz(score_pct: number, seuil: number): 'reussi' | 'echoue' {
  return score_pct >= seuil ? 'reussi' : 'echoue'
}

/** L'employé peut-il retenter le quiz ? Limite : 1 tentative / 24 h. */
export function peutRetenter(progression: Progression | null): { ok: boolean; raison?: string; prochaine_tentative_dans_h?: number } {
  if (!progression?.derniere_tentative_le) return { ok: true }
  const ageH = (Date.now() - new Date(progression.derniere_tentative_le).getTime()) / 3_600_000
  if (ageH >= 24) return { ok: true }
  return { ok: false, raison: 'limite 24h', prochaine_tentative_dans_h: Math.ceil(24 - ageH) }
}
