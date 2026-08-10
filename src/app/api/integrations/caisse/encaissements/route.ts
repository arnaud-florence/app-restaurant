// ─── Connecteur « caisse agréée » → ingestion des encaissements (lecture seule) ───
//
// La caisse agréée (NF525) est la source de vérité fiscale. Elle nous POUSSE ses
// tickets ici ; on les miroite dans `encaissements_externes` et on rapproche
// best-effort la commande prise dans l'app (par numéro) → on la marque encaissée.
//
// POS-AGNOSTIQUE : la payload est normalisée. Le jour où la caisse est choisie,
// on écrit un fin adaptateur (cron/webhook) qui mappe son export → ce format.
//
// Auth : Bearer CRON_SECRET. Idempotent via (source_caisse, ticket_externe).
//
//   POST /api/integrations/caisse/encaissements
//   Authorization: Bearer ${CRON_SECRET}
//   {
//     "source_caisse": "tiller",
//     "encaissements": [
//       { "ticket_externe": "T-123", "etablissement_slug": "bar",
//         "commande_numero": "BAR-260609-AB12", "montant_ttc": 12.0,
//         "montant_ht": 10.0, "tva_total": 2.0, "ventilation_tva": {"20": 2.0},
//         "mode_paiement": "cb", "encaisse_at": "2026-06-09T18:00:00Z" }
//     ]
//   }
//
// Pré-requis : migration 0108_encaissements_externes.sql appliquée.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}`
}

const ligneSchema = z.object({
  ticket_externe: z.string().min(1),
  etablissement_slug: z.string().optional(),
  commande_numero: z.string().optional(),
  montant_ttc: z.number(),
  montant_ht: z.number().optional(),
  tva_total: z.number().optional(),
  ventilation_tva: z.record(z.string(), z.number()).optional(),
  mode_paiement: z.string().optional(),
  encaisse_at: z.string().optional(),
})
const payloadSchema = z.object({
  source_caisse: z.string().min(1),
  encaissements: z.array(ligneSchema).min(1).max(500),
})

export async function POST(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 }) }

  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Payload invalide', details: parsed.error.flatten() }, { status: 422 })
  }
  const { source_caisse, encaissements } = parsed.data

  const sb = await createClient()

  // Map slug → etablissement_id (best-effort)
  const slugToId = new Map<string, string>()
  try {
    const { data: etabs } = await sb.from('etablissements').select('id, slug')
    for (const e of etabs ?? []) slugToId.set(String(e.slug), String(e.id))
  } catch { /* table absente → ignore */ }

  let recus = 0, rapproches = 0, sansCommande = 0
  const erreurs: { ticket: string; error: string }[] = []

  for (const l of encaissements) {
    try {
      // 1. Rapprochement commande par numéro (si fourni)
      let commandeId: string | null = null
      if (l.commande_numero) {
        const { data: cmd } = await sb.from('commandes')
          .select('id, statut').eq('numero', l.commande_numero).maybeSingle()
        if (cmd) {
          commandeId = String(cmd.id)
          // Marque la commande encaissée si elle ne l'est pas déjà (ni annulée)
          if (cmd.statut !== 'encaisse' && cmd.statut !== 'annule') {
            await sb.from('commandes').update({
              statut: 'encaisse',
              mode_paiement: l.mode_paiement ?? 'caisse_agreee',
            }).eq('id', commandeId)
          }
        }
      }
      const statutRappr = commandeId ? 'rapproche' : (l.commande_numero ? 'sans_commande' : 'non_rapproche')

      // 2. Miroir local (idempotent)
      const { error } = await sb.from('encaissements_externes').upsert({
        source_caisse,
        ticket_externe: l.ticket_externe,
        etablissement_id: l.etablissement_slug ? (slugToId.get(l.etablissement_slug) ?? null) : null,
        commande_id: commandeId,
        montant_ttc: l.montant_ttc,
        montant_ht: l.montant_ht ?? null,
        tva_total: l.tva_total ?? null,
        ventilation_tva: l.ventilation_tva ?? {},
        mode_paiement: l.mode_paiement ?? null,
        encaisse_at: l.encaisse_at ?? null,
        statut_rapprochement: statutRappr,
        raw: l as unknown as Record<string, unknown>,
      }, { onConflict: 'source_caisse,ticket_externe' })
      if (error) { erreurs.push({ ticket: l.ticket_externe, error: error.message }); continue }

      recus++
      if (statutRappr === 'rapproche') rapproches++
      else if (statutRappr === 'sans_commande') sansCommande++
    } catch (e) {
      erreurs.push({ ticket: l.ticket_externe, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({
    ok: erreurs.length === 0,
    source_caisse,
    recus,
    rapproches,
    sans_commande: sansCommande,
    erreurs,
  })
}
