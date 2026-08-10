'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { logActivite } from '@/lib/operateur'
import { type Fournisseur, type BonCommande, type BonCommandeLigne, type Facture, type EntreePrix, JOURS_SEMAINE } from '@/lib/fournisseurs'

// ─── Validation ──────────────────────────────────────────────────────
const fournisseurSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(160),
  contact: z.string().max(160),
  telephone: z.string().max(40),
  email: z.string().max(160),
  adresse: z.string().max(500),
  conditions_tarifaires: z.string().max(500),
  delai_livraison_jours: z.number().int().min(0).max(60),
  minimum_commande: z.number().min(0).max(99999),
  jours_livraison: z.array(z.enum(JOURS_SEMAINE)),
  note_qualite: z.number().int().min(0).max(5),
  note_ponctualite: z.number().int().min(0).max(5),
  actif: z.boolean(),
})

const bonCommandeSchema = z.object({
  fournisseur_id: z.string().uuid(),
  statut: z.enum(['brouillon','a_valider','envoye','recu','annule']),
  date_commande: z.string(),
  date_livraison_prevue: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  lignes: z.array(z.object({
    ingredient_id: z.string().uuid(),
    quantite_commandee: z.number().min(0.0001),
    prix_unitaire_ht: z.number().min(0),
  })),
})

const factureSchema = z.object({
  fournisseur_id: z.string().uuid(),
  bon_commande_id: z.string().uuid().optional().nullable(),
  numero: z.string().min(1).max(60),
  date_emission: z.string(),
  date_echeance: z.string().optional().nullable(),
  montant_ht: z.number().min(0),
  montant_ttc: z.number().min(0),
  statut: z.enum(['a_payer','paye','en_retard','litige','annule']),
  notes: z.string().max(1000).optional().nullable(),
})

const receptionLigneSchema = z.object({
  ligne_id: z.string().uuid(),
  quantite_recue: z.number().min(0),
  temperature_reception: z.number().optional().nullable(),
  dlc_observee: z.string().optional().nullable(),
  lot_numero: z.string().max(100).optional().nullable(),  // Module 11 — traçabilité
  etat_emballage: z.enum(['parfait','correct','abime','rejete']).optional().nullable(),
  note_qualite_ligne: z.number().int().min(1).max(5).optional().nullable(),
  commentaire: z.string().max(500).optional().nullable(),
})

// ─── Mappings ────────────────────────────────────────────────────────
function mapFournisseur(r: Record<string, unknown>): Fournisseur {
  return {
    id: r.id as string,
    nom: r.nom as string,
    contact: (r.contact as string) ?? null,
    telephone: (r.telephone as string) ?? null,
    email: (r.email as string) ?? null,
    adresse: (r.adresse as string) ?? null,
    conditions_tarifaires: (r.conditions_tarifaires as string) ?? null,
    delai_livraison_jours: Number(r.delai_livraison_jours ?? 0),
    minimum_commande: Number(r.minimum_commande ?? 0),
    jours_livraison: (r.jours_livraison as string[]) ?? [],
    note_qualite: Number(r.note_qualite ?? 0),
    note_ponctualite: Number(r.note_ponctualite ?? 0),
    actif: r.actif as boolean,
    created_at: r.created_at as string,
  }
}

// ─── Lectures ────────────────────────────────────────────────────────
export async function listFournisseurs(): Promise<Fournisseur[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('fournisseurs').select('*').order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapFournisseur)
}

