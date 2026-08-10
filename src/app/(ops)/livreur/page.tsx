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
import { instantParis } from '@/lib/activation/config'

export const metadata = { title: 'Livreur — Service' }
export const dynamic = 'force-dynamic'

export default async function LivreurPage() {
  const supabase = await createClient()

  // ─── Journée de tournée, en heure de PARIS ──────────────────────────
  // Deux corrections par rapport à la version initiale :
  //
  // 1. On filtre sur `creneau_retrait` (la date de LIVRAISON) et non sur
  //    `created_at` (la date de COMMANDE). Le fournil prend des commandes le
  //    soir pour la tournée du lendemain : filtrées sur created_at, elles
  //    n'apparaissaient jamais dans la tournée qu'elles concernent.
  //
  // 2. Les bornes du jour sont calculées en heure de Paris. `toISOString()`
  //    donne la date UTC : entre minuit et 2h du matin l'été, le livreur
  //    voyait encore la tournée de la veille.
  //
  // Les commandes sans créneau (livraisons restaurant historiques) restent
  // rattachées à leur jour de création — d'où la seconde branche du `or`.
  const nowParis = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  const demain = new Date(`${nowParis}T00:00:00Z`)
  demain.setUTCDate(demain.getUTCDate() + 1)
  const demainISO = demain.toISOString().slice(0, 10)

  const dayStart = instantParis(nowParis, '00:00').toISOString()
  const dayEnd   = instantParis(demainISO, '00:00').toISOString()

  const { data: cmds } = await supabase
    .from('commandes')
    .select('id, numero, statut, client_nom, client_telephone, client_email, montant_total_ttc, creneau_retrait, created_at, notes, consommation, mode_retrait, adresse_livraison, livraison_depart_at, email_retard_envoye_at, mode_paiement')
    .eq('source', 'ONLINE')
    .eq('mode_retrait', 'livraison')
    .or(
      `and(creneau_retrait.gte.${dayStart},creneau_retrait.lt.${dayEnd}),` +
      `and(creneau_retrait.is.null,created_at.gte.${dayStart},created_at.lt.${dayEnd})`,
    )
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
