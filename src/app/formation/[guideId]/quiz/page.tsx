// Module 27 — Quiz d'un guide : /formation/[guideId]/quiz?emp=...

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import QuizClient from './QuizClient'
import type { Guide, Question, Progression } from '@/lib/formation'

export const dynamic = 'force-dynamic'

export default async function QuizPage({
  params, searchParams,
}: {
  params: { guideId: string }
  searchParams: { emp?: string }
}) {
  const employeId = searchParams.emp
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

  return (
    <QuizClient
      guide={guideRes.data as Guide}
      questions={(questionsRes.data ?? []) as unknown as Question[]}
      progression={(progRes.data ?? null) as Progression | null}
      employe={employeRes.data as { id: string; prenom: string; nom: string }}
    />
  )
}
