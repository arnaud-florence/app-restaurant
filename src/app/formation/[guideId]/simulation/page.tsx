// Route /formation/[guideId]/simulation
// Joue la simulation niveau 2 si le guide a un simulation_config.
// Sinon redirige vers le quiz classique.

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import SimulationPlayer from './SimulationPlayer'

export const dynamic = 'force-dynamic'

export default async function SimulationPage({
  params, searchParams,
}: {
  params: { guideId: string }
  // Accepte `emp` (convention de l'app, passé par les liens /formation) ET `employe`.
  searchParams: { emp?: string; employe?: string }
}) {
  const supabase = await createClient()

  const { data: guide } = await supabase
    .from('guides_formation')
    .select('*')
    .eq('id', params.guideId)
    .maybeSingle()
  if (!guide) notFound()

  // Si pas de simulation_config → redirige vers quiz classique
  if (!guide.simulation_config) {
    redirect(`/formation/${params.guideId}/quiz`)
  }

  // Détermine l'employé : auth manager/employé prioritaire, sinon param URL (kiosk)
  const profil = await getProfile()
  let employeId = searchParams.emp ?? searchParams.employe ?? null
  if (profil && profil.role !== 'manager' && profil.employe_id) {
    employeId = profil.employe_id
  }
  if (!employeId) {
    redirect(`/formation/${params.guideId}`)
  }

  const { data: emp } = await supabase
    .from('employes')
    .select('id, prenom, nom, poste')
    .eq('id', employeId)
    .maybeSingle()
  if (!emp) notFound()

  return (
    <SimulationPlayer
      guide={{
        id: guide.id as string,
        titre: guide.titre as string,
        poste: guide.poste as string,
        simulation_config: guide.simulation_config as Record<string, unknown>,
      }}
      employe={{ id: emp.id as string, prenom: emp.prenom as string, nom: emp.nom as string }}
    />
  )
}
