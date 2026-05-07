import { createClient } from '@/lib/supabase/server'
import FinancesClient from './FinancesClient'
import { chargerCRMois } from './actions'
import {
  type ChargeFixe, type NoteDeFrais, type CategorieCharge, type FrequenceCharge, type StatutNDF,
  intervalleMoisIso, projeterTresorerie,
} from '@/lib/finances'
import { format } from 'date-fns'

export const metadata = { title: 'Finances & pilotage — Admin' }
export const dynamic = 'force-dynamic'

export default async function FinancesPage() {
  const supabase = await createClient()
  const today = new Date()
  const moisIso = format(today, 'yyyy-MM')
  const mois = intervalleMoisIso(today)

  const [
    chargesRes, ndfRes, employesRes, paramsRes, paiements30jRes,
    crData,
  ] = await Promise.all([
    supabase.from('charges_fixes').select('*').eq('actif', true).order('prochaine_echeance', { nullsFirst: false }),
    supabase.from('notes_de_frais')
      .select(`*,
               employe:employes!employe_id(prenom, nom),
               rembourseur:employes!remboursee_par(prenom, nom)`)
      .order('date_depense', { ascending: false })
      .limit(100),
    supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    supabase.from('parametres').select('cle, valeur').in('cle', ['tresorerie_solde','tresorerie_solde_date']),
    supabase.from('paiements_caisse')
      .select('montant, encaisse_at')
      .gte('encaisse_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('encaisse_at'),
    chargerCRMois(moisIso),
  ])

  const charges: ChargeFixe[] = (chargesRes.data ?? []).map(c => ({
    id: c.id as string,
    libelle: c.libelle as string,
    categorie: c.categorie as CategorieCharge,
    montant_ht: Number(c.montant_ht ?? 0),
    montant_ttc: Number(c.montant_ttc ?? 0),
    frequence: c.frequence as FrequenceCharge,
    jour_prelevement: (c.jour_prelevement as number) ?? null,
    prochaine_echeance: (c.prochaine_echeance as string) ?? null,
    fournisseur_nom: (c.fournisseur_nom as string) ?? null,
    iban: (c.iban as string) ?? null,
    notes: (c.notes as string) ?? null,
    actif: Boolean(c.actif),
  }))

  type NDFRow = {
    id: string; employe_id: string; date_depense: string; libelle: string;
    motif: string | null; montant: number | string; justificatif_url: string | null;
    statut: string; remboursee_at: string | null; notes_admin: string | null; created_at: string;
    employe?: { prenom?: string; nom?: string } | null;
    rembourseur?: { prenom?: string; nom?: string } | null;
  }
  const notes: NoteDeFrais[] = ((ndfRes.data ?? []) as NDFRow[]).map(n => ({
    id: n.id,
    employe_id: n.employe_id,
    employe_nom: n.employe ? `${n.employe.prenom ?? ''} ${n.employe.nom ?? ''}`.trim() : '— Inconnu —',
    date_depense: n.date_depense,
    libelle: n.libelle,
    motif: n.motif,
    montant: Number(n.montant ?? 0),
    justificatif_url: n.justificatif_url,
    statut: n.statut as StatutNDF,
    remboursee_at: n.remboursee_at,
    remboursee_par_nom: n.rembourseur ? `${n.rembourseur.prenom ?? ''} ${n.rembourseur.nom ?? ''}`.trim() : null,
    notes_admin: n.notes_admin,
    created_at: n.created_at,
  }))

  const employes = (employesRes.data ?? []).map(e => ({
    id: e.id as string, prenom: e.prenom as string, nom: e.nom as string, poste: e.poste as string,
  }))

  const params = Object.fromEntries((paramsRes.data ?? []).map(p => [p.cle as string, p.valeur as string]))
  const tresorSolde = params.tresorerie_solde ? Number(params.tresorerie_solde) : 0
  const tresorDate = params.tresorerie_solde_date || mois.debut

  // CA moyen jour sur les 30 derniers jours
  const ca30j = (paiements30jRes.data ?? []).reduce((s, p) => s + Number(p.montant ?? 0), 0)
  const caJourMoyen = Math.round((ca30j / 30) * 100) / 100

  // Charges à venir = charges fixes avec prochaine_echeance dans les 90 prochains jours
  const dateMax = new Date(tresorDate)
  dateMax.setDate(dateMax.getDate() + 90)
  const chargesAVenir = charges
    .filter(c => c.actif && c.prochaine_echeance && new Date(c.prochaine_echeance) > new Date(tresorDate) && new Date(c.prochaine_echeance) <= dateMax)
    .map(c => ({ date: c.prochaine_echeance!, montant: c.montant_ttc, libelle: c.libelle }))

  const projection = projeterTresorerie({
    solde_initial: tresorSolde,
    date_solde: tresorDate,
    ca_jour_moyen: caJourMoyen,
    charges_a_venir: chargesAVenir,
  })

  return (
    <FinancesClient
      cr={crData.cr}
      tva={crData.tva}
      moisLibelle={crData.libelle}
      moisIso={moisIso}
      charges={charges}
      notes={notes}
      employes={employes}
      tresorSolde={tresorSolde}
      tresorDate={tresorDate}
      caJourMoyen={caJourMoyen}
      projection={projection}
    />
  )
}
