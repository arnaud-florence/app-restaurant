import { createClient } from '@/lib/supabase/server'
import { getResumeSession, listSessionsFermees } from '../actions'
import CaisseClient from './CaisseClient'
import CaisseBorneBanner from '@/components/CaisseBorneBanner'
import BriefingPoste from '@/components/BriefingPoste'
import AlertesAgentsOps from '@/components/ops/AlertesAgentsOps'
import { getProfile } from '@/lib/auth'
import { getBriefingForPoste } from '@/lib/briefing/poste'

export const metadata = { title: 'Caisse — Z-report' }
export const dynamic = 'force-dynamic'

export default async function CaissePage() {
  const supabase = await createClient()

  const [resume, sessionsFermees, employesRes, borneRes] = await Promise.all([
    getResumeSession(),
    listSessionsFermees(15),
    supabase
      .from('employes')
      .select('id, prenom, nom, poste')
      .eq('actif', true)
      .order('prenom'),
    supabase
      .from('commandes')
      .select('id, numero, montant_total_ttc, borne_payment_method, borne_expire_at, created_at, borne_id')
      .eq('source', 'BORNE')
      .eq('statut', 'en_attente_paiement_comptoir')
      .order('created_at', { ascending: true }),
  ])
  const commandesBorne = (borneRes.data ?? []).map(c => ({
    id: c.id as string,
    numero: c.numero as string,
    montant_total_ttc: Number(c.montant_total_ttc ?? 0),
    borne_payment_method: c.borne_payment_method as 'nfc' | 'comptoir' | null,
    borne_expire_at: (c.borne_expire_at as string) ?? null,
    created_at: c.created_at as string,
    borne_id: (c.borne_id as string) ?? null,
  }))

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
      <div className="px-3 pt-3">
        <CaisseBorneBanner initial={commandesBorne} />
      </div>
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
