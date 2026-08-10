// Module 27 — Quiz d'un guide : /formation/[guideId]/quiz?emp=...

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import QuizClient from './QuizClient'
import { getProfile } from '@/lib/auth'
import { guideAccessibleAuPoste, type Guide, type Question, type Progression } from '@/lib/formation'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'

export const dynamic = 'force-dynamic'

export default async function QuizPage({
  params, searchParams,
}: {
  params: { guideId: string }
  searchParams: { emp?: string }
}) {
  // RBAC : employé connecté → forcé sur SON employe_id (anti-tampering URL).
  const profil = await getProfile()
  let employeId = searchParams.emp
  if (profil && profil.role !== 'manager' && profil.employe_id) {
    employeId = profil.employe_id
  }
  if (!employeId) redirect('/formation')

  const supabase = await createClient()
  const [guideRes, questionsRes, progRes, employeRes] = await Promise.all([
    supabase.from('guides_formation').select('*').eq('id', params.guideId).maybeSingle(),
    supabase.from('quiz_questions').select('*').eq('guide_id', params.guideId).order('ordre'),
    supabase.from('progressions_formation').select('*').eq('guide_id', params.guideId).eq('employe_id', employeId).maybeSingle(),
    supabase.from('employes').select('id, prenom, nom').eq('id', employeId).maybeSingle(),
  ])
  if (!guideRes.data) notFound()
  if (!employeRes.data) redirect('/formation')

  const guide = guideRes.data as Guide
  if (profil && profil.role !== 'manager' && !guideAccessibleAuPoste(profil.poste, guide.poste)) {
    redirect('/formation')
  }

  const navProfil: OpsBottomNavProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  // Quiz adaptatif : tirage aléatoire de N questions parmi le pool.
  // N = 5 par défaut. Si le pool a moins de N questions, on les prend toutes.
  // Re-shuffled à chaque tentative → empêche d'apprendre par cœur.
  const NB_QUESTIONS_TIRAGE = 5
  const allQuestions = (questionsRes.data ?? []) as unknown as Question[]
  const questionsTirees = shuffleAndPick(allQuestions, NB_QUESTIONS_TIRAGE)

  return (
    <QuizClient
      guide={guide}
      questions={questionsTirees}
      progression={(progRes.data ?? null) as Progression | null}
      employe={employeRes.data as { id: string; prenom: string; nom: string }}
      navProfil={navProfil}
    />
  )
}

/** Fisher-Yates shuffle + slice. Renvoie max `n` éléments aléatoires. */
function shuffleAndPick<T>(arr: T[], n: number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.min(n, a.length))
}
