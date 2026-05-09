// Module 27 — Page /formation : liste des guides accessibles à l'employé connecté.
//
// Comportement RBAC :
// - Manager connecté → voit TOUS les employés + TOUS les guides (suivi équipe).
// - Employé connecté → verrouillé sur son propre profil + guides de son poste (+ "tous").
// - Kiosk (non connecté) → dropdown libre (mode tablette partagée).

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import FormationListClient from './FormationListClient'
import { guideAccessibleAuPoste, type Guide, type Progression } from '@/lib/formation'
import type { OpsBottomNavProfil } from '@/components/OpsBottomNav'

export const metadata = { title: 'Formation' }
export const dynamic = 'force-dynamic'

export default async function FormationListPage() {
  const supabase = await createClient()
  const profil = await getProfile()
  const isManager = profil?.role === 'manager'

  // Détermine quels employés sont visibles
  let employesQuery = supabase
    .from('employes')
    .select('id, prenom, nom, poste')
    .eq('actif', true)
    .order('prenom')

  if (profil && !isManager && profil.employe_id) {
    // Employé connecté : verrouillé sur lui-même
    employesQuery = supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('id', profil.employe_id)
  }

  const [guidesRes, employesRes, progRes, etapesCountRes, quizCountRes] = await Promise.all([
    supabase.from('guides_formation').select('*').eq('actif', true).order('poste').order('ordre'),
    employesQuery,
    supabase.from('progressions_formation').select('*'),
    supabase.from('etapes_formation').select('guide_id'),
    supabase.from('quiz_questions').select('guide_id'),
  ])

  // Filtrage des guides par poste si employé connecté (non manager)
  let guides = (guidesRes.data ?? []) as Guide[]
  if (profil && !isManager && profil.poste) {
    guides = guides.filter(g => guideAccessibleAuPoste(profil.poste, g.poste))
  }

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

  const employes = (employesRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>

  // Mode "verrouillé" : employé connecté → on auto-sélectionne son employe et on cache le dropdown
  const lockedEmployeId = (profil && !isManager && profil.employe_id) ? profil.employe_id : null

  const navProfil: OpsBottomNavProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  return (
    <FormationListClient
      guides={guides}
      employes={employes}
      progressions={(progRes.data ?? []) as unknown as Progression[]}
      nbEtapesParGuide={Object.fromEntries(nbEtapesParGuide)}
      nbQuestionsParGuide={Object.fromEntries(nbQuestionsParGuide)}
      lockedEmployeId={lockedEmployeId}
      isManager={isManager}
      navProfil={navProfil}
    />
  )
}
