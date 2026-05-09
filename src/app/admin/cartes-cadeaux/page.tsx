// Module Cartes cadeaux — création/suivi (admin) + utilisation depuis les commandes en ligne (futur).
// Le client achètera plus tard ses cartes via le site web (outil 2). Ici, l'admin peut :
// - créer manuellement (cadeau staff, événement, sponsor)
// - consulter le solde + historique
// - annuler une carte (rembourse le solde restant)
// - créditer manuellement (geste commercial)

import { createClient } from '@/lib/supabase/server'
import CartesCadeauxClient from './CartesCadeauxClient'

export const metadata = { title: 'Cartes cadeaux — Admin' }
export const dynamic = 'force-dynamic'

export type CarteCadeau = {
  id: string
  code: string
  montant_initial: number
  montant_restant: number
  acheteur_nom: string | null
  acheteur_email: string | null
  beneficiaire_nom: string | null
  beneficiaire_email: string | null
  message_personnel: string | null
  date_emission: string
  date_validite_fin: string | null
  statut: 'active' | 'utilisee' | 'expiree' | 'annulee'
  paiement_stripe_id: string | null
  created_at: string
  nb_mouvements: number
}

export type MouvementCarte = {
  id: string
  carte_cadeau_id: string
  type: 'achat' | 'utilisation' | 'remboursement' | 'expiration'
  montant: number
  commande_id: string | null
  motif: string | null
  created_at: string
}

export default async function CartesCadeauxPage() {
  const sb = await createClient()
  const { data: cartes } = await sb.from('cartes_cadeaux')
    .select('*, mouvements:mouvements_cartes_cadeaux(id)')
    .order('created_at', { ascending: false })
    .limit(500)

  type Row = {
    id: string; code: string;
    montant_initial: number | string; montant_restant: number | string;
    acheteur_nom: string | null; acheteur_email: string | null;
    beneficiaire_nom: string | null; beneficiaire_email: string | null;
    message_personnel: string | null;
    date_emission: string; date_validite_fin: string | null;
    statut: 'active' | 'utilisee' | 'expiree' | 'annulee';
    paiement_stripe_id: string | null;
    created_at: string;
    mouvements: Array<{ id: string }> | null;
  }

  const list: CarteCadeau[] = ((cartes ?? []) as Row[]).map(r => ({
    id: r.id,
    code: r.code,
    montant_initial: Number(r.montant_initial),
    montant_restant: Number(r.montant_restant),
    acheteur_nom: r.acheteur_nom,
    acheteur_email: r.acheteur_email,
    beneficiaire_nom: r.beneficiaire_nom,
    beneficiaire_email: r.beneficiaire_email,
    message_personnel: r.message_personnel,
    date_emission: r.date_emission,
    date_validite_fin: r.date_validite_fin,
    statut: r.statut,
    paiement_stripe_id: r.paiement_stripe_id,
    created_at: r.created_at,
    nb_mouvements: (r.mouvements ?? []).length,
  }))

  return <CartesCadeauxClient cartes={list} />
}
