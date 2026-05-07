// Module 27 — Page publique /formation : liste des guides par poste, sélecteur employé.

import { createClient } from '@/lib/supabase/server'
import FormationListClient from './FormationListClient'
import type { Guide, Progression } from '@/lib/formation'

export const metadata = { title: 'Formation' }
export const dynamic = 'force-dynamic'

export default async function FormationListPage() {
  const supabase = await createClient()

  const [guidesRes, employesRes, progRes, etapesCountRes, quizCountRes] = await Promise.all([
    supabase.from('guides_formation').select('*').eq('actif', true).order('poste').order('ordre'),
    supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    supabase.from('progressions_formation').select('*'),
    supabase.from('etapes_formation').select('guide_id'),
    supabase.from('quiz_questions').select('guide_id'),
  ])

  // Aggrégat nb étapes / nb questions par guide
  const nbEtapesParGuide = new Map<string, number>()
  for (const e of (etapesCountRes.data ?? [])) {
    const k = e.guide_id as string
    nbEtapesParGuide.set(k, (nbEtapesParGuide.get(k) ?? 0) + 1)
  }
  const nbQuestionsParGuide = new Map<string, number>()
  for (const q of (quizCountRes.data ?? [])) {
    const k = q.guide_id as string
    nbQuestionsParGuide.set(k, (nbQuestionsParGuide.get(k) ?? 0) + 1)
  }

  return (
    <FormationListClient
      guides={(guidesRes.data ?? []) as Guide[]}
      employes={(employesRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>}
      progressions={(progRes.data ?? []) as unknown as Progression[]}
      nbEtapesParGuide={Object.fromEntries(nbEtapesParGuide)}
      nbQuestionsParGuide={Object.fromEntries(nbQuestionsParGuide)}
    />
  )
}
