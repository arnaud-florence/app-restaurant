// Bilan mensuel comptable — page imprimable.
// Regroupe : CA + ventilation TVA + masse salariale + charges fixes + Z-reports + notes de frais.
// Manager only. Impression via window.print().

import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import BilanClient from './BilanClient'

export const metadata = { title: 'Bilan comptable mensuel' }
export const dynamic = 'force-dynamic'

type Props = { searchParams: { mois?: string } }

export default async function BilanMensuelPage({ searchParams }: Props) {
  await requireManager()
  const moisIso = searchParams.mois ?? new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(moisIso)) {
    return <div className="p-8 text-red-700">Format mois invalide. Attendu : YYYY-MM</div>
  }

  const supabase = await createClient()
  const debut = `${moisIso}-01T00:00:00`
  const finDate = new Date(moisIso + '-01')
  finDate.setMonth(finDate.getMonth() + 1)
  const fin = finDate.toISOString().slice(0, 10) + 'T00:00:00'
  const moisDateOnly = `${moisIso}-01`

  const [
    cmdsRes, sessionsRes, ndfRes, employesRes, pointagesRes, chargesRes, paramsRes,
  ] = await Promise.all([
    supabase.from('commandes')
      .select('id, statut, consommation, montant_total_ht, tva_total, montant_total_ttc, created_at, ventilation_tva')
      .eq('statut', 'encaisse')
      .gte('created_at', debut).lt('created_at', fin),
    supabase.from('sessions_caisse')
      .select('id, date_session, ouverte_at, fermee_at, fond_initial, fond_final, ca_attendu, ca_compte')
      .gte('date_session', moisDateOnly)
      .lt('date_session', fin.slice(0, 10))
      .order('date_session', { ascending: false }),
    supabase.from('notes_de_frais')
      .select('id, employe_id, date_depense, libelle, montant, statut, employe:employes!employe_id(prenom, nom)')
      .gte('date_depense', moisDateOnly)
      .lt('date_depense', fin.slice(0, 10))
      .order('date_depense'),
    supabase.from('employes').select('id, prenom, nom, poste, type_contrat, salaire_horaire, coef_charges_patronales, avantages_mensuel_eur').eq('actif', true).order('prenom'),
    supabase.from('pointage')
      .select('employe_id, heures_travaillees')
      .gte('date_pointage', moisDateOnly)
      .lt('date_pointage', fin.slice(0, 10)),
    supabase.from('charges_fixes_recurrentes')
      .select('categorie, libelle, montant_mensuel_eur, fournisseur')
      .eq('actif', true)
      .order('categorie').order('libelle'),
    supabase.from('parametres').select('cle, valeur')
      .in('cle', ['etablissement_nom', 'etablissement_adresse', 'etablissement_siret', 'etablissement_tva_intra']),
  ])

  type Cmd = { statut: string; consommation: string | null; montant_total_ht: number; tva_total: number; montant_total_ttc: number; ventilation_tva: Record<string, number> | null }
  type Session = { id: string; date_session: string; ouverte_at: string; fermee_at: string | null; fond_initial: number; fond_final: number | null; ca_attendu: number | null; ca_compte: number | null }
  type Ndf = { id: string; date_depense: string; libelle: string; montant: number; statut: string; employe?: { prenom?: string; nom?: string } | null }
  type Emp = { id: string; prenom: string; nom: string; poste: string; type_contrat: string; salaire_horaire: number; coef_charges_patronales: number; avantages_mensuel_eur: number }
  type Charge = { categorie: string; libelle: string; montant_mensuel_eur: number; fournisseur: string | null }

  const cmds = (cmdsRes.data ?? []) as Cmd[]
  const sessions = (sessionsRes.data ?? []) as Session[]
  const ndfs = (ndfRes.data ?? []) as Ndf[]
  const employes = (employesRes.data ?? []) as Emp[]
  const charges = (chargesRes.data ?? []) as Charge[]
  const params = Object.fromEntries((paramsRes.data ?? []).map(p => [p.cle as string, p.valeur as string]))

  // Heures par employé
  const heuresByEmp = new Map<string, number>()
  for (const p of pointagesRes.data ?? []) {
    const k = p.employe_id as string
    heuresByEmp.set(k, (heuresByEmp.get(k) ?? 0) + Number(p.heures_travaillees ?? 0))
  }

  // Agrégats CA / TVA
  const totalHt  = cmds.reduce((s, c) => s + Number(c.montant_total_ht ?? 0), 0)
  const totalTva = cmds.reduce((s, c) => s + Number(c.tva_total ?? 0), 0)
  const totalTtc = cmds.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const ventilation = new Map<string, number>()
  for (const c of cmds) {
    if (!c.ventilation_tva) continue
    for (const [t, v] of Object.entries(c.ventilation_tva)) {
      ventilation.set(t, (ventilation.get(t) ?? 0) + Number(v ?? 0))
    }
  }
  const tvaByTaux = Array.from(ventilation.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([t, v]) => ({ taux: t, montant: Math.round(v * 100) / 100 }))

  // Masse salariale prévisible (heures × tarif × coef + avantages mensuel /4)
  type EmpRow = { id: string; prenom: string; nom: string; poste: string; type_contrat: string; heures: number; brut: number; cout_emp: number; avantages: number; total: number }
  const ms: EmpRow[] = employes.map(e => {
    const heures = heuresByEmp.get(e.id) ?? 0
    const tarif  = Number(e.salaire_horaire ?? 0)
    const coef   = Number(e.coef_charges_patronales ?? 1.45)
    const av     = Number(e.avantages_mensuel_eur ?? 0)
    const brut   = heures * tarif
    const cout_emp = brut * coef
    const total = cout_emp + av
    return { id: e.id, prenom: e.prenom, nom: e.nom, poste: e.poste, type_contrat: e.type_contrat, heures: round(heures), brut: round(brut), cout_emp: round(cout_emp), avantages: round(av), total: round(total) }
  })
  const totalMs = ms.reduce((s, e) => s + e.total, 0)

  // Charges fixes total
  const totalChargesFixes = charges.reduce((s, c) => s + Number(c.montant_mensuel_eur ?? 0), 0)

  // Notes de frais (remboursées vs en attente)
  const ndfRembourse = ndfs.filter(n => n.statut === 'remboursee').reduce((s, n) => s + Number(n.montant ?? 0), 0)
  const ndfEnAttente = ndfs.filter(n => n.statut !== 'remboursee').reduce((s, n) => s + Number(n.montant ?? 0), 0)

  // Z-reports stats
  const zCount = sessions.filter(s => s.fermee_at != null).length
  const zEcarts = sessions
    .filter(s => s.ca_compte != null && s.ca_attendu != null)
    .map(s => Number(s.ca_compte) - Number(s.ca_attendu))
  const ecartTotal = zEcarts.reduce((s, e) => s + e, 0)

  return (
    <BilanClient
      moisIso={moisIso}
      etablissement={{
        nom:        params.etablissement_nom        ?? 'Mon restaurant',
        adresse:    params.etablissement_adresse    ?? '',
        siret:      params.etablissement_siret      ?? '',
        tva_intra:  params.etablissement_tva_intra  ?? '',
      }}
      ca={{
        nb_commandes: cmds.length,
        ht: round(totalHt), tva: round(totalTva), ttc: round(totalTtc),
        ventilation: tvaByTaux,
      }}
      masseSalariale={{ employes: ms, total: round(totalMs) }}
      chargesFixes={{
        lignes: charges.map(c => ({ categorie: c.categorie, libelle: c.libelle, fournisseur: c.fournisseur, montant: Number(c.montant_mensuel_eur) })),
        total: round(totalChargesFixes),
      }}
      zReports={{
        nb: zCount,
        ecart_total: round(ecartTotal),
        sessions: sessions.map(s => ({
          date: s.date_session,
          fond_init: Number(s.fond_initial ?? 0),
          fond_final: Number(s.fond_final ?? 0),
          ca_attendu: Number(s.ca_attendu ?? 0),
          ca_compte: Number(s.ca_compte ?? 0),
          ecart: Number(s.ca_compte ?? 0) - Number(s.ca_attendu ?? 0),
          fermee: !!s.fermee_at,
        })),
      }}
      ndfs={{
        rembourse: round(ndfRembourse),
        en_attente: round(ndfEnAttente),
        total: round(ndfRembourse + ndfEnAttente),
        lignes: ndfs.map(n => ({
          date: n.date_depense,
          employe_nom: n.employe ? `${n.employe.prenom ?? ''} ${n.employe.nom ?? ''}`.trim() : '—',
          libelle: n.libelle,
          montant: Number(n.montant ?? 0),
          statut: n.statut,
        })),
      }}
      synthese={{
        ca_ht: round(totalHt),
        tva_a_reverser: round(totalTva),
        masse_salariale: round(totalMs),
        charges_fixes: round(totalChargesFixes),
        ndfs: round(ndfRembourse + ndfEnAttente),
        resultat_estime: round(totalHt - totalMs - totalChargesFixes - (ndfRembourse + ndfEnAttente)),
      }}
    />
  )
}

function round(n: number): number { return Math.round(n * 100) / 100 }
