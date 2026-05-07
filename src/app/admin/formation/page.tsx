// Module 27 — Page admin /admin/formation : CRUD guides + étapes + quiz + suivi.

import { createClient } from '@/lib/supabase/server'
import FormationAdminClient from './FormationAdminClient'
import type { Guide, Etape, Question, Progression } from '@/lib/formation'

export const metadata = { title: 'Formation — Admin' }
export const dynamic = 'force-dynamic'

export default async function FormationAdminPage() {
  const supabase = await createClient()

  const [guidesRes, etapesRes, questionsRes, progressionsRes, employesRes] = await Promise.all([
    supabase.from('guides_formation').select('*').order('poste').order('ordre'),
    supabase.from('etapes_formation').select('*').order('guide_id').order('ordre'),
    supabase.from('quiz_questions').select('*').order('guide_id').order('ordre'),
    supabase.from('progressions_formation').select('*, employes!employe_id(prenom, nom, poste)').order('updated_at', { ascending: false }),
    supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
  ])

  return (
    <FormationAdminClient
      guides={(guidesRes.data ?? []) as Guide[]}
      etapes={(etapesRes.data ?? []) as Etape[]}
      questions={(questionsRes.data ?? []) as unknown as Question[]}
      progressions={(progressionsRes.data ?? []) as unknown as Array<Progression & { employes?: { prenom: string; nom: string; poste: string } }>}
      employes={(employesRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>}
    />
  )
}
