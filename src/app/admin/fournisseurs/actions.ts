'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { extraireConditionnement } from '@/lib/commande-fournisseur'
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

const factureLigneSchema = z.object({
  /** Référence article du fournisseur (0142). Clé de rapprochement EXACTE,
   *  à préférer au libellé : elle ne change pas quand le libellé change. */
  reference: z.string().max(60).nullable().optional(),
  description: z.string().min(1).max(300),
  quantite: z.number().nullable().optional(),
  unite: z.string().max(30).nullable().optional(),
  prix_unitaire_ht: z.number().nullable().optional(),
  total_ht: z.number().nullable().optional(),
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
  lignes: z.array(factureLigneSchema).max(200).optional().default([]),
  nb_pages: z.number().int().min(1).max(8).optional().default(1),
  type_document: z.enum(['facture','avoir']).optional().default('facture'),
  /** Passe outre l'alerte de doublon (numéro déjà saisi chez ce fournisseur). */
  forcer_doublon: z.boolean().optional().default(false),
  facture_liee_id: z.string().uuid().optional().nullable(),
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
      type_document: (r.type_document as 'facture' | 'avoir') ?? 'facture',
      facture_liee_id: (r.facture_liee_id as string) ?? null,
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
// Rapprochement ligne de facture → ingrédient : comparaison insensible à la
// casse et aux accents, sur l'inclusion du nom le plus court dans le plus
// long. Volontairement prudent (noms de 4 caractères minimum) : un mauvais
// rapprochement écrirait un faux prix d'achat, ce qui est pire qu'aucun.
function normaliserNom(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export async function createFacture(input: unknown) {
  const p = factureSchema.parse(input)
  const supabase = await createClient()

  // ─── Garde-fou anti-doublon ──────────────────────────────────────
  // Rescanner une facture déjà saisie la comptait une seconde fois, sans
  // rien signaler : deux factures Promocash rescannées le 24/08 avaient
  // gonflé les achats de ~447 € et les dettes fournisseur d'autant. Un
  // numéro de facture est unique CHEZ UN FOURNISSEUR — deux fournisseurs
  // peuvent numéroter pareil, d'où le double critère.
  // On BLOQUE plutôt qu'on avertit : l'écriture est silencieuse et ses
  // effets (coûts, marges, dettes) se propagent partout. `forcer_doublon`
  // laisse la main au gérant quand le doublon est légitime — un fournisseur
  // qui réémet le même numéro, cela arrive.
  if (!p.forcer_doublon) {
    const { data: deja } = await supabase.from('factures_fournisseurs')
      .select('id, date_emission, montant_ttc, type_document')
      .eq('fournisseur_id', p.fournisseur_id)
      .eq('numero', p.numero)
      .eq('type_document', p.type_document)
      .maybeSingle()
    if (deja) {
      const quoi = p.type_document === 'avoir' ? 'Cet avoir' : 'Cette facture'
      const montant = Math.abs(Number(deja.montant_ttc ?? 0)).toFixed(2).replace('.', ',')
      throw new Error(
        `${quoi} n° ${p.numero} est déjà enregistrée pour ce fournisseur `
        + `(${deja.date_emission}, ${montant} € TTC). `
        + `Vérifie la liste avant d'enregistrer — ou coche « enregistrer quand même » `
        + `s'il s'agit bien d'un second document portant le même numéro.`,
      )
    }
  }

  // Avoir : montants stockés en NÉGATIF (l'UI saisit du positif). Toutes les
  // sommes existantes — dettes à payer du pilotage, P&L, snapshot assistant —
  // restent ainsi justes sans modification : l'avoir vient en déduction.
  const signe = p.type_document === 'avoir' ? -1 : 1
  const { data: facture, error } = await supabase.from('factures_fournisseurs').insert({
    fournisseur_id: p.fournisseur_id,
    bon_commande_id: p.bon_commande_id || null,
    numero: p.numero,
    date_emission: p.date_emission,
    date_echeance: p.date_echeance || null,
    montant_ht: signe * Math.abs(p.montant_ht),
    montant_ttc: signe * Math.abs(p.montant_ttc),
    statut: p.statut,
    notes: p.notes || null,
    nb_pages: p.nb_pages,
    type_document: p.type_document,
    facture_liee_id: p.facture_liee_id || null,
  }).select('id').single()
  if (error) throw new Error(error.message)

  let lignesInserees = 0
  let prixMisAJour = 0

  // Un avoir référence des marchandises rendues ou un geste commercial : ses
  // lignes sont conservées pour la traçabilité mais ne doivent JAMAIS écraser
  // un prix d'achat — ce n'est pas un nouveau tarif.
  const propagerPrix = p.type_document !== 'avoir'

  if (p.lignes.length > 0 && facture) {
    // Rapprochement en mémoire : ~100 ingrédients, inutile de requêter par ligne
    const { data: ings } = await supabase.from('ingredients')
      .select('id, nom, reference_fournisseur').eq('actif', true)
    const ingredientsBruts = ings ?? []
    const ingredients = ingredientsBruts.map(i => ({ id: i.id as string, nom: normaliserNom(i.nom as string) }))
    // Achat-revente (Fournil) : le produit acheté EST souvent le produit vendu
    // (« Croissant » sur la facture Metro = le produit « Croissant » de la
    // carte). Quand une ligne se rapproche d'un produit par son nom, son prix
    // unitaire devient recettes.cout_achat_ht — la marge se met à jour toute
    // seule à chaque facture scannée. Même prudence que pour les ingrédients.
    const { data: recs } = await supabase.from('recettes')
      .select('id, nom, nom_caisse, libelle_achat, unites_par_achat, prix_vente_ht, reference_fournisseur').eq('actif', true)
    // Un produit peut être reconnu par son nom, son libellé caisse OU son
    // libellé d'achat (0131) — « Panuozzi » ne ressemble pas à « PATON A
    // PIZZA », et les deux cafés sortent de la même capsule.
    // Index par RÉFÉRENCE (0142) : rapprochement exact, évalué AVANT le nom.
    // Une référence ne souffre ni des abréviations ni des accents, et ne
    // confond pas deux produits proches.
    const produitsParRef = new Map<string, Array<{ id: string; pv: number; parAchat: number }>>()
    for (const r of recs ?? []) {
      const ref = (r.reference_fournisseur as string | null)?.trim().toUpperCase()
      if (!ref) continue
      const l = produitsParRef.get(ref) ?? []
      l.push({
        id: r.id as string,
        pv: Number(r.prix_vente_ht ?? 0),
        parAchat: Number(r.unites_par_achat ?? 1) || 1,
      })
      produitsParRef.set(ref, l)
    }

    const produits = (recs ?? []).flatMap(r => {
      const base = {
        id: r.id as string,
        pv: Number(r.prix_vente_ht ?? 0),
        parAchat: Number(r.unites_par_achat ?? 1) || 1,
      }
      const out = [{ ...base, nom: normaliserNom(r.nom as string) }]
      if (r.nom_caisse) out.push({ ...base, nom: normaliserNom(r.nom_caisse as string) })
      if (r.libelle_achat) out.push({ ...base, nom: normaliserNom(r.libelle_achat as string) })
      return out
    })

    // Index des références connues : c'est le rapprochement EXACT (0142).
    // Le libellé ne sert plus qu'en second rang, quand la facture n'imprime
    // pas de référence ou qu'elle nous est encore inconnue.
    const parReference = new Map<string, string>()
    for (const i of ingredientsBruts) {
      const ref = (i.reference_fournisseur as string | null)?.trim()
      if (ref) parReference.set(ref.toUpperCase(), String(i.id))
    }

    const rows = p.lignes.map(l => {
      const ref = l.reference?.trim().toUpperCase()
      const parRef = ref ? parReference.get(ref) : undefined
      const desc = normaliserNom(l.description)
      const match = parRef
        ? { id: parRef }
        : ingredients.find(i =>
            i.nom.length >= 4 && (desc.includes(i.nom) || (desc.length >= 4 && i.nom.includes(desc))),
          )
      return {
        facture_id: facture.id as string,
        reference: l.reference?.trim() || null,
        description: l.description,
        quantite: l.quantite ?? null,
        unite: l.unite ?? null,
        prix_unitaire_ht: l.prix_unitaire_ht ?? null,
        total_ht: l.total_ht ?? null,
        ingredient_id: match?.id ?? null,
      }
    })

    // L'échec des lignes ne doit PAS annuler la facture : les totaux sont
    // déjà enregistrés, on signale seulement dans la réponse.
    const { error: eLignes } = await supabase.from('facture_lignes').insert(rows)
    if (!eLignes) {
      lignesInserees = rows.length

      // Met à jour le prix d'achat des ingrédients rapprochés + trace
      // l'historique (source 'livraison' — c'est ce que lisent les courbes
      // de prix et l'alerte hausse de l'agent Scanner).
      for (const [idx, r] of rows.entries()) {
        if (!propagerPrix) break
        const prixLigne = r.prix_unitaire_ht
        if (prixLigne && prixLigne > 0) {
          const desc = normaliserNom(p.lignes[idx].description)
          const refLigne = p.lignes[idx].reference?.trim().toUpperCase()
          // `filter` et non `find` : une même ligne de facture alimente
          // parfois PLUSIEURS produits (une capsule Lavazza = expresso ET
          // allongé). Dédupliqué par id — un produit peut matcher par son nom
          // et par son libellé d'achat à la fois.
          //
          // La RÉFÉRENCE passe avant le nom quand elle est connue : elle est
          // exacte, là où le libellé est une approximation qui peut écrire un
          // faux prix — pire qu'aucun.
          const parRef = refLigne ? produitsParRef.get(refLigne) : undefined
          const trouves = parRef?.length ? parRef : produits.filter(x =>
            x.nom.length >= 4 && (desc.includes(x.nom) || (desc.length >= 4 && x.nom.includes(desc))),
          )
          const vus = new Set<string>()
          for (const prod of trouves) {
            if (vus.has(prod.id)) continue
            vus.add(prod.id)
            // Le prix de ligne Gineys est presque toujours celui du COLIS
            // (« CROISSANT … C=96 » à 28,84 € le carton). Écrit tel quel, il a
            // fait un croissant à 40 € de coût — marges détruites en silence.
            // Prix à la pièce = prix du colis ÷ C=N. Sans C=N lisible, on ne
            // propage que si l'unité de la ligne dit explicitement « pièce ».
            // ⚠️ L'UNITÉ DE LA LIGNE décide, et elle passe AVANT le C=N.
            // Gineys facture tantôt au colis (« q=2 Col, pu=20,31 »), tantôt à
            // la pièce (« q=27 Pce, pu=1,26 ») pour un libellé qui porte
            // pourtant C=27 dans les deux cas. Diviser par C=N une ligne déjà
            // au détail donnait un moelleux à 4,7 centimes — food cost 3 %.
            const uniteLigne = String(p.lignes[idx].unite ?? '').toLowerCase()
            const estPiece = /^(pce|pi[eè]ce|piece|p|u|unite|unité)s?$/.test(uniteLigne)
            const cond = extraireConditionnement(p.lignes[idx].description)
            const prixAchat = estPiece ? prixLigne : (cond != null ? prixLigne / cond : null)
            // ÷ unites_par_achat : un flan entier donne 10 parts vendues.
            const prixPiece = prixAchat != null ? prixAchat / prod.parAchat : null
            // Garde-fou final : en achat-revente, un coût ≥ 95 % du prix de
            // vente HT est forcément une erreur de rapprochement — on n'écrit
            // pas un chiffre qui rendrait la marge négative en silence.
            if (prixPiece != null && (prod.pv <= 0 || prixPiece < prod.pv * 0.95)) {
              await supabase.from('recettes')
                .update({ cout_achat_ht: Math.round(prixPiece * 10000) / 10000 })
                .eq('id', prod.id)
            }
          }
        }
        if (!r.ingredient_id || !prixLigne || prixLigne <= 0) continue
        const { error: eIng } = await supabase.from('ingredients')
          .update({ prix_achat_ht: r.prix_unitaire_ht, updated_at: new Date().toISOString() })
          .eq('id', r.ingredient_id)
        if (!eIng) {
          prixMisAJour++
          await supabase.from('historique_prix_ingredients').insert({
            ingredient_id: r.ingredient_id,
            prix_achat_ht: r.prix_unitaire_ht,
            source: 'livraison',
            note: `Facture ${p.numero} — ${r.description.slice(0, 120)}`,
          })
        }
      }
    }
  }

  revalidatePath('/admin/fournisseurs')
  revalidatePath('/admin/ingredients')
  return { ok: true as const, lignes: lignesInserees, prix_mis_a_jour: prixMisAJour }
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
