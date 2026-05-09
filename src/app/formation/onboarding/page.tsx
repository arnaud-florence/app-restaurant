// Module 27/28 — Onboarding 1er login.
// Wizard 3 sections : (1) bienvenue, (2) lecture manuel, (3) quiz validation.
// Une fois le quiz réussi, bouton « Terminer onboarding » → set completed_at.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { getMainRoute } from '@/lib/permissions'
import { guideAccessibleAuPoste, type Guide, type Progression } from '@/lib/formation'
import OnboardingClient from './OnboardingClient'

export const metadata = { title: 'Onboarding — Formation' }
export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const profil = await getProfile()
  if (!profil) redirect('/login?next=/formation/onboarding')

  // Manager : pas d'onboarding nécessaire.
  if (profil.role === 'manager') redirect(getMainRoute(profil.poste))

  // Déjà onboardé : redirige vers la main route.
  if (profil.onboarding_completed_at) redirect(getMainRoute(profil.poste))

  // Pas d'employe lié : on ne peut pas faire l'onboarding correctement.
  if (!profil.employe_id) {
    return (
      <div className="min-h-screen bg-stone-50 p-6 flex items-center justify-center">
        <div className="max-w-md text-center bg-white rounded-lg shadow p-8">
          <p className="text-6xl mb-4">⚠️</p>
          <h1 className="text-xl font-bold mb-2">Compte non rattaché à un employé</h1>
          <p className="text-sm text-zinc-600">
            Demande au gérant de créer ta fiche RH avec ton email <strong>{profil.email}</strong>.
          </p>
        </div>
      </div>
    )
  }

  const supabase = await createClient()
  const [employeRes, guidesRes] = await Promise.all([
    supabase.from('employes').select('id, prenom, nom, poste').eq('id', profil.employe_id).maybeSingle(),
    supabase.from('guides_formation').select('*').eq('actif', true).order('ordre'),
  ])
  if (!employeRes.data) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center text-zinc-600">
        Employé introuvable. Demande au gérant.
      </div>
    )
  }
  const employe = employeRes.data as { id: string; prenom: string; nom: string; poste: string }
  const guides = (guidesRes.data ?? []) as Guide[]

  // Identifie le guide pertinent pour ce poste (1ᵉʳ match alias).
  const guidePoste = guides.find(g => guideAccessibleAuPoste(employe.poste, g.poste)) ?? null

  // Progression + nb questions pour ce guide
  let progression: Progression | null = null
  let nbEtapes = 0
  let nbQuestions = 0
  if (guidePoste) {
    const [progRes, etapesRes, qRes] = await Promise.all([
      supabase.from('progressions_formation').select('*')
        .eq('guide_id', guidePoste.id).eq('employe_id', employe.id).maybeSingle(),
      supabase.from('etapes_formation').select('id', { count: 'exact', head: true }).eq('guide_id', guidePoste.id),
      supabase.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('guide_id', guidePoste.id),
    ])
    progression = (progRes.data ?? null) as Progression | null
    nbEtapes = etapesRes.count ?? 0
    nbQuestions = qRes.count ?? 0
  }

  return (
    <OnboardingClient
      profil={{ email: profil.email, prenom: profil.prenom, nom: profil.nom, poste: profil.poste }}
      employe={employe}
      guide={guidePoste}
      progression={progression}
      nbEtapes={nbEtapes}
      nbQuestions={nbQuestions}
    />
  )
}
