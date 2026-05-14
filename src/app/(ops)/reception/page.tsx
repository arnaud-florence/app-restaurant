// Vue Réception — tableau de bord du réceptionniste.
// Affiche les arrivées/départs du jour, demandes de résa à traiter, acomptes
// en attente, chambres à préparer.

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import BriefingPoste from '@/components/BriefingPoste'
import { getBriefingForPoste } from '@/lib/briefing/poste'
import ReceptionClient from './ReceptionClient'

export const metadata = { title: 'Réception — Service' }
export const dynamic = 'force-dynamic'

export default async function ReceptionPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const dans7j = new Date(); dans7j.setDate(dans7j.getDate() + 7)

  const [arriveesRes, departsRes, demandesRes, futuresRes, chambresRes] = await Promise.all([
    // Arrivées aujourd'hui
    supabase.from('reservations_chambres')
      .select('id, chambre_id, client_nom, client_email, client_telephone, date_arrivee, date_depart, nb_personnes, montant_total, acompte_verse, statut, notes, chambre:chambres(nom, numero)')
      .eq('date_arrivee', today)
      .not('statut', 'in', '(annule,annulee)')
      .order('client_nom'),
    // Départs aujourd'hui
    supabase.from('reservations_chambres')
      .select('id, chambre_id, client_nom, date_depart, montant_total, acompte_verse, statut, chambre:chambres(nom, numero)')
      .eq('date_depart', today)
      .not('statut', 'in', '(annule,annulee)')
      .order('client_nom'),
    // Demandes en attente (à traiter)
    supabase.from('reservations_chambres')
      .select('id, client_nom, client_email, date_arrivee, date_depart, nb_personnes, montant_total, created_at, chambre:chambres(nom, numero)')
      .eq('statut', 'demande')
      .order('created_at', { ascending: false })
      .limit(10),
    // Réservations à venir cette semaine (futures arrivées J+1 à J+7)
    supabase.from('reservations_chambres')
      .select('id, client_nom, date_arrivee, nb_personnes, montant_total, acompte_verse, statut, chambre:chambres(nom, numero)')
      .gt('date_arrivee', today)
      .lte('date_arrivee', dans7j.toISOString().slice(0, 10))
      .not('statut', 'in', '(annule,annulee)')
      .order('date_arrivee'),
    // Chambres
    supabase.from('chambres')
      .select('id, nom, numero, capacite, prix_nuit_ht')
      .eq('actif', true)
      .order('numero'),
  ])

  const profil = await getProfile()
  const navProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  // Briefing : on utilise poste 'caisse' faute de poste dédié réception (le briefing
  // commun est utile : météo, plat du jour, alertes stock générales)
  const briefing = await getBriefingForPoste(supabase, 'caisse', { prenom: profil?.prenom ?? null })

  return (
    <>
      <BriefingPoste briefing={briefing} />
      <ReceptionClient
        arrivees={(arriveesRes.data ?? []) as Reservation[]}
        departs={(departsRes.data ?? []) as Reservation[]}
        demandes={(demandesRes.data ?? []) as Reservation[]}
        futures={(futuresRes.data ?? []) as Reservation[]}
        chambres={(chambresRes.data ?? []) as Chambre[]}
        navProfil={navProfil}
      />
    </>
  )
}

// Types exportés pour le client component (évite double définition)
export type Reservation = {
  id: string
  chambre_id?: string | null
  client_nom: string
  client_email?: string | null
  client_telephone?: string | null
  date_arrivee: string
  date_depart?: string
  nb_personnes?: number
  montant_total?: number | null
  acompte_verse?: number | null
  statut: string
  notes?: string | null
  created_at?: string
  chambre?: { nom: string | null; numero: string | null } | Array<{ nom: string | null; numero: string | null }> | null
}

export type Chambre = {
  id: string
  nom: string
  numero: string
  capacite: number
  prix_nuit_ht: number
}
