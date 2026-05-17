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
// Les "boissons" sont en fait des recettes avec tag_destination='BAR' dans
// l'app actuelle. commande_articles n'a qu'une FK recette_id (pas boisson_id).
const PanierItemSchema = z.object({
  recette_id: z.string().uuid(),
  nom: z.string().min(1), // capturé côté UI, non persisté ici (pas de colonne dédiée)
  quantite: z.number().int().positive(),
  prix_unitaire_ht: z.number().nonnegative(),
  tag_destination: z.enum(['CUISINE', 'SNACKING', 'PIZZA', 'BAR']),
})

const CreerCommandeBorneSchema = z.object({
  borne_id: z.string().min(1).max(64),
  panier: z.array(PanierItemSchema).min(1),
  mode_paiement: z.enum(['nfc', 'comptoir']),
  client_prenom: z.string().max(64).nullable().optional(),
  consommation: z.enum(['sur_place', 'emporter']).default('sur_place'),
  client_id: z.string().uuid().nullable().optional(),
  points_a_utiliser: z.number().int().nonnegative().optional().default(0),
})

export type PanierBorneItem = z.infer<typeof PanierItemSchema>

// Délai d'expiration côté comptoir : 10 min
const EXPIRATION_COMPTOIR_MS = 10 * 60_000

