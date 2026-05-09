// Guard unifié pour les routes publiques.
// Usage type :
//
//   export async function GET(req: Request) {
//     const guard = await guardPublicRoute(req, 'menu')
//     if (!guard.ok) return guard.response
//     // ... logique métier
//   }

import { checkApiKey, unauthorizedResponse } from './auth'
import { checkRateLimit, rateLimitedResponse, type RateLimitConfig } from './rate-limit'

export type GuardResult =
  | { ok: true }
  | { ok: false; response: Response }

export async function guardPublicRoute(
  req: Request,
  endpoint: string,
  rateConfig?: RateLimitConfig,
): Promise<GuardResult> {
  // 1. Auth API key
  const auth = checkApiKey(req)
  if (!auth.ok) {
    return { ok: false, response: unauthorizedResponse(auth.reason, auth.status) }
  }

  // 2. Rate limit
  const rl = checkRateLimit(req, endpoint, rateConfig)
  if (!rl.ok) {
    return { ok: false, response: rateLimitedResponse(rl.retryAfter) }
  }

  return { ok: true }
}

// CORS pour permettre à l'outil 2 de consommer ces routes depuis le navigateur.
// La liste des origines autorisées est dans PUBLIC_API_ALLOWED_ORIGINS (CSV).
// Ex : "https://monresto.fr,https://www.monresto.fr"
// Si vide en dev : autorise tout (dev only).
export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers()
  const allowed = (process.env.PUBLIC_API_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const isAllowed = allowed.length === 0 || (origin && allowed.includes(origin))
  if (isAllowed && origin) headers.set('Access-Control-Allow-Origin', origin)
  else if (allowed.length === 0) headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'content-type, x-api-key, idempotency-key, authorization')
  headers.set('Access-Control-Max-Age', '86400')
  return headers
}

// Pre-flight CORS pour les requêtes OPTIONS
export function handleCorsOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}
