// POST /api/borne/stripe/connection-token
// Génère un connection_token Stripe Terminal pour la borne (NFC native).
// Le SDK Capacitor appelle ce endpoint à l'initialisation.
//
// SÉCURITÉ : pas d'auth pour l'instant (la borne tourne en kiosk avec accès
// physique). Si une protection est requise, ajouter un header X-Borne-Secret
// validé contre BORNE_SHARED_SECRET dans .env.
//
// DOC Stripe : https://stripe.com/docs/terminal/quickstart

import Stripe from 'stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return Response.json({ error: 'STRIPE_SECRET_KEY manquant' }, { status: 503 })
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' as any })
    const token = await stripe.terminal.connectionTokens.create()
    return Response.json({ secret: token.secret })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Stripe Terminal'
    return Response.json({ error: msg }, { status: 500 })
  }
}
