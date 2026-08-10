// Module 27 — Parcours d'un guide étape par étape : /formation/[guideId]?emp=...

import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import GuideClient from './GuideClient'
import { getProfile } from '@/lib/auth'
import { guideAccessibleAuPoste, type Guide, type Etape, type Progression } from '@/lib/formation'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'

export const dynamic = 'force-dynamic'

export default async function GuidePage({
  params, searchParams,
}: {
  params: { guideId: string }
  searchParams: { emp?: string }
}) {
  // RBAC : un employé connecté ne peut consulter QUE son propre profil.
  // Manager : libre. Kiosk (non connecté) : libre (mode tablette partagée).
  const profil = await getProfile()
  let employeId = searchParams.emp
  if (profil && profil.role !== 'manager' && profil.employe_id) {
    employeId = profil.employe_id
  }
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

  // Anti-URL-tampering : un employé connecté (non-manager) ne peut pas accéder
  // à un guide d'un autre poste, même en tapant l'URL directement.
  const guide = guideRes.data as Guide
  if (profil && profil.role !== 'manager' && !guideAccessibleAuPoste(profil.poste, guide.poste)) {
    redirect('/formation')
  }

  const navProfil: OpsBottomNavProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  return (
    <GuideClient
      guide={guide}
      etapes={(etapesRes.data ?? []) as Etape[]}
      progression={(progRes.data ?? null) as Progression | null}
      employe={employeRes.data as { id: string; prenom: string; nom: string }}
      nbQuestions={nbQuestionsRes.count ?? 0}
      navProfil={navProfil}
    />
  )
}
