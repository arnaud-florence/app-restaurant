import { createClient } from '@/lib/supabase/server'
import ReservationsClient from './ReservationsClient'
import {
  type Chambre, type ResaChambre, type ResaTable, type Evenement,
  type StatutResa, type StatutResaTable, type StatutEvent, type TypeEvenement,
} from '@/lib/reservations'
import { getProfile } from '@/lib/auth'
import { isReadOnly } from '@/lib/permissions'

export const metadata = { title: 'Réservations & événementiel — Admin' }
export const dynamic = 'force-dynamic'

export type DataReservations = {
  chambres: Chambre[]
  resaChambres: ResaChambre[]
  resaTables: ResaTable[]
  evenements: Evenement[]
  tables: { id: string; numero: string; capacite: number; zone: string }[]
}

export default async function ReservationsPage() {
  const supabase = await createClient()

  const [chRes, resaChRes, resaTRes, evtRes, tablesRes] = await Promise.all([
    supabase.from('chambres').select('*').eq('actif', true).order('numero'),
    supabase.from('reservations_chambres')
      .select('*, chambre:chambres(nom, numero)')
      .order('date_arrivee', { ascending: false })
      .limit(200),
    supabase.from('reservations_tables')
      .select('*, table:tables_restaurant(numero, capacite, zone)')
      .order('date_resa', { ascending: false })
      .order('heure_arrivee')
      .limit(200),
    supabase.from('evenements').select('*').order('date_evenement', { ascending: false }).limit(100),
    supabase.from('tables_restaurant').select('id, numero, capacite, zone').order('zone').order('numero'),
  ])

  const chambres: Chambre[] = (chRes.data ?? []).map(c => ({
    id: c.id as string,
    nom: c.nom as string,
    numero: c.numero as string,
    capacite: Number(c.capacite ?? 2),
    prix_nuit_ht: Number(c.prix_nuit_ht ?? 0),
    description: (c.description as string) ?? null,
    equipements: (c.equipements as string[]) ?? [],
    photos: (c.photos as string[]) ?? [],
    actif: Boolean(c.actif),
  }))

  type ResaChRow = {
    id: string; chambre_id: string; client_nom: string; client_email: string | null;
    client_telephone: string | null; date_arrivee: string; date_depart: string;
    nb_personnes: number | string; montant_total: number | string; acompte_verse: number | string;
    statut: string; notes: string | null;
    chambre?: { nom?: string; numero?: string } | null;
  }
  const resaChambres: ResaChambre[] = ((resaChRes.data ?? []) as ResaChRow[]).map(r => ({
    id: r.id, chambre_id: r.chambre_id,
    chambre_nom: r.chambre ? `${r.chambre.numero} — ${r.chambre.nom}` : '— supprimée —',
    client_nom: r.client_nom,
    client_email: r.client_email,
    client_telephone: r.client_telephone,
    date_arrivee: r.date_arrivee,
    date_depart: r.date_depart,
    nb_personnes: Number(r.nb_personnes ?? 1),
    montant_total: Number(r.montant_total ?? 0),
    acompte_verse: Number(r.acompte_verse ?? 0),
    statut: r.statut as StatutResa,
    notes: r.notes,
  }))

  type ResaTRow = {
    id: string; table_id: string | null; zone: string | null;
    date_resa: string; heure_arrivee: string; heure_depart: string | null;
    nb_personnes: number | string; client_nom: string; client_telephone: string | null;
    client_email: string | null; client_id: string | null; notes: string | null;
    statut: string; rappel_envoye: boolean;
    table?: { numero?: string; capacite?: number; zone?: string } | null;
  }
  const resaTables: ResaTable[] = ((resaTRes.data ?? []) as ResaTRow[]).map(r => ({
    id: r.id, table_id: r.table_id,
    table_numero: r.table?.numero ?? null,
    zone: r.zone ?? r.table?.zone ?? null,
    date_resa: r.date_resa,
    heure_arrivee: r.heure_arrivee,
    heure_depart: r.heure_depart,
    nb_personnes: Number(r.nb_personnes ?? 1),
    client_nom: r.client_nom,
    client_telephone: r.client_telephone,
    client_email: r.client_email,
    client_id: r.client_id,
    notes: r.notes,
    statut: r.statut as StatutResaTable,
    rappel_envoye: r.rappel_envoye,
  }))

  const evenements: Evenement[] = (evtRes.data ?? []).map(e => ({
    id: e.id as string,
    titre: e.titre as string,
    type: (e.type_evenement as TypeEvenement) ?? null,
    date_evenement: e.date_evenement as string,
    heure_debut: (e.heure_debut as string) ?? null,
    heure_fin: (e.heure_fin as string) ?? null,
    nb_personnes: Number(e.nb_personnes ?? 0),
    prix_par_personne_ht: e.prix_par_personne_ht != null ? Number(e.prix_par_personne_ht) : null,
    taux_tva: Number(e.taux_tva ?? 10),
    montant_devis: Number(e.montant_devis ?? 0),
    acompte_verse: Number(e.acompte_verse ?? 0),
    statut: e.statut as StatutEvent,
    client_nom: (e.client_nom as string) ?? null,
    client_email: (e.client_email as string) ?? null,
    client_telephone: (e.client_telephone as string) ?? null,
    lieu: (e.lieu as string) ?? null,
    privatisation: Boolean(e.privatisation),
    materiel_demande: (e.materiel_demande as string) ?? null,
    besoins_techniques: (e.besoins_techniques as string) ?? null,
    notes: (e.notes as string) ?? null,
  }))

  const tables = (tablesRes.data ?? []).map(t => ({
    id: t.id as string, numero: t.numero as string,
    capacite: Number(t.capacite ?? 2),
    zone: (t.zone as string) ?? 'salle',
  }))

  const profil = await getProfile()
  const readOnly = isReadOnly(profil?.poste, '/admin/reservations', profil?.custom_permissions)
  const showTaches = profil?.poste === 'receptionniste'

  return <ReservationsClient
    data={{ chambres, resaChambres, resaTables, evenements, tables }}
    readOnly={readOnly}
    showTachesDuJour={showTaches}
  />
}
