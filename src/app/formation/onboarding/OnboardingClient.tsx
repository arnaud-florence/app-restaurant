'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { ChevronRight, BookOpen, Award, CheckCircle2, Loader2, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { POSTE_INFO, type Guide, type Progression, type Poste } from '@/lib/formation'
import { terminerOnboarding } from '../actions'

export default function OnboardingClient({
  profil, employe, guide, progression, nbEtapes, nbQuestions,
}: {
  profil: { email: string; prenom: string | null; nom: string | null; poste: string | null }
  employe: { id: string; prenom: string; nom: string; poste: string }
  guide: Guide | null
  progression: Progression | null
  nbEtapes: number
  nbQuestions: number
}) {
  const [pending, startTransition] = useTransition()
  const nbVues = progression?.etapes_vues_ids.length ?? 0
  const toutesVues = nbEtapes > 0 && nbVues >= nbEtapes
  const quizReussi = progression?.statut === 'reussi'
  const quizEchoue = progression?.statut === 'echoue'
  const score = progression?.dernier_score_pct
  const seuil = guide?.seuil_reussite_pct ?? 80

  const posteKey = (employe.poste as Poste) in POSTE_INFO ? (employe.poste as Poste) : 'autre'
  const posteInfo = POSTE_INFO[posteKey]

  function onTerminer() {
    if (!quizReussi) return
    startTransition(async () => {
      try {
        const r = await terminerOnboarding()
        window.location.href = r.mainRoute
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-stone-50 to-stone-50">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">
        {/* Bienvenue */}
        <Card className="p-6 bg-white border-emerald-200">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full bg-emerald-600 text-white text-2xl font-bold flex items-center justify-center shrink-0">
              {(employe.prenom[0] ?? profil.email[0]).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Bienvenue, {employe.prenom} ! <span>👋</span>
              </h1>
              <p className="text-sm text-zinc-600 mt-1">
                Avant de commencer ton service, tu dois valider ta formation. Ça prend ~25 min.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="outline" className={posteInfo.cls}>{posteInfo.emoji} {posteInfo.label}</Badge>
                <span className="text-xs text-zinc-500">·  {profil.email}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Étape 1 — Lecture manuel */}
        <Card className={cn('p-5 transition-colors', toutesVues ? 'bg-emerald-50 border-emerald-300' : 'bg-white')}>
          <div className="flex items-start gap-4">
            <div className={cn(
              'h-10 w-10 rounded-full font-bold flex items-center justify-center shrink-0',
              toutesVues ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-700',
            )}>
              {toutesVues ? <CheckCircle2 className="h-5 w-5" /> : '1'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> Lis ton manuel</h2>
                {!guide && <Badge variant="outline" className="bg-red-100 text-red-900 border-red-300">⚠️ Manuel manquant</Badge>}
              </div>
              {guide ? (
                <>
                  <p className="text-sm text-zinc-600 mt-0.5">{guide.titre}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                    <span><BookOpen className="inline h-3 w-3" /> {nbEtapes} étapes</span>
                    {guide.duree_minutes && <span>⏱ ~{guide.duree_minutes} min</span>}
                    <span>{nbVues}/{nbEtapes} vues</span>
                  </div>
                  {nbEtapes > 0 && (
                    <div className="mt-2 h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${(nbVues / nbEtapes) * 100}%` }}
                      />
                    </div>
                  )}
                  <Link href={`/formation/${guide.id}?emp=${employe.id}`} className="inline-block mt-3">
                    <Button variant={toutesVues ? 'outline' : 'default'} className="gap-1">
                      {toutesVues ? '✓ Relire' : 'Ouvrir mon manuel'} <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </>
              ) : (
                <p className="text-sm text-zinc-600 mt-1">
                  Aucun manuel n'est disponible pour ton poste <strong>{posteInfo.label}</strong>.
                  Contacte le gérant.
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Étape 2 — Quiz */}
        <Card className={cn('p-5 transition-colors',
          quizReussi   ? 'bg-emerald-50 border-emerald-300' :
          quizEchoue   ? 'bg-amber-50   border-amber-300'   :
                         'bg-white',
          !toutesVues && 'opacity-60',
        )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              'h-10 w-10 rounded-full font-bold flex items-center justify-center shrink-0',
              quizReussi ? 'bg-emerald-600 text-white'
              : quizEchoue ? 'bg-amber-500 text-white'
              : 'bg-zinc-200 text-zinc-700',
            )}>
              {quizReussi ? <CheckCircle2 className="h-5 w-5" /> : '2'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold flex items-center gap-1.5"><Award className="h-4 w-4" /> Passe ton quiz</h2>
              {guide && nbQuestions > 0 ? (
                <>
                  <p className="text-sm text-zinc-600 mt-0.5">
                    {nbQuestions} questions · seuil de réussite {seuil}%
                  </p>
                  {progression && score != null && (
                    <p className="text-xs mt-2">
                      Dernier essai : <strong className={quizReussi ? 'text-emerald-700' : 'text-red-700'}>{score}%</strong>
                      {quizReussi  && ' ✅ réussi'}
                      {quizEchoue  && ' ❌ à retenter dans 24h'}
                    </p>
                  )}
                  {!toutesVues ? (
                    <p className="text-xs text-amber-700 mt-2">📖 Lis d'abord toutes les étapes du manuel.</p>
                  ) : !quizReussi ? (
                    <Link href={`/formation/${guide.id}/quiz?emp=${employe.id}`} className="inline-block mt-3">
                      <Button className="gap-1">
                        Démarrer le quiz <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-zinc-600 mt-1">Aucun quiz disponible.</p>
              )}
            </div>
          </div>
        </Card>

        {/* Étape 3 — Validation */}
        <Card className={cn('p-5 text-center', quizReussi ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-zinc-100 border-zinc-200')}>
          {quizReussi ? (
            <>
              <GraduationCap className="h-10 w-10 mx-auto mb-2" />
              <h2 className="text-lg font-bold">Tu es prêt à commencer ! 🎉</h2>
              <p className="text-sm opacity-90 mt-1">
                Ton onboarding est validé. Tu peux maintenant accéder à tes modules.
              </p>
              <Button
                onClick={onTerminer}
                disabled={pending}
                className="mt-4 bg-white text-emerald-700 hover:bg-emerald-50 gap-1"
                size="lg"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Terminer mon onboarding
              </Button>
            </>
          ) : (
            <p className="text-sm text-zinc-600 italic">
              Une fois le quiz réussi, tu pourras valider ton onboarding ici.
            </p>
          )}
        </Card>

        <p className="text-center text-xs text-zinc-400">
          Ton manuel reste accessible à tout moment via le menu « Plus » → « Mes manuels ».
        </p>
      </div>
    </div>
  )
}
