'use server'

// Server Actions du module Livreur (Phase 2).
//
// 3 actions exposées au LivreurClient :
//   - marquerEnLivraison(commande_id) : 'pret' → 'en_livraison' + horodate
//   - marquerLivree(commande_id)      : 'en_livraison' → 'retire_par_client'
//   - envoyerEmailRetard(commande_id) : email Resend au client + flag anti-spam

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function marquerEnLivraison(commande_id: string) {
  const sb = await createClient()
  const { error } = await sb.from('commandes')
    .update({
      statut: 'en_livraison',
      livraison_depart_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', commande_id)
    .in('statut', ['pret', 'pret_pour_retrait'])  // safety guard

  if (error) return { ok: false, error: error.message }
  revalidatePath('/livreur')
  return { ok: true }
}

export async function marquerLivree(commande_id: string) {
  const sb = await createClient()
  // Récupère statut courant pour savoir si déjà payée (CB online) ou non
  const { data: c } = await sb.from('commandes')
    .select('statut, mode_paiement')
    .eq('id', commande_id)
    .single()

  if (!c) return { ok: false, error: 'Commande introuvable' }
  if (c.statut !== 'en_livraison') {
    return { ok: false, error: `Statut actuel '${c.statut}' — impossible de marquer livrée` }
  }

  // Si déjà payée en CB (mode_paiement non null), on passe direct à 'encaisse'.
  // Sinon, 'retire_par_client' = client a reçu mais paiement à la livraison.
  const nouveauStatut = c.mode_paiement ? 'encaisse' : 'retire_par_client'

  const { error } = await sb.from('commandes')
    .update({ statut: nouveauStatut, updated_at: new Date().toISOString() })
    .eq('id', commande_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/livreur')
  return { ok: true, statut: nouveauStatut }
}

export async function envoyerEmailRetard(commande_id: string) {
  const sb = await createClient()
  const { data: c, error } = await sb.from('commandes')
    .select('numero, client_email, client_nom, creneau_retrait, adresse_livraison, email_retard_envoye_at')
    .eq('id', commande_id)
    .single()

  if (error || !c) return { ok: false, error: 'Commande introuvable' }
  if (!c.client_email) return { ok: false, error: 'Pas d\'email client' }
  if (c.email_retard_envoye_at) {
    return { ok: false, error: 'Email retard déjà envoyé', alreadySent: true }
  }

  try {
    const { sendEmail } = await import('@/lib/email')
    const heurePrevue = c.creneau_retrait
      ? new Date(c.creneau_retrait).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : 'l\'heure prévue'

    const subject = `Votre commande #${c.numero} arrive avec un peu de retard`
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; line-height: 1.5;">
        <h2>Bonjour ${c.client_nom ?? ''} 👋</h2>
        <p>Désolé, votre commande <b>#${c.numero}</b> est en route mais accuse un peu de retard sur l'heure prévue (${heurePrevue}).</p>
        <p>Le livreur arrive d'ici quelques minutes à l'adresse : <b>${c.adresse_livraison ?? ''}</b></p>
        <p>Merci pour votre patience, à très vite !</p>
        <p style="color:#666; font-size:13px; margin-top:24px">Email envoyé automatiquement — pas besoin de répondre.</p>
      </div>
    `.trim()
    const text = `Bonjour ${c.client_nom ?? ''}, votre commande #${c.numero} est en route mais a un peu de retard sur l'heure prévue (${heurePrevue}). Le livreur arrive d'ici quelques minutes à : ${c.adresse_livraison ?? ''}. Merci pour votre patience !`

    await sendEmail({ to: c.client_email, subject, html, text })

    // Flag anti-spam : ne pas renvoyer un 2e email retard sur la même commande
    await sb.from('commandes')
      .update({ email_retard_envoye_at: new Date().toISOString() })
      .eq('id', commande_id)

    revalidatePath('/livreur')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
