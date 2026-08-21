import { createClient } from '@/lib/supabase/server'
import HygieneClient from './HygieneClient'
import { getProfile } from '@/lib/auth'
import type { PosteWidget } from '@/lib/taches-du-jour'
import type {
  PlanHaccp, Lot, NonConformite, Intervention3D, PlanNettoyage,
  ReleveTemperature, ProcedureHygiene, ChecklistHygiene,
  Employe, IngredientShort, FournisseurShort,
  TypeDanger, StatutLot, TypeNC, Gravite, StatutNC,
  TypeTraitement, Frequence, TypeEquipement, Moment, MomentProcedure,
} from './types'

export const metadata = { title: 'Hygiène & sécurité — Admin' }
export const dynamic = 'force-dynamic'

export default async function HygienePage() {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    employesRes, ingredientsRes, fournisseursRes,
    proceduresRes, checklistsTodayRes, relevesRes,
    haccpRes, lotsRes, ncRes, interventionsRes, planNettoyageRes,
  ] = await Promise.all([
    supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    supabase.from('ingredients').select('id, nom, unite').eq('actif', true).order('nom'),
    supabase.from('fournisseurs').select('id, nom').eq('actif', true).order('nom'),
    supabase.from('procedures_hygiene').select('id, titre, moment, poste_concerne, description, ordre, actif').eq('actif', true).order('moment').order('ordre'),
    supabase.from('checklists_hygiene')
      .select(`id, procedure_id, employe_id, date_realisation, heure_realisation, valide, commentaire, signature_text,
               procedure:procedures_hygiene(titre, moment),
               employe:employes!employe_id(prenom, nom)`)
      .eq('date_realisation', today)
      .order('heure_realisation', { ascending: false }),
    supabase.from('releves_temperatures')
      .select(`id, equipement, type_equipement, temperature, temperature_min_ok, temperature_max_ok, conforme, moment, employe_id, notes, created_at,
               employe:employes!employe_id(prenom, nom)`)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('plans_haccp').select('*').eq('actif', true).order('ccp_numero', { nullsFirst: false }).order('created_at'),
    supabase.from('lots_produits')
      .select(`id, ingredient_id, produit_nom, lot_numero, dlc, fournisseur_id, fournisseur_nom, quantite, unite, bon_commande_id, date_reception, statut, notes, created_at,
               ingredient:ingredients(nom)`)
      .order('date_reception', { ascending: false })
      .limit(200),
    supabase.from('non_conformites')
      .select(`id, date_constat, type, gravite, description, action_corrective, responsable_id, statut, resolved_at, resolved_by, releve_temperature_id, created_at,
               responsable:employes!responsable_id(prenom, nom),
               resolver:employes!resolved_by(prenom, nom)`)
      .order('statut')
      .order('date_constat', { ascending: false })
      .limit(100),
    supabase.from('interventions_antiparasitaire').select('*').order('date_intervention', { ascending: false }).limit(50),
    supabase.from('plan_nettoyage').select('*').eq('actif', true).order('zone').order('ordre'),
  ])

  const employes: Employe[] = (employesRes.data ?? []).map(e => ({
    id: e.id as string, prenom: e.prenom as string, nom: e.nom as string, poste: e.poste as string,
  }))
  const ingredients: IngredientShort[] = (ingredientsRes.data ?? []).map(i => ({
    id: i.id as string, nom: i.nom as string, unite: (i.unite as string) ?? '',
  }))
  const fournisseurs: FournisseurShort[] = (fournisseursRes.data ?? []).map(f => ({
    id: f.id as string, nom: f.nom as string,
  }))

  const procedures: ProcedureHygiene[] = (proceduresRes.data ?? []).map(p => ({
    id: p.id as string, titre: p.titre as string,
    moment: p.moment as MomentProcedure,
    poste_concerne: (p.poste_concerne as string) ?? null,
    description: (p.description as string) ?? null,
    ordre: Number(p.ordre ?? 0),
    actif: Boolean(p.actif ?? true),
  }))

  type CheckRow = { id: string; procedure_id: string; employe_id: string | null;
    date_realisation: string; heure_realisation: string | null; valide: boolean | null;
    commentaire: string | null; signature_text: string | null;
    procedure?: { titre?: string; moment?: string } | null;
    employe?: { prenom?: string; nom?: string } | null }
  const checklistsToday: ChecklistHygiene[] = ((checklistsTodayRes.data ?? []) as CheckRow[]).map(c => {
    const e = c.employe; const pr = c.procedure
    return {
      id: c.id, procedure_id: c.procedure_id,
      procedure_titre: pr?.titre ?? '— Procédure supprimée —',
      procedure_moment: (pr?.moment as MomentProcedure) ?? null,
      employe_id: c.employe_id,
      employe_nom: e ? `${e.prenom ?? ''} ${e.nom ?? ''}`.trim() : null,
      date_realisation: c.date_realisation,
      heure_realisation: c.heure_realisation,
      valide: Boolean(c.valide),
      commentaire: c.commentaire,
      signature_text: c.signature_text,
    }
  })

  type ReleveRow = { id: string; equipement: string; type_equipement: string | null;
    temperature: number | string; temperature_min_ok: number | string | null;
    temperature_max_ok: number | string | null; conforme: boolean | null;
    moment: string | null; employe_id: string | null; notes: string | null; created_at: string;
    employe?: { prenom?: string; nom?: string } | null }
  const releves: ReleveTemperature[] = ((relevesRes.data ?? []) as ReleveRow[]).map(r => {
    const e = r.employe
    return {
      id: r.id, equipement: r.equipement,
      type_equipement: (r.type_equipement as TypeEquipement) ?? null,
      temperature: Number(r.temperature),
      temperature_min_ok: r.temperature_min_ok != null ? Number(r.temperature_min_ok) : null,
      temperature_max_ok: r.temperature_max_ok != null ? Number(r.temperature_max_ok) : null,
      conforme: r.conforme,
      moment: (r.moment as Moment) ?? null,
      employe_id: r.employe_id,
      employe_nom: e ? `${e.prenom ?? ''} ${e.nom ?? ''}`.trim() : null,
      notes: r.notes,
      created_at: r.created_at,
    }
  })

  const haccp: PlanHaccp[] = (haccpRes.data ?? []).map(h => ({
    id: h.id as string, titre: h.titre as string,
    type_danger: h.type_danger as TypeDanger,
    description_danger: h.description_danger as string,
    ccp_numero: h.ccp_numero as number | null,
    mesure_preventive: h.mesure_preventive as string,
    surveillance_methode: (h.surveillance_methode as string) ?? null,
    surveillance_frequence: (h.surveillance_frequence as string) ?? null,
    limite_critique: (h.limite_critique as string) ?? null,
    action_corrective: h.action_corrective as string,
    responsable_poste: (h.responsable_poste as string) ?? null,
    actif: Boolean(h.actif),
    created_at: h.created_at as string,
  }))

  type LotRow = { id: string; ingredient_id: string | null; lot_numero: string;
    dlc: string | null; fournisseur_id: string | null; fournisseur_nom: string | null;
    quantite: number | string; unite: string | null; bon_commande_id: string | null;
    date_reception: string; statut: string; notes: string | null; created_at: string;
    produit_nom: string | null;
    ingredient?: { nom?: string } | null }
  const lots: Lot[] = ((lotsRes.data ?? []) as LotRow[]).map(l => ({
    id: l.id, ingredient_id: l.ingredient_id,
    ingredient_nom: l.ingredient?.nom ?? null,
    produit_nom: l.produit_nom ?? null,
    lot_numero: l.lot_numero,
    dlc: l.dlc, fournisseur_id: l.fournisseur_id,
    fournisseur_nom: l.fournisseur_nom,
    quantite: Number(l.quantite ?? 0),
    unite: l.unite, bon_commande_id: l.bon_commande_id,
    date_reception: l.date_reception, statut: l.statut as StatutLot,
    notes: l.notes, created_at: l.created_at,
  }))

  type NCRow = { id: string; date_constat: string; type: string; gravite: string;
    description: string; action_corrective: string | null; responsable_id: string | null;
    statut: string; resolved_at: string | null; resolved_by: string | null;
    releve_temperature_id: string | null; created_at: string;
    responsable?: { prenom?: string; nom?: string } | null;
    resolver?: { prenom?: string; nom?: string } | null }
  const ncs: NonConformite[] = ((ncRes.data ?? []) as NCRow[]).map(n => {
    const r = n.responsable; const rs = n.resolver
    return {
      id: n.id, date_constat: n.date_constat,
      type: n.type as TypeNC, gravite: n.gravite as Gravite,
      description: n.description, action_corrective: n.action_corrective,
      responsable_id: n.responsable_id,
      responsable_nom: r ? `${r.prenom ?? ''} ${r.nom ?? ''}`.trim() : null,
      statut: n.statut as StatutNC,
      resolved_at: n.resolved_at, resolved_by: n.resolved_by,
      resolved_by_nom: rs ? `${rs.prenom ?? ''} ${rs.nom ?? ''}`.trim() : null,
      releve_temperature_id: n.releve_temperature_id,
      created_at: n.created_at,
    }
  })

  type IntRow = { id: string; date_intervention: string; prestataire: string;
    type_traitement: string; zones: string[] | null; produits_utilises: string | null;
    observations: string | null; prochaine_intervention: string | null;
    document_url: string | null; cout: number | string | null; created_at: string }
  const interventions: Intervention3D[] = ((interventionsRes.data ?? []) as IntRow[]).map(i => ({
    id: i.id, date_intervention: i.date_intervention,
    prestataire: i.prestataire,
    type_traitement: i.type_traitement as TypeTraitement,
    zones: i.zones ?? [],
    produits_utilises: i.produits_utilises,
    observations: i.observations,
    prochaine_intervention: i.prochaine_intervention,
    document_url: i.document_url,
    cout: i.cout != null ? Number(i.cout) : null,
    created_at: i.created_at,
  }))

  const plansNettoyage: PlanNettoyage[] = (planNettoyageRes.data ?? []).map(p => ({
    id: p.id as string, zone: p.zone as string,
    equipement: (p.equipement as string) ?? null,
    frequence: p.frequence as Frequence,
    produit_utilise: (p.produit_utilise as string) ?? null,
    methode: (p.methode as string) ?? null,
    responsable_poste: (p.responsable_poste as string) ?? null,
    ordre: Number(p.ordre ?? 0),
    actif: Boolean(p.actif),
    derniere_execution: (p.derniere_execution as string) ?? null,
    created_at: p.created_at as string,
  }))

  // Détecte le poste de l'utilisateur connecté pour afficher le bon widget
  // Tâches du jour. Manager ne voit pas de widget ici (il a le sien sur
  // /admin/pilotage). Les autres postes voient le leur s'ils en ont un
  // dans la matrice des tâches qui couvre /admin/hygiene.
  const profil = await getProfile()
  let widgetPoste: PosteWidget | null = null
  switch (profil?.poste) {
    case 'plonge': case 'extra':         widgetPoste = 'plonge'; break
    case 'cuisine': case 'cuisinier':    widgetPoste = 'cuisinier'; break
    case 'pizzaiolo':                    widgetPoste = 'pizzaiolo'; break
    case 'salle': case 'serveur':        widgetPoste = 'serveur'; break
    case 'bar': case 'barman':           widgetPoste = 'barman'; break
    case 'second':                       widgetPoste = 'second'; break
    default:                             widgetPoste = null  // manager ou autre
  }

  return (
    <HygieneClient
      employes={employes}
      ingredients={ingredients}
      fournisseurs={fournisseurs}
      procedures={procedures}
      checklistsToday={checklistsToday}
      releves={releves}
      haccp={haccp}
      lots={lots}
      ncs={ncs}
      interventions={interventions}
      plansNettoyage={plansNettoyage}
      widgetPoste={widgetPoste}
    />
  )
}
