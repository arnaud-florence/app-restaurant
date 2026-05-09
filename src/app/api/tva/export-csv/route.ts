// GET /api/tva/export-csv?mois=YYYY-MM
// Export CSV des commandes encaissées du mois pour le comptable :
// 1 ligne par article (avec ventilation TVA) + en-têtes lisibles.
// Manager only.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireManager()
  } catch {
    return new NextResponse('Manager only', { status: 403 })
  }

  const moisIso = req.nextUrl.searchParams.get('mois')
  if (!moisIso || !/^\d{4}-\d{2}$/.test(moisIso)) {
    return new NextResponse('Param mois manquant ou invalide (format YYYY-MM)', { status: 400 })
  }

  const sb = await createClient()
  const debut = `${moisIso}-01T00:00:00`
  const fin = (() => {
    const d = new Date(moisIso + '-01')
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10) + 'T00:00:00'
  })()

  // Commandes encaissées du mois
  const { data: cmds } = await sb.from('commandes')
    .select('id, numero, source, numero_table, consommation, encaisse_at:created_at, montant_total_ht, tva_total, montant_total_ttc')
    .eq('statut', 'encaisse')
    .gte('created_at', debut).lt('created_at', fin)
    .order('created_at')

  type CmdRow = { id: string; numero: string; source: string; numero_table: string | null; consommation: string | null; encaisse_at: string; montant_total_ht: number; tva_total: number; montant_total_ttc: number }
  const commandes = (cmds ?? []) as CmdRow[]
  const ids = commandes.map(c => c.id)
  const cmdById = new Map<string, CmdRow>()
  for (const c of commandes) cmdById.set(c.id, c)

  // Articles
  type ArtRow = { commande_id: string; quantite: number; prix_unitaire_ht: number; tva_taux: number; tva_eur: number; tag_destination: string; recette?: { nom?: string } | null }
  let arts: ArtRow[] = []
  if (ids.length > 0) {
    const { data: artsData } = await sb.from('commande_articles')
      .select('commande_id, quantite, prix_unitaire_ht, tva_taux, tva_eur, tag_destination, recette:recettes(nom)')
      .in('commande_id', ids)
    arts = (artsData ?? []) as ArtRow[]
  }

  // Construit le CSV
  const headers = [
    'date_encaissement', 'numero_commande', 'source', 'table',
    'consommation', 'recette', 'tag', 'quantite',
    'prix_unitaire_ht', 'total_ht_ligne', 'tva_taux_pct', 'tva_eur_ligne', 'total_ttc_ligne',
  ]
  const sep = ';'
  const lines: string[] = [headers.join(sep)]

  for (const a of arts) {
    const c = cmdById.get(a.commande_id)
    if (!c) continue
    const ht = Number(a.quantite ?? 0) * Number(a.prix_unitaire_ht ?? 0)
    const tva = Number(a.tva_eur ?? 0)
    const ttc = ht + tva
    const row = [
      new Date(c.encaisse_at).toLocaleString('fr-FR'),
      c.numero,
      c.source,
      c.numero_table ?? '',
      c.consommation ?? '',
      csvEscape(a.recette?.nom ?? ''),
      a.tag_destination ?? '',
      String(a.quantite),
      Number(a.prix_unitaire_ht ?? 0).toFixed(2).replace('.', ','),
      ht.toFixed(2).replace('.', ','),
      Number(a.tva_taux ?? 0).toString().replace('.', ','),
      tva.toFixed(2).replace('.', ','),
      ttc.toFixed(2).replace('.', ','),
    ]
    lines.push(row.join(sep))
  }

  // Ligne de totaux à la fin
  const totalHt = commandes.reduce((s, c) => s + Number(c.montant_total_ht ?? 0), 0)
  const totalTva = commandes.reduce((s, c) => s + Number(c.tva_total ?? 0), 0)
  const totalTtc = commandes.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  lines.push('')
  lines.push(['TOTAL', '', '', '', '', '', '', '', '', totalHt.toFixed(2).replace('.', ','), '', totalTva.toFixed(2).replace('.', ','), totalTtc.toFixed(2).replace('.', ',')].join(sep))

  // BOM UTF-8 pour qu'Excel reconnaisse l'encodage
  const csv = '﻿' + lines.join('\r\n')
  const filename = `tva-${moisIso}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function csvEscape(v: string): string {
  if (/[";\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}
