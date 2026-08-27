// ─── Miroir du catalogue Zelty → outil ───────────────────────────────────
//
// Zelty devient maître des données COMMERCIALES : nom, prix, TVA,
// disponibilité — ce qui s'imprime sur le ticket et fait foi fiscalement.
// L'outil garde ce qu'aucune caisse ne portera jamais : photos, allergènes,
// prix d'achat réels, correspondance « Panuozzi ← pâton ».
//
//   GET|POST /api/cron/caisse/zelty/catalogue[?dry=1]
//   Authorization: Bearer ${CRON_SECRET}
//
//   ?dry=1  → rapproche et RENVOIE le résultat sans rien écrire. À utiliser
//             au premier appel : c'est là qu'on voit combien de plats
//             tombent juste et lesquels restent orphelins.
//
// Rien n'est créé automatiquement. Un plat Zelty sans correspondance est
// REMONTÉ, pas inventé : créer à l'aveugle doublonnerait nos 85 fiches du
// Fournil dès le premier appel.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lireConfig, recupererPlats } from '@/lib/integrations/zelty/client'
import { normaliserPlat, rapprocher, type PlatNormalise } from '@/lib/integrations/zelty/catalogue'
import { journaliser } from '@/lib/integrations/journal'
import { chargerCorrespondances, noterCorrespondance } from '@/lib/integrations/correspondances'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

/** Écart de prix au-delà duquel on alerte au lieu d'appliquer en silence. */
const ECART_PRIX_ALERTE = 0.5

async function traiter(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })
  const dry = new URL(req.url).searchParams.get('dry') === '1'

  const cfg = lireConfig()
  if (!cfg.pret) {
    return NextResponse.json({
      ok: true, configure: false, manquants: cfg.manquants,
      message: 'Zelty pas encore branché.',
    })
  }

  const t0 = Date.now()
  try {
    const { plats: brut, url, pages } = await recupererPlats(cfg.config)

    const plats: PlatNormalise[] = []
    const illisibles: string[] = []
    for (const b of brut) {
      const n = normaliserPlat(b)
      if ('erreur' in n) illisibles.push(n.erreur)
      else plats.push(n)
    }

    const sb = await createClient()
    const { data: locaux } = await sb.from('recettes').select('id, nom, nom_caisse, prix_vente_ht, tva, actif')
    type Local = { id: string; nom: string; nom_caisse: string | null; prix_vente_ht: number | string | null; tva: number | string | null; actif: boolean }
    const listeLocale = (locaux ?? []) as Local[]
    const correspondances = await chargerCorrespondances('zelty').catch(() => new Map<string, string>())

    const { apparies, sansCorrespondance } = rapprocher(
      plats,
      listeLocale.map(l => ({ id: l.id, nom: l.nom, nom_caisse: l.nom_caisse })),
      correspondances,
    )

    // ── Écarts de prix ────────────────────────────────────────────────
    // On compare AVANT d'écrire. Un prix qui change de plus de 50 centimes
    // n'est pas une correction d'arrondi : c'est une décision commerciale,
    // et elle mérite d'être vue plutôt qu'appliquée en silence.
    const parId = new Map(listeLocale.map(l => [l.id, l]))
    const ecarts: Array<{ nom: string; local: number; zelty: number }> = []
    for (const a of apparies) {
      if (!a.recetteId || a.plat.prixTtc == null || a.plat.tva == null) continue
      const l = parId.get(a.recetteId)
      if (!l) continue
      const ttcLocal = Number(l.prix_vente_ht ?? 0) * (1 + Number(l.tva ?? 0) / 100)
      if (Math.abs(ttcLocal - a.plat.prixTtc) > ECART_PRIX_ALERTE) {
        ecarts.push({ nom: a.plat.nom, local: Math.round(ttcLocal * 100) / 100, zelty: a.plat.prixTtc })
      }
    }

    const bilan = {
      configure: true, url_appelee: url, pages,
      plats_recus: brut.length,
      plats_lisibles: plats.length,
      apparies: apparies.length,
      par_remote_id: apparies.filter(a => a.par === 'remote_id').length,
      par_correspondance: apparies.filter(a => a.par === 'correspondance').length,
      par_nom: apparies.filter(a => a.par === 'nom').length,
      sans_correspondance: sansCorrespondance.map(p => ({ id: p.identifiant, nom: p.nom })),
      ecarts_prix: ecarts,
      illisibles: illisibles.slice(0, 10),
    }

    if (dry) return NextResponse.json({ ...bilan, ok: true, ecrit: false })

    // ── Écriture ──────────────────────────────────────────────────────
    let liens = 0, majs = 0
    for (const a of apparies) {
      if (!a.recetteId) continue
      // Le lien d'abord : c'est lui qui rend les synchros suivantes exactes,
      // même si le nom change des deux côtés.
      if (a.par === 'nom') {
        await noterCorrespondance({
          systeme: 'zelty', identifiant_externe: a.plat.identifiant,
          recette_id: a.recetteId, libelle_externe: a.plat.nom,
        })
        liens++
      }
      // Données commerciales : Zelty fait foi.
      const maj: Record<string, unknown> = { nom_caisse: a.plat.nom }
      if (a.plat.prixTtc != null && a.plat.tva != null) {
        maj.prix_vente_ht = Math.round((a.plat.prixTtc / (1 + a.plat.tva / 100)) * 10000) / 10000
        maj.tva = a.plat.tva
      }
      maj.actif = a.plat.actif
      const { error } = await sb.from('recettes').update(maj).eq('id', a.recetteId)
      if (!error) majs++
    }

    const resultat = { ...bilan, liens_crees: liens, fiches_mises_a_jour: majs }
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'catalogue',
      reference: `${plats.length} plat(s)`, resultat,
      statut: sansCorrespondance.length > 0 || ecarts.length > 0 ? 'echec' : 'succes',
      erreur: [
        sansCorrespondance.length ? `${sansCorrespondance.length} plat(s) sans correspondance` : '',
        ecarts.length ? `${ecarts.length} écart(s) de prix` : '',
      ].filter(Boolean).join(' · ') || null,
      duree_ms: Date.now() - t0,
    })

    return NextResponse.json({ ...resultat, ok: true, ecrit: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'catalogue',
      statut: 'echec', erreur: message, duree_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: false, configure: true, error: message }, { status: 502 })
  }
}

export const GET = traiter
export const POST = traiter
