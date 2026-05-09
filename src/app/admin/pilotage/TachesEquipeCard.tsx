// Carte dashboard manager : checklist du jour par employé (tâches du widget).
// Server Component — fetch live, à inclure dans /admin/pilotage.

import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TACHES, MOMENT_INFO, type Moment, type PosteWidget } from '@/lib/taches-du-jour'

const POSTE_TO_WIDGET: Record<string, PosteWidget> = {
  manager:        'gerant',
  gerant:         'gerant',
  cuisine:        'cuisinier',
  cuisinier:      'cuisinier',
  pizzaiolo:      'pizzaiolo',
  bar:            'barman',
  barman:         'barman',
  serveur:        'serveur',
  salle:          'serveur',
  receptionniste: 'receptionniste',
  second:         'second',
  plonge:         'plonge',
  extra:          'plonge',
}

function widgetPosteFor(poste: string | null): PosteWidget | null {
  if (!poste) return null
  return POSTE_TO_WIDGET[poste] ?? null
}

export default async function TachesEquipeCard() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [employesRes, completRes] = await Promise.all([
    supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    supabase.from('taches_completees')
      .select('employe_id, tache_id, moment, obligatoire')
      .eq('date', today),
  ])

  const employes = (employesRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>
  const completes = (completRes.data ?? []) as Array<{ employe_id: string; tache_id: string; moment: Moment; obligatoire: boolean }>

  // Index par employé
  const completsByEmploye = new Map<string, Array<typeof completes[number]>>()
  for (const c of completes) {
    if (!completsByEmploye.has(c.employe_id)) completsByEmploye.set(c.employe_id, [])
    completsByEmploye.get(c.employe_id)!.push(c)
  }

  type Stat = {
    moment: Moment
    faites: number
    total: number
    oblig_faites: number
    oblig_total: number
  }
  type Ligne = {
    employe: { id: string; prenom: string; nom: string; poste: string }
    posteWidget: PosteWidget | null
    stats: Stat[]
    pctTotal: number
  }

  const lignes: Ligne[] = employes.map(emp => {
    const posteW = widgetPosteFor(emp.poste)
    const matrice = posteW ? TACHES[posteW] : null
    const fait = completsByEmploye.get(emp.id) ?? []

    const stats: Stat[] = (['matin', 'service', 'fin'] as Moment[]).map(m => {
      const totalTaches = matrice?.[m] ?? []
      const oblig = totalTaches.filter(t => t.obligatoire)
      const fait_m = fait.filter(c => c.moment === m)
      return {
        moment: m,
        faites:        fait_m.length,
        total:         totalTaches.length,
        oblig_faites:  fait_m.filter(c => c.obligatoire).length,
        oblig_total:   oblig.length,
      }
    })
    const totalAll = stats.reduce((s, x) => s + x.total, 0)
    const faitesAll = stats.reduce((s, x) => s + x.faites, 0)
    return {
      employe: emp,
      posteWidget: posteW,
      stats,
      pctTotal: totalAll === 0 ? 0 : Math.round((faitesAll / totalAll) * 100),
    }
  })

  // Total équipe
  const totalEquipe = lignes.reduce((s, l) => s + l.stats.reduce((a, x) => a + x.total, 0), 0)
  const faitesEquipe = lignes.reduce((s, l) => s + l.stats.reduce((a, x) => a + x.faites, 0), 0)
  const obligTotalEquipe = lignes.reduce((s, l) => s + l.stats.reduce((a, x) => a + x.oblig_total, 0), 0)
  const obligFaitesEquipe = lignes.reduce((s, l) => s + l.stats.reduce((a, x) => a + x.oblig_faites, 0), 0)
  const pctTotalEquipe = totalEquipe === 0 ? 0 : Math.round((faitesEquipe / totalEquipe) * 100)

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-emerald-600" />
            Checklists d'équipe — aujourd'hui
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Cochages live depuis les widgets « Tâches du jour » sur ops.
          </p>
        </div>
        <div className="text-right">
          <div className={cn(
            'text-3xl font-bold tabular-nums',
            pctTotalEquipe >= 80 ? 'text-emerald-600' : pctTotalEquipe >= 40 ? 'text-amber-600' : 'text-red-600',
          )}>
            {pctTotalEquipe}%
          </div>
          <div className="text-xs text-zinc-500">
            {faitesEquipe}/{totalEquipe} · ⚠ {obligFaitesEquipe}/{obligTotalEquipe}
          </div>
        </div>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-zinc-500 italic text-center py-4">Aucun employé actif.</p>
      ) : (
        <div className="space-y-3">
          {lignes.map(l => {
            const noPoste = !l.posteWidget
            return (
              <div key={l.employe.id} className={cn('rounded-md border p-3', noPoste && 'opacity-50')}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-zinc-200 text-zinc-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {(l.employe.prenom[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{l.employe.prenom} {l.employe.nom}</p>
                      <p className="text-xs text-zinc-500">{l.employe.poste}</p>
                    </div>
                  </div>
                  {!noPoste ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        l.pctTotal >= 80 ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                        l.pctTotal >= 40 ? 'bg-amber-100   text-amber-900   border-amber-300'   :
                                           'bg-red-100     text-red-900     border-red-300',
                      )}
                    >
                      {l.pctTotal}%
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-zinc-100 text-zinc-500 border-zinc-300">
                      pas de matrice
                    </Badge>
                  )}
                </div>

                {!noPoste && (
                  <div className="grid grid-cols-3 gap-2">
                    {l.stats.map(s => (
                      <div key={s.moment} className="rounded bg-zinc-50 px-2 py-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-600">{MOMENT_INFO[s.moment].emoji} {MOMENT_INFO[s.moment].label}</span>
                          <span className="font-bold tabular-nums">{s.faites}/{s.total}</span>
                        </div>
                        <div className="mt-1 h-1 bg-zinc-200 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all',
                              s.total === 0 ? 'bg-zinc-300' :
                              s.faites === s.total ? 'bg-emerald-500' :
                              s.faites > 0 ? 'bg-amber-500' :
                              'bg-zinc-300',
                            )}
                            style={{ width: s.total === 0 ? '0%' : `${(s.faites / s.total) * 100}%` }}
                          />
                        </div>
                        {s.oblig_total > 0 && (
                          <p className="mt-0.5 text-[10px] text-zinc-500">
                            ⚠ {s.oblig_faites}/{s.oblig_total} oblig.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
