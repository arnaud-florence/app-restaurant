'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PillTab, PillCount, PillDivider } from '@/components/ui/PillTab'

import {
  type Ingredient, type Mouvement,
  statutStock, STATUT_STOCK_STYLE, valeurStock, alertesDLC, listeCourses, bilanInvendusMois,
  TYPE_MOUVEMENT_LABEL, fmtPrix, fmtQte,
} from '@/lib/stock'
import { sortieManuelle } from './actions'

import EntreeModal from './EntreeModal'
import PerteModal from './PerteModal'
import InventaireModal from './InventaireModal'
import ListeCoursesModal from './ListeCoursesModal'

type ActionKind = 'entree' | 'perte' | 'inventaire' | 'courses' | null

export default function StockClient({
  ingredients, mouvements,
}: {
  ingredients: Ingredient[]
  mouvements: Mouvement[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filtreCat, setFiltreCat] = useState('')
  const [filtreStock, setFiltreStock] = useState<'tous' | 'rouge' | 'orange' | 'vert'>('tous')
  const [actionOpen, setActionOpen] = useState<ActionKind>(null)
  const [ingredientCourant, setIngredientCourant] = useState<Ingredient | null>(null)
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  const [, startTransition] = useTransition()

  const categories = useMemo(() => {
    const set = new Set<string>()
    ingredients.forEach(i => set.add(i.categorie))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [ingredients])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ingredients
      .filter(i => i.actif)
      .filter(i => {
        if (filtreCat && i.categorie !== filtreCat) return false
        if (filtreStock !== 'tous' && statutStock(i.stock_actuel, i.stock_minimum) !== filtreStock) return false
        if (q && !i.nom.toLowerCase().includes(q) && !i.categorie.toLowerCase().includes(q)) return false
        return true
      })
  }, [ingredients, search, filtreCat, filtreStock])

  // KPIs
  const valeur = useMemo(() => valeurStock(ingredients.filter(i => i.actif)), [ingredients])
  const dlcAlerts = useMemo(() => alertesDLC(mouvements, 3), [mouvements])
  const courses = useMemo(() => listeCourses(ingredients), [ingredients])
  const invendus = useMemo(() => bilanInvendusMois(mouvements), [mouvements])

  const stats = useMemo(() => {
    const actifs = ingredients.filter(i => i.actif)
    const rouge = actifs.filter(i => statutStock(i.stock_actuel, i.stock_minimum) === 'rouge').length
    const orange = actifs.filter(i => statutStock(i.stock_actuel, i.stock_minimum) === 'orange').length
    return { totalActifs: actifs.length, rouge, orange }
  }, [ingredients])

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 1800) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  function deduire1Portion(i: Ingredient) {
    startTransition(async () => {
      try {
        const qte = i.unite === 'pièce' || i.unite === 'botte' ? 1 : 0.1
        await sortieManuelle({ ingredient_id: i.id, quantite: qte, motif: 'Bouton -1 portion (cuisine)' })
        flashOk(`-${qte} ${i.unite} sur ${i.nom}`)
        router.refresh()
      } catch (e) { flashKo(e) }
    })
  }

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-xl shadow-lg shadow-blue-500/30 shrink-0">
                📦
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Inventaire & mouvements</p>
                <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Stocks</h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setIngredientCourant(null); setActionOpen('entree') }} variant="default" size="sm">
                <span className="text-base">+</span> Livraison
              </Button>
              <Button onClick={() => { setIngredientCourant(null); setActionOpen('perte') }} variant="destructive" size="sm">
                <span className="text-base">−</span> Perte/casse
              </Button>
              <Button onClick={() => setActionOpen('inventaire')} variant="outline" size="sm">📊 Inventaire</Button>
              <Button onClick={() => setActionOpen('courses')} variant="outline" size="sm">
                🛒 Liste courses {courses.length > 0 && <Badge variant="destructive" className="ml-1">{courses.length}</Badge>}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
          <KPI label="Total actifs" value={String(stats.totalActifs)} icon="📋" />
          <KPI label="Stock OK"     value={String(stats.totalActifs - stats.rouge - stats.orange)} icon="✓" tone="green" />
          <KPI label="Stock faible" value={String(stats.orange)} icon="⚠" tone={stats.orange > 0 ? 'orange' : 'default'} />
          <KPI label="Épuisés"      value={String(stats.rouge)}  icon="🔴" tone={stats.rouge > 0 ? 'red' : 'default'} pulse={stats.rouge > 0} />
          <KPI label="Valeur stock" value={fmtPrix(valeur)} icon="💰" />
        </div>

        {/* Bandeau alertes DLC */}
        {dlcAlerts.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold text-amber-900">⏰ {dlcAlerts.length} alerte{dlcAlerts.length > 1 ? 's' : ''} DLC dans les 3 jours</p>
                  <ul className="mt-1 text-xs text-amber-800 space-y-0.5">
                    {dlcAlerts.slice(0, 3).map(m => (
                      <li key={m.id}>
                        • <b>{m.ingredient_nom ?? '—'}</b> ({fmtQte(m.quantite)} {m.ingredient_unite ?? ''}) — DLC le {format(parseISO(m.date_peremption!), 'd MMM', { locale: fr })}
                      </li>
                    ))}
                    {dlcAlerts.length > 3 && <li className="italic">… et {dlcAlerts.length - 3} autre{dlcAlerts.length - 3 > 1 ? 's' : ''}.</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Toolbar premium tactile */}
        <div className="sticky top-[64px] z-10 -mx-4 px-4 py-3 bg-zinc-50/95 backdrop-blur-md border-b border-zinc-200 space-y-2">
          <Input
            type="search"
            placeholder="🔍 Rechercher un ingrédient..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-11 text-base"
          />
          {/* Catégories */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab active={filtreCat === ''} onClick={() => setFiltreCat('')}>
              ✦ Toutes <PillCount n={ingredients.length} active={filtreCat === ''} />
            </PillTab>
            {categories.map(c => {
              const n = ingredients.filter(i => i.categorie === c).length
              return (
                <PillTab key={c} active={filtreCat === c} onClick={() => setFiltreCat(c)}>
                  {c} <PillCount n={n} active={filtreCat === c} />
                </PillTab>
              )
            })}
          </div>
          {/* Stock status */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab small active={filtreStock === 'tous'}   onClick={() => setFiltreStock('tous')}>📦 Tout</PillTab>
            <PillTab small active={filtreStock === 'rouge'}  onClick={() => setFiltreStock('rouge')}>🔴 Épuisés</PillTab>
            <PillTab small active={filtreStock === 'orange'} onClick={() => setFiltreStock('orange')}>⚠ Faibles</PillTab>
            <PillTab small active={filtreStock === 'vert'}   onClick={() => setFiltreStock('vert')}>✓ OK</PillTab>
          </div>
        </div>

        {/* Table ingrédients (mobile cards / desktop table) */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground italic">
              Aucun ingrédient — relâche tes filtres.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="grid grid-cols-1 gap-2 md:hidden">
              {filtered.map(i => (
                <IngredientStockCard
                  key={i.id}
                  i={i}
                  onEntree={() => { setIngredientCourant(i); setActionOpen('entree') }}
                  onPerte={() => { setIngredientCourant(i); setActionOpen('perte') }}
                  onMoinsUn={() => deduire1Portion(i)}
                />
              ))}
            </div>

            {/* Desktop table */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="text-left  py-2.5 px-4">Ingrédient</th>
                        <th className="text-left  py-2.5 px-2">Catégorie</th>
                        <th className="text-right py-2.5 px-2">Stock</th>
                        <th className="text-right py-2.5 px-2">Min / Max</th>
                        <th className="text-right py-2.5 px-2">Prix HT</th>
                        <th className="text-right py-2.5 px-2">Valeur</th>
                        <th className="text-right py-2.5 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(i => (
                        <IngredientStockRow
                          key={i.id}
                          i={i}
                          onEntree={() => { setIngredientCourant(i); setActionOpen('entree') }}
                          onPerte={() => { setIngredientCourant(i); setActionOpen('perte') }}
                          onMoinsUn={() => deduire1Portion(i)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Bilan invendus du mois */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <h2 className="font-bold">🗑 Invendus du mois</h2>
              <span className="text-sm font-bold text-red-700 tabular-nums">
                {invendus.par_ingredient.length} ingrédient{invendus.par_ingredient.length > 1 ? 's' : ''} · {fmtPrix(invendus.total_cout)}
              </span>
            </div>
            {invendus.par_ingredient.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucune perte ce mois — bravo 👏</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {invendus.par_ingredient.map(p => (
                  <li key={p.ingredient_id} className="flex items-center justify-between gap-2 bg-red-50/50 border border-red-100 rounded px-2 py-1.5">
                    <span className="min-w-0 truncate">{p.nom}</span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {fmtQte(p.qte)} unités · <b className="text-red-700">{fmtPrix(p.cout)}</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Historique récent */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <h2 className="font-bold mb-2">📜 Historique des mouvements ({mouvements.length})</h2>
            {mouvements.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucun mouvement enregistré.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-left py-2 px-2">Ingrédient</th>
                      <th className="text-right py-2 px-2">Qté</th>
                      <th className="text-right py-2 px-2">Valeur</th>
                      <th className="text-left py-2 px-2 hidden sm:table-cell">Motif / Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvements.slice(0, 30).map(m => {
                      const cfg = TYPE_MOUVEMENT_LABEL[m.type]
                      const valeur = m.quantite * m.prix_unitaire_ht
                      return (
                        <tr key={m.id} className="border-t hover:bg-muted/30">
                          <td className="py-2 px-2 text-xs whitespace-nowrap">
                            {format(parseISO(m.created_at), 'd MMM HH:mm', { locale: fr })}
                          </td>
                          <td className="py-2 px-2">
                            <Badge className={cn('border', cfg.cls)}>{cfg.emoji} {cfg.label}</Badge>
                          </td>
                          <td className="py-2 px-2 truncate max-w-48">{m.ingredient_nom ?? '—'}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            <span className={cfg.signe === '-' ? 'text-red-700' : cfg.signe === '+' ? 'text-emerald-700' : ''}>
                              {cfg.signe} {fmtQte(m.quantite)} {m.ingredient_unite ?? ''}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-xs text-muted-foreground">
                            {valeur > 0 ? fmtPrix(valeur) : '—'}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground hidden sm:table-cell">
                            <span className="line-clamp-1">{m.motif ?? '—'}{m.fournisseur ? ` · ${m.fournisseur}` : ''}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {mouvements.length > 30 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Affichage des 30 plus récents sur {mouvements.length}.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Toasts */}
      {erreur && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 max-w-[90vw] text-center cursor-pointer" onClick={() => setErreur('')}>
          ⚠️ {erreur}
        </div>
      )}
      {success && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">
          ✓ {success}
        </div>
      )}

      {/* Modaux */}
      {actionOpen === 'entree' && (
        <EntreeModal
          ingredients={ingredients}
          ingredientPreselectionne={ingredientCourant}
          onClose={() => { setActionOpen(null); setIngredientCourant(null) }}
          onSaved={() => { setActionOpen(null); setIngredientCourant(null); router.refresh() }}
        />
      )}
      {actionOpen === 'perte' && (
        <PerteModal
          ingredients={ingredients}
          ingredientPreselectionne={ingredientCourant}
          onClose={() => { setActionOpen(null); setIngredientCourant(null) }}
          onSaved={() => { setActionOpen(null); setIngredientCourant(null); router.refresh() }}
        />
      )}
      {actionOpen === 'inventaire' && (
        <InventaireModal
          ingredients={ingredients}
          onClose={() => setActionOpen(null)}
          onSaved={() => { setActionOpen(null); router.refresh() }}
        />
      )}
      {actionOpen === 'courses' && (
        <ListeCoursesModal items={courses} onClose={() => setActionOpen(null)} />
      )}
    </div>
  )
}

// ─── KPI ─────────────────────────────────────────────────────────────
function KPI({ label, value, tone = 'default', icon, pulse }: {
  label: string
  value: string
  tone?: 'default' | 'green' | 'orange' | 'red'
  icon: string
  pulse?: boolean
}) {
  const cls = {
    default: 'bg-background',
    green:   'bg-emerald-50 border-emerald-200',
    orange:  'bg-amber-50 border-amber-200',
    red:     'bg-red-50 border-red-200',
  }[tone]
  return (
    <Card className={cn('overflow-hidden', cls)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <span className={cn('text-lg', pulse && 'animate-pulse')}>{icon}</span>
        </div>
        <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums truncate">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Mobile : carte d'ingrédient ─────────────────────────────────────
function IngredientStockCard({
  i, onEntree, onPerte, onMoinsUn,
}: {
  i: Ingredient
  onEntree: () => void
  onPerte: () => void
  onMoinsUn: () => void
}) {
  const stat = statutStock(i.stock_actuel, i.stock_minimum)
  const sty = STATUT_STOCK_STYLE[stat]
  const valeur = i.stock_actuel * i.prix_achat_ht
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate">{i.nom}</p>
            <p className="text-[11px] text-muted-foreground">{i.categorie} · {i.unite}</p>
          </div>
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', sty.bg, sty.text, sty.border)}>
            {sty.label}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Stock"  value={`${fmtQte(i.stock_actuel)} ${i.unite}`} />
          <Stat label="Min"    value={`${fmtQte(i.stock_minimum)}`} />
          <Stat label="Valeur" value={fmtPrix(valeur)} />
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="default"    onClick={onEntree}  className="flex-1">📥 +</Button>
          <Button size="sm" variant="destructive" onClick={onPerte}  className="flex-1">⚠ Perte</Button>
          <Button size="sm" variant="outline"    onClick={onMoinsUn}>−1</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/40 px-1.5 py-1 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums truncate">{value}</p>
    </div>
  )
}

// ─── Desktop : ligne de table ────────────────────────────────────────
function IngredientStockRow({
  i, onEntree, onPerte, onMoinsUn,
}: {
  i: Ingredient
  onEntree: () => void
  onPerte: () => void
  onMoinsUn: () => void
}) {
  const stat = statutStock(i.stock_actuel, i.stock_minimum)
  const sty = STATUT_STOCK_STYLE[stat]
  const valeur = i.stock_actuel * i.prix_achat_ht
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-4">
        <p className="font-semibold">{i.nom}</p>
      </td>
      <td className="py-2.5 px-2 text-muted-foreground text-xs">{i.categorie}</td>
      <td className="py-2.5 px-2 text-right">
        <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md border tabular-nums', sty.bg, sty.text, sty.border)}>
          {fmtQte(i.stock_actuel)} {i.unite}
        </span>
      </td>
      <td className="py-2.5 px-2 text-right text-xs text-muted-foreground tabular-nums">
        {fmtQte(i.stock_minimum)} / {fmtQte(i.stock_maximum)}
      </td>
      <td className="py-2.5 px-2 text-right tabular-nums">{fmtPrix(i.prix_achat_ht)}</td>
      <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{fmtPrix(valeur)}</td>
      <td className="py-2.5 px-4">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEntree} title="Livraison">📥</Button>
          <Button size="sm" variant="ghost" onClick={onPerte} title="Perte/casse" className="text-destructive">⚠</Button>
          <Button size="sm" variant="ghost" onClick={onMoinsUn} title="−1 portion">−1</Button>
        </div>
      </td>
    </tr>
  )
}
