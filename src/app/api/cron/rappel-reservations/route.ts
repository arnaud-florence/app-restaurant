// CRON 48h : envoie un email de rappel aux clients dont la réservation chambre arrive dans 48h.
// Déclenché par vercel.json cron quotidien (ex: 09:00).
// Sécurisé par CRON_SECRET via Authorization header.

import { createClient } from '@/lib/supabase/server'
import { sendEmail, emailRappelReservation } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Sécurité : vérifie le secret cron Vercel
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = await createClient()

  // Réservations qui arrivent dans 48h ± 12h (tolérance)
  const now = new Date()
  const target = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const targetStart = new Date(target.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const targetEnd = new Date(target.getTime() + 12 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: resas, error } = await sb.from('reservations_chambres')
    .select('id, client_nom, client_email, date_arrivee, chambre:chambres(nom)')
    .in('statut', ['demande', 'confirmee'])
    .gte('date_arrivee', targetStart)
    .lte('date_arrivee', targetEnd)
    .not('client_email', 'is', null)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  type ResaRow = {
    id: string
    client_nom: string
    client_email: string
    date_arrivee: string
    chambre?: { nom: string } | null
  }
  const list = (resas ?? []) as unknown as ResaRow[]
  const results: Array<{ id: string; ok: boolean; reason?: string }> = []

  for (const r of list) {
    const tpl = emailRappelReservation({
      chambre_nom: r.chambre?.nom ?? 'votre chambre',
      date_arrivee: r.date_arrivee,
      client_nom: r.client_nom,
    })
    const res = await sendEmail({ to: r.client_email, subject: tpl.subject, html: tpl.html, text: tpl.text })
    results.push({ id: r.id, ok: res.ok, reason: res.reason })
  }

  return Response.json({ count: list.length, sent: results.filter(r => r.ok).length, results })
}
