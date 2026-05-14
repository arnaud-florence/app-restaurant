'use client'

// Player générique pour les simulations de formation niveau 2.
// Lit `simulation_config` du guide et joue 2 types :
//   - checklist_simule : cocher des actions dans le bon ordre
//   - scenario_qcm     : enchaîner des scénarios avec choix multiples
//
// Score = % de bonnes réponses. ≥ 80% → validation niveau 2 (progression='reussi').

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { enregistrerSimulation } from './actions'

// ─── Types de configs supportés ────────────────────────────
type ChecklistAction = {
  label: string
  ordre_attendu: number
  obligatoire?: boolean
  feedback_ok?: string
  feedback_ko?: string
}
type ChecklistConfig = {
  type: 'checklist_simule'
  titre?: string
  introduction?: string
  actions: ChecklistAction[]
}

type ScenarioStep = {
  situation: string
  choix: string[]
  bonne_reponse: number
  explication?: string
}
type ScenarioConfig = {
  type: 'scenario_qcm'
  titre?: string
  introduction?: string
  scenarios: ScenarioStep[]
}

type Config = ChecklistConfig | ScenarioConfig | { type: string }

export default function SimulationPlayer({
  guide, employe,
}: {
  guide: { id: string; titre: string; poste: string; simulation_config: Record<string, unknown> }
  employe: { id: string; prenom: string; nom: string }
}) {
  const cfg = guide.simulation_config as unknown as Config

  if (cfg.type === 'checklist_simule') {
    return <ChecklistPlayer guide={guide} employe={employe} config={cfg as ChecklistConfig} />
  }
  if (cfg.type === 'scenario_qcm') {
    return <ScenarioPlayer guide={guide} employe={employe} config={cfg as ScenarioConfig} />
  }
  return (
    <div className="p-6 text-center text-zinc-500">
      Type de simulation non supporté : <code>{cfg.type}</code>. Reviens plus tard.
      <div className="mt-3"><Link href={`/formation/${guide.id}`}><Button variant="outline">← Retour</Button></Link></div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Type 1 : CHECKLIST — cocher dans le bon ordre
// ─────────────────────────────────────────────────────────────
function ChecklistPlayer({
  guide, employe, config,
}: {
  guide: { id: string; titre: string; poste: string }
  employe: { id: string; prenom: string; nom: string }
  config: ChecklistConfig
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [clicked, setClicked] = useState<number[]>([])     // indices dans l'ordre où l'employé clique
  const [showResults, setShowResults] = useState(false)

  // Ordre attendu : actions triées par ordre_attendu
  const ordreAttendu = useMemo(
    () => config.actions
      .map((a, i) => ({ ...a, idx: i }))
      .sort((a, b) => a.ordre_attendu - b.ordre_attendu),
    [config.actions],
  )

  const total = config.actions.length

  function toggleAction(idx: number) {
    if (showResults) return
    setClicked(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])
  }

  function valider() {
    setShowResults(true)
  }

  // Calcule le score : % d'actions cochées dans le BON ordre (en termes de séquence relative)
  const resultats = useMemo(() => {
    const items: Array<{ idx: number; action: ChecklistAction; ordre_clic: number | null; ordre_attendu: number; ok: boolean }> = []
    let nbOk = 0
    for (let i = 0; i < config.actions.length; i++) {
      const a = config.actions[i]
      const ordre_clic = clicked.indexOf(i)
      const positionRelative = clicked.findIndex(c => config.actions[c].ordre_attendu >= a.ordre_attendu)
      // Critère simple : l'action est OK si elle a été cliquée ET dans une position cohérente avec son ordre
      const ok = ordre_clic >= 0
      if (ok) {
        const avant = clicked.slice(0, ordre_clic).map(c => config.actions[c].ordre_attendu)
        const tousAvantInferieurs = avant.every(o => o <= a.ordre_attendu)
        if (tousAvantInferieurs) nbOk++
      }
      items.push({
        idx: i, action: a, ordre_clic: ordre_clic >= 0 ? ordre_clic + 1 : null,
        ordre_attendu: a.ordre_attendu,
        ok: ok && ordre_clic >= 0 && clicked.slice(0, ordre_clic).every(c => config.actions[c].ordre_attendu <= a.ordre_attendu),
      })
      void positionRelative
    }
    return { items, nbOk, score: total > 0 ? Math.round((nbOk / total) * 100) : 0 }
  }, [clicked, config.actions, total, showResults])

  function envoyer() {
    startTransition(async () => {
      try {
        await enregistrerSimulation({
          guide_id: guide.id,
          employe_id: employe.id,
          type_simulation: 'checklist_simule',
          score_pct: resultats.score,
          reponses: { clicked, ordreAttendu: ordreAttendu.map(o => o.idx) },
        })
        router.push(`/formation/${guide.id}`)
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  return (
    <div className="min-h-screen bg-stone-50 p-4">
      <header className="max-w-3xl mx-auto mb-4">
        <Link href={`/formation/${guide.id}`} className="text-sm text-zinc-600 hover:text-emerald-700">← Retour au guide</Link>
        <h1 className="text-2xl font-bold mt-1">🎯 Simulation : {guide.titre}</h1>
        <Badge variant="outline">{config.type === 'checklist_simule' ? '✅ Checklist' : config.type}</Badge>
      </header>

      <Card className="max-w-3xl mx-auto p-5 space-y-4">
        {config.introduction && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">{config.introduction}</div>
        )}

        {!showResults ? (
          <>
            <p className="text-sm text-zinc-600">
              <b>Mission :</b> coche les actions dans l'ordre où tu les ferais en vrai. Tu n'es pas obligé de toutes les cocher.
            </p>
            <ol className="space-y-2">
              {config.actions.map((a, i) => {
                const ordre = clicked.indexOf(i)
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggleAction(i)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-md border-2 text-left transition-all active:scale-[0.99]',
                        ordre >= 0
                          ? 'bg-emerald-50 border-emerald-400'
                          : 'bg-white border-zinc-300 hover:border-emerald-300',
                      )}
                    >
                      <div className={cn(
                        'shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                        ordre >= 0 ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-400',
                      )}>
                        {ordre >= 0 ? ordre + 1 : '·'}
                      </div>
                      <span className="text-sm flex-1">{a.label}</span>
                      {a.obligatoire && <Badge variant="destructive" className="text-[10px]">Obligatoire</Badge>}
                    </button>
                  </li>
                )
              })}
            </ol>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setClicked([])}>Effacer</Button>
              <Button onClick={valider} disabled={clicked.length === 0} className="min-h-[48px]">
                Valider mes choix
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={cn(
              'rounded-md p-4 text-center font-bold text-lg',
              resultats.score >= 80 ? 'bg-emerald-100 text-emerald-900 border-2 border-emerald-400'
              : resultats.score >= 50 ? 'bg-amber-100 text-amber-900 border-2 border-amber-400'
              : 'bg-red-100 text-red-900 border-2 border-red-400',
            )}>
              {resultats.score >= 80
                ? `🎉 Excellent ! ${resultats.score}% — niveau 2 validé`
                : resultats.score >= 50
                  ? `⚠ ${resultats.score}% — essaie encore, tu peux mieux faire`
                  : `❌ ${resultats.score}% — relis la théorie et réessaie`}
            </div>

            <h3 className="font-bold text-zinc-900">Détail :</h3>
            <ul className="space-y-2 text-sm">
              {resultats.items.map(r => (
                <li key={r.idx} className={cn(
                  'rounded-md border p-3',
                  r.ok ? 'bg-emerald-50 border-emerald-200' : (r.ordre_clic !== null ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50 border-zinc-200'),
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex-1">
                      <b>{r.ordre_clic ? `${r.ordre_clic}. ` : '— '}</b>
                      {r.action.label}
                      <span className="text-zinc-500"> (ordre attendu : {r.ordre_attendu})</span>
                    </span>
                    <span className="text-lg">
                      {r.ok ? '✓' : (r.ordre_clic !== null ? '⚠' : '·')}
                    </span>
                  </div>
                  {r.ok && r.action.feedback_ok && (
                    <p className="text-xs text-emerald-700 mt-1">{r.action.feedback_ok}</p>
                  )}
                  {!r.ok && r.ordre_clic !== null && r.action.feedback_ko && (
                    <p className="text-xs text-amber-700 mt-1">{r.action.feedback_ko}</p>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowResults(false); setClicked([]) }}>↺ Recommencer</Button>
              <Button onClick={envoyer} disabled={pending} className="min-h-[48px]">
                {pending ? 'Envoi…' : 'Enregistrer et continuer'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Type 2 : SCENARIO QCM — choix multiples scénarisés
// ─────────────────────────────────────────────────────────────
function ScenarioPlayer({
  guide, employe, config,
}: {
  guide: { id: string; titre: string; poste: string }
  employe: { id: string; prenom: string; nom: string }
  config: ScenarioConfig
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reponses, setReponses] = useState<Record<number, number>>({})
  const [showResults, setShowResults] = useState(false)
  const [idxCourant, setIdxCourant] = useState(0)

  const total = config.scenarios.length
  const nbOk = useMemo(
    () => Object.entries(reponses).filter(([i, r]) => config.scenarios[Number(i)]?.bonne_reponse === r).length,
    [reponses, config.scenarios],
  )
  const score = total > 0 ? Math.round((nbOk / total) * 100) : 0

  function repondre(idxScenario: number, choix: number) {
    if (showResults) return
    setReponses(prev => ({ ...prev, [idxScenario]: choix }))
  }

  function suivantOuValider() {
    if (idxCourant < total - 1) setIdxCourant(idxCourant + 1)
    else setShowResults(true)
  }

  function envoyer() {
    startTransition(async () => {
      try {
        await enregistrerSimulation({
          guide_id: guide.id,
          employe_id: employe.id,
          type_simulation: 'scenario_qcm',
          score_pct: score,
          reponses,
        })
        router.push(`/formation/${guide.id}`)
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  const scenario = config.scenarios[idxCourant]
  const reponseCourante = reponses[idxCourant]

  return (
    <div className="min-h-screen bg-stone-50 p-4">
      <header className="max-w-3xl mx-auto mb-4">
        <Link href={`/formation/${guide.id}`} className="text-sm text-zinc-600 hover:text-emerald-700">← Retour au guide</Link>
        <h1 className="text-2xl font-bold mt-1">🎯 Simulation : {guide.titre}</h1>
      </header>

      <Card className="max-w-3xl mx-auto p-5 space-y-4">
        {config.introduction && !showResults && idxCourant === 0 && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">{config.introduction}</div>
        )}

        {!showResults ? (
          <>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Scénario {idxCourant + 1} / {total}</span>
              <span>{Object.keys(reponses).length} / {total} répondus</span>
            </div>

            <div className="rounded-md bg-zinc-100 p-4">
              <p className="font-bold text-zinc-900 mb-1">📋 Situation</p>
              <p className="text-sm">{scenario.situation}</p>
            </div>

            <div className="space-y-2">
              {scenario.choix.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => repondre(idxCourant, i)}
                  className={cn(
                    'w-full text-left px-3 py-3 rounded-md border-2 transition-colors active:scale-[0.99] min-h-[56px]',
                    reponseCourante === i
                      ? 'bg-emerald-50 border-emerald-400'
                      : 'bg-white border-zinc-300 hover:border-emerald-300',
                  )}
                >
                  <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                  {c}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIdxCourant(Math.max(0, idxCourant - 1))}
                disabled={idxCourant === 0}
              >← Précédent</Button>
              <Button
                onClick={suivantOuValider}
                disabled={reponseCourante === undefined}
                className="min-h-[48px]"
              >
                {idxCourant < total - 1 ? 'Suivant →' : 'Voir mon score'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={cn(
              'rounded-md p-4 text-center font-bold text-lg',
              score >= 80 ? 'bg-emerald-100 text-emerald-900 border-2 border-emerald-400'
              : score >= 50 ? 'bg-amber-100 text-amber-900 border-2 border-amber-400'
              : 'bg-red-100 text-red-900 border-2 border-red-400',
            )}>
              {score >= 80
                ? `🎉 ${score}% — niveau 2 validé !`
                : score >= 50 ? `⚠ ${score}% — relis les explications`
                : `❌ ${score}% — recommence après avoir relu`}
            </div>

            <h3 className="font-bold text-zinc-900">Détail :</h3>
            <ol className="space-y-3 text-sm">
              {config.scenarios.map((s, i) => {
                const r = reponses[i]
                const ok = r === s.bonne_reponse
                return (
                  <li key={i} className={cn(
                    'rounded-md border p-3',
                    ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
                  )}>
                    <p className="font-bold mb-1">{i + 1}. {s.situation}</p>
                    <p className="text-xs">
                      Ta réponse : <b>{String.fromCharCode(65 + r)}</b>{ok ? ' ✓' : ' ✗'}
                      {!ok && <> · Bonne réponse : <b>{String.fromCharCode(65 + s.bonne_reponse)}. {s.choix[s.bonne_reponse]}</b></>}
                    </p>
                    {s.explication && <p className="text-xs text-zinc-600 mt-1 italic">{s.explication}</p>}
                  </li>
                )
              })}
            </ol>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowResults(false); setReponses({}); setIdxCourant(0) }}>↺ Recommencer</Button>
              <Button onClick={envoyer} disabled={pending} className="min-h-[48px]">
                {pending ? 'Envoi…' : 'Enregistrer et continuer'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
