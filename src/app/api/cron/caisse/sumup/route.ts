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
// Deux choses vérifiées sur les tickets réels du Fournil (17–19 août) :
//
//   • Les ventes en ESPÈCES remontent (`payment_type: CASH`). Le lecteur ne
//     traite que la carte, mais SumUp Caisse enregistre aussi les espèces et
//     l'API les renvoie. Le CA est donc complet.
//
//   • Le détail par produit et la TVA existent, mais PAS dans l'historique :
//     il faut appeler le détail de chaque transaction. D'où les deux étages
//     ci-dessous — une liste, puis un appel par ticket.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  refunded_amount?: number
}

type ProduitSumUp = {
  name?: string
  quantity?: number
  price_with_vat?: number
  total_with_vat?: number
  vat_rate?: number
}

type DetailSumUp = {
  products?: ProduitSumUp[]
  vat_amount?: number
  amount?: number
  payment_type?: string
  timestamp?: string
  /** Pourboire encaissé avec la vente — c'est de l'argent de l'équipe. */
  tip_amount?: number
  /** Remboursement partiel ou total déjà accordé sur cette vente. */
  refunded_amount?: number
  /** Ventilation TVA donnée par la caisse, plus fiable que reconstruite. */
  vat_rates?: Array<{ rate?: number; vat?: number; gross?: number; net?: number }>
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

  // Historique des transactions. NB : la forme /merchants/{code}/... répond 404
  // sur ce compte ; c'est /me/... qui fonctionne.
  const apiUrl = new URL('https://api.sumup.com/v0.1/me/transactions/history')
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

  // ?champs=1 — inspection de la FORME de la réponse SumUp : uniquement les
  // noms de champs, jamais les valeurs. Sert à vérifier ce que l'API expose
  // réellement plutôt que de s'en remettre à la documentation, qui annonçait
  // par exemple qu'il n'existait pas de produits alors qu'il y en a.
  if (url.searchParams.get('champs') === '1') {
    const premier = items.find(t => t.transaction_code ?? t.id)
    if (!premier) return NextResponse.json({ ok: true, message: 'aucune transaction à inspecter' })
    const code = String(premier.transaction_code ?? premier.id)
    const r = await fetch(`https://api.sumup.com/v0.1/me/transactions?transaction_code=${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' }, cache: 'no-store',
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: `SumUp ${r.status}` }, { status: 502 })
    const d = await r.json()
    const noms = (o: unknown): unknown =>
      Array.isArray(o) ? (o.length ? [noms(o[0])] : [])
      : o && typeof o === 'object' ? Object.fromEntries(
          Object.entries(o as Record<string, unknown>).map(([k, v]) => [k,
            v && typeof v === 'object' ? noms(v) : typeof v]))
      : typeof o
    return NextResponse.json({
      ok: true,
      champs_liste: Object.keys(premier),
      champs_detail: noms(d),
    })
  }

  // Seules les transactions abouties deviennent du CA. Un paiement remboursé ou
  // échoué ne doit pas gonfler la journée.
  const abouties = items
    .filter(t => (t.status ?? '').toUpperCase() === 'SUCCESSFUL')
    .filter(t => typeof t.amount === 'number' && (t.amount as number) > 0)
    .filter(t => t.transaction_code ?? t.id)

  // On écarte d'emblée les tickets DÉJÀ importés. Sans ce filtre, chaque
  // passage refait le détail de toute la journée : à 70 tickets et une synchro
  // toutes les 10 minutes, cela représentait ~10 000 appels quotidiens à SumUp
  // pour ne rien apprendre. C'est ce gaspillage qui interdisait d'accélérer la
  // cadence — une fois retiré, un passage ne coûte plus qu'un appel de liste
  // plus les tickets réellement nouveaux.
  const sb = await createClient()
  const codes = abouties.map(t => String(t.transaction_code ?? t.id))
  const dejaVus = new Set<string>()
  if (codes.length > 0) {
    const { data: connus } = await sb.from('encaissements_externes')
      .select('ticket_externe')
      .eq('source_caisse', 'sumup')
      .in('ticket_externe', codes)
    for (const c of connus ?? []) dejaVus.add(String(c.ticket_externe))
  }
  const nouveaux = abouties.filter(t => !dejaVus.has(String(t.transaction_code ?? t.id)))

  if (nouveaux.length === 0) {
    return NextResponse.json({
      ok: true, source_caisse: 'sumup', depuis,
      vus: abouties.length, nouveaux: 0, message: 'rien de neuf',
    })
  }

  // Détail ticket par ticket : c'est le seul endroit où SumUp donne les
  // produits et leur taux de TVA. On borne la concurrence pour ne pas se faire
  // limiter, et un détail manquant ne fait pas échouer le ticket — il rentrera
  // dans le CA sans ses lignes.
  async function detail(code: string): Promise<DetailSumUp | null> {
    try {
      const r = await fetch(`https://api.sumup.com/v0.1/me/transactions?transaction_code=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
        cache: 'no-store',
      })
      return r.ok ? await r.json() : null
    } catch { return null }
  }

  const details = new Map<string, DetailSumUp | null>()
  const LOT = 6
  for (let i = 0; i < nouveaux.length; i += LOT) {
    const paquet = nouveaux.slice(i, i + LOT)
    const res = await Promise.all(paquet.map(t => detail(String(t.transaction_code ?? t.id))))
    paquet.forEach((t, k) => details.set(String(t.transaction_code ?? t.id), res[k]))
  }

  const encaissements = nouveaux.map(t => {
    const code = String(t.transaction_code ?? t.id)
    const d = details.get(code)
    const produits = (d?.products ?? [])
      .filter(p => p.name && typeof p.quantity === 'number' && p.quantity > 0)
      .map(p => {
        const qte = Number(p.quantity)
        const unitaire = typeof p.price_with_vat === 'number'
          ? Number(p.price_with_vat)
          : Number(p.total_with_vat ?? 0) / qte
        return {
          nom_caisse: String(p.name).trim(),
          quantite: qte,
          prix_unitaire_ttc: Math.round(unitaire * 100) / 100,
          // SumUp exprime le taux en fraction (0.055) — on le remet en points.
          tva_taux: typeof p.vat_rate === 'number' ? Math.round(p.vat_rate * 1000) / 10 : undefined,
        }
      })

    // Ventilation TVA : celle de la caisse d'abord (`vat_rates`), qui fait foi
    // fiscalement. On ne reconstitue depuis les lignes que si elle manque.
    const ventilation: Record<string, number> = {}
    if (Array.isArray(d?.vat_rates) && d.vat_rates.length > 0) {
      for (const v of d.vat_rates) {
        if (typeof v.rate !== 'number' || typeof v.vat !== 'number') continue
        const taux = String(Math.round(v.rate * 1000) / 10)
        ventilation[taux] = Math.round(((ventilation[taux] ?? 0) + v.vat) * 100) / 100
      }
    } else {
      for (const p of produits) {
        if (p.tva_taux == null) continue
        const ht = (p.prix_unitaire_ttc * p.quantite) / (1 + p.tva_taux / 100)
        const tva = p.prix_unitaire_ttc * p.quantite - ht
        ventilation[String(p.tva_taux)] = Math.round(((ventilation[String(p.tva_taux)] ?? 0) + tva) * 100) / 100
      }
    }

    // Un remboursement partiel laisse la transaction en SUCCESSFUL : sans
    // cette soustraction, une vente remboursée à moitié compterait pour son
    // montant entier et gonflerait le chiffre d'affaires.
    const rembourse = Number(d?.refunded_amount ?? t.refunded_amount ?? 0)
    const encaisse = Math.max(0, Number(t.amount) - rembourse)

    return {
      ticket_externe: code,
      etablissement_slug: 'fournil',
      montant_ttc: Math.round(encaisse * 100) / 100,
      pourboire: typeof d?.tip_amount === 'number' ? d.tip_amount : undefined,
      tva_total: typeof d?.vat_amount === 'number' ? d.vat_amount : undefined,
      ventilation_tva: Object.keys(ventilation).length ? ventilation : undefined,
      mode_paiement: (t.payment_type ?? 'carte').toLowerCase(),
      encaisse_at: t.timestamp,
      produits: produits.length ? produits : undefined,
    }
  })
  // Une vente intégralement remboursée n'est plus du chiffre d'affaires : on
  // ne la matérialise pas en commande. Elle reste visible côté SumUp, qui
  // demeure le registre fiscal.
  .filter(e => e.montant_ttc > 0)

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
  return NextResponse.json({
    ok: rep.ok, depuis,
    vus: abouties.length, deja_importes: dejaVus.size,
    envoyes: encaissements.length,
    connecteur: resultat,
  })
}

export const GET = handler
export const POST = handler
