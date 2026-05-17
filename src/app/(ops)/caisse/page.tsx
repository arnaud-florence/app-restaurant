import { createClient } from '@/lib/supabase/server'
import { getResumeSession, listSessionsFermees } from '../actions'
import CaisseClient from './CaisseClient'
import BriefingPoste from '@/components/BriefingPoste'
import AlertesAgentsOps from '@/components/ops/AlertesAgentsOps'
import { getProfile } from '@/lib/auth'
import { getBriefingForPoste } from '@/lib/briefing/poste'

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

  const employeId = profil?.employe_id ?? null
  let initialDone: string[] = []
  if (employeId) {
    const { data } = await supabase.from('taches_completees')
      .select('tache_id')
      .eq('employe_id', employeId)
      .eq('date', new Date().toISOString().slice(0, 10))
    initialDone = (data ?? []).map(r => r.tache_id as string)
  }

  const briefing = await getBriefingForPoste(supabase, 'caisse', {
    prenom: profil?.prenom ?? null,
  })

  return (
    <>
      <BriefingPoste briefing={briefing} />
      <AlertesAgentsOps agentIds={['financier', 'securite']} />
      <CaisseClient
        initialResume={resume}
        sessionsFermees={sessionsFermees}
        employes={employes}
        navProfil={navProfil}
        widgetEmployeId={employeId}
        widgetInitialDone={initialDone}
      />
    </>
  )
}
