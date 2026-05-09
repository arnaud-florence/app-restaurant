// GET /api/public/creneaux-retrait?date=YYYY-MM-DD
// Calcule les créneaux disponibles pour le retrait des commandes ONLINE.
// Logique :
//   1. Lit la config capacite_cuisine_par_creneau pour la zone SNACKING
//      (par défaut — pourra être paramétrable plus tard).
//   2. Découpe en créneaux de duree_creneau_min minutes.
//   3. Pour chaque créneau, compte les commandes ONLINE déjà créées avec
//      creneau_retrait dans cette tranche.
//   4. Renvoie disponible=true si count < max_commandes, sinon false.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'creneaux-retrait', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const dateStr = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const tag = url.searchParams.get('tag') ?? 'SNACKING'

  // Validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return Response.json({ error: 'date invalide (YYYY-MM-DD)' }, { status: 400, headers: corsHeaders(req.headers.get('origin')) })
  }
  if (!['SNACKING', 'PIZZA', 'BAR'].includes(tag)) {
    return Response.json({ error: 'tag invalide' }, { status: 400, headers: corsHeaders(req.headers.get('origin')) })
  }

  const date = new Date(dateStr + 'T00:00:00')
  const jourSemaine = date.getDay()  // 0=dim, 6=sam

  const sb = await createClient()
  const { data: configs } = await sb.from('capacite_cuisine_par_creneau')
    .select('heure_debut, heure_fin, duree_creneau_min, max_commandes')
    .eq('jour_semaine', jourSemaine)
    .eq('tag_destination', tag)
    .eq('actif', true)

  if (!configs || configs.length === 0) {
    return Response.json({ items: [], message: `Pas de service ${tag} ce jour` }, {
      headers: {
        ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
        'Cache-Control': 'public, s-maxage=120',
      },
    })
  }

  // Compte commandes ONLINE déjà existantes pour ce jour avec creneau_retrait
  const dayStart = new Date(dateStr + 'T00:00:00').toISOString()
  const dayEnd = new Date(dateStr + 'T23:59:59').toISOString()
  const { data: cmds } = await sb.from('commandes')
    .select('creneau_retrait')
    .eq('source', 'ONLINE')
    .not('statut', 'in', '(annule)')
    .gte('creneau_retrait', dayStart)
    .lte('creneau_retrait', dayEnd)

  const slots: Array<{ heure: string; iso: string; disponible: boolean }> = []
  const now = new Date()

  for (const cfg of configs) {
    const debut = (cfg.heure_debut as string).slice(0, 5)  // HH:MM
    const fin = (cfg.heure_fin as string).slice(0, 5)
    const duree = Number(cfg.duree_creneau_min ?? 15)
    const max = Number(cfg.max_commandes ?? 5)

    const [hd, md] = debut.split(':').map(Number)
    const [hf, mf] = fin.split(':').map(Number)
    let curMin = hd * 60 + md
    const endMin = hf * 60 + mf

    while (curMin < endMin) {
      const h = Math.floor(curMin / 60)
      const m = curMin % 60
      const heureStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const slotStart = new Date(`${dateStr}T${heureStr}:00`)
      const slotEnd = new Date(slotStart.getTime() + duree * 60_000)

      // Skip si déjà passé (avec marge 15 min)
      if (slotStart.getTime() < now.getTime() + 15 * 60_000) {
        curMin += duree
        continue
      }

      // Compte commandes dans ce créneau
      const count = (cmds ?? []).filter(c => {
        if (!c.creneau_retrait) return false
        const t = new Date(c.creneau_retrait as string).getTime()
        return t >= slotStart.getTime() && t < slotEnd.getTime()
      }).length

      slots.push({
        heure: heureStr,
        iso: slotStart.toISOString(),
        disponible: count < max,
      })
      curMin += duree
    }
  }

  return Response.json({ date: dateStr, tag, items: slots, count: slots.length }, {
    headers: {
      ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
      'Cache-Control': 'public, s-maxage=30',   // cache court car capacités évoluent vite
    },
  })
}
