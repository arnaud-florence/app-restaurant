// Rate limiting in-memory simple pour les routes publiques.
// Limite par IP + endpoint, fenêtre glissante.
// MVP : process-local (suffisant pour 1 instance Vercel). Pour scale horizontal,
// migrer vers Upstash Redis (variable env UPSTASH_REDIS_REST_URL).

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export type RateLimitConfig = {
  windowMs: number      // fenêtre (ex: 60000 = 1 min)
  max: number           // requêtes max par fenêtre
}

const DEFAULT_LIMIT: RateLimitConfig = { windowMs: 60_000, max: 60 }

export function getClientIp(req: Request): string {
  // Vercel : x-forwarded-for, x-real-ip
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function checkRateLimit(
  req: Request,
  endpoint: string,
  config: RateLimitConfig = DEFAULT_LIMIT,
): { ok: true; remaining: number } | { ok: false; status: 429; retryAfter: number } {
  const ip = getClientIp(req)
  const key = `${endpoint}:${ip}`
  const now = Date.now()

  // Cleanup buckets expirés (best-effort, 5% de chance par requête)
  if (Math.random() < 0.05) {
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt < now) buckets.delete(k)
    }
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs })
    return { ok: true, remaining: config.max - 1 }
  }

  if (bucket.count >= config.max) {
    return {
      ok: false,
      status: 429,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }

  bucket.count++
  return { ok: true, remaining: config.max - bucket.count }
}

export function rateLimitedResponse(retryAfter: number): Response {
  return Response.json(
    { error: 'Trop de requêtes. Réessayez plus tard.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}
