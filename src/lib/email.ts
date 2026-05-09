// Helper d'envoi email via Resend (https://resend.com).
// Best-effort : si RESEND_API_KEY absente ou erreur réseau → log + return false.
// Ne JAMAIS bloquer un flow business à cause d'un email.
//
// Variable d'env requise (à ajouter sur Vercel quand prêt) :
//   RESEND_API_KEY=re_xxxxx
//   EMAIL_FROM="App Restaurant <noreply@tondomaine.fr>"
// Tant qu'absente : sendEmail() renvoie { ok: false, reason: 'no_api_key' }
// sans erreur (les flows métier continuent normalement).

export type EmailPayload = {
  to: string | string[]
  subject: string
  html: string
  text?: string                  // version texte fallback
  reply_to?: string
  tags?: Array<{ name: string; value: string }>
}

export type EmailResult = {
  ok: boolean
  reason?: string
  id?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY absent — email skip :', payload.subject, '→', payload.to)
    return { ok: false, reason: 'no_api_key' }
  }
  const from = process.env.EMAIL_FROM ?? 'noreply@example.com'

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: payload.reply_to,
        tags: payload.tags,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[email] Resend error', res.status, txt)
      return { ok: false, reason: `resend_${res.status}` }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, id: data?.id }
  } catch (e) {
    console.error('[email] fetch error', e)
    return { ok: false, reason: 'fetch_error' }
  }
}

// Wrapper pour layout simple HTML brand resto.
export function emailLayout(opts: { titre: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string }): string {
  const { titre, bodyHtml, ctaLabel, ctaUrl } = opts
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titre)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafaf9;color:#1c1917;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafaf9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.06);overflow:hidden;">
          <tr><td style="background:#10b981;padding:20px 24px;color:#fff;">
            <h1 style="margin:0;font-size:20px;font-weight:700;">🍽️ ${escapeHtml(titre)}</h1>
          </td></tr>
          <tr><td style="padding:24px;line-height:1.55;font-size:15px;">
            ${bodyHtml}
            ${ctaLabel && ctaUrl ? `
              <p style="margin:24px 0 0;text-align:center;">
                <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(ctaLabel)}</a>
              </p>
            ` : ''}
          </td></tr>
          <tr><td style="background:#f5f5f4;padding:16px 24px;text-align:center;font-size:11px;color:#78716c;">
            Vous recevez cet email automatique de votre restaurant.
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
