// Module fidélité — dashboard admin.
// Top 20 clients par points / par CA + config paliers + derniers mouvements.

import { createClient } from '@/lib/supabase/server'
import { getConfigFidelite } from '@/lib/fidelite'
import { NIVEAU_INFO, type NiveauFidelite } from '@/lib/clients'
import { TYPE_MOUVEMENT_INFO, type TypeMouvementPoints } from '@/lib/fidelite-types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star, TrendingUp, Settings, History } from 'lucide-react'
import Link from 'next/link'
import ConfigFideliteForm from './ConfigFideliteForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fidélité — Admin' }

export default async function FidelitePage() {
  const sb = await createClient()

  const [topPointsRes, topCaRes, mouvementsRes, config] = await Promise.all([
    sb.from('clients')
      .select('id, prenom, nom, points_fidelite, niveau_fidelite, nb_visites, total_depense')
      .order('points_fidelite', { ascending: false })
      .limit(20),
    sb.from('clients')
      .select('id, prenom, nom, points_fidelite, niveau_fidelite, nb_visites, total_depense')
      .order('total_depense', { ascending: false })
      .limit(20),
    sb.from('mouvements_points')
      .select('id, type, points, motif, created_at, client:clients!client_id(prenom, nom)')
      .order('created_at', { ascending: false })
      .limit(20),
    getConfigFidelite(),
  ])

  type Cli = {
    id: string; prenom: string | null; nom: string;
    points_fidelite: number | string;
    niveau_fidelite: string;
    nb_visites: number | string;
    total_depense: number | string;
  }
  const topPoints = (topPointsRes.data ?? []) as Cli[]
  const topCa = (topCaRes.data ?? []) as Cli[]

  type MvtRow = {
    id: string; type: string; points: number | string;
    motif: string | null; created_at: string;
    client: { prenom?: string | null; nom?: string | null } | null
  }
  const mouvements = (mouvementsRes.data ?? []) as MvtRow[]

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Star className="h-6 w-6 text-amber-500" />
              Programme fidélité
            </h1>
            <p className="text-sm text-zinc-500">Top clients, mouvements de points, configuration des paliers.</p>
          </div>
          <Link
            href="/admin/clients"
            className="text-sm text-emerald-700 hover:text-emerald-900 underline"
          >
            ← Retour au CRM clients
          </Link>
        </div>
      </header>

      {/* Configuration */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Settings className="h-5 w-5 text-zinc-600" />
          Configuration
        </h2>
        <ConfigFideliteForm config={config} />
      </Card>

      {/* Tops */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <Star className="h-5 w-5 text-amber-500" />
            Top 20 par points
          </h2>
          {topPoints.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">Aucun client avec des points.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 uppercase">
                <tr><th className="text-left">Client</th><th className="text-left">Niveau</th><th className="text-right">Points</th><th className="text-right">Visites</th></tr>
              </thead>
              <tbody>
                {topPoints.map((c, i) => {
                  const k = (c.niveau_fidelite as NiveauFidelite) ?? 'standard'
                  const ni = NIVEAU_INFO[k] ?? NIVEAU_INFO.standard
                  return (
                    <tr key={c.id} className="border-t border-zinc-100">
                      <td className="py-1.5">
                        <span className="text-zinc-400 mr-1">{i + 1}.</span>
                        <Link href={`/client/${c.id}`} target="_blank" className="hover:text-emerald-700 underline">
                          {c.prenom ? c.prenom + ' ' : ''}{c.nom}
                        </Link>
                      </td>
                      <td><Badge variant="outline" className={ni.cls + ' text-[10px]'}>{ni.emoji} {ni.label}</Badge></td>
                      <td className="text-right tabular-nums font-bold">{Number(c.points_fidelite)}</td>
                      <td className="text-right tabular-nums text-zinc-500">{Number(c.nb_visites)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            Top 20 par CA
          </h2>
          {topCa.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">Aucun client avec des achats.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 uppercase">
                <tr><th className="text-left">Client</th><th className="text-left">Niveau</th><th className="text-right">Total</th><th className="text-right">Visites</th></tr>
              </thead>
              <tbody>
                {topCa.map((c, i) => {
                  const k = (c.niveau_fidelite as NiveauFidelite) ?? 'standard'
                  const ni = NIVEAU_INFO[k] ?? NIVEAU_INFO.standard
                  return (
                    <tr key={c.id} className="border-t border-zinc-100">
                      <td className="py-1.5">
                        <span className="text-zinc-400 mr-1">{i + 1}.</span>
                        <Link href={`/client/${c.id}`} target="_blank" className="hover:text-emerald-700 underline">
                          {c.prenom ? c.prenom + ' ' : ''}{c.nom}
                        </Link>
                      </td>
                      <td><Badge variant="outline" className={ni.cls + ' text-[10px]'}>{ni.emoji} {ni.label}</Badge></td>
                      <td className="text-right tabular-nums font-bold">{Number(c.total_depense).toFixed(0)} €</td>
                      <td className="text-right tabular-nums text-zinc-500">{Number(c.nb_visites)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Derniers mouvements */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <History className="h-5 w-5 text-zinc-600" />
          Derniers mouvements de points
        </h2>
        {mouvements.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Aucun mouvement.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 uppercase">
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Client</th>
                <th className="text-left">Type</th>
                <th className="text-left">Motif</th>
                <th className="text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.map(m => {
                const info = TYPE_MOUVEMENT_INFO[(m.type as TypeMouvementPoints)] ?? TYPE_MOUVEMENT_INFO.ajustement
                const pts = Number(m.points)
                const date = new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                return (
                  <tr key={m.id} className="border-t border-zinc-100">
                    <td className="py-1.5 text-xs text-zinc-500 whitespace-nowrap">{date}</td>
                    <td>{m.client?.prenom ? m.client.prenom + ' ' : ''}{m.client?.nom ?? '— supprimé —'}</td>
                    <td><Badge variant="outline" className={info.cls + ' text-[10px]'}>{info.emoji} {info.label}</Badge></td>
                    <td className="text-zinc-600">{m.motif ?? '—'}</td>
                    <td className={`text-right tabular-nums font-bold ${pts > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {pts > 0 ? '+' : ''}{pts}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
