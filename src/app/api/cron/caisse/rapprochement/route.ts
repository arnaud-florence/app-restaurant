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
import { appelZelty, zeltyConfigure } from '@/lib/integrations/zelty/client'
import { reponseClotures, normaliser as normaliserCloture, agregerParJour } from '@/lib/integrations/zelty/clotures'
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

  // ─── Le Z de la caisse, troisième témoin ────────────────────────────────
  // Les deux chiffres déjà comparés (reçu / compris) viennent du MÊME flux :
  // un ticket que la caisse ne nous envoie jamais est invisible des deux
  // côtés, et la journée s'affiche « ok » en étant amputée. Le Z est ce que
  // la caisse déclare pour elle-même — un témoin indépendant.
  const zParJour = new Map<string, { ids: string[]; ca_ttc: number; taxes: number; commentaires: string[] }>()
  if (zeltyConfigure()) {
    const depuis = jourParis(new Date(Date.now() - (jours + 1) * 86_400_000))
    const jusqua = jourParis(new Date())
    const rep = await appelZelty(`/closures?after=${depuis}&before=${jusqua}&limit=500`)
    if (rep.ok) {
      const parsed = reponseClotures.safeParse(rep.data)
      if (parsed.success) {
        const propres = []
        for (const brut of parsed.data.closures) {
          const n = normaliserCloture(brut)
          if (n.ok) propres.push(n.cloture)
          else anomalies.push(n.motif)
        }
        for (const [jour, agr] of agregerParJour(propres)) zParJour.set(jour, agr)
      } else {
        anomalies.push(`clôtures illisibles : ${parsed.error.issues[0].message}`)
      }
    } else {
      // Pas de Z n'est pas une panne du rapprochement : les deux autres
      // témoins restent valables, et on le dit plutôt que de se taire.
      anomalies.push(`clôtures injoignables : ${rep.erreur}`)
    }
  }

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

        // ⚠️ Le Z ne concerne QUE la caisse qui l'a produit. L'appliquer à
        // l'historique SumUp comparerait le total Zelty d'un jour aux tickets
        // d'une autre caisse — un écart inventé de toutes pièces.
        const z = source === 'zelty' ? zParJour.get(jour) : undefined
        if (z) {
          r.cloture_id_externe = z.ids.join(',')
          r.cloture_ca_ttc = z.ca_ttc
          r.cloture_taxes = z.taxes
          r.ecart_cloture = Math.round((z.ca_ttc - r.montant_recu) * 100) / 100
          // Un Z qui ne tombe pas sur nos tickets veut dire qu'il en manque :
          // c'est plus grave qu'un écart de traitement, donc ça prime.
          if (Math.abs(r.ecart_cloture) >= 0.05) r.statut = 'ecart'
        }

        await enregistrerRapprochement(r)
        resultats.push({ jour, source, statut: r.statut, ecart: r.ecart_montant })
        if (r.statut !== 'ok') {
          const surZ = r.ecart_cloture && Math.abs(r.ecart_cloture) >= 0.05
            ? `, Z de la caisse ${r.cloture_ca_ttc} € contre ${r.montant_recu} € reçus`
            : ''
          anomalies.push(`${jour} ${source} : ${r.statut}, écart ${r.ecart_montant} €${surZ}`)
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
