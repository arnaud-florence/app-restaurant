// ─── Banc d'essai de la traduction Zelty ─────────────────────────────────
//
// À utiliser à la SECONDE où une vraie commande Zelty est disponible — copiée
// de leur documentation, de leur back-office ou d'un appel manuel — et avant
// d'avoir branché quoi que ce soit.
//
//   POST /api/integrations/zelty/verifier
//   Authorization: Bearer ${CRON_SECRET}
//   { "commandes": [ … le JSON brut de Zelty … ], "centimes": true }
//
// Renvoie la traduction et ses diagnostics. N'écrit RIEN, ne contacte personne.
// C'est ce qui permet de corriger `mapper.ts` sur pièce plutôt qu'à l'aveugle.

import { NextResponse } from 'next/server'
import { mapperCommandes } from '@/lib/integrations/zelty/mapper'
import { extraireListe } from '@/lib/integrations/zelty/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected || (req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 }) }

  const b = (body ?? {}) as Record<string, unknown>
  // On accepte aussi bien `{ commandes: [...] }` qu'une réponse Zelty brute
  // collée telle quelle : au moment du branchement, chaque friction compte.
  const liste = Array.isArray(b.commandes) ? b.commandes : extraireListe(body)
  if (liste.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'Aucune commande trouvée. Collez le tableau de commandes, ou la réponse complète de Zelty.',
    }, { status: 422 })
  }

  const centimes = b.centimes === true || b.centimes === 'true'
  const resultat = mapperCommandes(liste, {
    montantsEnCentimes: centimes,
    etablissementSlug: typeof b.slug === 'string' ? b.slug : 'fournil',
  })

  const totaux = resultat.encaissements.reduce(
    (a, e) => ({ ttc: a.ttc + e.montant_ttc, lignes: a.lignes + (e.produits?.length ?? 0) }),
    { ttc: 0, lignes: 0 },
  )

  return NextResponse.json({
    ok: resultat.rejets.length === 0,
    lues: liste.length,
    traduites: resultat.encaissements.length,
    total_ttc: Math.round(totaux.ttc * 100) / 100,
    lignes_produits: totaux.lignes,
    // Le détail des lignes est LE point que Zelty n'a pas confirmé en démo.
    // S'il est à zéro, le CA sera juste mais le stock et les marges aveugles.
    detail_produits_present: totaux.lignes > 0,
    rejets: resultat.rejets,
    avertissements: resultat.avertissements,
    apercu: resultat.encaissements.slice(0, 3),
  })
}
