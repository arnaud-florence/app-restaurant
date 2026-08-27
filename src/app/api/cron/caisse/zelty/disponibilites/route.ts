// ─── Disponibilités : outil → caisse Zelty ───────────────────────────────
//
// L'inventaire du matin sait qu'il ne reste que quatre paninis. Sans le dire
// à la caisse, on continue de les vendre en ligne et il faut ensuite
// l'expliquer au client sur le pas de la porte.
//
//   GET|POST /api/cron/caisse/zelty/disponibilites[?dry=1]
//   Authorization: Bearer ${CRON_SECRET}
//
// ⚠️ Le sens le plus dangereux de toute l'intégration : `POST /catalog/dishes`
// est un UPSERT qui exige `name`, `price` et `tax`. On RELIT donc le catalogue
// juste avant, on recopie ces champs tels quels, et on ne touche que les
// drapeaux de disponibilité. Aucun prix n'est jamais inventé.
//
// La rupture coupe `disable_takeaway` et `disable_delivery` — les canaux en
// ligne — mais JAMAIS `disable` : l'éteindre ferait relire « produit inactif »
// par le miroir du catalogue, qui éteindrait la fiche chez nous, et le produit
// disparaîtrait même une fois réapprovisionné.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lireConfig, recupererPlats } from '@/lib/integrations/zelty/client'
import { construireDisponibilites, type PlatCourant, type Voulu } from '@/lib/integrations/zelty/disponibilite'
import { chargerCorrespondances } from '@/lib/integrations/correspondances'
import { journaliser } from '@/lib/integrations/journal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

const jourParis = () =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

async function traiter(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })
  const dry = new URL(req.url).searchParams.get('dry') === '1'

  const cfg = lireConfig()
  if (!cfg.pret) {
    return NextResponse.json({ ok: true, configure: false, manquants: cfg.manquants })
  }

  const t0 = Date.now()
  try {
    const sb = await createClient()
    const aujourdhui = jourParis()

    // Nos produits, et ceux déclarés en rupture AUJOURD'HUI. Une rupture
    // datée se périme seule : personne n'a à penser à la lever le lendemain.
    const { data: recs } = await sb.from('recettes').select('id, nom, rupture_le')
    type Rec = { id: string; nom: string; rupture_le: string | null }
    const locaux = (recs ?? []) as Rec[]
    const correspondances = await chargerCorrespondances('zelty').catch(() => new Map<string, string>())

    // recette → identifiant Zelty : on inverse la table des correspondances.
    const zeltyParRecette = new Map<string, string>()
    for (const [ext, rec] of correspondances) zeltyParRecette.set(rec, ext)

    const voulus = new Map<string, Voulu>()
    const sansCorrespondance: string[] = []
    for (const r of locaux) {
      const ext = zeltyParRecette.get(r.id)
      if (!ext) { if (r.rupture_le === aujourdhui) sansCorrespondance.push(r.nom); continue }
      voulus.set(ext, { indisponibleEnLigne: r.rupture_le === aujourdhui })
    }

    const { plats: brut } = await recupererPlats(cfg.config)
    const courants = brut as PlatCourant[]
    const { majs, refus, inchanges } = construireDisponibilites(courants, voulus)

    const bilan = {
      configure: true,
      jour: aujourdhui,
      en_rupture: locaux.filter(r => r.rupture_le === aujourdhui).length,
      a_mettre_a_jour: majs.length,
      inchanges,
      refus,
      // Une rupture sur un produit que la caisse ne connaît pas ne peut pas
      // être propagée : on le dit plutôt que de la perdre en silence.
      ruptures_non_propagees: sansCorrespondance,
    }

    if (dry) return NextResponse.json({ ...bilan, ok: true, ecrit: false, apercu: majs.slice(0, 5) })
    if (majs.length === 0) return NextResponse.json({ ...bilan, ok: true, ecrit: false })

    const r = await fetch(`${cfg.config.baseUrl.replace(/\/+$/, '')}${cfg.config.cheminCatalogue}?lang=fr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.config.cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(majs),
    })
    const rep = await r.json().catch(() => null) as { errmsg?: string; errors?: unknown } | null
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${rep?.errmsg ?? ''} ${JSON.stringify(rep?.errors ?? {})}`.slice(0, 500))
    }

    const resultat = { ...bilan, ecrit: true }
    await journaliser({
      sens: 'sortant', systeme: 'zelty', type: 'disponibilite',
      reference: `${majs.length} plat(s)`, payload: majs, resultat,
      statut: refus.length === 0 && sansCorrespondance.length === 0 ? 'succes' : 'echec',
      erreur: [
        ...refus.map(x => `${x.id} : ${x.raison}`),
        sansCorrespondance.length ? `ruptures non propagées : ${sansCorrespondance.join(', ')}` : '',
      ].filter(Boolean).join(' | ').slice(0, 2000) || null,
      duree_ms: Date.now() - t0,
    })

    return NextResponse.json({ ...resultat, ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await journaliser({
      sens: 'sortant', systeme: 'zelty', type: 'disponibilite',
      statut: 'echec', erreur: message, duree_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: false, configure: true, error: message }, { status: 502 })
  }
}

export const GET = traiter
export const POST = traiter
