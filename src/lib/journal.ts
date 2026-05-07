// Module 23 — Helpers journal de bord : types + analyses 6 mois.

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export type Humeur = 'tres_bonne' | 'bonne' | 'normale' | 'difficile' | 'tres_difficile'

export const HUMEUR_INFO: Record<Humeur, { label: string; emoji: string; cls: string; score: number }> = {
  tres_bonne:      { label: 'Très bonne',      emoji: '😄', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', score: 5 },
  bonne:           { label: 'Bonne',           emoji: '🙂', cls: 'bg-blue-100   text-blue-900   border-blue-300',     score: 4 },
  normale:         { label: 'Normale',         emoji: '😐', cls: 'bg-zinc-100   text-zinc-700   border-zinc-300',     score: 3 },
  difficile:       { label: 'Difficile',       emoji: '😕', cls: 'bg-amber-100  text-amber-900  border-amber-300',    score: 2 },
  tres_difficile:  { label: 'Très difficile',  emoji: '😞', cls: 'bg-red-100    text-red-900    border-red-300',      score: 1 },
}

export type Entree = {
  id: string
  date_entree: string
  titre: string | null
  contenu: string
  humeur: Humeur
  photos_urls: string[]
  tags: string[]
  faits_marquants: string | null
  ca_jour_snap: number | null
  nb_couverts_snap: number | null
  meteo_snap: string | null
  redacteur_id: string | null
  redacteur_nom: string | null
  created_at: string
}

// ─── Analyses 6 mois ────────────────────────────────────────────────

export type Analyses = {
  total: number
  par_humeur: Array<{ humeur: Humeur; nb: number; pct: number }>
  ca_moyen_par_humeur: Array<{ humeur: Humeur; ca_moyen: number; nb: number }>
  top_tags: Array<{ tag: string; nb: number }>
  score_moyen: number   // 1-5
  tendance: 'amelioration' | 'stable' | 'degradation' | 'inconnu'
}

export function analyser6Mois(entrees: Entree[]): Analyses {
  const total = entrees.length
  if (total === 0) {
    return { total: 0, par_humeur: [], ca_moyen_par_humeur: [], top_tags: [], score_moyen: 0, tendance: 'inconnu' }
  }

  // Par humeur
  const humeurs: Humeur[] = ['tres_bonne', 'bonne', 'normale', 'difficile', 'tres_difficile']
  const par_humeur = humeurs.map(h => {
    const nb = entrees.filter(e => e.humeur === h).length
    return { humeur: h, nb, pct: total > 0 ? Math.round((nb / total) * 1000) / 10 : 0 }
  }).filter(x => x.nb > 0)

  // CA moyen par humeur (snapshot)
  const ca_moyen_par_humeur = humeurs.map(h => {
    const sub = entrees.filter(e => e.humeur === h && e.ca_jour_snap !== null)
    const nb = sub.length
    if (nb === 0) return { humeur: h, ca_moyen: 0, nb: 0 }
    const tot = sub.reduce((s, e) => s + (e.ca_jour_snap ?? 0), 0)
    return { humeur: h, ca_moyen: Math.round((tot / nb) * 100) / 100, nb }
  }).filter(x => x.nb > 0)

  // Top tags
  const tagCounts = new Map<string, number>()
  for (const e of entrees) {
    for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const top_tags = Array.from(tagCounts.entries())
    .map(([tag, nb]) => ({ tag, nb }))
    .sort((a, b) => b.nb - a.nb)
    .slice(0, 10)

  // Score moyen
  const score_moyen = Math.round(
    entrees.reduce((s, e) => s + HUMEUR_INFO[e.humeur].score, 0) / total * 10
  ) / 10

  // Tendance : compare premier tiers et dernier tiers
  let tendance: Analyses['tendance'] = 'inconnu'
  if (total >= 9) {
    const sorted = [...entrees].sort((a, b) => a.date_entree.localeCompare(b.date_entree))
    const tiers = Math.floor(total / 3)
    const debut = sorted.slice(0, tiers)
    const fin = sorted.slice(-tiers)
    const scoreDebut = debut.reduce((s, e) => s + HUMEUR_INFO[e.humeur].score, 0) / tiers
    const scoreFin = fin.reduce((s, e) => s + HUMEUR_INFO[e.humeur].score, 0) / tiers
    const ecart = scoreFin - scoreDebut
    if (ecart > 0.3) tendance = 'amelioration'
    else if (ecart < -0.3) tendance = 'degradation'
    else tendance = 'stable'
  }

  return { total, par_humeur, ca_moyen_par_humeur, top_tags, score_moyen, tendance }
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

export const fmtDate = (iso: string) => format(parseISO(iso), 'EEEE d MMMM yyyy', { locale: fr })
export const fmtDateCourt = (iso: string) => format(parseISO(iso), 'EEE d MMM', { locale: fr })
