// Module 18 — Helpers déchets : agrégat mensuel/annuel + format.

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export type TypeDechet = 'biodechet' | 'carton' | 'verre' | 'plastique' | 'huile' | 'metal' | 'dasri' | 'autre'

export const TYPE_DECHET_INFO: Record<TypeDechet, { label: string; emoji: string; cls: string; cls_solid: string; bsd_obligatoire: boolean }> = {
  biodechet:  { label: 'Biodéchet',         emoji: '🥬', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', cls_solid: '#10b981', bsd_obligatoire: true },
  carton:     { label: 'Carton',            emoji: '📦', cls: 'bg-amber-100  text-amber-900  border-amber-300',     cls_solid: '#f59e0b', bsd_obligatoire: false },
  verre:      { label: 'Verre',             emoji: '🍾', cls: 'bg-cyan-100   text-cyan-900   border-cyan-300',      cls_solid: '#06b6d4', bsd_obligatoire: false },
  plastique:  { label: 'Plastique',         emoji: '♻️', cls: 'bg-blue-100   text-blue-900   border-blue-300',      cls_solid: '#3b82f6', bsd_obligatoire: false },
  huile:      { label: 'Huiles usagées',    emoji: '🛢️', cls: 'bg-yellow-100 text-yellow-900 border-yellow-300',    cls_solid: '#eab308', bsd_obligatoire: true  },
  metal:      { label: 'Métal',             emoji: '🔩', cls: 'bg-stone-100  text-stone-900  border-stone-300',     cls_solid: '#78716c', bsd_obligatoire: false },
  dasri:      { label: 'DASRI',             emoji: '🚑', cls: 'bg-red-100    text-red-900    border-red-300',       cls_solid: '#ef4444', bsd_obligatoire: true  },
  autre:      { label: 'Autre',             emoji: '•',  cls: 'bg-zinc-100   text-zinc-700   border-zinc-300',      cls_solid: '#71717a', bsd_obligatoire: false },
}

export type Pesee = {
  id: string
  date_pesee: string
  type_dechet: TypeDechet
  poids_kg: number
  cout_estime: number
  employe_id: string | null
  employe_nom: string | null
  notes: string | null
}

export type Collecte = {
  id: string
  type_dechet: TypeDechet
  date_collecte: string
  prestataire: string
  poids_total_kg: number | null
  num_bsd: string | null
  cout_collecte: number | null
  document_url: string | null
  notes: string | null
}

// ─── Agrégats ───────────────────────────────────────────────────────

export type AggParType = {
  type: TypeDechet
  poids_kg: number
  cout: number
}

export function agregerParType(pesees: Pesee[]): AggParType[] {
  const m = new Map<TypeDechet, AggParType>()
  for (const p of pesees) {
    const cur = m.get(p.type_dechet) ?? { type: p.type_dechet, poids_kg: 0, cout: 0 }
    cur.poids_kg += p.poids_kg
    cur.cout += p.cout_estime
    m.set(p.type_dechet, cur)
  }
  return Array.from(m.values()).sort((a, b) => b.poids_kg - a.poids_kg)
}

export function agregerParMois(pesees: Pesee[]): Array<{ mois: string; libelle: string; poids: number; cout: number }> {
  const m = new Map<string, { mois: string; libelle: string; poids: number; cout: number }>()
  for (const p of pesees) {
    const mois = p.date_pesee.slice(0, 7)
    const cur = m.get(mois) ?? { mois, libelle: format(parseISO(p.date_pesee), 'MMM yy', { locale: fr }), poids: 0, cout: 0 }
    cur.poids += p.poids_kg
    cur.cout += p.cout_estime
    m.set(mois, cur)
  }
  return Array.from(m.values()).sort((a, b) => a.mois.localeCompare(b.mois))
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtPoids = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`

export const fmtDate = (iso: string | null) => iso ? format(parseISO(iso), 'd MMM yyyy', { locale: fr }) : '—'
