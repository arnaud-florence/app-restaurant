// ─── Ruptures : caisse Zelty → outil ─────────────────────────────────────
//
//   GET|POST /api/cron/caisse/zelty/disponibilites/entrantes[?dry=1]
//   Authorization: Bearer ${CRON_SECRET}
//
// Le sens qui manquait. On poussait nos ruptures vers la caisse depuis la
// 0141 ; l'inverse n'existait pas. Un plat marqué en rupture SUR LA CAISSE —
// le geste naturel quand on s'en aperçoit en servant — ne redescendait pas,
// et casatasia.fr continuait de le vendre.
//
// ⚠️ ON N'AJOUTE QUE DES RUPTURES, ON N'EN LÈVE JAMAIS. La règle et ses trois
// raisons sont dans `zelty/ruptures-entrantes.ts`, avec la traduction pure.
//
// ⚠️ Pas de boucle avec le sens sortant, et ce n'est pas un hasard : ce sont
// DEUX drapeaux distincts chez Zelty. On écrit `disable_takeaway` /
// `disable_delivery` (les canaux de vente en ligne) ; on lit `outofstock`
// (l'état du stock). Notre poussée ne modifie donc jamais ce qu'on relit ici.
// Une rupture venue de la caisse posera bien `rupture_le`, qui repartira en
// `disable_takeaway` au passage suivant — et là ça s'arrête, parce que ce
// champ-là n'est pas celui qu'on lit.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appelZelty, zeltyConfigure } from '@/lib/integrations/zelty/client'
import {
  deciderRuptures, type DispoZelty, type ProduitCourant,
} from '@/lib/integrations/zelty/ruptures-entrantes'
import { journaliser } from '@/lib/integrations/journal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const attendu = process.env.CRON_SECRET
  if (!attendu) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${attendu}`
}

/** Le jour métier est celui de PARIS, jamais celui du serveur. Vercel tourne
 *  en UTC : après 22 h, `new Date().toISOString()` daterait la rupture de la
 *  veille — et la caisse ne la verrait jamais. */
const jourParis = () =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

async function traiter(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })
  const dry = new URL(req.url).searchParams.get('dry') === '1'

  // Une caisse pas encore branchée n'est PAS une panne : le monitoring compte
  // tout code ≠ 200 comme une erreur.
  if (!zeltyConfigure()) return NextResponse.json({ ok: true, configure: false })

  const debut = Date.now()

  // L'identifiant du restaurant vient de `GET /info` plutôt que d'une variable
  // d'environnement : une valeur recopiée à la main finit par désigner un
  // autre établissement le jour où la clé change.
  const info = await appelZelty('/info')
  if (!info.ok) {
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'disponibilite',
      statut: 'echec', erreur: `GET /info — ${info.erreur}`,
    })
    return NextResponse.json({ ok: false, erreur: info.erreur }, { status: 200 })
  }
  const idResto = (info.data as { restaurant_id?: number } | null)?.restaurant_id
  if (!idResto) {
    return NextResponse.json({ ok: false, erreur: 'restaurant_id introuvable' }, { status: 200 })
  }

  const rep = await appelZelty(`/restaurants/${idResto}/dishes_availability`)
  if (!rep.ok) {
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'disponibilite',
      statut: 'echec', erreur: rep.erreur,
    })
    return NextResponse.json({ ok: false, erreur: rep.erreur }, { status: 200 })
  }

  const dispos = ((rep.data as { dishes?: DispoZelty[] } | null)?.dishes ?? []) as DispoZelty[]

  const sb = await createClient()
  const { data: lignes } = await sb
    .from('recettes')
    .select('id, nom, rupture_le')
    .eq('actif', true)
  const produits = (lignes ?? []) as ProduitCourant[]

  const aujourdhui = jourParis()
  const d = deciderRuptures(dispos, produits, aujourdhui)

  if (!dry && d.aMarquer.length > 0) {
    const { error } = await sb
      .from('recettes')
      .update({ rupture_le: aujourdhui })
      .in('id', d.aMarquer.map(p => p.id))
    if (error) {
      await journaliser({
        sens: 'entrant', systeme: 'zelty', type: 'disponibilite',
        payload: { aMarquer: d.aMarquer }, statut: 'echec', erreur: error.message,
      })
      return NextResponse.json({ ok: false, erreur: error.message }, { status: 200 })
    }
  }

  const bilan = {
    ok: true,
    dry,
    lues: dispos.length,
    marquees: dry ? 0 : d.aMarquer.length,
    a_marquer: d.aMarquer.map(p => p.nom),
    deja_connues: d.dejaConnus,
    sans_correspondance: d.inconnus.length,
    avertissements: d.avertissements,
  }
  await journaliser({
    sens: 'entrant', systeme: 'zelty', type: 'disponibilite',
    reference: aujourdhui, resultat: bilan,
    statut: d.avertissements.length > 0 ? 'echec' : 'succes',
    erreur: d.avertissements.join(' | ') || null,
    duree_ms: Date.now() - debut,
  })
  return NextResponse.json(bilan)
}

export const GET = traiter
export const POST = traiter
