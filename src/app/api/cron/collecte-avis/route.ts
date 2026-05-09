// Cron Vercel : envoi email J+1 post-commande pour collecte d'avis.
// À configurer dans vercel.json :
//   { "crons": [{ "path": "/api/cron/collecte-avis", "schedule": "0 10 * * *" }] }
// (chaque jour à 10h UTC)
//
// Sécurité : vérifie le header CRON_SECRET pour éviter les appels publics.

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Vérification du secret cron
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const sb = await createClient()

  // Commandes encaissées hier (J-1) avec email client présent et pas encore d'avis
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const dayStart = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString()
  const dayEnd = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString()

  const { data: commandes } = await sb.from('commandes')
    .select('id, numero, client_id, client_email, client_nom, montant_total_ttc')
    .in('statut', ['encaisse', 'retire_par_client'])
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .not('client_email', 'is', null)

  if (!commandes || commandes.length === 0) {
    return Response.json({ ok: true, sent: 0, message: 'Aucune commande éligible' })
  }

  // Filtre celles qui n'ont PAS encore d'avis
  const cmdIds = commandes.map(c => c.id)
  const { data: avisExistants } = await sb.from('avis_publics')
    .select('commande_id').in('commande_id', cmdIds)
  const avisIds = new Set((avisExistants ?? []).map(a => a.commande_id))

  const cmdEligibles = commandes.filter(c => !avisIds.has(c.id))
  if (cmdEligibles.length === 0) {
    return Response.json({ ok: true, sent: 0, message: 'Toutes les commandes ont déjà un avis' })
  }

  // Récupère paramètres établissement pour le mail
  const { data: paramRow } = await sb.from('parametres')
    .select('valeur').eq('cle', 'etablissement_nom').maybeSingle()
  const restoNom = (paramRow?.valeur as string) ?? 'notre restaurant'
  const siteBaseUrl = 'https://site-restaurant-beta.vercel.app'

  const { sendEmail, emailLayout } = await import('@/lib/email')

  let sent = 0, errors = 0
  for (const cmd of cmdEligibles) {
    const lien = `${siteBaseUrl}/avis?commande=${cmd.id}`
    const body = `
      <p>Bonjour${cmd.client_nom ? ' ' + (cmd.client_nom as string).split(' ')[0] : ''},</p>
      <p>Merci d&apos;être venu chez <strong>${restoNom}</strong> hier !</p>
      <p>Votre avis nous aiderait beaucoup. En 1 minute, partagez votre expérience :</p>
    `
    const r = await sendEmail({
      to: cmd.client_email as string,
      subject: `📝 Comment s'est passée votre visite chez ${restoNom} ?`,
      html: emailLayout({
        titre: 'Votre avis nous intéresse',
        bodyHtml: body,
        ctaLabel: '⭐ Laisser un avis (1 min)',
        ctaUrl: lien,
      }),
    })
    if (r.ok) sent++
    else errors++
  }

  return Response.json({
    ok: true,
    eligibles: cmdEligibles.length,
    sent,
    errors,
  })
}
