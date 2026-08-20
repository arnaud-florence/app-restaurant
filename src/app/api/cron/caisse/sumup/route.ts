// ─── Adaptateur SumUp → connecteur caisse ────────────────────────────────
//
// Tire les transactions SumUp et les pousse dans le format normalisé du
// connecteur (`/api/integrations/caisse/encaissements`), qui les matérialise
// en commandes 'CAISSE' pour qu'elles entrent dans le chiffre d'affaires.
//
//   GET|POST /api/cron/caisse/sumup?jours=7
//   Authorization: Bearer ${CRON_SECRET}
//
// Variables d'environnement (à poser sur Vercel, jamais dans le dépôt) :
//   SUMUP_API_KEY        clé secrète SumUp (sup_sk_…), profil marchand
//   SUMUP_MERCHANT_CODE  code marchand SumUp (visible dans le back-office)
//
// ⚠️ DEUX LIMITES À CONNAÎTRE, elles ne viennent pas du code mais de SumUp :
//
//   1. Le lecteur de carte ne voit QUE les paiements par carte. Les ventes en
//      espèces n'y sont pas. Le CA remonté ici est donc le CA carte, pas le CA
//      total — sauf si l'équipe saisit aussi les espèces sur SumUp Caisse.
//
//   2. L'historique des transactions ne porte pas de ventilation TVA : SumUp
//      renvoie un montant, pas une répartition 5,5 / 10 / 20. On laisse donc
//      `ventilation_tva` vide plutôt que d'inventer une clé de répartition —
//      une TVA fausse serait pire qu'une TVA absente. La déclaration se fait
//      sur les états SumUp, qui eux la portent.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

type TxSumUp = {
  id?: string
  transaction_code?: string
  amount?: number
  currency?: string
  status?: string
  payment_type?: string
  timestamp?: string
}

async function handler(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })

  const cle = process.env.SUMUP_API_KEY
  const marchand = process.env.SUMUP_MERCHANT_CODE
  if (!cle || !marchand) {
    return NextResponse.json(
      { ok: false, error: 'SUMUP_API_KEY ou SUMUP_MERCHANT_CODE absent des variables d’environnement' },
      { status: 503 },
    )
  }

  const url = new URL(req.url)
  const jours = Math.min(Math.max(Number(url.searchParams.get('jours') ?? 3), 1), 60)
  const depuis = new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10)

  // Historique des transactions du marchand.
  const apiUrl = new URL(`https://api.sumup.com/v0.1/merchants/${marchand}/transactions/history`)
  apiUrl.searchParams.set('start_date', depuis)
  apiUrl.searchParams.set('limit', '500')

  let items: TxSumUp[] = []
  try {
    const r = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!r.ok) {
      const txt = await r.text()
      return NextResponse.json({ ok: false, error: `SumUp ${r.status}`, details: txt.slice(0, 400) }, { status: 502 })
    }
    const j = await r.json()
    items = Array.isArray(j) ? j : (j.items ?? j.transactions ?? [])
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  // Seules les transactions abouties deviennent du CA. Un paiement remboursé ou
  // échoué ne doit pas gonfler la journée.
  const encaissements = items
    .filter(t => (t.status ?? '').toUpperCase() === 'SUCCESSFUL')
    .filter(t => typeof t.amount === 'number' && (t.amount as number) > 0)
    .map(t => ({
      ticket_externe: String(t.transaction_code ?? t.id),
      etablissement_slug: 'fournil',
      montant_ttc: Number(t.amount),
      mode_paiement: (t.payment_type ?? 'carte').toLowerCase(),
      encaisse_at: t.timestamp,
    }))
    .filter(e => e.ticket_externe && e.ticket_externe !== 'undefined')

  if (encaissements.length === 0) {
    return NextResponse.json({ ok: true, source_caisse: 'sumup', depuis, recus: 0, message: 'aucune transaction' })
  }

  // On réutilise le connecteur normalisé plutôt que d'écrire en base ici : une
  // seule logique de rapprochement et d'idempotence, un seul endroit à relire.
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://app-restaurant-livid.vercel.app'
  const rep = await fetch(`${base}/api/integrations/caisse/encaissements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source_caisse: 'sumup', encaissements }),
    cache: 'no-store',
  })

  const resultat = await rep.json().catch(() => ({}))
  return NextResponse.json({ ok: rep.ok, depuis, envoyes: encaissements.length, connecteur: resultat })
}

export const GET = handler
export const POST = handler
