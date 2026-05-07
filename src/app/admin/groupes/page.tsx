import { createClient } from '@/lib/supabase/server'
import GroupesClient from './GroupesClient'
import { type Groupe, type Paiement, type MenuGroupe, type StatutGroupe, type TypeGroupe, type MethodePaiement, type TypePaiement } from '@/lib/groupes'

export const metadata = { title: 'Groupes — Admin' }
export const dynamic = 'force-dynamic'

export type DataGroupes = {
  groupes: Groupe[]
  paiements: Paiement[]
  menus: MenuGroupe[]
  employes: { id: string; prenom: string; nom: string }[]
  recettes: { id: string; nom: string; categorie: string; prix_vente_ht: number }[]
}

export default async function GroupesPage() {
  const supabase = await createClient()

  const [grpRes, paiRes, menuRes, empRes, recRes] = await Promise.all([
    supabase.from('groupes')
      .select('*, responsable:employes!responsable_employe_id(prenom, nom)')
      .order('date_visite', { ascending: false }),
    supabase.from('groupes_paiements').select('*').order('date_paiement', { ascending: false }),
    supabase.from('groupes_menus')
      .select('*, recette:recettes(nom)')
      .order('ordre'),
    supabase.from('employes').select('id, prenom, nom').eq('actif', true).order('prenom'),
    supabase.from('recettes').select('id, nom, categorie, prix_vente_ht').eq('actif', true).order('categorie').order('nom'),
  ])

  type GrpRow = {
    id: string; nom: string; type: string;
    tour_operateur: string | null; contact_nom: string | null;
    contact_telephone: string | null; contact_email: string | null;
    date_visite: string; heure_arrivee: string | null; heure_depart: string | null;
    nb_personnes: number | string; prix_par_personne_ht: number | string;
    taux_tva: number | string; facturation_via_to: boolean;
    statut: string; notes: string | null; zone_assignee: string | null;
    responsable_employe_id: string | null;
    responsable?: { prenom?: string; nom?: string } | null;
  }
  const groupes: Groupe[] = ((grpRes.data ?? []) as GrpRow[]).map(g => ({
    id: g.id, nom: g.nom, type: g.type as TypeGroupe,
    tour_operateur: g.tour_operateur, contact_nom: g.contact_nom,
    contact_telephone: g.contact_telephone, contact_email: g.contact_email,
    date_visite: g.date_visite, heure_arrivee: g.heure_arrivee, heure_depart: g.heure_depart,
    nb_personnes: Number(g.nb_personnes ?? 0),
    prix_par_personne_ht: Number(g.prix_par_personne_ht ?? 0),
    taux_tva: Number(g.taux_tva ?? 10),
    facturation_via_to: g.facturation_via_to,
    statut: g.statut as StatutGroupe,
    notes: g.notes, zone_assignee: g.zone_assignee,
    responsable_employe_id: g.responsable_employe_id,
    responsable_nom: g.responsable ? `${g.responsable.prenom ?? ''} ${g.responsable.nom ?? ''}`.trim() : null,
  }))

  const paiements: Paiement[] = (paiRes.data ?? []).map(p => ({
    id: p.id as string,
    groupe_id: p.groupe_id as string,
    type: p.type as TypePaiement,
    date_paiement: p.date_paiement as string,
    montant: Number(p.montant ?? 0),
    methode: p.methode as MethodePaiement,
    reference: (p.reference as string) ?? null,
    notes: (p.notes as string) ?? null,
  }))

  type MenuRow = { id: string; groupe_id: string; recette_id: string | null;
    recette_nom_libre: string | null; categorie: string | null;
    quantite_par_personne: number | string; prix_negocie_ht: number | string | null;
    ordre: number | string; notes: string | null;
    recette?: { nom?: string } | null }
  const menus: MenuGroupe[] = ((menuRes.data ?? []) as MenuRow[]).map(m => ({
    id: m.id,
    groupe_id: m.groupe_id,
    recette_id: m.recette_id,
    recette_nom: m.recette?.nom ?? m.recette_nom_libre ?? '— supprimée —',
    categorie: m.categorie,
    quantite_par_personne: Number(m.quantite_par_personne ?? 1),
    prix_negocie_ht: m.prix_negocie_ht != null ? Number(m.prix_negocie_ht) : null,
    ordre: Number(m.ordre ?? 0),
    notes: m.notes,
  }))

  const employes = (empRes.data ?? []).map(e => ({ id: e.id as string, prenom: e.prenom as string, nom: e.nom as string }))
  const recettes = (recRes.data ?? []).map(r => ({
    id: r.id as string, nom: r.nom as string, categorie: r.categorie as string, prix_vente_ht: Number(r.prix_vente_ht ?? 0),
  }))

  return <GroupesClient data={{ groupes, paiements, menus, employes, recettes }} />
}
