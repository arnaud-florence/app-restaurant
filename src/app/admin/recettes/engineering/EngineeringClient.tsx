'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, ResponsiveContainer, ZAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fmtPrix, fmtPct } from '@/lib/foodCost'
import { getRecettePhoto } from '@/lib/recettePhoto'
import {
  type RecetteCalc, type ArticleVente, type RecetteEngineering, type Quadrant,
  calculerMatrice, suggestionPour,
  QUADRANT_LABEL, QUADRANT_EMOJI, QUADRANT_COLOR, QUADRANT_STYLE, QUADRANT_DESCRIPTION,
} from '@/lib/menuEngineering'

const PERIODES = [
  { key: 7,  label: '7 jours' },
  { key: 30, label: '30 jours' },
  { key: 90, label: '90 jours' },
] as const

const TAG_EMOJI: Record<string, string> = {
  CUISINE: '👨‍🍳', PIZZA: '🍕', BAR: '🍷',
}

export default function EngineeringClient({
  recettes, articles, fenetreJours,
}: {
  recettes: RecetteCalc[]
  articles: ArticleVente[]
  fenetreJours: number
}) {
  const [periode, setPeriode] = useState<number>(30)
  // Recharts ne peut pas mesurer les dimensions en SSR ; on attend
  // l'hydratation pour rendre le scatter, ça évite un warning console.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Filtrage des articles selon la période
  const articlesPeriode = useMemo(() => {
    const cutoff = Date.now() - periode * 86400000
    return articles.filter(a => new Date(a.created_at).getTime() >= cutoff)
  }, [articles, periode])

  const synth = useMemo(() => calculerMatrice(recettes, articlesPeriode), [recettes, articlesPeriode])

  const points = useMemo(
    () => synth.recettes.map(r => ({
      x: r.mix_pct,
      y: r.marge_par_portion,
      z: Math.max(20, r.ventes * 4),  // taille proportionnelle aux ventes
      nom: r.nom,
      quadrant: r.quadrant,
      recette_id: r.recette_id,
      ventes: r.ventes,
      marge_par_portion: r.marge_par_portion,
      mix_pct: r.mix_pct,
      ca_ht: r.ca_ht,
      food_cost_pct: r.food_cost_pct,
    })),
    [synth.recettes]
  )

  const xMax = Math.max(20, ...points.map(p => p.x)) * 1.15
  const yMax = Math.max(5,  ...points.map(p => p.y)) * 1.15

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background border-b" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pilotage carte</p>
            <h1 className="text-xl sm:text-2xl font-bold truncate">📊 Menu engineering</h1>
          </div>
          <Link href="/admin/recettes">
            <Button variant="outline" size="sm">← Recettes</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Sélecteur période + KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-3 items-stretch">
          <Card className="lg:w-64">
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Période d&apos;analyse</p>
              <div className="grid grid-cols-3 gap-1">
                {PERIODES.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPeriode(p.key)}
                    className={cn(
                      'h-10 rounded-md border text-xs font-bold transition-colors',
                      periode === p.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-input hover:bg-muted'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Données disponibles sur {fenetreJours} j
                {synth.total_ventes === 0 && ' (aucune vente sur la période)'}
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KPI label="Ventes" value={String(synth.total_ventes)} icon="🛒" />
            <KPI label="CA HT" value={fmtPrix(synth.ca_total)} icon="💰" />
            <KPI label="Marge brute" value={fmtPrix(synth.marge_total)} icon="📈" />
            <KPI label="Ticket moyen" value={fmtPrix(synth.ticket_moyen)} icon="🎫" />
          </div>
        </div>

        {/* Matrice */}
        {synth.total_ventes === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-5xl mb-3">📭</p>
              <p className="text-lg font-semibold">Aucune vente sur la période choisie</p>
              <p className="text-sm text-muted-foreground mt-1">
                Élargis la période ou attends que les premières commandes arrivent.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="font-bold">📍 Matrice popularité × rentabilité</h2>
                  <div className="flex gap-2 flex-wrap">
                    {(['star', 'plowhorse', 'puzzle', 'dog'] as const).map(q => (
                      <span key={q} className="inline-flex items-center gap-1.5 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: QUADRANT_COLOR[q] }} />
                        <span>{QUADRANT_EMOJI[q]} {QUADRANT_LABEL[q]} ({synth.par_quadrant[q].length})</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="h-[360px] sm:h-[420px]">
                  {!mounted ? (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                      Chargement de la matrice…
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 16, right: 24, bottom: 36, left: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Popularité"
                        unit="%"
                        domain={[0, xMax]}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        label={{ value: 'Popularité (% du mix)', position: 'insideBottom', offset: -16, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Marge"
                        domain={[0, yMax]}
                        tickFormatter={n => `${Math.round(n)}€`}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        label={{ value: 'Marge €/portion', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      />
                      <ZAxis type="number" dataKey="z" range={[60, 600]} />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null
                          const d = payload[0].payload as typeof points[number]
                          return (
                            <div className="bg-background border rounded-md px-3 py-2 text-xs shadow-lg">
                              <p className="font-bold">{d.nom}</p>
                              <p className="text-muted-foreground">
                                {QUADRANT_EMOJI[d.quadrant as Quadrant]} {QUADRANT_LABEL[d.quadrant as Quadrant]}
                              </p>
                              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                                <span className="text-muted-foreground">Ventes :</span><span className="font-semibold tabular-nums">{d.ventes}</span>
                                <span className="text-muted-foreground">Mix :</span><span className="font-semibold tabular-nums">{fmtPct(d.mix_pct)}</span>
                                <span className="text-muted-foreground">Marge/p :</span><span className="font-semibold tabular-nums">{fmtPrix(d.marge_par_portion)}</span>
                                <span className="text-muted-foreground">CA :</span><span className="font-semibold tabular-nums">{fmtPrix(d.ca_ht)}</span>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <ReferenceLine
                        x={synth.seuil_popularite}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        label={{ value: `Seuil pop ${synth.seuil_popularite.toFixed(1)}%`, position: 'top', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                      />
                      <ReferenceLine
                        y={synth.seuil_marge}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        label={{ value: `Seuil marge ${fmtPrix(synth.seuil_marge)}`, position: 'right', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                      />
                      <Scatter data={points}>
                        {points.map((p, i) => <Cell key={i} fill={QUADRANT_COLOR[p.quadrant as Quadrant]} fillOpacity={0.85} stroke="white" strokeWidth={2} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  Taille des bulles ∝ nb de ventes · Lignes pointillées = seuils auto-calculés (méthode Kasavana 70%).
                </p>
              </CardContent>
            </Card>

            {/* Cards par recette, regroupées par quadrant */}
            <div className="space-y-4">
              {(['star', 'plowhorse', 'puzzle', 'dog'] as const).map(q => {
                const items = synth.par_quadrant[q]
                if (items.length === 0) return null
                const sty = QUADRANT_STYLE[q]
                return (
                  <section key={q} className={cn('rounded-lg border p-3 sm:p-4 space-y-3', sty.bg, sty.border)}>
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <h2 className={cn('text-lg font-bold flex items-center gap-2', sty.text)}>
                        <span className="text-2xl">{QUADRANT_EMOJI[q]}</span>
                        <span>{QUADRANT_LABEL[q]}</span>
                        <Badge variant="outline" className="ml-1">{items.length}</Badge>
                      </h2>
                      <p className="text-xs text-muted-foreground max-w-2xl">
                        {QUADRANT_DESCRIPTION[q]}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {items.map(r => <RecetteCard key={r.recette_id} r={r} />)}
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// ─── KPI ─────────────────────────────────────────────────────────────
function KPI({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <span className="text-lg">{icon}</span>
        </div>
        <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Card recette dans un quadrant ───────────────────────────────────
function RecetteCard({ r }: { r: RecetteEngineering }) {
  const photoUrl = getRecettePhoto({
    tag_destination: r.tag_destination,
    categorie: r.categorie,
    nom: r.nom,
  })
  return (
    <Card className="bg-background overflow-hidden">
      {/* Photo header (fallback Unsplash thématique) */}
      <div className="relative aspect-[16/7] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt={r.nom} loading="lazy" className="w-full h-full object-cover" />
        <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-white/95 backdrop-blur text-zinc-900 text-[10px] font-black tabular-nums shadow">
          {r.ventes} ventes
        </span>
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate">
              <span className="mr-1">{TAG_EMOJI[r.tag_destination] ?? ''}</span>
              {r.nom}
            </p>
            <p className="text-[11px] text-muted-foreground">{r.categorie}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <Stat label="Mix" value={fmtPct(r.mix_pct)} />
          <Stat label="Marge/p" value={fmtPrix(r.marge_par_portion)} bold />
          <Stat label="Food cost" value={fmtPct(r.food_cost_pct)} />
        </div>

        <div className="rounded-md bg-muted/50 px-2.5 py-2 text-xs">
          <p className="font-semibold mb-0.5">💡 Action</p>
          <p className="text-muted-foreground leading-relaxed">{suggestionPour(r, fmtPrix)}</p>
        </div>

        {r.quadrant === 'plowhorse' && r.prix_suggere_70 > r.prix_vente_ht && (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <span className="font-bold">Recommandation prix : </span>
            {fmtPrix(r.prix_vente_ht)} → <b className="tabular-nums">{fmtPrix(r.prix_suggere_70)}</b> pour viser 70% de marge.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="rounded bg-muted/30 px-1.5 py-1 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('tabular-nums truncate', bold ? 'font-bold' : 'font-semibold')}>{value}</p>
    </div>
  )
}
