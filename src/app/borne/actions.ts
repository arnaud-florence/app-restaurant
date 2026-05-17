'use server'

/**
 * Server actions de la borne kiosk.
 * - creerCommandeBorne(panier, mode_paiement) → insère la commande (statut adapté au mode)
 * - marquerBornePayee(commande_id, payment_intent_id) → encaisse + passe en cuisine
 * - annulerCommandeBorne(commande_id, raison) → annule (expiration, NFC échec, retour)
 * - incrementerEchecsNFC(commande_id) → compteur pour push manager
 * - logBorneEvenement(borne_id, type, details?) → log neutre
 * - heartbeatBorne(borne_id) → maintient borne_sessions à jour
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { sendPushToPostes } from '@/lib/push'

// ─── Types ─────────────────────────────────────────────────────────────
const PanierItemSchema = z.object({
  recette_id: z.string().uuid().nullable(),
  boisson_id: z.string().uuid().nullable(),
  nom: z.string().min(1),
  quantite: z.number().int().positive(),
  prix_unitaire_ht: z.number().nonnegative(),
  tag_destination: z.enum(['CUISINE', 'SNACKING', 'PIZZA', 'BAR']),
})

const CreerCommandeBorneSchema = z.object({
  borne_id: z.string().min(1).max(64),
  panier: z.array(PanierItemSchema).min(1),
  mode_paiement: z.enum(['nfc', 'comptoir']),
  client_prenom: z.string().max(64).nullable().optional(),
})

export type PanierBorneItem = z.infer<typeof PanierItemSchema>

// Délai d'expiration côté comptoir : 10 min
const EXPIRATION_COMPTOIR_MS = 10 * 60_000

// ─── Création de commande borne ────────────────────────────────────────
export async function creerCommandeBorne(input: z.infer<typeof CreerCommandeBorneSchema>) {
  const data = CreerCommandeBorneSchema.parse(input)
  const supabase = await createClient()

  const total_ht = data.panier.reduce((s, p) => s + p.quantite * p.prix_unitaire_ht, 0)
  const tva = 0.10
  const total_ttc = total_ht * (1 + tva)

  // Statut initial selon le mode de paiement
  //   NFC : en_attente (passe direct en cuisine si paiement confirmé)
  //         on insère en 'en_attente_paiement_comptoir' aussi en attendant
  //         que payment intent soit créé → marquerBornePayee la fera passer
  //   Comptoir : en_attente_paiement_comptoir (visible /caisse, pas cuisine)
  const statut = 'en_attente_paiement_comptoir'
  const expire_at = data.mode_paiement === 'comptoir'
    ? new Date(Date.now() + EXPIRATION_COMPTOIR_MS).toISOString()
    : null

  // Insert commande
  const { data: cmd, error: errCmd } = await supabase
    .from('commandes')
    .insert({
      source: 'BORNE',
      statut,
      montant_total_ht: total_ht,
      montant_total_ttc: total_ttc,
      tva_taux: tva,
      client_nom: data.client_prenom ?? null,
      borne_id: data.borne_id,
      borne_payment_method: data.mode_paiement,
      borne_expire_at: expire_at,
    })
    .select('id, numero')
    .single()

  if (errCmd) throw new Error('Création commande borne : ' + errCmd.message)
  if (!cmd) throw new Error('Création commande borne : aucune ligne retournée')

  // Insert articles
  const articles = data.panier.map(p => ({
    commande_id: cmd.id,
    recette_id: p.recette_id,
    boisson_id: p.boisson_id,
    nom_capture: p.nom,
    quantite: p.quantite,
    prix_unitaire_ht: p.prix_unitaire_ht,
    tag_destination: p.tag_destination,
    statut: 'en_attente',
  }))
  const { error: errArt } = await supabase.from('commande_articles').insert(articles)
  if (errArt) {
    // Rollback : on supprime la commande
    await supabase.from('commandes').delete().eq('id', cmd.id)
    throw new Error('Création articles borne : ' + errArt.message)
  }

  // Log événement
  await supabase.from('borne_evenements').insert({
    borne_id: data.borne_id,
    commande_id: cmd.id,
    type: data.mode_paiement === 'nfc' ? 'choix_nfc' : 'choix_comptoir',
    details: { total_ttc, nb_articles: data.panier.length },
  })

  // Maj session
  await supabase.from('borne_sessions').upsert({
    borne_id: data.borne_id,
    derniere_action: new Date().toISOString(),
    derniere_cmd_at: new Date().toISOString(),
  })

  revalidatePath('/caisse')
  return { id: cmd.id as string, numero: cmd.numero as string, expire_at }
}

// ─── Marquer borne payée (NFC succès OU caissier valide) ───────────────
export async function marquerBornePayee(input: {
  commande_id: string
  payment_intent_id?: string | null
  via: 'nfc' | 'comptoir'
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commandes')
    .update({
      statut: 'en_attente', // bascule en cuisine
      borne_payment_intent_id: input.payment_intent_id ?? null,
      borne_expire_at: null,
    })
    .eq('id', input.commande_id)
  if (error) throw new Error('Marquer borne payée : ' + error.message)

  await supabase.from('borne_evenements').insert({
    commande_id: input.commande_id,
    borne_id: 'caisse', // au moins pour le log si on vient de la caisse
    type: input.via === 'nfc' ? 'nfc_succes' : 'comptoir_paye',
    details: { payment_intent_id: input.payment_intent_id ?? null },
  })
  revalidatePath('/caisse')
  revalidatePath('/cuisine')
  revalidatePath('/pizza')
  revalidatePath('/bar')
  return { ok: true }
}

// ─── Annuler commande borne ─────────────────────────────────────────────
export async function annulerCommandeBorne(input: {
  commande_id: string
  raison: 'expiration' | 'nfc_echec' | 'retour_client' | 'manuel'
  borne_id?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commandes')
    .update({ statut: 'annule', borne_expire_at: null })
    .eq('id', input.commande_id)
  if (error) throw new Error('Annuler commande borne : ' + error.message)

  await supabase.from('borne_evenements').insert({
    commande_id: input.commande_id,
    borne_id: input.borne_id ?? 'caisse',
    type: input.raison === 'expiration' ? 'comptoir_expire' : 'nfc_echec',
    details: { raison: input.raison },
  })
  revalidatePath('/caisse')
  return { ok: true }
}

// ─── Compteur d'échecs NFC ─────────────────────────────────────────────
export async function incrementerEchecsNFC(input: {
  commande_id: string
  borne_id: string
}) {
  const supabase = await createClient()
  // Lecture du compteur actuel
  const { data: cmd } = await supabase
    .from('commandes')
    .select('borne_nfc_echecs')
    .eq('id', input.commande_id)
    .single()
  const nbActuel = (cmd?.borne_nfc_echecs as number | null) ?? 0
  const nouveau = nbActuel + 1
  await supabase
    .from('commandes')
    .update({ borne_nfc_echecs: nouveau })
    .eq('id', input.commande_id)
  await supabase.from('borne_evenements').insert({
    commande_id: input.commande_id,
    borne_id: input.borne_id,
    type: 'nfc_echec',
    details: { compteur: nouveau },
  })
  // À partir de 3 échecs consécutifs : push manager (best-effort, on n'attend pas)
  if (nouveau >= 3) {
    void sendPushToPostes(['manager'], {
      title: '⚠ Borne : 3 échecs NFC',
      body: `Borne ${input.borne_id} : 3 tentatives NFC échouées sur la même commande.`,
      url: '/caisse',
      tag: `borne_nfc_3echecs_${input.commande_id}`,
    })
  }
  return { ok: true, compteur: nouveau }
}

// ─── Heartbeat (le client appelle toutes les 60s) ──────────────────────
export async function heartbeatBorne(input: { borne_id: string; user_agent?: string }) {
  const supabase = await createClient()
  await supabase.from('borne_sessions').upsert({
    borne_id: input.borne_id,
    derniere_action: new Date().toISOString(),
    user_agent: input.user_agent ?? null,
  })
  return { ok: true }
}

// ─── Log neutre (panier_ajout etc) ─────────────────────────────────────
export async function logBorneEvenement(input: {
  borne_id: string
  type: 'panier_ajout' | 'panier_retire' | 'panier_vide' | 'session_open' | 'session_close' | 'nfc_init'
  details?: Record<string, unknown>
  commande_id?: string
}) {
  const supabase = await createClient()
  await supabase.from('borne_evenements').insert({
    borne_id: input.borne_id,
    commande_id: input.commande_id ?? null,
    type: input.type,
    details: input.details ?? null,
  })
  return { ok: true }
}
