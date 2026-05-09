// Helpers anti-spam pour les formulaires publics (contact, inscription, avis).
//
// 2 mécanismes complémentaires :
//   1. Honeypot : champ caché côté client (display:none) qui doit rester VIDE.
//      Les bots remplissent automatiquement tous les champs visibles.
//      → si rempli = bot détecté, requête rejetée silencieusement.
//   2. Captcha (optionnel) : hCaptcha ou Cloudflare Turnstile côté outil 2.
//      Le token est envoyé au backend qui vérifie via API.
//
// Variable d'env (optionnelle) :
//   HCAPTCHA_SECRET = secret hCaptcha (https://hcaptcha.com)
// Tant qu'absente : honeypot seul est utilisé (suffisant pour MVP).

export function isHoneypotFilled(payload: Record<string, unknown>): boolean {
  // Champs honeypot conventionnels que les bots remplissent
  // (le frontend doit les inclure mais cachés en CSS)
  const honeypotFields = ['website', 'url', 'company_extra', 'phone_extra']
  return honeypotFields.some(f => {
    const v = payload[f]
    return typeof v === 'string' && v.trim().length > 0
  })
}

/**
 * Vérifie un token hCaptcha via l'API hCaptcha.
 * Si HCAPTCHA_SECRET absent : renvoie { ok: true } (pas de blocage).
 */
export async function verifyHcaptcha(
  token: string | null | undefined,
  remoteip?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.HCAPTCHA_SECRET
  if (!secret) return { ok: true }   // pas configuré → on laisse passer
  if (!token) return { ok: false, reason: 'Captcha manquant' }

  try {
    const params = new URLSearchParams({ secret, response: token })
    if (remoteip) params.append('remoteip', remoteip)

    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) return { ok: false, reason: 'Erreur vérification captcha' }
    const data = await res.json()
    if (data.success === true) return { ok: true }
    return { ok: false, reason: 'Captcha invalide' }
  } catch (e) {
    console.error('[hcaptcha] erreur vérif :', e)
    return { ok: false, reason: 'Erreur réseau captcha' }
  }
}
