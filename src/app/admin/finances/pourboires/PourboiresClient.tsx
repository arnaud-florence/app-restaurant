'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Save, Lock, Unlock, CheckCircle2,
  Calculator, Sparkles, Loader2,
} from 'lucide-react'
import { METHODE_LABEL, type Methode } from '@/lib/pourboires-types'
import { askConfirm } from '@/lib/confirm'
import { preparerDistribution, cloturerDistribution, reouvrirDistribution, marquerLigneVersee } from './actions'

type Distribution = { id: string; mois: string; pool_total_eur: number; methode: string; cloture_at: string | null; notes: string | null } | null

type Ligne = {
  id: string
  employe_id: string | null
  heures_mois: number
  part_pct: number
  montant_eur: number
  verse: boolean
  employe?: { prenom?: string; nom?: string; poste?: string } | null
}

type Props = {
  moisIso: string
  poolMois: number
  distribution: Distribution
  lignes: Ligne[]
  employes: Array<{ id: string; prenom: string; nom: string; poste: string }>
  history: Array<{ mois: string; pool_total_eur: number; cloture_at: string | null; methode: string }>
}

export default function PourboiresClient(p: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [methode, setMethode] = useState<Methode>((p.distribution?.methode as Methode) ?? 'heures')
  const [notes, setNotes] = useState(p.distribution?.notes ?? '')
  const [manuelMontants, setManuelMontants] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const l of p.lignes) if (l.employe_id) m[l.employe_id] = String(l.montant_eur)
    return m
  })

  const moisLabel = new Date(p.moisIso + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const isCloture = !!p.distribution?.cloture_at

  function changerMois(delta: number) {
    const d = new Date(p.moisIso + '-01')
    d.setMonth(d.getMonth() + delta)
    const newMois = d.toISOString().slice(0, 7)
    const sp = new URLSearchParams(params?.toString() ?? '')
    sp.set('mois', newMois)
    router.push(`?${sp.toString()}`)
  }

  function preparer() {
    startTransition(async () => {
      try {
        const manuelLignes = methode === 'manuel'
          ? p.employes.map(e => ({ employe_id: e.id, montant_eur: parseFloat(manuelMontants[e.id] ?? '0') || 0 }))
          : undefined
        await preparerDistribution({
          mois: p.moisIso + '-01',
          methode, notes: notes || null,
          manuelLignes,
        })
        router.refresh()
      } catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  async function cloturer() {
    if (!p.distribution) return
    if (!(await askConfirm({ message: 'Clôturer la distribution ? Les montants seront figés (mais tu pourras réouvrir).', confirmLabel: 'Clôturer', danger: false }))) return
    startTransition(async () => {
      try { await cloturerDistribution({ id: p.distribution!.id }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  async function reouvrir() {
    if (!p.distribution) return
    if (!(await askConfirm({ message: 'Ré-ouvrir la distribution pour modification ?', confirmLabel: 'Ré-ouvrir', danger: false }))) return
    startTransition(async () => {
      try { await reouvrirDistribution({ id: p.distribution!.id }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function toggleVerse(ligne: Ligne) {
    startTransition(async () => {
      try { await marquerLigneVersee({ ligne_id: ligne.id, verse: !ligne.verse }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  const totalDistribue = p.lignes.reduce((s, l) => s + Number(l.montant_eur ?? 0), 0)
  const totalVerse = p.lignes.filter(l => l.verse).reduce((s, l) => s + Number(l.montant_eur ?? 0), 0)

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin/finances" className="text-sm text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Finances
        </Link>
        <span className="text-zinc-300">|</span>
        <button onClick={() => changerMois(-1)} className="p-1.5 rounded hover:bg-zinc-100"><ChevronLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-bold capitalize">💸 Pourboires — {moisLabel}</h1>
        <button onClick={() => changerMois(1)} className="p-1.5 rounded hover:bg-zinc-100"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* KPIs pool */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Pool total du mois" value={p.poolMois} highlight />
        <Tile label="Distribué (calcul)" value={totalDistribue} />
        <Tile label="Versé aux employés" value={totalVerse} />
        <Tile label="Reste à verser" value={totalDistribue - totalVerse} />
      </div>

      {/* Configuration méthode */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-bold flex items-center gap-2"><Calculator className="h-5 w-5 text-emerald-600" /> Méthode de répartition</h2>
            <p className="text-xs text-zinc-500">{METHODE_LABEL[methode].description}</p>
          </div>
          {isCloture ? (
            <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-300">
              ✅ Clôturé le {p.distribution?.cloture_at?.slice(0, 10)}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300">Brouillon</Badge>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          {(Object.keys(METHODE_LABEL) as Methode[]).map(m => (
            <button
              key={m}
              onClick={() => !isCloture && setMethode(m)}
              disabled={isCloture}
              className={cn(
                'rounded-md border-2 p-3 text-left transition-colors',
                methode === m
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-zinc-200 hover:border-zinc-300',
                isCloture && 'opacity-60 cursor-not-allowed',
              )}
            >
              <p className="font-bold flex items-center gap-1">{METHODE_LABEL[m].emoji} {METHODE_LABEL[m].label}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{METHODE_LABEL[m].description}</p>
            </button>
          ))}
        </div>
        <div className="mb-3">
          <label className="text-xs font-medium block mb-1">Notes (facultatif)</label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} disabled={isCloture} placeholder="ex : pourboires de la mention TripAdvisor" />
        </div>
        <div className="flex justify-end gap-2 flex-wrap">
          {!isCloture && (
            <Button onClick={preparer} disabled={pending} className="gap-1">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {p.distribution ? 'Recalculer la distribution' : 'Calculer la distribution'}
            </Button>
          )}
          {p.distribution && !isCloture && (
            <Button onClick={cloturer} disabled={pending} variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1">
              <Lock className="h-4 w-4" /> Clôturer
            </Button>
          )}
          {p.distribution && isCloture && (
            <Button onClick={reouvrir} disabled={pending} variant="outline" className="gap-1">
              <Unlock className="h-4 w-4" /> Ré-ouvrir
            </Button>
          )}
        </div>
      </Card>

      {/* Tableau lignes (si distribution existe) ou form manuel */}
      {p.lignes.length === 0 && methode !== 'manuel' ? (
        <Card className="p-6 text-center text-zinc-500 italic">
          Clique sur « Calculer la distribution » pour générer la répartition.
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="font-bold mb-3">Répartition par employé</h2>

          {/* Mobile : liste de cards (table 5 colonnes illisible à 375px) */}
          <ul className="md:hidden divide-y divide-zinc-100 -mx-2">
            {(p.lignes.length > 0 ? p.lignes : p.employes.map(e => ({
              id: 'preview-' + e.id, employe_id: e.id, heures_mois: 0, part_pct: 0, montant_eur: 0, verse: false,
              employe: { prenom: e.prenom, nom: e.nom, poste: e.poste },
            }) as Ligne)).map(l => {
              const empPrenom = l.employe?.prenom ?? '—'
              const empNom    = l.employe?.nom ?? ''
              const empPoste  = l.employe?.poste ?? ''
              const isManual  = methode === 'manuel' && !isCloture && l.employe_id
              return (
                <li key={l.id} className="px-2 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{empPrenom} {empNom}</p>
                      <p className="text-[11px] text-zinc-500">{empPoste}</p>
                    </div>
                    {p.lignes.length > 0 && isCloture && (
                      <button onClick={() => toggleVerse(l)} disabled={pending} className="min-h-[40px] px-1 shrink-0">
                        {l.verse
                          ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          : <span className="inline-block w-5 h-5 rounded-full border-2 border-zinc-300" />
                        }
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-500 tabular-nums">{Number(l.heures_mois).toFixed(1)} h · {Number(l.part_pct).toFixed(1)} %</span>
                    {isManual ? (
                      <Input
                        type="number" step="0.01" min="0"
                        value={manuelMontants[l.employe_id!] ?? ''}
                        onChange={e => setManuelMontants(prev => ({ ...prev, [l.employe_id!]: e.target.value }))}
                        className="w-24 text-right"
                      />
                    ) : (
                      <span className="font-bold tabular-nums">{eur(Number(l.montant_eur))}</span>
                    )}
                  </div>
                </li>
              )
            })}
            {p.lignes.length > 0 && (
              <li className="px-2 py-3 bg-zinc-50 font-bold flex items-center justify-between gap-2">
                <span>TOTAL · {p.lignes.reduce((s, l) => s + Number(l.part_pct ?? 0), 0).toFixed(1)} %</span>
                <span className="tabular-nums">{eur(totalDistribue)} <span className="text-xs font-normal text-zinc-500">({eur(totalVerse)} versés)</span></span>
              </li>
            )}
          </ul>

          {/* Desktop/tablette : table complète */}
          <div className="hidden md:block overflow-x-auto -mx-2">
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left px-3 py-2">Employé</th>
                  <th className="text-right px-3 py-2">Heures</th>
                  <th className="text-right px-3 py-2">% du pool</th>
                  <th className="text-right px-3 py-2">Montant</th>
                  <th className="text-center px-3 py-2">Versé ?</th>
                </tr>
              </thead>
              <tbody>
                {(p.lignes.length > 0 ? p.lignes : p.employes.map(e => ({
                  id: 'preview-' + e.id, employe_id: e.id, heures_mois: 0, part_pct: 0, montant_eur: 0, verse: false,
                  employe: { prenom: e.prenom, nom: e.nom, poste: e.poste },
                }) as Ligne)).map(l => {
                  const empPrenom = l.employe?.prenom ?? '—'
                  const empNom    = l.employe?.nom ?? ''
                  const empPoste  = l.employe?.poste ?? ''
                  const isManual  = methode === 'manuel' && !isCloture && l.employe_id
                  return (
                    <tr key={l.id} className="border-t hover:bg-zinc-50">
                      <td className="px-3 py-2">
                        <p className="font-medium">{empPrenom} {empNom}</p>
                        <p className="text-[11px] text-zinc-500">{empPoste}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(l.heures_mois).toFixed(1)} h</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(l.part_pct).toFixed(1)} %</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {isManual ? (
                          <Input
                            type="number" step="0.01" min="0"
                            value={manuelMontants[l.employe_id!] ?? ''}
                            onChange={e => setManuelMontants(prev => ({ ...prev, [l.employe_id!]: e.target.value }))}
                            className="w-24 text-right"
                          />
                        ) : (
                          <span className="font-bold">{eur(Number(l.montant_eur))}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.lignes.length > 0 && isCloture && (
                          <button onClick={() => toggleVerse(l)} disabled={pending}>
                            {l.verse
                              ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto" />
                              : <span className="inline-block w-5 h-5 rounded-full border-2 border-zinc-300 mx-auto" />
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {p.lignes.length > 0 && (
                <tfoot className="bg-zinc-50 border-t-2 font-bold">
                  <tr>
                    <td className="px-3 py-2">TOTAL</td>
                    <td></td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.lignes.reduce((s, l) => s + Number(l.part_pct ?? 0), 0).toFixed(1)} %</td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur(totalDistribue)}</td>
                    <td className="px-3 py-2 text-center text-xs text-zinc-500">{eur(totalVerse)} versés</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {Math.abs(totalDistribue - p.poolMois) > 0.5 && p.lignes.length > 0 && (
            <p className="text-xs text-amber-700 mt-2">
              ⚠ Écart entre pool ({eur(p.poolMois)}) et distribué ({eur(totalDistribue)}) : {eur(p.poolMois - totalDistribue)}.
            </p>
          )}
        </Card>
      )}

      {/* Historique 12 derniers mois */}
      {p.history.length > 0 && (
        <Card className="p-5">
          <h2 className="font-bold mb-3">Historique 12 derniers mois</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {p.history.map(h => (
              <Link
                key={h.mois}
                href={`?mois=${h.mois.slice(0, 7)}`}
                className="rounded-md border p-2 hover:bg-zinc-50 transition-colors text-xs"
              >
                <p className="font-medium capitalize">{new Date(h.mois).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</p>
                <p className="text-base font-bold tabular-nums">{eur(Number(h.pool_total_eur))}</p>
                <p className="text-[10px] text-zinc-500">{METHODE_LABEL[h.methode as Methode]?.label} {h.cloture_at ? '· clôturé' : '· brouillon'}</p>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Tile({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={cn('p-3', highlight && 'bg-emerald-50 border-emerald-300')}>
      <p className="text-xs text-zinc-600">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', highlight && 'text-emerald-700')}>{eur(value)}</p>
    </Card>
  )
}

function eur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}
