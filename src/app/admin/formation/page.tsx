// Module 27 — Page admin /admin/formation : CRUD guides + étapes + quiz + suivi.

import { createClient } from '@/lib/supabase/server'
import FormationAdminClient from './FormationAdminClient'
import type { Guide, Etape, Question, Progression } from '@/lib/formation'

export const metadata = { title: 'Formation — Admin' }
export const dynamic = 'force-dynamic'

export default async function FormationAdminPage() {
  const supabase = await createClient()

  const [guidesRes, etapesRes, questionsRes, progressionsRes, employesRes, certifsRes, questionsIaRes, badgesRes] = await Promise.all([
    supabase.from('guides_formation').select('*').order('poste').order('ordre'),
    supabase.from('etapes_formation').select('*').order('guide_id').order('ordre'),
    supabase.from('quiz_questions').select('*').order('guide_id').order('ordre'),
    supabase.from('progressions_formation').select('*, employes!employe_id(prenom, nom, poste)').order('updated_at', { ascending: false }),
    supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    // Nouveau : certifications + questions IA + badges
    supabase.from('certifications').select('id, employe_id, poste, obtenue_le, score_pct, employe:employes!employe_id(prenom, nom)').order('obtenue_le', { ascending: false }),
    supabase.from('formation_questions_ia').select('id, question, reponse, poste, guide_id, created_at, employe:employes!employe_id(prenom, nom)').order('created_at', { ascending: false }).limit(100),
    supabase.from('badges_employes').select('employe_id, badge_code, badge_titre, badge_emoji, obtenu_le').order('obtenu_le', { ascending: false }),
  ])

  return (
    <FormationAdminClient
      guides={(guidesRes.data ?? []) as Guide[]}
      etapes={(etapesRes.data ?? []) as Etape[]}
      questions={(questionsRes.data ?? []) as unknown as Question[]}
      progressions={(progressionsRes.data ?? []) as unknown as Array<Progression & { employes?: { prenom: string; nom: string; poste: string } }>}
      employes={(employesRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>}
      certifications={(certifsRes.data ?? []) as unknown as CertifRow[]}
      questionsIa={(questionsIaRes.data ?? []) as unknown as QuestionIaRow[]}
      badges={(badgesRes.data ?? []) as BadgeRow[]}
    />
  )
}

export type CertifRow = {
  id: string
  employe_id: string
  poste: string
  obtenue_le: string
  score_pct: number
  employe?: { prenom: string; nom: string } | Array<{ prenom: string; nom: string }> | null
}
export type QuestionIaRow = {
  id: string
  question: string
  reponse: string
  poste: string | null
  guide_id: string | null
  created_at: string
  employe?: { prenom: string; nom: string } | Array<{ prenom: string; nom: string }> | null
}
export type BadgeRow = {
  employe_id: string
  badge_code: string
  badge_titre: string
  badge_emoji: string
  obtenu_le: string
}
