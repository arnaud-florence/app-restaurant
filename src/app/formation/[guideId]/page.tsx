// Module 27 — Parcours d'un guide étape par étape : /formation/[guideId]?emp=...

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import GuideClient from './GuideClient'
import type { Guide, Etape, Progression } from '@/lib/formation'

export const dynamic = 'force-dynamic'

export default async function GuidePage({
  params, searchParams,
}: {
  params: { guideId: string }
  searchParams: { emp?: string }
}) {
  const employeId = searchParams.emp
  if (!employeId) redirect('/formation')

  const supabase = await createClient()
  const [guideRes, etapesRes, progRes, employeRes, nbQuestionsRes] = await Promise.all([
    supabase.from('guides_formation').select('*').eq('id', params.guideId).maybeSingle(),
    supabase.from('etapes_formation').select('*').eq('guide_id', params.guideId).order('ordre'),
    supabase.from('progressions_formation').select('*').eq('guide_id', params.guideId).eq('employe_id', employeId).maybeSingle(),
    supabase.from('employes').select('id, prenom, nom').eq('id', employeId).maybeSingle(),
    supabase.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('guide_id', params.guideId),
  ])
  if (!guideRes.data) notFound()
  if (!employeRes.data) redirect('/formation')

  return (
    <GuideClient
      guide={guideRes.data as Guide}
      etapes={(etapesRes.data ?? []) as Etape[]}
      progression={(progRes.data ?? null) as Progression | null}
      employe={employeRes.data as { id: string; prenom: string; nom: string }}
      nbQuestions={nbQuestionsRes.count ?? 0}
    />
  )
}
