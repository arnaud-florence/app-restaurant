import { createClient } from '@/lib/supabase/server'
import RhClient from './RhClient'
import {
  type Employe, type Document, type Formation, type Shift, type Pointage, type Conge,
  type TypeDocument, type TypeFormation, intervalleMois, joursDeLaSemaine, heuresEntre, coutShift, joursConge,
  lundiDeLaSemaine, coutSemaineAvecHeuresSup,
} from '@/lib/rh'

export const metadata = { title: 'Ressources humaines — Admin' }
export const dynamic = 'force-dynamic'

export type ProductiviteServeur = {
  serveur_id: string | null
  serveur_nom: string
  ca_genere: number
  pourboires: number
  heures_pointees: number
  ca_par_heure: number
}

export type DataRH = {
  refDate: string         // ISO date de référence (semaine + mois)
  employes: Employe[]
  documents: Document[]
  formations: Formation[]
  shiftsSemaine: Shift[]
  pointagesJour: Pointage[]
  conges: Conge[]
  joursSemaine: { iso: string; label: string }[]
  // KPI mois
  masseSalarialeMois: number
  caTTCMois: number
  pourboiresMois: number
  productivite: ProductiviteServeur[]
}

export default async function RhPage() {
  const supabase = await createClient()
  const refDate = new Date()
  const refIso = refDate.toISOString().slice(0, 10)
  const sem = joursDeLaSemaine(refDate)
  const mois = intervalleMois(refDate)

  const [
    empRes, docsRes, formRes,
    shiftsRes, pointageRes, congesRes,
    paiementsRes,
  ] = await Promise.all([
    supabase.from('employes')
      .select('id, prenom, nom, poste, type_contrat, email, telephone, salaire_horaire, heures_contrat, date_embauche, date_sortie, solde_conges_jours, notes_internes, actif, created_at, autonomie_reception, autonomie_commande, autonomie_modif_recettes, autonomie_voir_prix, pin_hash')
      .order('actif', { ascending: false })
      .order('prenom'),
    supabase.from('documents_employes').select('*').order('created_at', { ascending: false }),
    supabase.from('formations_employes').select('*').order('date_obtention', { ascending: false }),
    supabase.from('planning')
      .select('id, employe_id, date_travail, heure_debut, heure_fin, poste_jour, notes')
      .gte('date_travail', sem[0].iso)
      .lte('date_travail', sem[6].iso)
      .order('date_travail').order('heure_debut'),
    supabase.from('pointage')
      .select('id, employe_id, date_pointage, heure_arrivee, heure_depart, heures_travaillees, notes')
      .eq('date_pointage', refIso)
      .order('heure_arrivee'),
    supabase.from('conges')
      .select('id, employe_id, date_debut, date_fin, type, statut, notes')
      .or(`statut.eq.demande,date_fin.gte.${refIso}`)
      .order('statut').order('date_debut'),
    supabase.from('paiements_caisse')
      .select('montant, pourboire, serveur_id, encaisse_at, serveur:employes!serveur_id(prenom, nom)')
      .gte('encaisse_at', mois.debut)
      .lte('encaisse_at', mois.fin + 'T23:59:59'),
  ])

  const employes: Employe[] = (empRes.data ?? []).map(e => ({
    id: e.id as string,
    prenom: e.prenom as string,
    nom: e.nom as string,
    poste: e.poste as string,
    type_contrat: e.type_contrat as string,
    email: (e.email as string) ?? null,
    telephone: (e.telephone as string) ?? null,
    salaire_horaire: Number(e.salaire_horaire ?? 0),
    heures_contrat: Number(e.heures_contrat ?? 0),
    date_embauche: (e.date_embauche as string) ?? null,
    date_sortie: (e.date_sortie as string) ?? null,
    solde_conges_jours: Number(e.solde_conges_jours ?? 0),
    notes_internes: (e.notes_internes as string) ?? null,
    actif: Boolean(e.actif),
    created_at: e.created_at as string,
  }))
  const empById = new Map(employes.map(e => [e.id, e]))
  const empNom = (id: string | null) => {
    if (!id) return '— Non attribué —'
    const e = empById.get(id)
    return e ? `${e.prenom} ${e.nom}` : '— Inconnu —'
  }

  const documents: Document[] = (docsRes.data ?? []).map(d => ({
    id: d.id as string,
    employe_id: d.employe_id as string,
    type: d.type as TypeDocument,
    nom: d.nom as string,
    url: d.url as string,
    date_emission: (d.date_emission as string) ?? null,
    date_expiration: (d.date_expiration as string) ?? null,
    notes: (d.notes as string) ?? null,
    created_at: d.created_at as string,
  }))

  const formations: Formation[] = (formRes.data ?? []).map(f => ({
    id: f.id as string,
    employe_id: f.employe_id as string,
    formation: f.formation as TypeFormation,
    titre: f.titre as string,
    organisme: (f.organisme as string) ?? null,
    date_obtention: f.date_obtention as string,
    date_expiration: (f.date_expiration as string) ?? null,
    document_url: (f.document_url as string) ?? null,
    notes: (f.notes as string) ?? null,
    created_at: f.created_at as string,
  }))

  const shiftsSemaine: Shift[] = (shiftsRes.data ?? []).map(s => {
    const emp = empById.get(s.employe_id as string)
    const sal = emp?.salaire_horaire ?? 0
    return {
      id: s.id as string,
      employe_id: s.employe_id as string,
      employe_nom: empNom(s.employe_id as string),
      date_travail: s.date_travail as string,
      heure_debut: s.heure_debut as string,
      heure_fin: s.heure_fin as string,
      poste_jour: (s.poste_jour as string) ?? null,
      notes: (s.notes as string) ?? null,
      heures: heuresEntre(s.heure_debut as string, s.heure_fin as string),
      cout: coutShift(s.heure_debut as string, s.heure_fin as string, sal),
    }
  })

  const pointagesJour: Pointage[] = (pointageRes.data ?? []).map(p => ({
    id: p.id as string,
    employe_id: p.employe_id as string,
    employe_nom: empNom(p.employe_id as string),
    date_pointage: p.date_pointage as string,
    heure_arrivee: (p.heure_arrivee as string) ?? null,
    heure_depart: (p.heure_depart as string) ?? null,
    heures_travaillees: p.heures_travaillees != null ? Number(p.heures_travaillees) : null,
    notes: (p.notes as string) ?? null,
  }))

  const conges: Conge[] = (congesRes.data ?? []).map(c => ({
    id: c.id as string,
    employe_id: c.employe_id as string,
    employe_nom: empNom(c.employe_id as string),
    date_debut: c.date_debut as string,
    date_fin: c.date_fin as string,
    type: c.type as Conge['type'],
    statut: c.statut as Conge['statut'],
    notes: (c.notes as string) ?? null,
    jours: joursConge(c.date_debut as string, c.date_fin as string),
  }))

  // ─── KPI Paie ────────────────────────────────────────────────────
  // Masse salariale du mois = coût réel, heures supplémentaires incluses.
  //  1. Heures par (employé, jour) : on privilégie le POINTAGE réel ; à défaut de
  //     pointage ce jour-là, on retombe sur le PLANNING (prévisionnel).
  //  2. On regroupe par semaine (lundi) et on applique la majoration légale heures
  //     sup (35h normal · 36-43h +25% · >43h +50%), au taux horaire de chacun.
  const heuresParEmpJour = new Map<string, Map<string, number>>()  // empId → 'YYYY-MM-DD' → heures
  const ensureJour = (empId: string) => {
    let m = heuresParEmpJour.get(empId)
    if (!m) { m = new Map(); heuresParEmpJour.set(empId, m) }
    return m
  }

  // 1a. Planning (fallback)
  const { data: shiftsMoisRes } = await supabase
    .from('planning')
    .select('employe_id, date_travail, heure_debut, heure_fin')
    .gte('date_travail', mois.debut)
    .lte('date_travail', mois.fin)
  for (const s of (shiftsMoisRes ?? [])) {
    const empId = s.employe_id as string
    const jour = s.date_travail as string
    const h = heuresEntre(s.heure_debut as string, s.heure_fin as string)
    const m = ensureJour(empId)
    m.set(jour, (m.get(jour) ?? 0) + h)
  }
  // 1b. Pointage réel (écrase le planning sur les jours réellement pointés)
  const { data: pointagesPaieRes } = await supabase
    .from('pointage')
    .select('employe_id, date_pointage, heures_travaillees')
    .gte('date_pointage', mois.debut)
    .lte('date_pointage', mois.fin)
    .not('heures_travaillees', 'is', null)
  const joursPointes = new Set<string>()  // 'empId|jour' déjà remplacés par le pointage
  for (const p of (pointagesPaieRes ?? [])) {
    const empId = p.employe_id as string
    const jour = p.date_pointage as string
    const key = empId + '|' + jour
    const m = ensureJour(empId)
    const h = Number(p.heures_travaillees ?? 0)
    if (!joursPointes.has(key)) { m.set(jour, h); joursPointes.add(key) }   // remplace le planning
    else m.set(jour, (m.get(jour) ?? 0) + h)                                 // 2ᵉ pointage du jour → cumule
  }
  // 2. Regroupe par semaine + majoration heures sup, au taux de chaque employé
  let masseSalarialeMois = 0
  for (const [empId, parJour] of heuresParEmpJour) {
    const rate = empById.get(empId)?.salaire_horaire ?? 0
    if (rate <= 0) continue
    const parSemaine = new Map<string, number>()
    for (const [jour, h] of parJour) {
      const sem = lundiDeLaSemaine(jour)
      parSemaine.set(sem, (parSemaine.get(sem) ?? 0) + h)
    }
    for (const hSem of parSemaine.values()) masseSalarialeMois += coutSemaineAvecHeuresSup(hSem, rate)
  }
  masseSalarialeMois = Math.round(masseSalarialeMois * 100) / 100

  // CA TTC du mois = sum paiements_caisse.montant
  type PaiementRow = {
    montant: number | string
    pourboire: number | string
    serveur_id: string | null
    serveur?: { prenom?: string; nom?: string } | null
  }
  const paiementsMois = (paiementsRes.data ?? []) as PaiementRow[]
  const caTTCMois = Math.round(paiementsMois.reduce((s, p) => s + Number(p.montant ?? 0), 0) * 100) / 100
  const pourboiresMois = Math.round(paiementsMois.reduce((s, p) => s + Number(p.pourboire ?? 0), 0) * 100) / 100

  // Productivité par serveur (CA généré + tips + heures pointées)
  const { data: pointagesMoisRes } = await supabase
    .from('pointage')
    .select('employe_id, heures_travaillees')
    .gte('date_pointage', mois.debut)
    .lte('date_pointage', mois.fin)
    .not('heures_travaillees', 'is', null)
  const heuresMois = new Map<string, number>()
  for (const p of (pointagesMoisRes ?? [])) {
    const id = p.employe_id as string
    heuresMois.set(id, (heuresMois.get(id) ?? 0) + Number(p.heures_travaillees ?? 0))
  }

  const prodMap = new Map<string, ProductiviteServeur>()
  for (const p of paiementsMois) {
    const sid = p.serveur_id ?? '__none__'
    const cur = prodMap.get(sid) ?? {
      serveur_id: p.serveur_id,
      serveur_nom: p.serveur ? `${p.serveur.prenom ?? ''} ${p.serveur.nom ?? ''}`.trim() : '— Non attribué —',
      ca_genere: 0, pourboires: 0, heures_pointees: 0, ca_par_heure: 0,
    }
    cur.ca_genere += Number(p.montant ?? 0)
    cur.pourboires += Number(p.pourboire ?? 0)
    prodMap.set(sid, cur)
  }
  for (const [id, prod] of prodMap) {
    if (id !== '__none__') {
      prod.heures_pointees = Math.round((heuresMois.get(id) ?? 0) * 100) / 100
      prod.ca_par_heure = prod.heures_pointees > 0 ? Math.round((prod.ca_genere / prod.heures_pointees) * 100) / 100 : 0
    }
    prod.ca_genere = Math.round(prod.ca_genere * 100) / 100
    prod.pourboires = Math.round(prod.pourboires * 100) / 100
  }
  const productivite = Array.from(prodMap.values()).sort((a, b) => b.ca_genere - a.ca_genere)

  const data: DataRH = {
    refDate: refIso,
    employes,
    documents,
    formations,
    shiftsSemaine,
    pointagesJour,
    conges,
    joursSemaine: sem.map(j => ({ iso: j.iso, label: j.label })),
    masseSalarialeMois,
    caTTCMois,
    pourboiresMois,
    productivite,
  }

  return <RhClient data={data} />
}
