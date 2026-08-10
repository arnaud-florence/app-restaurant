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

import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { sendPushToPostes } from '@/lib/push'
import { tauxTvaArticle, calculerLigneTva, agregerVentilation } from '@/lib/tva'
import { getOrCreateSessionCaisseId } from '@/lib/caisse'

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

  // ─── Prix + TVA recalculés SERVEUR (jamais le prix envoyé par le client) ──
  // Sécurité : le payload borne fournit prix_unitaire_ht mais on l'IGNORE et on
  // relit prix_vente_ht depuis recettes → empêche la manipulation de prix (0,01 €).
  const recetteIds = Array.from(new Set(data.panier.map(p => p.recette_id)))
  const { data: recettesDb } = await supabase.from('recettes')
    .select('id, prix_vente_ht, contient_alcool').in('id', recetteIds)
  const recMap = new Map<string, { prix: number; alcool: boolean }>()
  for (const r of (recettesDb ?? [])) {
    recMap.set(r.id as string, { prix: Number(r.prix_vente_ht ?? 0), alcool: !!r.contient_alcool })
  }
  for (const id of recetteIds) {
    if (!recMap.has(id)) throw new Error('Produit introuvable ou indisponible')
  }

  const lignesTva = data.panier.map(p => {
    const rec = recMap.get(p.recette_id)!
    const prixHt = rec.prix                                  // ← source de vérité = DB
    const taux = tauxTvaArticle(rec.alcool, data.consommation)
    const calc = calculerLigneTva(p.quantite, prixHt, taux)
    return { ...p, prix_unitaire_ht: prixHt, tva_taux: taux, tva_eur: calc.tva_eur, ttc: calc.ttc, ht: calc.ht, prix_unitaire_ttc: calc.prix_unitaire_ttc }
  })
  const total_ht_brut  = lignesTva.reduce((s, l) => s + l.ht, 0)
  const total_ttc_brut = lignesTva.reduce((s, l) => s + l.ttc, 0)
  const tva_total_brut = lignesTva.reduce((s, l) => s + l.tva_eur, 0)

  // Remise fidélité (points → €) appliquée sur le TTC
  let remise_eur = 0
  let points_utilises = 0
  if (data.client_id && data.points_a_utiliser && data.points_a_utiliser > 0) {
    const config = await getConfigFideliteBorne()
    const ratio = Math.max(1, config.points_par_euro_remise)
    const supabaseCheck = await createClient()
    const { data: cli } = await supabaseCheck.from('clients')
      .select('points_fidelite').eq('id', data.client_id).maybeSingle()
    const solde = Number(cli?.points_fidelite ?? 0)
    points_utilises = Math.min(data.points_a_utiliser, solde, total_ttc_brut * ratio)
    remise_eur = Math.round((points_utilises / ratio) * 100) / 100
  }
  const total_ttc = Math.max(0, total_ttc_brut - remise_eur)
  // Prorata de la remise → HT / TVA / ventilation restent cohérents
  const factor = total_ttc_brut > 0 ? total_ttc / total_ttc_brut : 1
  const total_ht  = Math.round(total_ht_brut * factor * 100) / 100
  const tva_total = Math.round(tva_total_brut * factor * 100) / 100
  const ventilation: Record<string, number> = {}
  for (const [k, v] of Object.entries(agregerVentilation(lignesTva.map(l => ({ tva_taux: l.tva_taux, tva_eur: l.tva_eur }))))) {
    ventilation[k] = Math.round(v * factor * 100) / 100
  }

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
      montant_total_ht: total_ht,
      montant_total_ttc: Math.round(total_ttc * 100) / 100,
      tva_total,
      ventilation_tva: ventilation,
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
  const articles = lignesTva.map(l => ({
    commande_id: cmd.id,
    recette_id: l.recette_id,
    quantite: l.quantite,
    prix_unitaire_ht: Math.round(l.prix_unitaire_ht * 100) / 100,
    prix_unitaire_ttc: l.prix_unitaire_ttc,
    tva_taux: l.tva_taux,
    tva_eur: l.tva_eur,
    tag_destination: l.tag_destination,
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

  // Garde IDOR : doit être une commande BORNE en attente de paiement comptoir
  const { data: cmdGarde } = await supabase
    .from('commandes').select('source, statut').eq('id', input.commande_id).maybeSingle()
  if (!cmdGarde || cmdGarde.source !== 'BORNE') throw new Error('Commande borne introuvable')
  if (cmdGarde.statut !== 'en_attente_paiement_comptoir') return { ok: true as const, deja: true }

  // 1. Session caisse du jour, créée si aucune n'est ouverte (filet anti-paiement orphelin)
  const sessionId = await getOrCreateSessionCaisseId(supabase)

  // 2. Crée le paiement_caisse
  const { error: errPay } = await supabase.from('paiements_caisse').insert({
    commande_id: input.commande_id,
    session_caisse_id: sessionId,
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
      session_caisse_id: sessionId,
    })
    .eq('id', input.commande_id)
    .eq('source', 'BORNE')
  if (errUpd) throw new Error('Maj commande borne : ' + errUpd.message)

  // 4. Log
  await supabase.from('borne_evenements').insert({
    commande_id: input.commande_id,
    borne_id: 'caisse',
    type: 'comptoir_paye',
    details: { methode: input.methode, montant: input.montant, session_id: sessionId },
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

  // Lire la commande (+ garde IDOR : doit être une commande BORNE)
  const { data: cmd } = await supabase
    .from('commandes')
    .select('source, statut, client_id, borne_points_utilises, mode_paiement, montant_total_ttc')
    .eq('id', input.commande_id)
    .maybeSingle()
  if (!cmd || cmd.source !== 'BORNE') throw new Error('Commande borne introuvable')
  // Idempotence : déjà payée / avancée → ne pas ré-encaisser (double paiement)
  if (cmd.statut !== 'en_attente_paiement_comptoir') return { ok: true as const, deja: true }

  // ─── C1 : vérification du paiement Stripe (NFC) ───────────────────────
  // On ne fait JAMAIS confiance au client : on relit le PaymentIntent et on
  // exige status=succeeded ET amount_received == total serveur de la commande.
  if (input.via === 'nfc') {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('Paiement non vérifiable : Stripe non configuré')
    if (!input.payment_intent_id) throw new Error('Paiement NFC sans référence Stripe')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' as any })
    const pi = await stripe.paymentIntents.retrieve(input.payment_intent_id)
    const attenduCents = Math.round(Number(cmd.montant_total_ttc ?? 0) * 100)
    if (pi.status !== 'succeeded') throw new Error(`Paiement non abouti (statut Stripe : ${pi.status})`)
    if (Number(pi.amount_received) !== attenduCents) {
      throw new Error(`Montant payé incohérent (${pi.amount_received} ≠ ${attenduCents} cents)`)
    }
  }

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
    .eq('source', 'BORNE')
  if (error) throw new Error('Marquer borne payée : ' + error.message)

  // Enregistre le paiement carte NFC en caisse — SANS ça, le CA borne carte
  // n'apparaît pas dans le pilotage ni la RH (qui lisent paiements_caisse),
  // alors qu'il compte dans les finances (commandes encaissées) → CA incohérent.
  if (input.via === 'nfc') {
    try {
      const { count: dejaPaye } = await supabase
        .from('paiements_caisse').select('id', { count: 'exact', head: true })
        .eq('commande_id', input.commande_id)
      if (!dejaPaye) {
        const sessionId = await getOrCreateSessionCaisseId(supabase)
        await supabase.from('paiements_caisse').insert({
          commande_id: input.commande_id,
          session_caisse_id: sessionId,
          methode: 'carte',
          montant: Number(cmd?.montant_total_ttc ?? 0),
          pourboire: 0,
        })
        if (sessionId) await supabase.from('commandes').update({ session_caisse_id: sessionId }).eq('id', input.commande_id)
      }
    } catch (e) {
      console.error('[borne] paiement_caisse NFC non enregistré :', e)
    }
  }

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
  // Garde IDOR : on n'annule QUE des commandes BORNE non déjà encaissées/annulées
  // (empêche d'annuler une commande salle/table par id arbitraire = sabotage service).
  const { error } = await supabase
    .from('commandes')
    .update({ statut: 'annule', borne_expire_at: null })
    .eq('id', input.commande_id)
    .eq('source', 'BORNE')
    .not('statut', 'in', '(encaisse,annule)')
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
