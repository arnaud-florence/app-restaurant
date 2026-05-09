// POST /api/public/stripe/webhook
// Reçoit les événements Stripe (checkout.session.completed → confirme commande / carte cadeau).
//
// Variables d'env requises (à ajouter sur Vercel) :
//   STRIPE_SECRET_KEY=sk_xxx
//   STRIPE_WEBHOOK_SECRET=whsec_xxx
//
// Configuration côté Stripe Dashboard :
//   1. Créer un webhook endpoint pointant vers
//      https://app-restaurant-livid.vercel.app/api/public/stripe/webhook
//   2. Sélectionner les événements :
//      - checkout.session.completed
//      - payment_intent.payment_failed
//      - charge.refunded
//   3. Copier le signing secret → STRIPE_WEBHOOK_SECRET
//
// Sécurité : signature Stripe vérifiée via stripe.webhooks.constructEvent.
// Pas de PUBLIC_API_KEY requise (Stripe ne l'envoie pas) — la signature suffit.

import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeKey || !webhookSecret) {
    return Response.json({ error: 'Stripe non configuré' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return Response.json({ error: 'Signature manquante' }, { status: 400 })

  const rawBody = await req.text()
  const stripe = new Stripe(stripeKey)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] signature invalide :', err)
    return Response.json({ error: 'Signature invalide' }, { status: 400 })
  }

  const sb = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata ?? {}

        // Type de paiement déterminé par metadata.type :
        //   'commande' → confirme une commande déjà créée
        //   'carte_cadeau' → crée la carte cadeau

        if (metadata.type === 'commande' && metadata.commande_id) {
          // Marque la commande comme payée (mode_paiement='carte_stripe')
          // La commande est déjà créée par /api/public/commande, on ne la dédoublonne pas.
          await sb.from('commandes').update({
            mode_paiement: 'carte_stripe',
            // Note : pas encore 'encaisse' — le staff confirmera côté caisse.
            // Optionnel : on peut marquer 'en_preparation' si paiement = trigger cuisine
          }).eq('id', metadata.commande_id)

          // Trace dans paiements_caisse pour la compta
          await sb.from('paiements_caisse').insert({
            commande_id: metadata.commande_id,
            methode: 'carte',
            montant: (session.amount_total ?? 0) / 100,
            pourboire: 0,
            reference: session.id,
          })
        }

        if (metadata.type === 'carte_cadeau') {
          const montant = (session.amount_total ?? 0) / 100
          const code = metadata.code ?? 'GIFT-' + session.id.slice(-8).toUpperCase()
          // Idempotence : check si carte avec ce code existe déjà
          const { data: existant } = await sb.from('cartes_cadeaux').select('id').eq('code', code).maybeSingle()
          if (!existant) {
            const { data: carte } = await sb.from('cartes_cadeaux').insert({
              code,
              montant_initial: montant,
              montant_restant: montant,
              acheteur_nom: metadata.acheteur_nom ?? null,
              acheteur_email: session.customer_email ?? metadata.acheteur_email ?? null,
              beneficiaire_nom: metadata.beneficiaire_nom ?? null,
              beneficiaire_email: metadata.beneficiaire_email ?? null,
              message_personnel: metadata.message ?? null,
              statut: 'active',
              paiement_stripe_id: session.id,
            }).select('id').single()
            if (carte) {
              await sb.from('mouvements_cartes_cadeaux').insert({
                carte_cadeau_id: carte.id,
                type: 'achat',
                montant,
                motif: 'Achat en ligne via Stripe',
              })
            }
          }
        }

        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        // TODO : marquer la commande comme remboursée + trace mouvement
        console.log('[stripe-webhook] remboursement reçu', charge.id)
        break
      }

      default:
        // Event ignoré (mais 200 OK pour ne pas que Stripe retry)
        break
    }

    return Response.json({ received: true })
  } catch (e) {
    console.error('[stripe-webhook] traitement échoué :', e)
    // 500 → Stripe va retry (utile pour erreurs transitoires)
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
