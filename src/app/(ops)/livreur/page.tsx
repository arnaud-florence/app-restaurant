// Vue Livreur — tableau de bord du livreur.
//
// MVP : liste les commandes ONLINE du jour à statut "prêt pour retrait" ou
// "retiré par client" qui ont été marquées pour livraison. Tant qu'il n'y a pas
// de flag "livraison" sur les commandes (vs retrait sur place), on prend toutes
// les commandes ONLINE du jour comme livraisons potentielles.
//
// À venir (Phase 2) : ajout d'un flag `mode_retrait` sur commandes (sur_place/livraison),
// optimisation trajet via API maps, SMS auto retard.

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import BriefingPoste from '@/components/BriefingPoste'
import AlertesAgentsOps from '@/components/ops/AlertesAgentsOps'
import { getBriefingForPoste } from '@/lib/briefing/poste'
import LivreurClient from './LivreurClient'

export const metadata = { title: 'Livreur — Service' }
export const dynamic = 'force-dynamic'

export default async function LivreurPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const dayStart = `${today}T00:00:00.000Z`
  const dayEnd   = `${today}T23:59:59.999Z`

  // Commandes ONLINE du jour
  const { data: cmds } = await supabase
    .from('commandes')
    .select('id, numero, statut, client_nom, client_telephone, client_email, montant_total_ttc, creneau_retrait, created_at, notes, consommation')
    .eq('source', 'ONLINE')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .not('statut', 'in', '(annule)')
    .order('creneau_retrait', { ascending: true, nullsFirst: false })

  const profil = await getProfile()
  const navProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  // Briefing : poste caisse_snacking (proche du livreur côté contexte)
  const briefing = await getBriefingForPoste(supabase, 'caisse_snacking', { prenom: profil?.prenom ?? null })

  // CA livraisons jour (commandes encaissées)
  const caJour = (cmds ?? [])
    .filter(c => c.statut === 'encaisse' || c.statut === 'retire_par_client')
    .reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)

  return (
    <>
      <BriefingPoste briefing={briefing} />
      <AlertesAgentsOps agentIds={['commercial', 'serveur_rt']} />
      <LivreurClient
        commandes={(cmds ?? []) as CommandeLivreur[]}
        caJour={caJour}
        navProfil={navProfil}
      />
    </>
  )
}

export type CommandeLivreur = {
  id: string
  numero: string
  statut: string
  client_nom: string | null
  client_telephone: string | null
  client_email: string | null
  montant_total_ttc: number
  creneau_retrait: string | null
  created_at: string
  notes: string | null
  consommation: string | null
}
