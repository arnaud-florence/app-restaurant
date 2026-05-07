import { createClient } from '@/lib/supabase/server'
import ClientsAdmin from './ClientsClient'
import {
  type Client, type Campagne, type Reclamation, type RetourPlat,
  type SegmentCampagne, type StatutCampagne, type TypeCampagne,
  type TypeReclamation, type StatutReclam, type GraviteReclam,
  type MotifRetour,
} from '@/lib/clients'

export const metadata = { title: 'Clients & fidélité — Admin' }
export const dynamic = 'force-dynamic'

export type DataClients = {
  clients: Client[]
  campagnes: Campagne[]
  reclamations: Reclamation[]
  retours: RetourPlat[]
  recettes: { id: string; nom: string }[]
  employes: { id: string; prenom: string; nom: string }[]
}

export default async function ClientsPage() {
  const supabase = await createClient()

  const [cliRes, campRes, recRes, retRes, recetteRes, empRes] = await Promise.all([
    supabase.from('clients')
      .select(`*, parraine_par:clients!parraine_par_id(prenom, nom)`)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('campagnes').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('reclamations')
      .select('*, client:clients!client_id(prenom, nom), responsable:employes!responsable_id(prenom, nom)')
      .order('date_reclamation', { ascending: false })
      .limit(100),
    supabase.from('retours_plats')
      .select('*, client:clients!client_id(prenom, nom), recette:recettes!recette_id(nom), responsable:employes!responsable_id(prenom, nom)')
      .order('date_retour', { ascending: false })
      .limit(100),
    supabase.from('recettes').select('id, nom').eq('actif', true).order('nom'),
    supabase.from('employes').select('id, prenom, nom').eq('actif', true).order('prenom'),
  ])

  type CliRow = {
    id: string; prenom: string | null; nom: string;
    email: string | null; telephone: string | null; adresse: string | null;
    date_naissance: string | null; allergies: string[] | null;
    preferences: string | null; points_fidelite: number | string;
    niveau_fidelite: string; notes_internes: string | null;
    code_parrainage: string | null; parraine_par_id: string | null;
    opt_in_marketing: boolean; total_depense: number | string;
    nb_visites: number | string; derniere_visite: string | null;
    created_at: string;
    parraine_par?: { prenom?: string; nom?: string } | null;
  }
  const clients: Client[] = ((cliRes.data ?? []) as CliRow[]).map(c => ({
    id: c.id,
    prenom: c.prenom,
    nom: c.nom,
    email: c.email,
    telephone: c.telephone,
    adresse: c.adresse,
    date_naissance: c.date_naissance,
    allergies: c.allergies ?? [],
    preferences: c.preferences,
    points_fidelite: Number(c.points_fidelite ?? 0),
    niveau_fidelite: c.niveau_fidelite,
    notes_internes: c.notes_internes,
    code_parrainage: c.code_parrainage,
    parraine_par_id: c.parraine_par_id,
    parraine_par_nom: c.parraine_par ? `${c.parraine_par.prenom ?? ''} ${c.parraine_par.nom ?? ''}`.trim() : null,
    opt_in_marketing: c.opt_in_marketing,
    total_depense: Number(c.total_depense ?? 0),
    nb_visites: Number(c.nb_visites ?? 0),
    derniere_visite: c.derniere_visite,
    created_at: c.created_at,
  }))

  const campagnes: Campagne[] = (campRes.data ?? []).map(c => ({
    id: c.id as string,
    titre: c.titre as string,
    type: c.type as TypeCampagne,
    segment: c.segment as SegmentCampagne,
    segment_filtre: (c.segment_filtre as Record<string, unknown>) ?? null,
    sujet: (c.sujet as string) ?? null,
    contenu: c.contenu as string,
    nb_destinataires: Number(c.nb_destinataires ?? 0),
    date_envoi: (c.date_envoi as string) ?? null,
    statut: c.statut as StatutCampagne,
    notes: (c.notes as string) ?? null,
    created_at: c.created_at as string,
  }))

  type RecRow = {
    id: string; client_id: string | null; client_nom_libre: string | null;
    date_reclamation: string; type: string; gravite: string;
    description: string; statut: string; action_corrective: string | null;
    geste_commercial: string | null; resolved_at: string | null;
    responsable_id: string | null; notes: string | null;
    client?: { prenom?: string; nom?: string } | null;
    responsable?: { prenom?: string; nom?: string } | null;
  }
  const reclamations: Reclamation[] = ((recRes.data ?? []) as RecRow[]).map(r => ({
    id: r.id,
    client_id: r.client_id,
    client_nom: r.client ? `${r.client.prenom ?? ''} ${r.client.nom ?? ''}`.trim() : (r.client_nom_libre ?? '— Anonyme —'),
    client_nom_libre: r.client_nom_libre,
    date_reclamation: r.date_reclamation,
    type: r.type as TypeReclamation,
    gravite: r.gravite as GraviteReclam,
    description: r.description,
    statut: r.statut as StatutReclam,
    action_corrective: r.action_corrective,
    geste_commercial: r.geste_commercial,
    resolved_at: r.resolved_at,
    responsable_id: r.responsable_id,
    responsable_nom: r.responsable ? `${r.responsable.prenom ?? ''} ${r.responsable.nom ?? ''}`.trim() : null,
    notes: r.notes,
  }))

  type RetRow = {
    id: string; client_id: string | null; date_retour: string;
    recette_id: string | null; recette_nom_libre: string | null;
    motif: string; description: string | null;
    cout_food_cost: number | string; geste_commercial: string | null;
    refait: boolean; notes: string | null;
    responsable_id: string | null;
    client?: { prenom?: string; nom?: string } | null;
    recette?: { nom?: string } | null;
    responsable?: { prenom?: string; nom?: string } | null;
  }
  const retours: RetourPlat[] = ((retRes.data ?? []) as RetRow[]).map(r => ({
    id: r.id,
    client_id: r.client_id,
    client_nom: r.client ? `${r.client.prenom ?? ''} ${r.client.nom ?? ''}`.trim() : null,
    date_retour: r.date_retour,
    recette_id: r.recette_id,
    recette_nom: r.recette?.nom ?? r.recette_nom_libre ?? '— supprimée —',
    motif: r.motif as MotifRetour,
    description: r.description,
    cout_food_cost: Number(r.cout_food_cost ?? 0),
    geste_commercial: r.geste_commercial,
    refait: r.refait,
    notes: r.notes,
    responsable_id: r.responsable_id,
    responsable_nom: r.responsable ? `${r.responsable.prenom ?? ''} ${r.responsable.nom ?? ''}`.trim() : null,
  }))

  const recettes = (recetteRes.data ?? []).map(r => ({ id: r.id as string, nom: r.nom as string }))
  const employes = (empRes.data ?? []).map(e => ({ id: e.id as string, prenom: e.prenom as string, nom: e.nom as string }))

  return <ClientsAdmin data={{ clients, campagnes, reclamations, retours, recettes, employes }} />
}
