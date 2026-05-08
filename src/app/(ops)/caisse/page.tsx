import { createClient } from '@/lib/supabase/server'
import { getResumeSession, listSessionsFermees } from '../actions'
import CaisseClient from './CaisseClient'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'Caisse — Z-report' }
export const dynamic = 'force-dynamic'

export default async function CaissePage() {
  const supabase = await createClient()

  const [resume, sessionsFermees, employesRes] = await Promise.all([
    getResumeSession(),
    listSessionsFermees(15),
    supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('actif', true)
      .order('prenom'),
  ])

  const employes = (employesRes.data ?? []).map(e => ({
    id: e.id as string,
    prenom: e.prenom as string,
    nom: e.nom as string,
    poste: e.poste as string,
  }))

  const profil = await getProfile()
  const navProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  return (
    <CaisseClient
      initialResume={resume}
      sessionsFermees={sessionsFermees}
      employes={employes}
      navProfil={navProfil}
    />
  )
}