// ─── Création de commande borne ────────────────────────────────────────
export async function creerCommandeBorne(input: z.infer<typeof CreerCommandeBorneSchema>) {
  const data = CreerCommandeBorneSchema.parse(input)
  const supabase = await createClient()

  const total_ht_brut = data.panier.reduce((s, p) => s + p.quantite * p.prix_unitaire_ht, 0)
  const tva = 0.10
  const total_ttc_brut = total_ht_brut * (1 + tva)

  // Application de la remise fidélité (points → €)
  let remise_eur = 0
  let points_utilises = 0
  if (data.client_id && data.points_a_utiliser && data.points_a_utiliser > 0) {
    const config = await getConfigFideliteBorne()
    const ratio = Math.max(1, config.points_par_euro_remise)
    // Vérifier solde réel du client (anti-triche côté client)
    const supabaseCheck = await createClient()
    const { data: cli } = await supabaseCheck.from('clients')
      .select('points_fidelite').eq('id', data.client_id).maybeSingle()
    const solde = Number(cli?.points_fidelite ?? 0)
    points_utilises = Math.min(data.points_a_utiliser, solde, total_ttc_brut * ratio)
    remise_eur = Math.round((points_utilises / ratio) * 100) / 100
  }
  const total_ttc = Math.max(0, total_ttc_brut - remise_eur)
  const total_ht = total_ttc / (1 + tva)

  // Statut initial selon le mode de paiement
  //   NFC : en_attente_paiement_comptoir → marquerBornePayee bascule en cuisine
  //   Comptoir : en_attente_paiement_comptoir (visible /caisse, pas cuisine)
  const statut = 'en_attente_paiement_comptoir'
  const expire_at = data.mode_paiement === 'comptoir'
    ? new Date(Date.now() + EXPIRATION_COMPTOIR_MS).toISOString()
    : null

  // Génère un numéro lisible BRN-YYMMDD-XXXX (pattern aligné sur TKT-/etc)
  const today = new Date()
  const yymmdd = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  const random4 = Math.random().toString(36).slice(2, 6).toUpperCase()
  const numero = `BRN-${yymmdd}-${random4}`

  // Insert commande
  const { data: cmd, error: errCmd } = await supabase
    .from('commandes')
    .insert({
      numero,
      source: 'BORNE',
      statut,
      montant_total_ht: Math.round(total_ht * 100) / 100,
      montant_total_ttc: Math.round(total_ttc * 100) / 100,
      client_nom: data.client_prenom ?? null,
      client_id: data.client_id ?? null,
      consommation: data.consommation,
      borne_id: data.borne_id,
      borne_payment_method: data.mode_paiement,
      borne_expire_at: expire_at,
      borne_points_utilises: points_utilises,
      borne_remise_eur: remise_eur,
    })
    .select('id, numero')
    .single()

  if (errCmd) throw new Error('Création commande borne : ' + errCmd.message)
  if (!cmd) throw new Error('Création commande borne : aucune ligne retournée')

  // Insert articles (commande_articles n'a que recette_id, pas boisson_id ni nom_capture)
  const articles = data.panier.map(p => ({
    commande_id: cmd.id,
    recette_id: p.recette_id,
    quantite: p.quantite,
    prix_unitaire_ht: Math.round(p.prix_unitaire_ht * 100) / 100,
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

// ─── Encaisser borne au comptoir (modal /emporter) ─────────────────────
// Crée le paiement_caisse (traçabilité comptable) + bascule la commande
// de 'en_attente_paiement_comptoir' → 'en_attente' (= part en cuisine).
export async function encaisserBorne(input: {
  commande_id: string
  methode: 'especes' | 'carte' | 'ticket_resto' | 'virement' | 'autre'
  montant: number
  pourboire?: number
  reference?: string | null
  serveur_id?: string | null
}) {
  const supabase = await createClient()

  // 1. Trouver la session caisse ouverte du jour (peut être null si fermée)
  const today = new Date().toISOString().slice(0, 10)
  const { data: session } = await supabase
    .from('sessions_caisse')
    .select('id')
    .eq('date_session', today)
    .is('fermee_at', null)
    .order('ouverte_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 2. Crée le paiement_caisse
  const { error: errPay } = await supabase.from('paiements_caisse').insert({
    commande_id: input.commande_id,
    session_caisse_id: session?.id ?? null,
    methode: input.methode,
    montant: input.montant,
    pourboire: input.pourboire ?? 0,
    serveur_id: input.serveur_id ?? null,
    reference: input.reference ?? null,
  })
  if (errPay) throw new Error('Création paiement borne : ' + errPay.message)

  // 3. Bascule la commande en 'en_attente' → part en cuisine
  const { error: errUpd } = await supabase
    .from('commandes')
    .update({
      statut: 'en_attente',
      borne_expire_at: null,
      mode_paiement: input.methode,
      session_caisse_id: session?.id ?? null,
    })
    .eq('id', input.commande_id)
  if (errUpd) throw new Error('Maj commande borne : ' + errUpd.message)

  // 4. Log
  await supabase.from('borne_evenements').insert({
    commande_id: input.commande_id,
    borne_id: 'caisse',
    type: 'comptoir_paye',
    details: { methode: input.methode, montant: input.montant, session_id: session?.id ?? null },
  })

  revalidatePath('/caisse')
  revalidatePath('/emporter')
  revalidatePath('/cuisine')
  revalidatePath('/pizza')
  revalidatePath('/bar')
  return { ok: true }
}

// ─── Récupère une commande borne avec ses articles (pour le modal) ────
export async function getCommandeBorneDetails(commande_id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commandes')
    .select(`
      id, numero, montant_total_ttc, montant_total_ht, tva_total,
      borne_id, borne_payment_method, borne_expire_at, created_at,
      commande_articles(id, quantite, prix_unitaire_ht, tag_destination,
        recette:recettes(nom))
    `)
    .eq('id', commande_id)
    .single()
  if (error) throw new Error('Détails commande borne : ' + error.message)
  return data
}

// ─── Marquer borne payée (NFC succès OU caissier valide) ───────────────
export async function marquerBornePayee(input: {
  commande_id: string
  payment_intent_id?: string | null
  via: 'nfc' | 'comptoir'
}) {
  const supabase = await createClient()

  // Lire la commande pour voir si points fidélité à consommer
  const { data: cmd } = await supabase
    .from('commandes')
    .select('client_id, borne_points_utilises, mode_paiement')
    .eq('id', input.commande_id)
    .maybeSingle()

  const { error } = await supabase
    .from('commandes')
    .update({
      statut: 'en_attente', // bascule en cuisine
      borne_payment_intent_id: input.payment_intent_id ?? null,
      borne_expire_at: null,
      // Marque le mode de paiement pour que /emporter affiche '✓ déjà payé'
      mode_paiement: cmd?.mode_paiement ?? (input.via === 'nfc' ? 'carte_nfc' : 'comptoir'),
    })
    .eq('id', input.commande_id)
  if (error) throw new Error('Marquer borne payée : ' + error.message)

  // Consomme les points fidélité si applicable (best-effort, log si erreur)
  const ptsUtilises = Number(cmd?.borne_points_utilises ?? 0)
  if (cmd?.client_id && ptsUtilises > 0) {
    try {
      const { consommerPointsFidelite } = await import('@/lib/fidelite')
      await consommerPointsFidelite({
        client_id: cmd.client_id as string,
        points: ptsUtilises,
        commande_id: input.commande_id,
      })
    } catch (e) {
      // Log mais on ne bloque pas l'encaissement (la commande est déjà payée)
      console.error('[borne] consommation points fidélité échouée :', e)
      await supabase.from('borne_evenements').insert({
        commande_id: input.commande_id, borne_id: 'caisse',
        type: 'nfc_echec',
        details: { etape: 'consommation_points', erreur: e instanceof Error ? e.message : String(e) },
      })
    }
  }

  await supabase.from('borne_evenements').insert({
    commande_id: input.commande_id,
    borne_id: 'caisse',
    type: input.via === 'nfc' ? 'nfc_succes' : 'comptoir_paye',
    details: {
      payment_intent_id: input.payment_intent_id ?? null,
      points_utilises: ptsUtilises,
    },
  })
  revalidatePath('/caisse')
  revalidatePath('/emporter')
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

// ─── Config fidélité (lecture seule pour la borne) ────────────────────
export async function getConfigFideliteBorne() {
  const supabase = await createClient()
  const { data } = await supabase.from('parametres')
    .select('cle, valeur')
    .in('cle', ['fidelite.points_par_euro', 'fidelite.points_par_euro_remise'])
  const map = new Map((data ?? []).map(r => [r.cle as string, (r.valeur as string) ?? '']))
  return {
    points_par_euro:        Number(map.get('fidelite.points_par_euro') ?? 1),
    points_par_euro_remise: Number(map.get('fidelite.points_par_euro_remise') ?? 100),
  }
}

// ─── Fidélité : recherche client par téléphone (saisie borne) ──────────
// On normalise le téléphone (retire espaces / points / tirets) pour matching tolérant.
export type ClientFidelite = {
  id: string
  prenom: string | null
  nom: string | null
  points_fidelite: number
  niveau_fidelite: string
  nb_visites: number
}

function normaliserTel(t: string): string {
  return t.replace(/[\s.\-()]/g, '')
}

// Crée un compte fidélité minimal depuis la borne (prénom + téléphone).
// Le nom est rempli avec le prénom (placeholder modifiable côté admin).
export async function creerClientFideliteBorne(input: {
  prenom: string
  telephone: string
}): Promise<ClientFidelite> {
  const tel = normaliserTel(input.telephone)
  if (tel.length < 9) throw new Error('Numéro invalide')
  const prenom = input.prenom.trim()
  if (!prenom) throw new Error('Prénom requis')
  const supabase = await createClient()

  // Si déjà existant : on retourne celui-là (idempotent)
  const existant = await chercherClientFideliteParTel(tel)
  if (existant) return existant

  const { data, error } = await supabase
    .from('clients')
    .insert({
      prenom,
      nom: prenom, // placeholder, NOT NULL — modifiable côté admin
      telephone: tel,
      points_fidelite: 0,
      niveau_fidelite: 'standard',
      nb_visites: 0,
    })
    .select('id, prenom, nom, telephone, points_fidelite, niveau_fidelite, nb_visites')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création compte')
  return {
    id: data.id as string,
    prenom: (data.prenom as string) ?? null,
    nom: (data.nom as string) ?? null,
    points_fidelite: Number(data.points_fidelite ?? 0),
    niveau_fidelite: (data.niveau_fidelite as string) ?? 'standard',
    nb_visites: Number(data.nb_visites ?? 0),
  }
}

export async function chercherClientFideliteParTel(telephone: string): Promise<ClientFidelite | null> {
  const tel = normaliserTel(telephone)
  if (tel.length < 9) return null // FR minimum
  const supabase = await createClient()
  // Match exact ou avec préfixe FR (0X → 33X)
  const variantes = [tel]
  if (tel.startsWith('0')) variantes.push('33' + tel.slice(1))
  if (tel.startsWith('33')) variantes.push('0' + tel.slice(2))
  if (tel.startsWith('+')) variantes.push(tel.slice(1))
  const { data } = await supabase
    .from('clients')
    .select('id, prenom, nom, telephone, points_fidelite, niveau_fidelite, nb_visites')
    .in('telephone', variantes)
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    prenom: (data.prenom as string) ?? null,
    nom: (data.nom as string) ?? null,
    points_fidelite: Number(data.points_fidelite ?? 0),
    niveau_fidelite: (data.niveau_fidelite as string) ?? 'standard',
    nb_visites: Number(data.nb_visites ?? 0),
  }
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
