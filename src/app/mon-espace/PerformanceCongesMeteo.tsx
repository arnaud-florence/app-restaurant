// 3 cards complémentaires sur /mon-espace : performance vs mois précédent + congés + météo.
// Server Component pour le fetch + délègue le form congés à un Client child.

import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, Plane, CloudSun, Calendar, Users } from 'lucide-react'
import DemandeCongeForm from './DemandeCongeForm'

type Props = {
  employeId: string
  poste: string
  soldeConges: number
}

const COND_INFO: Record<string, { label: string; emoji: string }> = {
  ensoleille:    { label: 'Ensoleillé',     emoji: '☀️' },
  peu_nuageux:   { label: 'Peu nuageux',    emoji: '🌤' },
  nuageux:       { label: 'Nuageux',        emoji: '☁️' },
  pluie_legere:  { label: 'Pluie légère',   emoji: '🌦' },
  pluie_forte:   { label: 'Pluie forte',    emoji: '🌧' },
  orage:         { label: 'Orage',          emoji: '⛈' },
  neige:         { label: 'Neige',          emoji: '❄️' },
  brouillard:    { label: 'Brouillard',     emoji: '🌫' },
  autre:         { label: 'Autre',          emoji: '🌤' },
}

const STATUT_CONGE: Record<string, { label: string; cls: string }> = {
  demande: { label: 'En attente', cls: 'bg-amber-100   text-amber-900   border-amber-300' },
  valide:  { label: 'Validé',     cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  refuse:  { label: 'Refusé',     cls: 'bg-red-100     text-red-900     border-red-300' },
}

function pad2(n: number) { return n.toString().padStart(2, '0') }
function dateISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function moisDebut(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function moisFin(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }

export default async function PerformanceCongesMeteo({ employeId, poste, soldeConges }: Props) {
  const sb = await createClient()
  const today = new Date()
  const todayISO = dateISO(today)

  const moisCourantDebut = moisDebut(today)
  const moisCourantFin   = moisFin(today)
  const moisPrevDebut    = moisDebut(new Date(today.getFullYear(), today.getMonth() - 1, 1))
  const moisPrevFin      = moisFin(new Date(today.getFullYear(), today.getMonth() - 1, 1))

  const [pointagesM, pointagesP, tachesM, tachesP, congesRes, meteoRes, resasRes] = await Promise.all([
    // Heures mois courant
    sb.from('pointage').select('heures_travaillees')
      .eq('employe_id', employeId)
      .gte('date_pointage', dateISO(moisCourantDebut))
      .lte('date_pointage', dateISO(moisCourantFin)),
    // Heures mois précédent
    sb.from('pointage').select('heures_travaillees')
      .eq('employe_id', employeId)
      .gte('date_pointage', dateISO(moisPrevDebut))
      .lte('date_pointage', dateISO(moisPrevFin)),
    // Tâches obligatoires mois courant
    sb.from('taches_completees').select('id', { count: 'exact', head: true })
      .eq('employe_id', employeId).eq('obligatoire', true)
      .gte('date', dateISO(moisCourantDebut)).lte('date', dateISO(moisCourantFin)),
    // Tâches obligatoires mois précédent
    sb.from('taches_completees').select('id', { count: 'exact', head: true })
      .eq('employe_id', employeId).eq('obligatoire', true)
      .gte('date', dateISO(moisPrevDebut)).lte('date', dateISO(moisPrevFin)),
    // Mes 5 dernières demandes de congé
    sb.from('conges').select('id, date_debut, date_fin, type, statut, notes, created_at')
      .eq('employe_id', employeId)
      .order('created_at', { ascending: false })
      .limit(5),
    // Météo du jour (relevé constaté ou prévision)
    sb.from('releves_meteo').select('temperature_min, temperature_max, conditions, source, est_prevision')
      .eq('date_meteo', todayISO)
      .order('est_prevision').limit(1).maybeSingle(),
    // Réservations confirmées du jour
    sb.from('reservations_tables').select('id, nb_personnes, statut')
      .eq('date_resa', todayISO)
      .in('statut', ['confirmee', 'arrivee']),
  ])

  const heuresM = (pointagesM.data ?? []).reduce((s, p) => s + Number(p.heures_travaillees ?? 0), 0)
  const heuresP = (pointagesP.data ?? []).reduce((s, p) => s + Number(p.heures_travaillees ?? 0), 0)

  // Stat spéciale par poste (perso CA serveur, sinon team metric)
  let perfPoste: { label: string; current: number; prev: number; unite: string } | null = null

  if (poste === 'serveur' || poste === 'salle') {
    const [cmdM, cmdP] = await Promise.all([
      sb.from('commandes').select('montant_total_ttc')
        .eq('serveur_id', employeId)
        .gte('created_at', moisCourantDebut.toISOString()).lte('created_at', moisCourantFin.toISOString()),
      sb.from('commandes').select('montant_total_ttc')
        .eq('serveur_id', employeId)
        .gte('created_at', moisPrevDebut.toISOString()).lte('created_at', moisPrevFin.toISOString()),
    ])
    const caM = (cmdM.data ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
    const caP = (cmdP.data ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
    perfPoste = { label: 'CA personnel', current: caM, prev: caP, unite: '€' }
  }

  function delta(current: number, prev: number): { pct: number; trend: 'up' | 'down' | 'flat' } {
    if (prev === 0 && current === 0) return { pct: 0, trend: 'flat' }
    if (prev === 0) return { pct: 100, trend: 'up' }
    const pct = Math.round(((current - prev) / prev) * 100)
    return { pct, trend: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat' }
  }

  const heuresDelta = delta(heuresM, heuresP)
  const tachesDelta = delta(tachesM.count ?? 0, tachesP.count ?? 0)
  const perfDelta   = perfPoste ? delta(perfPoste.current, perfPoste.prev) : null

  type CongeRow = { id: string; date_debut: string; date_fin: string; type: string; statut: string; notes: string | null; created_at: string }
  const conges = (congesRes.data ?? []) as CongeRow[]

  const meteoData = meteoRes.data as { temperature_min?: number | null; temperature_max?: number | null; conditions?: string | null; source?: string | null; est_prevision?: boolean | null } | null
  const cond = meteoData?.conditions ?? null
  const condInfo = cond ? COND_INFO[cond] ?? COND_INFO.autre : null

  const resas = (resasRes.data ?? []) as Array<{ statut: string; nb_personnes: number }>
  const couvertsTotal = resas.reduce((s, r) => s + Number(r.nb_personnes ?? 0), 0)

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {/* ─── 1. Performance vs mois précédent ────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5 text-sm">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Vs. mois dernier
          </h3>
        </div>
        <div className="space-y-2">
          <PerfRow label="Heures travaillées" current={`${heuresM.toFixed(1)} h`} prev={`${heuresP.toFixed(1)} h`} delta={heuresDelta} />
          {perfPoste && perfDelta && (
            <PerfRow
              label={perfPoste.label}
              current={`${perfPoste.current.toFixed(0)} ${perfPoste.unite}`}
              prev={`${perfPoste.prev.toFixed(0)} ${perfPoste.unite}`}
              delta={perfDelta}
            />
          )}
        </div>
        {heuresM === 0 && heuresP === 0 && (
          <p className="text-[11px] text-zinc-400 italic mt-2 text-center">Données vides : passe ton 1ᵉʳ mois pour voir la comparaison.</p>
        )}
      </Card>

      {/* ─── 2. Mes congés ──────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5 text-sm">
            <Plane className="h-4 w-4 text-emerald-600" /> Mes congés
          </h3>
          <span className="text-base font-bold tabular-nums text-emerald-700">{soldeConges.toFixed(1)} j</span>
        </div>
        <div className="space-y-1.5">
          {conges.length === 0 ? (
            <p className="text-xs text-zinc-500 italic text-center py-2">Aucune demande.</p>
          ) : conges.slice(0, 3).map(c => {
            const stat = STATUT_CONGE[c.statut] ?? STATUT_CONGE.demande
            return (
              <div key={c.id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-medium">{fmtDateRange(c.date_debut, c.date_fin)}</span>
                  <Badge variant="outline" className={cn('text-[11px]', stat.cls)}>{stat.label}</Badge>
                </div>
                <p className="text-[11px] text-zinc-500 capitalize">{c.type}{c.notes ? ` · ${c.notes}` : ''}</p>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-2 border-t">
          <DemandeCongeForm employeId={employeId} />
        </div>
      </Card>

      {/* ─── 3. Météo + affluence du jour ───────────────────────── */}
      <Card className="p-4 bg-gradient-to-br from-sky-50 to-stone-50 border-sky-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5 text-sm">
            <CloudSun className="h-4 w-4 text-sky-600" /> Aujourd'hui
          </h3>
          <span className="text-[11px] text-sky-600">{today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        </div>

        {/* Météo */}
        {condInfo ? (
          <div className="rounded-md bg-white border p-3 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{condInfo.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-bold">{condInfo.label}</p>
                {(meteoData?.temperature_min != null || meteoData?.temperature_max != null) && (
                  <p className="text-xs text-zinc-600 tabular-nums">
                    {meteoData?.temperature_min != null ? `${Number(meteoData.temperature_min).toFixed(0)}° min` : ''}
                    {meteoData?.temperature_min != null && meteoData?.temperature_max != null ? ' · ' : ''}
                    {meteoData?.temperature_max != null ? `${Number(meteoData.temperature_max).toFixed(0)}° max` : ''}
                  </p>
                )}
                {meteoData?.est_prevision && <p className="text-[11px] text-amber-700">📡 prévision</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-zinc-50 border p-3 mb-2 text-xs text-zinc-500 text-center italic">
            Météo non saisie aujourd'hui (cf. /admin/previsionnel).
          </div>
        )}

        {/* Réservations + couverts */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-white border p-2 text-center">
            <Calendar className="h-4 w-4 text-emerald-600 mx-auto mb-0.5" />
            <p className="text-lg font-bold tabular-nums">{resas.length}</p>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Résas</p>
          </div>
          <div className="rounded-md bg-white border p-2 text-center">
            <Users className="h-4 w-4 text-emerald-600 mx-auto mb-0.5" />
            <p className="text-lg font-bold tabular-nums">{couvertsTotal}</p>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Couverts</p>
          </div>
        </div>

        {(condInfo?.label === 'Pluie forte' || condInfo?.label === 'Orage') && (
          <p className="text-[11px] mt-2 text-amber-800 italic">
            ⚠ Météo défavorable → anticipe les annulations terrasse + livraisons.
          </p>
        )}
      </Card>
    </div>
  )
}

function PerfRow({
  label, current, prev, delta,
}: {
  label: string
  current: string
  prev: string
  delta: { pct: number; trend: 'up' | 'down' | 'flat' }
}) {
  const Icon = delta.trend === 'up' ? TrendingUp : delta.trend === 'down' ? TrendingDown : Minus
  const cls  = delta.trend === 'up' ? 'text-emerald-600' : delta.trend === 'down' ? 'text-red-600' : 'text-zinc-400'
  const sign = delta.pct > 0 ? '+' : ''
  return (
    <div className="rounded-md bg-zinc-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-600">{label}</span>
        <span className={cn('flex items-center gap-0.5 text-xs font-bold', cls)}>
          <Icon className="h-3 w-3" />{sign}{delta.pct}%
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <span className="text-base font-bold tabular-nums">{current}</span>
        <span className="text-[11px] text-zinc-400">vs {prev}</span>
      </div>
    </div>
  )
}

function fmtDateRange(d1: string, d2: string): string {
  const a = new Date(d1)
  const b = new Date(d2)
  const aTxt = a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const bTxt = b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  if (d1 === d2) return aTxt
  return `${aTxt} → ${bTxt}`
}
