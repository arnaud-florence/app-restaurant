// ─── Rapprochement quotidien caisse ↔ outil (0139) ───────────────────────
//
// Compare ce que la caisse a POUSSÉ à ce que l'outil en a FAIT, jour par jour.
// Sans lui, une ingestion qui perd des lignes ne se voit nulle part : le CA
// reste juste (il vient des totaux), seules les marges dérivent.
//
//   GET|POST /api/cron/caisse/rapprochement?jours=7&source=sumup
//   Authorization: Bearer ${CRON_SECRET}
//
// Rejouable : un jour déjà rapproché est recalculé et réécrit.

import { NextResponse } from 'next/server'
import { calculerRapprochement, enregistrerRapprochement } from '@/lib/integrations/rapprochement'
import { journaliser } from '@/lib/integrations/journal'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

const jourParis = (d: Date) =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)

async function traiter(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const jours = Math.min(Math.max(Number(url.searchParams.get('jours') ?? 2), 1), 60)
  const sourceDemandee = url.searchParams.get('source')

  const t0 = Date.now()
  const sb = await createClient()

  // Quelles caisses ont poussé quelque chose ? On ne devine pas : on regarde.
  let sources: string[] = sourceDemandee ? [sourceDemandee] : []
  if (sources.length === 0) {
    const { data } = await sb
      .from('encaissements_externes')
      .select('source_caisse')
      .order('encaisse_at', { ascending: false })
      .limit(1000)
    sources = [...new Set((data ?? []).map(r => String(r.source_caisse)))]
  }

  const resultats: Array<Record<string, unknown>> = []
  const anomalies: string[] = []

  for (const source of sources) {
    // On repart d'hier : la journée en cours n'est pas finie, la rapprocher
    // produirait un faux écart à chaque exécution.
    for (let i = 1; i <= jours; i++) {
      const jour = jourParis(new Date(Date.now() - i * 86_400_000))
      try {
        const r = await calculerRapprochement(jour, source)
        // Ne rien écrire pour une journée sans aucun ticket : une caisse
        // fermée le lundi n'est pas une anomalie, et cent lignes vides
        // rendraient le tableau illisible.
        if (r.tickets_recus === 0) continue
        await enregistrerRapprochement(r)
        resultats.push({ jour, source, statut: r.statut, ecart: r.ecart_montant })
        if (r.statut !== 'ok') {
          anomalies.push(`${jour} ${source} : ${r.statut}, écart ${r.ecart_montant} €`)
        }
      } catch (e) {
        anomalies.push(`${jour} ${source} : ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  const bilan = {
    ok: anomalies.length === 0,
    sources,
    jours_traites: resultats.length,
    anomalies,
    resultats,
  }

  await journaliser({
    sens: 'entrant',
    systeme: sources.join(',') || 'aucune',
    type: 'rapprochement',
    reference: `${jours} jour(s)`,
    resultat: bilan,
    statut: anomalies.length === 0 ? 'succes' : 'echec',
    erreur: anomalies.length ? anomalies.join(' | ').slice(0, 2000) : null,
    duree_ms: Date.now() - t0,
  })

  return NextResponse.json(bilan)
}

export const GET = traiter
export const POST = traiter
