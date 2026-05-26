// Helper d'envoi email via Resend (best-effort).
// Si RESEND_API_KEY absente → log + return false (ne BLOQUE PAS le flow business).
//
// Variables d'env requises sur Vercel app-restaurant :
//   RESEND_API_KEY=re_xxxxx
//   EMAIL_FROM="CASATASIA <noreply@lerelaisdessaveurs.fr>"
//   EMAIL_GERANT="contact@lerelaisdessaveurs.fr"  (pour les notifs internes)

export type EmailPayload = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  reply_to?: string
  tags?: Array<{ name: string; value: string }>
}

export type EmailResult = { ok: boolean; reason?: string; id?: string }

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY absent — email skip :', payload.subject, '→', payload.to)
    return { ok: false, reason: 'no_api_key' }
  }
  const from = process.env.EMAIL_FROM ?? 'CASATASIA <onboarding@resend.dev>'

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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

// ─── Layout HTML branded CASATASIA ────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://site-restaurant-beta.vercel.app'
const LOGO_URL = `${SITE_URL}/icon-512.png`

export function emailLayout(opts: {
  titre: string
  preheader?: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
}): string {
  const { titre, preheader, bodyHtml, ctaLabel, ctaUrl } = opts
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(titre)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0D0D;color:#1c1917;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0D0D0D;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fafaf9;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.4);">
        <tr>
          <td style="background:linear-gradient(135deg,#0D0D0D 0%,#1a1a2e 100%);padding:32px 24px;text-align:center;">
            <img src="${LOGO_URL}" width="80" height="80" alt="CASATASIA" style="display:block;margin:0 auto 16px;border-radius:50%;border:2px solid #E8B86D;" />
            <p style="margin:0;color:#E8B86D;font-size:11px;letter-spacing:0.4em;text-transform:uppercase;">CASATASIA</p>
            <p style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:700;font-family:Georgia,serif;">${escapeHtml(titre)}</p>
          </td>
        </tr>
        <tr><td style="padding:32px 28px;line-height:1.6;font-size:15px;color:#1c1917;">
          ${bodyHtml}
          ${ctaLabel && ctaUrl ? `
            <p style="margin:32px 0 0;text-align:center;">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:linear-gradient(to right,#C0392B,#E8B86D,#C0392B);color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.05em;">${escapeHtml(ctaLabel)}</a>
            </p>
          ` : ''}
        </td></tr>
        <tr><td style="background:#0D0D0D;padding:20px 24px;text-align:center;font-size:11px;color:#a8a29e;border-top:1px solid #E8B86D33;">
          <p style="margin:0 0 4px;color:#E8B86D;letter-spacing:0.2em;text-transform:uppercase;font-size:10px;">Sainte Anastasie sur Issole · Var Provence</p>
          <p style="margin:0;color:#78716c;">Ouvert 7j/7 de 6h à minuit · <a href="${SITE_URL}" style="color:#E8B86D;text-decoration:none;">lerelaisdessaveurs.fr</a></p>
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

// ─── Templates spécifiques ─────────────────────────────────────────

export function emailConfirmationCommande(data: {
  numero: string
  total: number
  creneau_iso: string
  client_prenom?: string | null
  client_nom: string
  articles: Array<{ nom: string; quantite: number; prix_total: number }>
}): { subject: string; html: string; text: string } {
  const heure = new Date(data.creneau_iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  const prenom = data.client_prenom?.trim() || data.client_nom

  const articlesHtml = data.articles.map(a =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f5f5f4;">${escapeHtml(a.nom)} <span style="color:#78716c;">×${a.quantite}</span></td><td style="padding:8px 0;border-bottom:1px solid #f5f5f4;text-align:right;font-weight:600;color:#C0392B;">${a.prix_total.toFixed(2)}&nbsp;€</td></tr>`
  ).join('')

  const html = emailLayout({
    titre: 'Commande confirmée',
    preheader: `Commande #${data.numero} confirmée — ${data.total.toFixed(2)} €`,
    bodyHtml: `
      <p>Bonjour ${escapeHtml(prenom)},</p>
      <p>Votre commande <strong>#${escapeHtml(data.numero)}</strong> est bien enregistrée. Nous la préparons et vous attendons :</p>
      <p style="background:#fef3c7;padding:14px 18px;border-radius:8px;margin:18px 0;border-left:3px solid #E8B86D;">
        📅 <strong>${escapeHtml(heure)}</strong><br>
        📍 CASATASIA · Sainte Anastasie sur Issole
      </p>
      <p style="margin:24px 0 8px;font-weight:600;font-size:16px;">Récapitulatif</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        ${articlesHtml}
        <tr><td style="padding:14px 0 0;font-weight:700;font-size:17px;">Total</td><td style="padding:14px 0 0;text-align:right;font-weight:700;font-size:17px;color:#C0392B;">${data.total.toFixed(2)}&nbsp;€</td></tr>
      </table>
      <p style="margin-top:24px;color:#78716c;font-size:13px;">Paiement à la livraison (espèces, CB ou ticket restaurant). Merci pour votre confiance !</p>
    `,
    ctaLabel: 'Voir ma commande',
    ctaUrl: `${SITE_URL}/mon-compte`,
  })
  const text = `Commande #${data.numero} confirmée\n\nBonjour ${prenom},\nVotre commande est prête le ${heure} chez CASATASIA.\nTotal : ${data.total.toFixed(2)} €`
  return { subject: `Commande #${data.numero} confirmée — CASATASIA`, html, text }
}

export function emailConfirmationReservationChambre(data: {
  chambre_nom: string
  date_arrivee: string
  date_depart: string
  nuits: number
  montant_total: number
  acompte: number
  client_prenom?: string | null
  client_nom: string
}): { subject: string; html: string; text: string } {
  const arr = new Date(data.date_arrivee).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dep = new Date(data.date_depart).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const prenom = data.client_prenom?.trim() || data.client_nom

  const html = emailLayout({
    titre: 'Demande de chambre reçue',
    preheader: `${data.chambre_nom} · ${data.nuits} nuit(s) · ${data.montant_total.toFixed(2)} €`,
    bodyHtml: `
      <p>Bonjour ${escapeHtml(prenom)},</p>
      <p>Nous avons bien reçu votre demande de réservation pour la <strong>${escapeHtml(data.chambre_nom)}</strong>.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fef3c7;padding:18px;border-radius:8px;margin:18px 0;border-left:3px solid #E8B86D;">
        <tr><td style="padding:4px 0;">🛏️ <strong>${escapeHtml(data.chambre_nom)}</strong></td></tr>
        <tr><td style="padding:4px 0;">📅 Arrivée : <strong>${escapeHtml(arr)}</strong></td></tr>
        <tr><td style="padding:4px 0;">📅 Départ : <strong>${escapeHtml(dep)}</strong></td></tr>
        <tr><td style="padding:4px 0;">🌙 ${data.nuits} nuit(s)</td></tr>
        <tr><td style="padding:4px 0;font-weight:700;color:#C0392B;font-size:17px;">💰 Total : ${data.montant_total.toFixed(2)} €</td></tr>
      </table>
      <p style="background:#fef9c3;padding:12px 16px;border-radius:8px;border-left:3px solid #ca8a04;font-size:14px;">
        ⚠️ <strong>Acompte de ${data.acompte.toFixed(2)} €</strong> (30% du total) à verser pour confirmer définitivement la réservation.<br>
        Nous reviendrons vers vous très vite avec les modalités de paiement.
      </p>
      <p style="margin-top:24px;color:#78716c;font-size:13px;">Pour toute question : <a href="mailto:contact@lerelaisdessaveurs.fr" style="color:#C0392B;">contact@lerelaisdessaveurs.fr</a></p>
    `,
    ctaLabel: 'Voir mes réservations',
    ctaUrl: `${SITE_URL}/mon-compte`,
  })
  const text = `Réservation reçue : ${data.chambre_nom}, ${data.nuits} nuit(s) du ${arr} au ${dep}. Total ${data.montant_total.toFixed(2)} €. Acompte ${data.acompte.toFixed(2)} € à verser.`
  return { subject: `Demande de réservation reçue — ${data.chambre_nom}`, html, text }
}

export function emailRappelReservation(data: {
  chambre_nom: string
  date_arrivee: string
  client_prenom?: string | null
  client_nom: string
}): { subject: string; html: string; text: string } {
  const arr = new Date(data.date_arrivee).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const prenom = data.client_prenom?.trim() || data.client_nom
  const html = emailLayout({
    titre: 'À très bientôt !',
    preheader: `Rappel : votre arrivée le ${arr}`,
    bodyHtml: `
      <p>Bonjour ${escapeHtml(prenom)},</p>
      <p>Petit rappel : votre arrivée à <strong>${escapeHtml(data.chambre_nom)}</strong> est prévue dans 48h.</p>
      <p style="background:#fef3c7;padding:14px 18px;border-radius:8px;margin:18px 0;border-left:3px solid #E8B86D;">
        📅 <strong>${escapeHtml(arr)}</strong><br>
        📍 CASATASIA · Sainte Anastasie sur Issole · 83136
      </p>
      <p>Nous vous attendons avec impatience. Pour toute question (heure d'arrivée, demande spéciale), n'hésitez pas à nous contacter.</p>
    `,
    ctaLabel: 'Voir le plan',
    ctaUrl: `${SITE_URL}/contact`,
  })
  const text = `Rappel : votre arrivée à ${data.chambre_nom} est prévue le ${arr}. À très bientôt !`
  return { subject: `Votre arrivée approche — ${data.chambre_nom}`, html, text }
}

export function emailBienvenueFidelite(data: {
  prenom?: string | null
  nom: string
  points: number
  niveau: string
  code_parrainage: string
}): { subject: string; html: string; text: string } {
  const prenom = data.prenom?.trim() || data.nom
  const html = emailLayout({
    titre: 'Bienvenue dans le programme',
    preheader: `+${data.points} points de bienvenue offerts !`,
    bodyHtml: `
      <p>Bonjour ${escapeHtml(prenom)},</p>
      <p>Bienvenue dans le programme fidélité de <strong>CASATASIA</strong> ! 🎉</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#fef3c7,#fed7aa);padding:18px;border-radius:8px;margin:18px 0;text-align:center;">
        <tr><td style="padding:4px 0;font-size:36px;font-weight:700;color:#C0392B;">+${data.points}</td></tr>
        <tr><td style="padding:0 0 6px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#78716c;">points de bienvenue</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;">Votre niveau : <strong>${escapeHtml(data.niveau)}</strong></td></tr>
      </table>
      <p style="margin:24px 0 8px;font-weight:600;">Comment ça marche ?</p>
      <ul style="margin:0;padding-left:20px;color:#1c1917;">
        <li>1 € HT dépensé = 1 point</li>
        <li>100 points = 1 € de réduction</li>
        <li>Avantages exclusifs à chaque palier (Bronze, Argent, Or, Platine)</li>
      </ul>
      <p style="margin:24px 0 8px;font-weight:600;">Votre code de parrainage</p>
      <p style="background:#1c1917;color:#E8B86D;padding:14px;border-radius:8px;text-align:center;font-family:monospace;font-size:18px;letter-spacing:0.2em;font-weight:700;">${escapeHtml(data.code_parrainage)}</p>
      <p style="font-size:13px;color:#78716c;">Partagez-le : à chaque inscription via votre code, +20 points pour chacun.</p>
    `,
    ctaLabel: 'Mon espace fidélité',
    ctaUrl: `${SITE_URL}/mon-compte`,
  })
  const text = `Bienvenue ${prenom} ! +${data.points} points offerts. Votre code parrainage : ${data.code_parrainage}`
  return { subject: 'Bienvenue dans le programme fidélité 🎉', html, text }
}

export function emailNotifGerantEvenement(data: {
  type: string
  date_evenement?: string | null
  nb_personnes?: number | null
  client_nom: string
  client_email: string
  client_telephone?: string | null
  message?: string | null
}): { subject: string; html: string; text: string } {
  const html = emailLayout({
    titre: 'Nouvelle demande d\'événement',
    preheader: `${data.type} · ${data.client_nom}`,
    bodyHtml: `
      <p style="background:#fef3c7;padding:12px 16px;border-radius:8px;border-left:3px solid #E8B86D;font-size:14px;">
        🔔 Nouvelle demande de privatisation reçue.
      </p>
      <p style="margin:24px 0 8px;font-weight:600;">Détails</p>
      <ul style="margin:0;padding-left:20px;line-height:1.8;">
        <li>Type : <strong>${escapeHtml(data.type)}</strong></li>
        ${data.date_evenement ? `<li>Date : <strong>${escapeHtml(new Date(data.date_evenement).toLocaleDateString('fr-FR'))}</strong></li>` : ''}
        ${data.nb_personnes ? `<li>Invités : <strong>${data.nb_personnes}</strong></li>` : ''}
      </ul>
      <p style="margin:24px 0 8px;font-weight:600;">Contact</p>
      <ul style="margin:0;padding-left:20px;line-height:1.8;">
        <li>Nom : <strong>${escapeHtml(data.client_nom)}</strong></li>
        <li>Email : <a href="mailto:${escapeHtml(data.client_email)}" style="color:#C0392B;">${escapeHtml(data.client_email)}</a></li>
        ${data.client_telephone ? `<li>Téléphone : <a href="tel:${escapeHtml(data.client_telephone.replace(/\s/g,''))}" style="color:#C0392B;">${escapeHtml(data.client_telephone)}</a></li>` : ''}
      </ul>
      ${data.message ? `<p style="margin:24px 0 8px;font-weight:600;">Message du client</p><p style="background:#f5f5f4;padding:14px;border-radius:8px;font-style:italic;color:#1c1917;">"${escapeHtml(data.message)}"</p>` : ''}
    `,
    ctaLabel: 'Ouvrir le back-office',
    ctaUrl: 'https://app-restaurant-livid.vercel.app/admin/reservations/evenements',
  })
  const text = `Nouvelle demande événement : ${data.type} pour ${data.client_nom} (${data.client_email})`
  return { subject: `📅 Nouvelle demande : ${data.type} — ${data.client_nom}`, html, text }
}
