// POST /api/borne/stripe/payment-intent
// Crée un PaymentIntent Stripe Terminal (payment_method_types=card_present)
// Le SDK natif appelle ce endpoint AVANT collectPaymentMethod.
//
// Body : { amount: number (cents), currency: 'eur', commande_id?: string }
// Réponse : { id, client_secret }

import Stripe from 'stripe'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Body = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(3),
  commande_id: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return Response.json({ error: 'STRIPE_SECRET_KEY manquant' }, { status: 503 })
  }
  let body: z.infer<typeof Body>
  try { body = Body.parse(await req.json()) }
  catch (e) {
    return Response.json({ error: 'Body invalide', detail: String(e) }, { status: 400 })
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' as any })
    const pi = await stripe.paymentIntents.create({
      amount: body.amount,
      currency: body.currency,
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      metadata: body.commande_id ? { commande_id: body.commande_id } : undefined,
    })
    return Response.json({ id: pi.id, client_secret: pi.client_secret })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Stripe'
    return Response.json({ error: msg }, { status: 500 })
  }
}