export async function listBonsCommande(): Promise<BonCommande[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bons_commande')
    .select(`
      *,
      fournisseur:fournisseurs(nom),
      bon_commande_lignes(*, ingredient:ingredients(nom, unite))
    `)
    .order('date_commande', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => {
    const f = r.fournisseur as { nom?: string } | null
    const lignes = (r.bon_commande_lignes ?? []) as Array<Record<string, unknown> & { ingredient?: { nom?: string; unite?: string } | null }>
    return {
      id: r.id as string,
      fournisseur_id: r.fournisseur_id as string,
      fournisseur_nom: f?.nom,
      statut: r.statut as BonCommande['statut'],
      date_commande: r.date_commande as string,
      date_livraison_prevue: (r.date_livraison_prevue as string) ?? null,
      montant_total_ht: Number(r.montant_total_ht ?? 0),
      notes: (r.notes as string) ?? null,
      created_at: r.created_at as string,
      reception_a_verifier: Boolean(r.reception_a_verifier),
      lignes: lignes.map(li => ({
        id: li.id as string,
        bon_commande_id: li.bon_commande_id as string,
        ingredient_id: (li.ingredient_id as string) ?? null,
        ingredient_nom: li.ingredient?.nom,
        ingredient_unite: li.ingredient?.unite,
        quantite_commandee: Number(li.quantite_commandee ?? 0),
        prix_unitaire_ht: Number(li.prix_unitaire_ht ?? 0),
        quantite_recue: Number(li.quantite_recue ?? 0),
        temperature_reception: li.temperature_reception != null ? Number(li.temperature_reception) : null,
        dlc_observee: (li.dlc_observee as string) ?? null,
        etat_emballage: (li.etat_emballage as BonCommandeLigne['etat_emballage']) ?? null,
        note_qualite_ligne: li.note_qualite_ligne as number | null,
        commentaire: (li.commentaire as string) ?? null,
      })),
    }
  })
}

export async function listFactures(): Promise<Facture[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('factures_fournisseurs')
    .select('*, fournisseur:fournisseurs(nom)')
    .order('date_echeance', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => {
    const f = r.fournisseur as { nom?: string } | null
    return {
      id: r.id as string,
      fournisseur_id: r.fournisseur_id as string,
      fournisseur_nom: f?.nom,
      bon_commande_id: (r.bon_commande_id as string) ?? null,
      numero: r.numero as string,
      date_emission: r.date_emission as string,
      date_echeance: (r.date_echeance as string) ?? null,
      montant_ht: Number(r.montant_ht ?? 0),
      montant_ttc: Number(r.montant_ttc ?? 0),
      statut: r.statut as Facture['statut'],
      paye_le: (r.paye_le as string) ?? null,
      notes: (r.notes as string) ?? null,
      created_at: r.created_at as string,
    }
  })
}

export async function listEntreesPrix(): Promise<EntreePrix[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('historique_prix_ingredients')
    .select('ingredient_id, prix_achat_ht, created_at, fournisseur_id, source')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    ingredient_id: r.ingredient_id as string,
    prix_achat_ht: Number(r.prix_achat_ht),
    created_at: r.created_at as string,
    fournisseur_id: (r.fournisseur_id as string) ?? null,
    source: r.source as EntreePrix['source'],
  }))
}

