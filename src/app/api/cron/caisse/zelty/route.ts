// ─── Adaptateur Zelty → connecteur caisse ────────────────────────────────
//
// Même patron que l'adaptateur SumUp : tire les commandes, les traduit dans le
// format normalisé, laisse `/api/integrations/caisse/encaissements` faire le
// reste. Rien d'autre dans l'outil ne connaît Zelty.
//
//   GET|POST /api/cron/caisse/zelty?jours=2[&dry=1]
//   Authorization: Bearer ${CRON_SECRET}
//
//   ?dry=1  → traduit et RENVOIE le résultat sans rien écrire. C'est le mode
//             à utiliser au premier branchement : on regarde ce qui sort avant
//             de laisser quoi que ce soit entrer dans le chiffre d'affaires.
//
// Tant que la configuration est absente, la route répond 200 avec
// `{ configure: false }` : une caisse pas encore branchée n'est pas une panne,
// et le monitoring compte tout code ≠ 200 comme une erreur.

import { NextResponse } from 'next/server'
import { lireConfig, recupererCommandes } from '@/lib/integrations/zelty/client'
import { mapperCommandes } from '@/lib/integrations/zelty/mapper'
import { journaliser } from '@/lib/integrations/journal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

async function traiter(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const jours = Math.min(Math.max(Number(url.searchParams.get('jours') ?? 2), 1), 31)
  const dry = url.searchParams.get('dry') === '1'

  const cfg = lireConfig()
  if (!cfg.pret) {
    return NextResponse.json({
      ok: true,
      configure: false,
      manquants: cfg.manquants,
      message: 'Zelty pas encore branché. Renseignez ces variables sur Vercel, ' +
               'puis relancez avec ?dry=1 avant toute écriture.',
    })
  }

  const t0 = Date.now()
  const fin = new Date()
  const debut = new Date(fin.getTime() - jours * 86_400_000)

  try {
    const { commandes, url: appelee } = await recupererCommandes(cfg.config, debut, fin)
    const mapping = mapperCommandes(commandes, {
      montantsEnCentimes: cfg.config.montantsEnCentimes,
      etablissementSlug: cfg.config.etablissementSlug,
    })

    const base = {
      configure: true,
      url_appelee: appelee,
      recues: commandes.length,
      traduites: mapping.encaissements.length,
      rejets: mapping.rejets,
      avertissements: mapping.avertissements,
    }

    if (dry) {
      // Un échantillon suffit à juger la traduction ; renvoyer 500 tickets
      // rendrait la réponse illisible au moment où on en a le plus besoin.
      return NextResponse.json({
        ...base, ok: true, ecrit: false,
        echantillon: mapping.encaissements.slice(0, 3),
      })
    }

    if (mapping.encaissements.length === 0) {
      await journaliser({
        sens: 'entrant', systeme: 'zelty', type: 'tickets',
        reference: `${jours} jour(s)`, resultat: base,
        statut: mapping.rejets.length > 0 ? 'echec' : 'succes',
        duree_ms: Date.now() - t0,
      })
      return NextResponse.json({ ...base, ok: true, ecrit: false })
    }

    // On repasse par le connecteur normalisé plutôt que d'écrire ici : c'est
    // lui qui sait rapprocher, créer les fiches manquantes, poser les lignes
    // et tenir le miroir. Le dupliquer serait le laisser diverger.
    const rep = await fetch(new URL('/api/integrations/caisse/encaissements', req.url), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source_caisse: 'zelty', encaissements: mapping.encaissements }),
    })
    const bilan = await rep.json().catch(() => ({ ok: false, error: 'réponse illisible' }))

    return NextResponse.json({ ...base, ok: rep.ok && bilan.ok !== false, ecrit: true, connecteur: bilan })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'tickets',
      reference: `${jours} jour(s)`, statut: 'echec', erreur: message,
      duree_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: false, configure: true, error: message }, { status: 502 })
  }
}

export const GET = traiter
export const POST = traiter
