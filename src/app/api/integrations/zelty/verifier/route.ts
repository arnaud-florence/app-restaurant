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
import { normaliserPlat, rapprocher, type PlatNormalise } from '@/lib/integrations/zelty/catalogue'
import { construireCommandeZelty } from '@/lib/integrations/zelty/emission'
import { construireDisponibilites, type PlatCourant, type Voulu } from '@/lib/integrations/zelty/disponibilite'
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

  // ── Disponibilités : que serait-il écrit dans la caisse ? ────────
  // Le sens le plus dangereux : on veut absolument voir la charge utile
  // avant qu'elle ne parte toucher au catalogue.
  if (Array.isArray(b.courants)) {
    const voulus = new Map<string, Voulu>(
      Object.entries((b.voulus ?? {}) as Record<string, boolean>)
        .map(([k, v]) => [k, { indisponibleEnLigne: Boolean(v) }]),
    )
    const res = construireDisponibilites(b.courants as PlatCourant[], voulus)
    return NextResponse.json({ ok: res.refus.length === 0, ...res })
  }

  // ── Émission : que partirait-il vers la caisse ? ─────────────────
  // Même principe que pour la lecture : on voit ce qui sortirait AVANT que
  // quoi que ce soit ne parte.
  if (b.sortante && typeof b.sortante === 'object') {
    const e = b.sortante as Record<string, unknown>
    const res = construireCommandeZelty({
      numero: String(e.numero ?? ''),
      mode: (e.mode as 'takeaway' | 'delivery' | 'eat_in') ?? 'takeaway',
      lignes: Array.isArray(e.lignes) ? e.lignes as never : [],
      montantTotalTtc: Number(e.montantTotalTtc ?? 0),
      correspondances: new Map(Object.entries((e.correspondances ?? {}) as Record<string, string>)),
      modePaiement: typeof e.modePaiement === 'string' ? e.modePaiement : undefined,
      creneau: typeof e.creneau === 'string' ? e.creneau : null,
      commentaire: typeof e.commentaire === 'string' ? e.commentaire : null,
      prenom: typeof e.prenom === 'string' ? e.prenom : null,
      telephone: typeof e.telephone === 'string' ? e.telephone : null,
    })
    return NextResponse.json(
      res.refus
        ? { ok: false, refus: true, raisons: res.raisons }
        : { ok: true, refus: false, commande: res.commande },
    )
  }

  // ── Catalogue ────────────────────────────────────────────────────
  // Même usage que pour les commandes : on colle des plats Zelty et on voit
  // ce que la traduction en fait, sans clé et sans rien écrire.
  if (Array.isArray(b.plats)) {
    const plats: PlatNormalise[] = []
    const illisibles: string[] = []
    for (const brut of b.plats) {
      const n = normaliserPlat(brut)
      if ('erreur' in n) illisibles.push(n.erreur)
      else plats.push(n)
    }
    const locaux = Array.isArray(b.locaux)
      ? (b.locaux as Array<{ id: string; nom: string; nom_caisse?: string | null }>)
          .map(l => ({ id: l.id, nom: l.nom, nom_caisse: l.nom_caisse ?? null }))
      : []
    const corr = new Map<string, string>(
      Object.entries((b.correspondances ?? {}) as Record<string, string>),
    )
    const { apparies, sansCorrespondance } = rapprocher(plats, locaux, corr)
    return NextResponse.json({
      ok: illisibles.length === 0,
      lus: b.plats.length,
      lisibles: plats.length,
      illisibles,
      apparies: apparies.map(a => ({ nom: a.plat.nom, recetteId: a.recetteId, par: a.par })),
      sans_correspondance: sansCorrespondance.map(p => ({ id: p.identifiant, nom: p.nom })),
      apercu: plats.slice(0, 3),
    })
  }

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
