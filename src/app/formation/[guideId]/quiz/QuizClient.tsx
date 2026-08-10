'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, X, Loader2, Award, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type Guide, type Question, type Progression, POSTE_INFO, peutRetenter } from '@/lib/formation'
import { soumettreQuiz } from '../../actions'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'

type Resultat = { score_pct: number; bonnes: number; total: number; statut: 'reussi' | 'echoue'; seuil: number }

export default function QuizClient({
  guide, questions, progression, employe, navProfil = null,
}: {
  guide: Guide
  questions: Question[]
  progression: Progression | null
  employe: { id: string; prenom: string; nom: string }
  navProfil?: OpsBottomNavProfil
}) {
  const [reponses, setReponses] = useState<(number | null)[]>(new Array(questions.length).fill(null))
  const [pending, startTransition] = useTransition()
  const [resultat, setResultat] = useState<Resultat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const peut = peutRetenter(progression)
  const tousRepondu = reponses.every(r => r !== null)

  function soumettre() {
    if (!tousRepondu) return
    startTransition(async () => {
      try {
        // Quiz adaptatif : on envoie les réponses associées aux question_ids
        // tirées (et non l'ordre). Le serveur tolère un sous-ensemble.
        const reponses_par_question = questions.map((q, i) => ({
          question_id: q.id,
          reponse_idx: (reponses[i] as number) ?? 0,
        }))
        const r = await soumettreQuiz({
          guide_id: guide.id, employe_id: employe.id,
          reponses_par_question,
        })
        setResultat(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  // ─── Vue résultat ────────────────────────────────────────────
  if (resultat) {
    const reussi = resultat.statut === 'reussi'
    return (
      <div className="min-h-screen bg-stone-50 p-4 flex items-center justify-center">
        <Card className={cn('p-8 max-w-xl w-full text-center', reussi ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300')}>
          <div className="text-6xl mb-4">{reussi ? '🏆' : '😕'}</div>
          <h1 className={cn('text-3xl font-bold mb-2', reussi ? 'text-emerald-900' : 'text-red-900')}>
            {reussi ? 'Quiz réussi !' : 'Quiz échoué'}
          </h1>
          <p className="text-lg mb-2">
            Score : <strong>{resultat.score_pct}%</strong> ({resultat.bonnes} / {resultat.total})
          </p>
          <p className="text-sm text-zinc-700 mb-6">
            Seuil de réussite : {resultat.seuil}% · {reussi ? 'Formation validée.' : 'Vous pourrez retenter dans 24h.'}
          </p>

          {/* Détail des réponses */}
          <div className="text-left space-y-2 mb-6 max-h-64 overflow-y-auto">
            {questions.map((q, i) => {
              const ok = reponses[i] === q.bonne_reponse_idx
              return (
                <div key={q.id} className={cn('rounded-md p-3 border', ok ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-red-300')}>
                  <div className="flex items-start gap-2">
                    {ok ? <Check className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" /> : <X className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className="font-medium text-sm">{q.question}</p>
                      <p className="text-xs mt-1">
                        Votre réponse : <strong>{q.choix[reponses[i] as number]}</strong>
                        {!ok && <> · Bonne : <strong className="text-emerald-700">{q.choix[q.bonne_reponse_idx]}</strong></>}
                      </p>
                      {q.explication && <p className="text-xs text-zinc-600 mt-1 italic">💡 {q.explication}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link href="/formation" className="w-full sm:w-auto">
              <Button className={cn('w-full min-h-[48px] text-base font-semibold gap-1 px-6', reussi ? 'bg-emerald-600 hover:bg-emerald-700' : '')}>
                <ArrowLeft className="h-4 w-4" /> Retour à mes formations
              </Button>
            </Link>
            {!reussi && (
              <Link href={`/formation/${guide.id}?emp=${employe.id}`} className="w-full sm:w-auto">
                <Button variant="outline" className="w-full min-h-[48px] gap-1 px-6">
                  <RefreshCcw className="h-4 w-4" /> Revoir le guide
                </Button>
              </Link>
            )}
          </div>
        </Card>
      </div>
    )
  }

  // ─── Anti-spam : 1 tentative / 24h ─────────────────────────
  if (!peut.ok) {
    return (
      <div className="min-h-screen bg-stone-50 p-4 flex items-center justify-center">
        <Card className="p-6 max-w-md text-center">
          <RefreshCcw className="h-12 w-12 mx-auto text-amber-600 mb-3" />
          <h2 className="text-xl font-bold mb-2">Patientez…</h2>
          <p className="text-sm text-zinc-600 mb-1">Vous avez déjà tenté ce quiz récemment.</p>
          <p className="text-sm text-zinc-700 mb-4">Vous pourrez retenter dans <strong>{peut.prochaine_tentative_dans_h ?? 24} h</strong>.</p>
          {progression?.dernier_score_pct != null && (
            <p className="text-sm">Dernier score : <strong>{progression.dernier_score_pct}%</strong></p>
          )}
          <Link href="/formation"><Button variant="outline" className="mt-4 gap-1"><ArrowLeft className="h-4 w-4" /> Retour</Button></Link>
        </Card>
      </div>
    )
  }

  // ─── Vue passage du quiz ────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50 pb-mobile-nav">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto p-3 flex items-center gap-3">
          <Link href={`/formation/${guide.id}?emp=${employe.id}`} className="text-zinc-600 hover:text-emerald-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={POSTE_INFO[guide.poste].cls}>{POSTE_INFO[guide.poste].emoji}</Badge>
              <h1 className="font-semibold truncate">Quiz : {guide.titre}</h1>
            </div>
            <p className="text-xs text-zinc-500">{employe.prenom} {employe.nom} · seuil {guide.seuil_reussite_pct}%</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-5 pb-28">
        {questions.map((q, i) => {
          const repondu = reponses[i] !== null
          return (
          <Card key={q.id} className={cn('p-5 transition-colors', repondu && 'border-emerald-200')}>
            <p className="font-bold text-base mb-4 leading-snug">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-black mr-2 align-middle">{i + 1}</span>
              {q.question}
            </p>
            <div className="space-y-2.5">
              {q.choix.map((c, idx) => (
                <label key={idx} className={cn(
                  'flex items-center gap-3 rounded-xl border-2 p-3.5 min-h-[52px] cursor-pointer transition-colors active:scale-[0.99]',
                  reponses[i] === idx ? 'bg-emerald-50 border-emerald-400' : 'border-zinc-200 hover:bg-zinc-50',
                )}>
                  <input
                    type="radio" name={`q-${q.id}`}
                    className="h-5 w-5 accent-emerald-600 shrink-0"
                    checked={reponses[i] === idx}
                    onChange={() => setReponses(prev => prev.map((r, j) => j === i ? idx : r))}
                  />
                  <span className="font-bold text-sm text-zinc-500 shrink-0">{String.fromCharCode(65 + idx)}.</span>
                  <span className="text-sm leading-snug">{c}</span>
                </label>
              ))}
            </div>
          </Card>
          )
        })}

        {error && <Card className="p-3 bg-red-50 border-red-300 text-sm text-red-900">⚠️ {error}</Card>}

        {/* Bouton valider : collant en bas sur mobile pour rester accessible */}
        <Button
          onClick={soumettre}
          disabled={!tousRepondu || pending}
          className="w-full gap-1 min-h-[52px] text-base font-bold sticky bottom-2 shadow-lg"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
          {tousRepondu ? 'Valider mes réponses' : `Répondre à toutes les questions (${reponses.filter(r => r !== null).length}/${questions.length})`}
        </Button>
      </main>
    </div>
  )
}