// ─── CRUD Fournisseurs ───────────────────────────────────────────────
export async function createFournisseur(input: unknown) {
  const p = fournisseurSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('fournisseurs').insert({
    nom: p.nom,
    contact: p.contact || null,
    telephone: p.telephone || null,
    email: p.email || null,
    adresse: p.adresse || null,
    conditions_tarifaires: p.conditions_tarifaires || null,
    delai_livraison_jours: p.delai_livraison_jours,
    minimum_commande: p.minimum_commande,
    jours_livraison: p.jours_livraison,
    note_qualite: p.note_qualite,
    note_ponctualite: p.note_ponctualite,
    actif: p.actif,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création')
  revalidatePath('/admin/fournisseurs')
  return { id: data.id as string }
}

export async function updateFournisseur(id: string, input: unknown) {
  if (!id) throw new Error('id manquant')
  const p = fournisseurSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('fournisseurs').update({
    nom: p.nom,
    contact: p.contact || null,
    telephone: p.telephone || null,
    email: p.email || null,
    adresse: p.adresse || null,
    conditions_tarifaires: p.conditions_tarifaires || null,
    delai_livraison_jours: p.delai_livraison_jours,
    minimum_commande: p.minimum_commande,
    jours_livraison: p.jours_livraison,
    note_qualite: p.note_qualite,
    note_ponctualite: p.note_ponctualite,
    actif: p.actif,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}

export async function deleteFournisseur(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('fournisseurs').delete().eq('id', id)
  if (error) {
    throw new Error(error.message.includes('foreign key')
      ? 'Ce fournisseur est référencé par des bons de commande ou des factures — désactive-le plutôt.'
      : error.message)
  }
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}

// ─── Bons de commande ────────────────────────────────────────────────
export async function createBonCommande(input: unknown) {
  const p = bonCommandeSchema.parse(input)
  const supabase = await createClient()

  const total = p.lignes.reduce((s, l) => s + l.quantite_commandee * l.prix_unitaire_ht, 0)

  const { data: bon, error } = await supabase.from('bons_commande').insert({
    fournisseur_id: p.fournisseur_id,
    statut: p.statut,
    date_commande: p.date_commande,
    date_livraison_prevue: p.date_livraison_prevue || null,
    montant_total_ht: total,
    notes: p.notes || null,
  }).select('id').single()
  if (error || !bon) throw new Error(error?.message ?? 'Erreur création bon')

  if (p.lignes.length > 0) {
    const { error: lErr } = await supabase.from('bon_commande_lignes').insert(
      p.lignes.map(l => ({
        bon_commande_id: bon.id,
        ingredient_id: l.ingredient_id,
        quantite_commandee: l.quantite_commandee,
        prix_unitaire_ht: l.prix_unitaire_ht,
      }))
    )
    if (lErr) {
      await supabase.from('bons_commande').delete().eq('id', bon.id)
      throw new Error(`Erreur lignes : ${lErr.message}`)
    }
  }

  revalidatePath('/admin/fournisseurs')
  return { id: bon.id as string }
}

/**
 * Génère un brouillon de bon de commande à partir des ingrédients
 * sous le seuil minimum. Regroupe par fournisseur principal.
 * Renvoie la liste des bons créés (un par fournisseur).
 */
export async function autoGenererBonsDepuisStock() {
  const supabase = await createClient()

  // Lit les ingrédients en alerte stock
  const { data: ings } = await supabase
    .from('ingredients')
    .select('id, nom, unite, fournisseur_principal, stock_actuel, stock_minimum, stock_maximum, prix_achat_ht')
    .eq('actif', true)
  const enAlerte = (ings ?? []).filter(i => Number(i.stock_actuel) <= Number(i.stock_minimum) && i.fournisseur_principal)

  if (enAlerte.length === 0) {
    return { bons_crees: 0, message: 'Aucun ingrédient sous le seuil minimum.' }
  }

  // Lit les fournisseurs pour matcher par nom
  const { data: fournisseurs } = await supabase.from('fournisseurs').select('id, nom').eq('actif', true)
  const fournisseurMap = new Map((fournisseurs ?? []).map(f => [f.nom as string, f.id as string]))

  // Groupe par fournisseur (qui doit exister comme fiche)
  const groupes = new Map<string, typeof enAlerte>()
  for (const i of enAlerte) {
    const fournId = fournisseurMap.get(i.fournisseur_principal as string)
    if (!fournId) continue  // pas de fiche fournisseur correspondante → skip
    if (!groupes.has(fournId)) groupes.set(fournId, [])
    groupes.get(fournId)!.push(i)
  }

  let bons_crees = 0
  for (const [fournisseurId, items] of groupes.entries()) {
    const lignes = items.map(i => {
      const cible = Number(i.stock_maximum) > 0 ? Number(i.stock_maximum) : Number(i.stock_minimum) * 2
      const qte = Math.max(0, cible - Number(i.stock_actuel))
      return {
        ingredient_id: i.id as string,
        quantite_commandee: Math.round(qte * 1000) / 1000,
        prix_unitaire_ht: Number(i.prix_achat_ht),
      }
    }).filter(l => l.quantite_commandee > 0)
    if (lignes.length === 0) continue

    await createBonCommande({
      fournisseur_id: fournisseurId,
      statut: 'brouillon',
      date_commande: new Date().toISOString().slice(0, 10),
      date_livraison_prevue: null,
      notes: 'Brouillon auto-généré depuis les alertes de stock.',
      lignes,
    })
    bons_crees++
  }

  revalidatePath('/admin/fournisseurs')
  return { bons_crees, message: `${bons_crees} bon${bons_crees > 1 ? 's' : ''} de commande créé${bons_crees > 1 ? 's' : ''}.` }
}

export async function changerStatutBon(id: string, statut: 'brouillon'|'a_valider'|'envoye'|'recu'|'annule') {
  const supabase = await createClient()

  // Workflow de validation : si un employé NON-manager SANS autonomie_commande
  // tente d'ENVOYER un bon, on le bascule en "à valider" (le gérant validera)
  // au lieu de l'envoyer directement au fournisseur.
  if (statut === 'envoye') {
    const profil = await getProfile()
    const isManager = profil?.role === 'manager'
    if (!isManager && profil?.employe_id) {
      const { data: emp } = await supabase.from('employes')
        .select('autonomie_commande').eq('id', profil.employe_id).maybeSingle()
      if (!emp?.autonomie_commande) {
        const { error: e2 } = await supabase.from('bons_commande')
          .update({ statut: 'a_valider', propose_par: profil.employe_id, soumis_at: new Date().toISOString() })
          .eq('id', id)
        if (e2) throw new Error(e2.message)
        revalidatePath('/admin/fournisseurs')
        return { ok: true as const, aValider: true as const }
      }
    }
  }

  const { error } = await supabase.from('bons_commande').update({ statut }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}

export async function deleteBonCommande(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('bons_commande').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}

// ─── Réception marchandises ──────────────────────────────────────────
export async function enregistrerReception(bon_id: string, lignes: unknown[]) {
  if (!bon_id) throw new Error('bon_id manquant')
  const supabase = await createClient()

  // Garde-fou idempotence : ne JAMAIS re-réceptionner un bon déjà reçu. Sans ça,
  // un double-clic / une re-soumission ré-insère les mouvements 'entree' et
  // ré-incrémente le stock → inventaire faussement gonflé.
  const { data: bonStatut } = await supabase
    .from('bons_commande').select('statut').eq('id', bon_id).maybeSingle()
  if (!bonStatut) throw new Error('Bon de commande introuvable')
  if (bonStatut.statut === 'recu') throw new Error('Ce bon de commande a déjà été réceptionné.')

  // Autonomie réception : si un employé NON-manager SANS autonomie_reception
  // enregistre la réception, on met quand même le stock à jour (marchandise
  // physiquement arrivée), mais on flague le bon "à vérifier" pour le gérant.
  const profil = await getProfile()
  const isManager = profil?.role === 'manager'
  let aVerifier = false
  if (!isManager && profil?.employe_id) {
    const { data: emp } = await supabase.from('employes')
      .select('autonomie_reception').eq('id', profil.employe_id).maybeSingle()
    aVerifier = !emp?.autonomie_reception
  }

  // Map ligne_id → lot_numero pour la création des lots_produits (Module 11)
  const lotsParLigne = new Map<string, string>()

  for (const raw of lignes) {
    const p = receptionLigneSchema.parse(raw)
    if (p.lot_numero && p.lot_numero.trim()) lotsParLigne.set(p.ligne_id, p.lot_numero.trim())

    const { error } = await supabase.from('bon_commande_lignes').update({
      quantite_recue: p.quantite_recue,
      temperature_reception: p.temperature_reception,
      dlc_observee: p.dlc_observee || null,
      etat_emballage: p.etat_emballage || null,
      note_qualite_ligne: p.note_qualite_ligne ?? null,
      commentaire: p.commentaire || null,
    }).eq('id', p.ligne_id).eq('bon_commande_id', bon_id)
    if (error) throw new Error(`ligne ${p.ligne_id}: ${error.message}`)
  }

  // Passe le bon à 'recu' (+ traçabilité réception et flag de vérification gérant)
  await supabase.from('bons_commande').update({
    statut: 'recu',
    reception_par: profil?.employe_id ?? null,
    reception_at: new Date().toISOString(),
    reception_a_verifier: aVerifier,
  }).eq('id', bon_id)

  // Pour chaque ligne reçue : mouvement_stock 'entree' + maj stock + lot Module 11
  const { data: lignesRecues } = await supabase
    .from('bon_commande_lignes')
    .select('id, ingredient_id, quantite_recue, prix_unitaire_ht, dlc_observee, ingredient:ingredients(unite)')
    .eq('bon_commande_id', bon_id)
    .gt('quantite_recue', 0)

  const { data: bon } = await supabase.from('bons_commande').select('fournisseur_id, fournisseurs(nom)').eq('id', bon_id).single()
  const fournisseurId = (bon?.fournisseur_id as string | null) ?? null
  const fournisseurNom = (bon?.fournisseurs as unknown as { nom?: string } | null)?.nom

  for (const l of lignesRecues ?? []) {
    if (!l.ingredient_id) continue

    await supabase.from('mouvements_stock').insert({
      ingredient_id: l.ingredient_id,
      type: 'entree',
      quantite: Number(l.quantite_recue),
      prix_unitaire_ht: Number(l.prix_unitaire_ht ?? 0),
      fournisseur: fournisseurNom ?? null,
      date_peremption: l.dlc_observee || null,
      motif: 'Réception bon de commande',
    })

    // Maj stock_actuel
    const { data: ing } = await supabase.from('ingredients').select('stock_actuel').eq('id', l.ingredient_id).single()
    if (ing) {
      const newStock = Number(ing.stock_actuel) + Number(l.quantite_recue)
      await supabase.from('ingredients').update({ stock_actuel: newStock }).eq('id', l.ingredient_id)
    }

    // Module 11 : crée un lot_produit si un n° de lot a été saisi à la réception
    const lotNumero = lotsParLigne.get(l.id as string)
    if (lotNumero) {
      const ingUnite = (l.ingredient as unknown as { unite?: string } | null)?.unite ?? null
      await supabase.from('lots_produits').insert({
        ingredient_id: l.ingredient_id,
        lot_numero: lotNumero,
        dlc: l.dlc_observee || null,
        fournisseur_id: fournisseurId,
        fournisseur_nom: fournisseurNom ?? null,
        quantite: Number(l.quantite_recue),
        unite: ingUnite,
        bon_commande_id: bon_id,
        date_reception: new Date().toISOString().slice(0, 10),
        statut: 'en_stock',
      })
    }
  }

  await logActivite({ action: 'reception', zone: 'Réception', cible: fournisseurNom ?? 'Livraison', details: { a_verifier: aVerifier } })

  revalidatePath('/admin/fournisseurs')
  revalidatePath('/admin/stock')
  revalidatePath('/admin/hygiene')
  return { ok: true as const }
}

// Le gérant valide une réception saisie par un employé non-autonome (lève le flag).
export async function validerReception(bon_id: string) {
  if (!bon_id) throw new Error('bon_id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('bons_commande')
    .update({ reception_a_verifier: false }).eq('id', bon_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}

// ─── Factures ────────────────────────────────────────────────────────
export async function createFacture(input: unknown) {
  const p = factureSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('factures_fournisseurs').insert({
    fournisseur_id: p.fournisseur_id,
    bon_commande_id: p.bon_commande_id || null,
    numero: p.numero,
    date_emission: p.date_emission,
    date_echeance: p.date_echeance || null,
    montant_ht: p.montant_ht,
    montant_ttc: p.montant_ttc,
    statut: p.statut,
    notes: p.notes || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}

export async function changerStatutFacture(id: string, statut: 'a_payer'|'paye'|'en_retard'|'litige'|'annule') {
  const supabase = await createClient()
  const update: Record<string, unknown> = { statut }
  if (statut === 'paye') update.paye_le = new Date().toISOString()
  const { error } = await supabase.from('factures_fournisseurs').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}

export async function deleteFacture(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('factures_fournisseurs').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/fournisseurs')
  return { ok: true as const }
}
