// GET /api/public/livraison-fournil
//
// Dit au site quelle est la PROCHAINE TOURNÉE de livraison du fournil.
//
// Modèle « tournée », pas « créneaux » : le fournil ne propose pas des
// tranches horaires à réserver (c'est ce que fait /creneaux-retrait pour le
// snacking), mais UNE tournée par jour. Une commande passée avant l'heure
// limite part le matin même ; après, elle bascule au lendemain.
//
// Réponse :
//   {
//     disponible: true,
//     communes: ['Sainte-Anastasie-sur-Issole'],
//     heureLimite: '08:30', heureTournee: '10:00',
//     minimumTtc: 0, fraisTtc: 0,
//     tournee: { date: '2026-08-11', jourMeme: false, creneau: '2026-08-11T08:00:00.000Z' }
//   }
//
// ⚠️ `cache: no-store` volontaire : la réponse bascule au passage de l'heure
// limite. Un TTL, même court, ferait afficher « livré ce matin » à un client
// qui vient de rater le coche.

import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { getActivation, getConfigLivraisonFournil } from '@/lib/activation/server'
import { tourneePour, heuresRetraitFournil } from '@/lib/activation/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'livraison-fournil', { windowMs: 60_000, max: 240 })
  if (!guard.ok) return guard.response

  const headers = {
    ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
    'Cache-Control': 'no-store',
  }

  try {
    const [etat, cfg] = await Promise.all([getActivation(), getConfigLivraisonFournil()])
    const maintenant = new Date()

    // Date demandée pour le retrait (défaut : aujourd'hui, heure de Paris).
    const url = new URL(req.url)
    const demandee = url.searchParams.get('date')
    const tournee = tourneePour(maintenant, cfg)
    const dateRetrait = demandee && /^\d{4}-\d{2}-\d{2}$/.test(demandee)
      ? demandee
      : tourneePour(maintenant, { ...cfg, heureLimite: '23:59' }).date  // = aujourd'hui à Paris

    return Response.json({
      disponible: true,
      ouverture: cfg.ouverture,
      fermeture: cfg.fermeture,
      // ── Retrait au fournil ──
      retrait: {
        date: dateRetrait,
        heures: heuresRetraitFournil(dateRetrait, maintenant, cfg),
      },
      // ── Livraison à domicile ──
      livraison: etat.fournil_livraison
        ? {
            disponible: true,
            communes: cfg.communes,
            heureLimite: cfg.heureLimite,
            heureTournee: cfg.heureTournee,
            minimumTtc: cfg.minimumTtc,
            fraisTtc: cfg.fraisTtc,
            tournee,
          }
        : { disponible: false },
    }, { headers })
  } catch (e) {
    console.error('[api/public/livraison-fournil]', e)
    // On ferme la livraison plutôt que de laisser passer une commande qu'on
    // ne saurait pas honorer.
    return Response.json(
      { disponible: false, raison: 'Service de livraison momentanément indisponible.' },
      { headers },
    )
  }
}
