import { createClient } from '@/lib/supabase/server'
import FacturePrintClient from './FacturePrintClient'
import {
  type Groupe, type MenuGroupe, type Paiement,
  type StatutGroupe, type TypeGroupe, type MethodePaiement, type TypePaiement,
} from '@/lib/groupes'

export const metadata = { title: 'Facture groupe — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export type FactureData = {
  groupe: Groupe
  menus: MenuGroupe[]
  paiements: Paiement[]
  etablissement: Record<string, string>
  numero_facture: string
}

export default async function FacturePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [grpRes, menuRes, paiRes, paramRes] = await Promise.all([
    supabase.from('groupes').select('*, responsable:employes!responsable_employe_id(prenom, nom)').eq('id', id).maybeSingle(),
    supabase.from('groupes_menus').select('*, recette:recettes(nom)').eq('groupe_id', id).order('ordre'),
    supabase.from('groupes_paiements').select('*').eq('groupe_id', id).order('date_paiement'),
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom','etablissement_adresse','etablissement_telephone','etablissement_email','etablissement_siret','etablissement_tva_intra']),
  ])

  const g = grpRes.data
  if (!g) {
    return <div className="p-8 text-center">Groupe introuvable.</div>
  }

  type RespJoin = { prenom?: string; nom?: string } | null
  const resp = g.responsable as RespJoin
  const groupe: Groupe = {
    id: g.id as string,
    nom: g.nom as string,
    type: g.type as TypeGroupe,
    tour_operateur: (g.tour_operateur as string) ?? null,
    contact_nom: (g.contact_nom as string) ?? null,
    contact_telephone: (g.contact_telephone as string) ?? null,
    contact_email: (g.contact_email as string) ?? null,
    date_visite: g.date_visite as string,
    heure_arrivee: (g.heure_arrivee as string) ?? null,
    heure_depart: (g.heure_depart as string) ?? null,
    nb_personnes: Number(g.nb_personnes ?? 0),
    prix_par_personne_ht: Number(g.prix_par_personne_ht ?? 0),
    taux_tva: Number(g.taux_tva ?? 10),
    facturation_via_to: g.facturation_via_to,
    statut: g.statut as StatutGroupe,
    notes: (g.notes as string) ?? null,
    zone_assignee: (g.zone_assignee as string) ?? null,
    responsable_employe_id: (g.responsable_employe_id as string) ?? null,
    responsable_nom: resp ? `${resp.prenom ?? ''} ${resp.nom ?? ''}`.trim() : null,
  }

  type MenuRow = { id: string; groupe_id: string; recette_id: string | null; recette_nom_libre: string | null;
    categorie: string | null; quantite_par_personne: number | string;
    prix_negocie_ht: number | string | null; ordre: number | string; notes: string | null;
    recette?: { nom?: string } | null }
  const menus: MenuGroupe[] = ((menuRes.data ?? []) as MenuRow[]).map(m => ({
    id: m.id, groupe_id: m.groupe_id, recette_id: m.recette_id,
    recette_nom: m.recette?.nom ?? m.recette_nom_libre ?? '— supprimée —',
    categorie: m.categorie,
    quantite_par_personne: Number(m.quantite_par_personne ?? 1),
    prix_negocie_ht: m.prix_negocie_ht != null ? Number(m.prix_negocie_ht) : null,
    ordre: Number(m.ordre ?? 0),
    notes: m.notes,
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

  const etab: Record<string, string> = {}
  for (const p of paramRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  // Numéro de facture déterministe basé sur l'id du groupe
  const numero_facture = `GRP-${g.date_visite.replace(/-/g, '')}-${(g.id as string).slice(0, 4).toUpperCase()}`

  return <FacturePrintClient data={{ groupe, menus, paiements, etablissement: etab, numero_facture }} />
}
