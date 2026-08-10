'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  intervalleMoisIso, calculerCR, chargesFixesMensuelles, calculerTVA,
  ecrituresVersCSV, type EcritureComptable, type ChargeFixe, type FrequenceCharge,
} from '@/lib/finances'
import { coutShift } from '@/lib/rh'

// ─── Charges fixes ─────────────────────────────────────────────────

const chargeSchema = z.object({
  libelle:            z.string().trim().min(1).max(200),
  categorie:          z.enum(['loyer','energie','eau','telecom','internet','assurance','salaire','comptable','banque','urssaf','impots','abonnement','autre']),
  montant_ht:         z.number().min(0),
  montant_ttc:        z.number().min(0),
  frequence:          z.enum(['mensuel','bimestriel','trimestriel','semestriel','annuel']),
  jour_prelevement:   z.number().int().min(1).max(31).nullable(),
  prochaine_echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  fournisseur_nom:    z.string().max(200).nullable(),
  iban:               z.string().max(40).nullable(),
  notes:              z.string().max(500).nullable(),
})

export async function creerCharge(input: unknown): Promise<{ id: string }> {
  const p = chargeSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('charges_fixes').insert({ ...p, actif: true }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/finances')
  return { id: data.id as string }
}

const updateChargeSchema = chargeSchema.extend({ id: z.string().uuid() })

export async function updateCharge(input: unknown) {
  const p = updateChargeSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('charges_fixes').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/finances')
  return { ok: true as const }
}

export async function supprimerCharge(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('charges_fixes').update({ actif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/finances')
  return { ok: true as const }
}

// ─── Notes de frais ────────────────────────────────────────────────

const ndfSchema = z.object({
  employe_id:       z.string().uuid(),
  date_depense:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  libelle:          z.string().trim().min(1).max(200),
  motif:            z.string().max(500).nullable(),
  montant:          z.number().min(0),
  justificatif_url: z.string().max(500).nullable(),
})

export async function creerNoteDeFrais(input: unknown): Promise<{ id: string }> {
  const p = ndfSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('notes_de_frais').insert({ ...p, statut: 'en_attente' }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/finances')
  return { id: data.id as string }
}

const ndfStatutSchema = z.object({
  ndf_id:        z.string().uuid(),
  remboursee_par: z.string().uuid().nullable(),
  notes_admin:   z.string().max(500).nullable(),
})

export async function rembourserNDF(input: unknown) {
  const p = ndfStatutSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('notes_de_frais').update({
    statut: 'remboursee',
    remboursee_at: new Date().toISOString(),
    remboursee_par: p.remboursee_par,
    notes_admin: p.notes_admin,
  }).eq('id', p.ndf_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/finances')
  return { ok: true as const }
}

export async function refuserNDF(input: unknown) {
  const p = ndfStatutSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('notes_de_frais').update({
    statut: 'refusee', notes_admin: p.notes_admin,
  }).eq('id', p.ndf_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/finances')
  return { ok: true as const }
}

// ─── Trésorerie : ajustement du solde initial ──────────────────────

const tresorSchema = z.object({
  solde: z.number(),
  date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function ajusterTresorerie(input: unknown) {
  const p = tresorSchema.parse(input)
  const supabase = await createClient()

  for (const [cle, valeur] of [
    ['tresorerie_solde', String(p.solde)],
    ['tresorerie_solde_date', p.date],
  ] as [string, string][]) {
    const { data: existing } = await supabase.from('parametres').select('id').eq('cle', cle).maybeSingle()
    if (existing) {
      await supabase.from('parametres').update({ valeur, updated_at: new Date().toISOString() }).eq('cle', cle)
    } else {
      await supabase.from('parametres').insert({ cle, valeur, description: 'Module 14 — trésorerie' })
    }
  }
  revalidatePath('/admin/finances')
  return { ok: true as const }
}

// ─── Génération CSV écritures comptables ───────────────────────────

export async function exporterCSVMois(moisIso: string): Promise<{ csv: string; nb_ecritures: number; libelle: string }> {
  if (!/^\d{4}-\d{2}$/.test(moisIso)) throw new Error('mois doit être au format YYYY-MM')
  const ref = new Date(moisIso + '-01T12:00:00')
  const interval = intervalleMoisIso(ref)
  const supabase = await createClient()

  const ecritures: EcritureComptable[] = []

  // 1. Ventes : 512 (banque/caisse) débit par paiement / 707 (vente HT) + 44571 (TVA collectée)
  //    crédités depuis la VENTILATION RÉELLE de chaque commande (multi-taux 5,5/10/20),
  //    et non plus un /1.10 forfaitaire qui faussait la TVA dès qu'il y a alcool ou emporter.
  const { data: paiements } = await supabase
    .from('paiements_caisse')
    .select('id, montant, methode, encaisse_at, commande:commandes(numero, montant_total_ht, ventilation_tva)')
    .gte('encaisse_at', interval.debut)
    .lte('encaisse_at', interval.fin + 'T23:59:59')
    .order('encaisse_at')
  type CmdJoin = { numero?: string; montant_total_ht?: number; ventilation_tva?: Record<string, number> }
  const cmdVues = new Set<string>()
  for (const p of paiements ?? []) {
    const cmd = p.commande as unknown as CmdJoin | null
    const num = cmd?.numero ?? p.id
    const date = (p.encaisse_at as string).slice(0, 10)
    const ttc = Number(p.montant)
    // Ligne banque/caisse : montant réel encaissé par méthode (espèces, carte…).
    ecritures.push({ date, numero: num, libelle: `Vente ${p.methode}`, compte: '512', debit: ttc, credit: 0, journal: 'VTE' })
    // Produits + TVA : émis UNE fois par commande (les paiements multiples se partagent le TTC).
    if (num && !cmdVues.has(num)) {
      cmdVues.add(num)
      const ventil = (cmd?.ventilation_tva ?? {}) as Record<string, number>
      const taux = Object.keys(ventil)
      if (taux.length > 0) {
        // HT réel = TTC commande − somme TVA ; on s'appuie sur la ventilation par taux.
        let htTotal = Number(cmd?.montant_total_ht ?? 0)
        if (!htTotal) {
          // Fallback : reconstruit HT depuis la ventilation (HT = tva / (taux/100)).
          htTotal = taux.reduce((s, t) => s + (Number(t) > 0 ? Number(ventil[t]) / (Number(t) / 100) : 0), 0)
          htTotal = Math.round(htTotal * 100) / 100
        }
        ecritures.push({ date, numero: num, libelle: 'Vente HT', compte: '707', debit: 0, credit: htTotal, journal: 'VTE' })
        for (const t of taux.sort((a, b) => Number(a) - Number(b))) {
          const tva = Math.round(Number(ventil[t] ?? 0) * 100) / 100
          if (tva > 0) ecritures.push({ date, numero: num, libelle: `TVA collectée ${t.replace('.', ',')}%`, compte: '44571', debit: 0, credit: tva, journal: 'VTE' })
        }
      } else {
        // Commande sans ventilation (ancienne donnée) : fallback /1.10 historique.
        const ht = Math.round((ttc / 1.10) * 100) / 100
        const tva = Math.round((ttc - ht) * 100) / 100
        ecritures.push({ date, numero: num, libelle: 'Vente HT', compte: '707', debit: 0, credit: ht, journal: 'VTE' })
        if (tva > 0) ecritures.push({ date, numero: num, libelle: 'TVA collectée 10%', compte: '44571', debit: 0, credit: tva, journal: 'VTE' })
      }
    }
  }

  // 2. Achats : factures_fournisseurs → 6071 (achats) + 44566 (TVA déductible) / 401 (fournisseur)
  const { data: factures } = await supabase
    .from('factures_fournisseurs')
    .select('id, numero, date_emission, montant_ht, montant_ttc, fournisseur:fournisseurs(nom)')
    .gte('date_emission', interval.debut)
    .lte('date_emission', interval.fin)
    .order('date_emission')
  for (const f of factures ?? []) {
    type FournJoin = { nom?: string }
    const fourn = f.fournisseur as unknown as FournJoin | null
    const fournNom = fourn?.nom ?? '—'
    const ht = Number(f.montant_ht)
    const ttc = Number(f.montant_ttc)
    const tva = Math.round((ttc - ht) * 100) / 100
    const date = f.date_emission as string
    const num = f.numero as string
    ecritures.push({ date, numero: num, libelle: `Achat ${fournNom}`, compte: '6071', debit: ht, credit: 0, journal: 'ACH' })
    if (tva > 0) ecritures.push({ date, numero: num, libelle: `TVA déductible ${fournNom}`, compte: '44566', debit: tva, credit: 0, journal: 'ACH' })
    ecritures.push({ date, numero: num, libelle: `Fournisseur ${fournNom}`, compte: '401', debit: 0, credit: ttc, journal: 'ACH' })
  }

  // 3. Charges fixes échues dans le mois
  const { data: charges } = await supabase
    .from('charges_fixes')
    .select('libelle, categorie, montant_ht, montant_ttc, prochaine_echeance, fournisseur_nom')
    .eq('actif', true)
    .gte('prochaine_echeance', interval.debut)
    .lte('prochaine_echeance', interval.fin)
  const COMPTE_PAR_CAT: Record<string, string> = {
    loyer: '6132', energie: '6061', eau: '6061', telecom: '6262', internet: '6262',
    assurance: '6160', salaire: '641', comptable: '6226', banque: '627',
    urssaf: '6451', impots: '631', abonnement: '6261', autre: '6280',
  }
  for (const c of charges ?? []) {
    const compte = COMPTE_PAR_CAT[c.categorie as string] ?? '6280'
    const ht = Number(c.montant_ht)
    const ttc = Number(c.montant_ttc)
    const tva = Math.round((ttc - ht) * 100) / 100
    const date = c.prochaine_echeance as string
    const num = `CH-${(c.libelle as string).slice(0, 20)}`
    ecritures.push({ date, numero: num, libelle: c.libelle as string, compte, debit: ht, credit: 0, journal: 'OD' })
    if (tva > 0) ecritures.push({ date, numero: num, libelle: `TVA ${c.libelle}`, compte: '44566', debit: tva, credit: 0, journal: 'OD' })
    ecritures.push({ date, numero: num, libelle: `Règlement ${c.libelle}`, compte: '512', debit: 0, credit: ttc, journal: 'OD' })
  }

  return {
    csv: ecrituresVersCSV(ecritures),
    nb_ecritures: ecritures.length,
    libelle: interval.libelle,
  }
}

// ─── Calcul P&L mensuel agrégé (utilitaire serveur) ───────────────

export async function chargerCRMois(moisIso: string) {
  const ref = new Date(moisIso + '-01T12:00:00')
  const interval = intervalleMoisIso(ref)
  const supabase = await createClient()

  const [commandesRes, mouvementsRes, planningRes, chargesRes, ndfRes, facturesRes] = await Promise.all([
    // Source de vérité unique du CA = commandes encaissées (montants TTC/HT/TVA réels, ventilation multi-taux).
    // Inclut livraisons cash (statut encaisse sans paiement) et évite le double comptage Stripe.
    supabase.from('commandes').select('montant_total_ttc, montant_total_ht, tva_total')
      .eq('statut', 'encaisse').gte('created_at', interval.debut).lte('created_at', interval.fin + 'T23:59:59'),
    supabase.from('mouvements_stock').select('quantite, prix_unitaire_ht').eq('type', 'entree').gte('created_at', interval.debut).lte('created_at', interval.fin + 'T23:59:59'),
    supabase.from('planning').select('employe_id, heure_debut, heure_fin, employe:employes!employe_id(salaire_horaire)').gte('date_travail', interval.debut).lte('date_travail', interval.fin),
    supabase.from('charges_fixes').select('montant_ttc, frequence, actif'),
    supabase.from('notes_de_frais').select('montant').eq('statut', 'remboursee').gte('remboursee_at', interval.debut).lte('remboursee_at', interval.fin + 'T23:59:59'),
    supabase.from('factures_fournisseurs').select('montant_ht, montant_ttc').gte('date_emission', interval.debut).lte('date_emission', interval.fin),
  ])

  const cmds = commandesRes.data ?? []
  const ca_ttc = cmds.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const ca_ht  = cmds.reduce((s, c) => s + Number(c.montant_total_ht ?? 0), 0)
  const tva_collectee_reelle = cmds.reduce((s, c) => s + Number(c.tva_total ?? 0), 0)
  const food_cost = (mouvementsRes.data ?? []).reduce((s, m) => s + Number(m.quantite ?? 0) * Number(m.prix_unitaire_ht ?? 0), 0)

  type ShiftRow = { heure_debut: string; heure_fin: string; employe?: { salaire_horaire?: number | string } | null }
  const masse_salariale = ((planningRes.data ?? []) as ShiftRow[]).reduce((s, sh) => {
    const sal = Number(sh.employe?.salaire_horaire ?? 0)
    return s + coutShift(sh.heure_debut, sh.heure_fin, sal)
  }, 0)

  const charges_fixes_mensuelles = chargesFixesMensuelles((chargesRes.data ?? []).map(c => ({
    montant_ttc: Number(c.montant_ttc ?? 0),
    frequence: c.frequence as FrequenceCharge,
    actif: Boolean(c.actif),
  })))

  const notes_de_frais_mois = (ndfRes.data ?? []).reduce((s, n) => s + Number(n.montant ?? 0), 0)

  const cr = calculerCR({ ca_ttc, ca_ht, food_cost, masse_salariale, charges_fixes_mensuelles, notes_de_frais_mois })
  const tva = calculerTVA(ca_ttc, (facturesRes.data ?? []).map(f => ({
    montant_ht: Number(f.montant_ht ?? 0),
    montant_ttc: Number(f.montant_ttc ?? 0),
  })), 0.10, tva_collectee_reelle)

  return { cr, tva, libelle: interval.libelle }
}

// type alias for re-export to client
export type { ChargeFixe } from '@/lib/finances'
