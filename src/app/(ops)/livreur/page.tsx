// Vue Livreur — tableau de bord du livreur.
//
// Filtre commandes ONLINE du jour avec mode_retrait='livraison' (migration 0089).
// Affiche l'adresse de livraison, le créneau prévu, et le statut.
//
// À venir (Phase 3) : optimisation trajet via API maps, SMS auto retard,
// statut "en_livraison" dédié (vs "pret"/"retire_par_client").

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import BriefingPoste from '@/components/BriefingPoste'
import { getBriefingForPoste } from '@/lib/briefing/poste'
import LivreurClient from './LivreurClient'

export const metadata = { title: 'Livreur — Service' }
export const dynamic = 'force-dynamic'

export default async function LivreurPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const dayStart = `${today}T00:00:00.000Z`
  const dayEnd   = `${today}T23:59:59.999Z`

  // Commandes ONLINE du jour avec livraison à effectuer
  const { data: cmds } = await supabase
    .from('commandes')
    .select('id, numero, statut, client_nom, client_telephone, client_email, montant_total_ttc, creneau_retrait, created_at, notes, consommation, mode_retrait, adresse_livraison, livraison_depart_at, email_retard_envoye_at, mode_paiement')
    .eq('source', 'ONLINE')
    .eq('mode_retrait', 'livraison')
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
  mode_retrait: string | null
  adresse_livraison: string | null
  livraison_depart_at: string | null
  email_retard_envoye_at: string | null
  mode_paiement: string | null
}
