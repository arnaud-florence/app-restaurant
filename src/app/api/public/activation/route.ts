// GET /api/public/activation
//
// Dit au site public CASATASIA ce qui est ouvert et ce qui ne l'est pas.
// Source de vérité : table `activites_modules` (migration 0110), pilotée
// depuis /admin/etablissements → onglet « Activités ».
//
// Réponse :
//   {
//     etat:     { fournil: true, chambres: false, ... },   // un booléen par module
//     teasers:  [ { cle, libelle, emoji, teaser_texte, date_ouverture_prevue } ],
//     tags:     ['FOURNIL'],                               // tags de carte visibles
//     livraison:{ communes, heureLimite, heureTournee, minimumTtc, fraisTtc }
//   }
//
// ⚠️ En cas d'erreur base, on répond 200 avec le repli « Fournil seul » plutôt
// qu'un 500 : le site doit toujours pouvoir se rendre, et jamais dans un état
// qui révélerait une activité non ouverte.

import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { getModules, getConfigLivraisonFournil } from '@/lib/activation/server'
import {
  REPLI_FOURNIL_SEUL,
  LIVRAISON_FOURNIL_DEFAUT,
  etatDepuisModules,
  tagsActifs,
} from '@/lib/activation/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'activation', { windowMs: 60_000, max: 240 })
  if (!guard.ok) return guard.response

  const cors = Object.fromEntries(corsHeaders(req.headers.get('origin')))
  const cache = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }

  try {
    const [modules, livraison] = await Promise.all([
      getModules(),
      getConfigLivraisonFournil(),
    ])

    // Table absente ou vide → repli sûr, mais on répond 200.
    if (modules.length === 0) {
      return Response.json({
        etat: REPLI_FOURNIL_SEUL,
        teasers: [],
        tags: tagsActifs(REPLI_FOURNIL_SEUL),
        livraison: LIVRAISON_FOURNIL_DEFAUT,
        repli: true,
      }, { headers: { ...cors, ...cache } })
    }

    const etat = etatDepuisModules(modules)

    return Response.json({
      etat,
      teasers: modules
        .filter(m => !m.actif && m.teaser)
        .map(m => ({
          cle: m.cle,
          libelle: m.libelle,
          emoji: m.emoji,
          teaser_texte: m.teaser_texte,
          date_ouverture_prevue: m.date_ouverture_prevue,
        })),
      tags: tagsActifs(etat),
      livraison,
      repli: false,
    }, { headers: { ...cors, ...cache } })
  } catch (e) {
    console.error('[api/public/activation]', e)
    return Response.json({
      etat: REPLI_FOURNIL_SEUL,
      teasers: [],
      tags: tagsActifs(REPLI_FOURNIL_SEUL),
      livraison: LIVRAISON_FOURNIL_DEFAUT,
      repli: true,
    }, { headers: { ...cors, ...cache } })
  }
}
