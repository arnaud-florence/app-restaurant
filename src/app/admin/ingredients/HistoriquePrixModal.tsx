'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { type Ingredient, type HistoriquePrix } from './types'
import { getHistoriquePrix } from './actions'

const SOURCE_LABEL: Record<HistoriquePrix['source'], { label: string; cls: string }> = {
  creation:     { label: 'Création',     cls: 'bg-blue-100 text-blue-800' },
  manuel:       { label: 'Modification', cls: 'bg-amber-100 text-amber-800' },
  livraison:    { label: 'Livraison',    cls: 'bg-emerald-100 text-emerald-800' },
  bon_commande: { label: 'Bon de cmd.',  cls: 'bg-violet-100 text-violet-800' },
}

const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)

export default function HistoriquePrixModal({
  ingredient, onClose,
}: {
  ingredient: Ingredient
  onClose: () => void
}) {
  const [data, setData] = useState<HistoriquePrix[] | null>(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let alive = true
    getHistoriquePrix(ingredient.id)
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setErreur(e instanceof Error ? e.message : 'Erreur chargement') })
    return () => { alive = false }
  }, [ingredient.id])

  const chartData = useMemo(
    () => (data ?? []).map(h => ({
      date: format(parseISO(h.created_at), 'dd MMM', { locale: fr }),
      dateFull: h.created_at,
      prix: Number(h.prix_achat_ht),
    })),
    [data]
  )

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null
    const prix = data.map(h => h.prix_achat_ht)
    const min = Math.min(...prix)
    const max = Math.max(...prix)
    const first = data[0].prix_achat_ht
    const last = data[data.length - 1].prix_achat_ht
    const variation = first > 0 ? ((last - first) / first) * 100 : 0
    return { min, max, last, variation }
  }, [data])

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-3xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>📈 Historique des prix</DialogTitle>
        <DialogDescription>
          {ingredient.nom} · {ingredient.categorie} · prix par {ingredient.unite}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {erreur && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
            ⚠️ {erreur}
          </p>
        )}

        {!data ? (
          <p className="text-sm text-muted-foreground italic text-center py-12">Chargement…</p>
        ) : data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-5xl mb-3">📊</p>
            <p className="text-lg font-semibold">Aucun historique</p>
            <p className="text-sm text-muted-foreground mt-1">
              L&apos;historique se remplit automatiquement à chaque modification du prix.
            </p>
          </div>
        ) : (
          <>
            {/* Stats rapides */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KPI label="Prix actuel" value={fmtPrix(stats.last)} />
                <KPI label="Plus bas"    value={fmtPrix(stats.min)} tone="green" />
                <KPI label="Plus haut"   value={fmtPrix(stats.max)} tone="red" />
                <KPI
                  label="Variation"
                  value={`${stats.variation > 0 ? '+' : ''}${stats.variation.toFixed(1)}%`}
                  tone={stats.variation > 0 ? 'red' : stats.variation < 0 ? 'green' : 'default'}
                />
              </div>
            )}

            {/* Graphique */}
            {chartData.length >= 2 ? (
              <div className="border rounded-lg bg-background p-3">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickFormatter={n => `${n} €`}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [fmtPrix(Number(v ?? 0)), 'Prix']}
                      labelFormatter={(_, payload) => {
                        const d = payload?.[0]?.payload?.dateFull
                        return d ? format(parseISO(String(d)), 'd MMM yyyy à HH:mm', { locale: fr }) : ''
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="prix"
                      stroke="#1A1A2E"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#E8B86D' }}
                      activeDot={{ r: 6, fill: '#C0392B' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center italic">
                Le graphique apparaîtra dès qu&apos;il y aura au moins 2 changements de prix.
              </p>
            )}

            {/* Tableau historique */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-right py-2 px-3">Prix</th>
                    <th className="text-left py-2 px-3 hidden sm:table-cell">Source</th>
                    <th className="text-left py-2 px-3 hidden md:table-cell">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].reverse().map((h, idx, arr) => {
                    const prevPrice = idx < arr.length - 1 ? arr[idx + 1].prix_achat_ht : null
                    const delta = prevPrice !== null ? h.prix_achat_ht - prevPrice : 0
                    return (
                      <tr key={h.id} className="border-t">
                        <td className="py-2 px-3 text-xs whitespace-nowrap">
                          {format(parseISO(h.created_at), 'd MMM yyyy', { locale: fr })}
                          <span className="text-muted-foreground ml-1">{format(parseISO(h.created_at), 'HH:mm')}</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">
                          {fmtPrix(h.prix_achat_ht)}
                          {prevPrice !== null && delta !== 0 && (
                            <span className={`ml-2 text-[10px] font-bold ${delta > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {delta > 0 ? '↑' : '↓'} {fmtPrix(Math.abs(delta))}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 hidden sm:table-cell">
                          <Badge className={SOURCE_LABEL[h.source].cls + ' border-0'}>
                            {SOURCE_LABEL[h.source].label}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 hidden md:table-cell text-xs text-muted-foreground">
                          {h.note ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogBody>

      <DialogFooter>
        <Button onClick={onClose}>Fermer</Button>
      </DialogFooter>
    </Dialog>
  )
}

function KPI({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'red' }) {
  const cls =
    tone === 'green' ? 'bg-emerald-50 border-emerald-200' :
    tone === 'red'   ? 'bg-red-50 border-red-200' :
                       'bg-background'
  return (
    <div className={`rounded-md border p-2.5 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-bold text-base sm:text-lg tabular-nums truncate">{value}</p>
    </div>
  )
}
