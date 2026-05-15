'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  type Ingredient, statutStock, STATUT_STOCK_STYLE, iconAllergene,
  CATEGORIES_DEFAUT,
} from './types'
import { toggleIngredientActif, deleteIngredient } from './actions'
import IngredientFormModal from './IngredientFormModal'
import HistoriquePrixModal from './HistoriquePrixModal'
import { PillTab, PillCount, PillDivider } from '@/components/ui/PillTab'

const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)

export default function IngredientsClient({ initial, readOnly = false }: { initial: Ingredient[]; readOnly?: boolean }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filtreCat, setFiltreCat] = useState<string>('')
  const [filtreStatut, setFiltreStatut] = useState<'actifs' | 'inactifs' | 'tous'>('actifs')
  const [filtreStock, setFiltreStock] = useState<'tous' | 'rouge' | 'orange' | 'vert'>('tous')

  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [creating, setCreating] = useState(false)
  const [historique, setHistorique] = useState<Ingredient | null>(null)
  const [erreur, setErreur] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Ingredient | null>(null)
  const [, startTransition] = useTransition()

  // Catégories effectivement présentes dans la liste, fusionnées avec les défauts
  const categories = useMemo(() => {
    const set = new Set<string>(CATEGORIES_DEFAUT as readonly string[])
    initial.forEach(i => set.add(i.categorie))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [initial])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return initial.filter(i => {
      if (filtreStatut === 'actifs'   && !i.actif) return false
      if (filtreStatut === 'inactifs' &&  i.actif) return false
      if (filtreCat && i.categorie !== filtreCat) return false
      if (filtreStock !== 'tous' && statutStock(i.stock_actuel, i.stock_minimum) !== filtreStock) return false
      if (q && !(i.nom.toLowerCase().includes(q) || i.categorie.toLowerCase().includes(q))) return false
      return true
    })
  }, [initial, search, filtreCat, filtreStatut, filtreStock])

  const stats = useMemo(() => {
    const actifs = initial.filter(i => i.actif)
    const rouge  = actifs.filter(i => statutStock(i.stock_actuel, i.stock_minimum) === 'rouge').length
    const orange = actifs.filter(i => statutStock(i.stock_actuel, i.stock_minimum) === 'orange').length
    const vert   = actifs.filter(i => statutStock(i.stock_actuel, i.stock_minimum) === 'vert').length
    return { total: actifs.length, rouge, orange, vert }
  }, [initial])

  function onActiver(i: Ingredient, actif: boolean) {
    startTransition(async () => {
      try {
        await toggleIngredientActif(i.id, actif)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function onSupprimer(i: Ingredient) {
    startTransition(async () => {
      try {
        await deleteIngredient(i.id)
        setConfirmDelete(null)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header sticky */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xl shadow-lg shadow-emerald-500/30 shrink-0">
                🥬
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Catalogue produits</p>
                <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Ingrédients</h1>
              </div>
            </div>
            {!readOnly && (
              <Button size="lg" onClick={() => setCreating(true)} className="shrink-0">
                <span className="text-lg">+</span>
                <span className="hidden sm:inline">Ajouter un ingrédient</span>
                <span className="sm:hidden">Ajouter</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <KPI label="Total actifs" value={stats.total} tone="default" icon="📦" />
          <KPI label="Stock OK"     value={stats.vert}   tone="green"   icon="✓" />
          <KPI label="Stock faible" value={stats.orange} tone="orange"  icon="⚠" />
          <KPI label="Épuisés"      value={stats.rouge}  tone="red"     icon="🔴" pulse={stats.rouge > 0} />
        </div>

        {/* Toolbar premium tactile — recherche + 3 niveaux pills */}
        <div className="sticky top-[64px] z-10 -mx-4 px-4 py-3 bg-zinc-50/95 backdrop-blur-md border-b border-zinc-200 space-y-2">
          <Input
            type="search"
            placeholder="🔍 Rechercher un ingrédient..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-11 text-base"
          />
          {/* Niveau 1 : Catégorie (gros pills tactiles) */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab active={filtreCat === ''} onClick={() => setFiltreCat('')}>
              ✦ Toutes <PillCount n={initial.length} active={filtreCat === ''} />
            </PillTab>
            {categories.map(c => {
              const n = initial.filter(i => i.categorie === c).length
              if (n === 0) return null
              return (
                <PillTab key={c} active={filtreCat === c} onClick={() => setFiltreCat(c)}>
                  {c} <PillCount n={n} active={filtreCat === c} />
                </PillTab>
              )
            })}
          </div>
          {/* Niveau 2 : Stock + Statut */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab small active={filtreStock === 'tous'}   onClick={() => setFiltreStock('tous')}>📦 Tout stock</PillTab>
            <PillTab small active={filtreStock === 'rouge'}  onClick={() => setFiltreStock('rouge')}>🔴 Épuisés</PillTab>
            <PillTab small active={filtreStock === 'orange'} onClick={() => setFiltreStock('orange')}>⚠ Faibles</PillTab>
            <PillTab small active={filtreStock === 'vert'}   onClick={() => setFiltreStock('vert')}>✓ OK</PillTab>
            <PillDivider />
            <PillTab small active={filtreStatut === 'actifs'}   onClick={() => setFiltreStatut('actifs')}>✓ Actifs</PillTab>
            <PillTab small active={filtreStatut === 'tous'}     onClick={() => setFiltreStatut('tous')}>Tous</PillTab>
            <PillTab small active={filtreStatut === 'inactifs'} onClick={() => setFiltreStatut('inactifs')}>🚫 Inactifs</PillTab>
          </div>
        </div>

        {/* Liste — cards mobile / table desktop */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-5xl mb-3">🥕</p>
              <p className="text-lg font-semibold mb-1">Aucun ingrédient</p>
              <p className="text-sm text-muted-foreground">
                {search || filtreCat || filtreStock !== 'tous' || filtreStatut !== 'actifs'
                  ? 'Essaie de relâcher tes filtres.'
                  : 'Ajoute ton premier ingrédient pour démarrer.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile : cards */}
            <div className="grid grid-cols-1 gap-2 md:hidden">
              {filtered.map(i => (
                <IngredientCard
                  key={i.id}
                  i={i}
                  readOnly={readOnly}
                  onEdit={() => setEditing(i)}
                  onHistorique={() => setHistorique(i)}
                  onToggle={() => onActiver(i, !i.actif)}
                  onDelete={() => setConfirmDelete(i)}
                />
              ))}
            </div>

            {/* Desktop : table */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="text-left py-2.5 px-4">Ingrédient</th>
                        <th className="text-left py-2.5 px-2">Catégorie</th>
                        <th className="text-right py-2.5 px-2">Prix HT</th>
                        <th className="text-center py-2.5 px-2">Stock</th>
                        <th className="text-left py-2.5 px-2">Allergènes</th>
                        <th className="text-right py-2.5 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(i => (
                        <IngredientRow
                          key={i.id}
                          i={i}
                          readOnly={readOnly}
                          onEdit={() => setEditing(i)}
                          onHistorique={() => setHistorique(i)}
                          onToggle={() => onActiver(i, !i.actif)}
                          onDelete={() => setConfirmDelete(i)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              {filtered.length} ingrédient{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''} sur {initial.length}
            </p>
          </>
        )}
      </main>

      {/* Toasts */}
      {erreur && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 max-w-[90vw] text-center cursor-pointer"
          onClick={() => setErreur('')}
        >
          ⚠️ {erreur}
        </div>
      )}

      {/* Modals */}
      {(creating || editing) && (
        <IngredientFormModal
          ingredient={editing ?? null}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}
      {historique && (
        <HistoriquePrixModal
          ingredient={historique}
          onClose={() => setHistorique(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer cet ingrédient ?"
          message={`"${confirmDelete.nom}" sera supprimé définitivement avec son historique de prix. Si tu veux le retirer temporairement, utilise plutôt "Désactiver".`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => onSupprimer(confirmDelete)}
        />
      )}
    </div>
  )
}

// ─── KPI ─────────────────────────────────────────────────────────────
function KPI({ label, value, tone, icon, pulse }: {
  label: string
  value: number
  tone: 'default' | 'green' | 'orange' | 'red'
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
        <p className="text-2xl sm:text-3xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Mobile : carte ──────────────────────────────────────────────────
function IngredientCard({
  i, readOnly = false, onEdit, onHistorique, onToggle, onDelete,
}: {
  i: Ingredient
  readOnly?: boolean
  onEdit: () => void
  onHistorique: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const stat = statutStock(i.stock_actuel, i.stock_minimum)
  const sty = STATUT_STOCK_STYLE[stat]
  return (
    <Card className={cn(!i.actif && 'opacity-60')}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base truncate">{i.nom}</p>
            <p className="text-xs text-muted-foreground">{i.categorie} · {i.unite}</p>
          </div>
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', sty.bg, sty.text, sty.border)}>
            {sty.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prix HT</p>
            <p className="font-bold">{fmtPrix(i.prix_achat_ht)}<span className="text-xs text-muted-foreground"> /{i.unite}</span></p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stock</p>
            <p className="font-bold">
              {i.stock_actuel} <span className="text-xs text-muted-foreground">/ {i.stock_minimum} {i.unite}</span>
            </p>
          </div>
        </div>

        {i.allergenes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {i.allergenes.map(a => (
              <span key={a} className="text-[10px] bg-muted px-1.5 py-0.5 rounded" title={a}>
                {iconAllergene(a)}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="ghost" onClick={onHistorique}>📈 Prix</Button>
          {!readOnly && (
            <>
              <Button size="sm" variant="outline" onClick={onEdit} className="flex-1">✏️ Modifier</Button>
              <Button size="sm" variant="ghost" onClick={onToggle}>
                {i.actif ? '🚫' : '✓'}
              </Button>
            </>
          )}
          {!readOnly && <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive">🗑</Button>}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Desktop : ligne ─────────────────────────────────────────────────
function IngredientRow({
  i, readOnly = false, onEdit, onHistorique, onToggle, onDelete,
}: {
  i: Ingredient
  readOnly?: boolean
  onEdit: () => void
  onHistorique: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const stat = statutStock(i.stock_actuel, i.stock_minimum)
  const sty = STATUT_STOCK_STYLE[stat]
  return (
    <tr className={cn('border-b last:border-b-0 hover:bg-muted/30 transition-colors', !i.actif && 'opacity-60')}>
      <td className="py-3 px-4">
        <p className="font-semibold">{i.nom}</p>
        {!i.actif && <Badge variant="secondary" className="mt-0.5">inactif</Badge>}
      </td>
      <td className="py-3 px-2 text-muted-foreground">{i.categorie}</td>
      <td className="py-3 px-2 text-right tabular-nums font-semibold">
        {fmtPrix(i.prix_achat_ht)}<span className="text-xs text-muted-foreground"> /{i.unite}</span>
      </td>
      <td className="py-3 px-2 text-center">
        <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md border', sty.bg, sty.text, sty.border)}>
          {i.stock_actuel} / {i.stock_minimum} {i.unite}
        </span>
      </td>
      <td className="py-3 px-2">
        <div className="flex flex-wrap gap-0.5">
          {i.allergenes.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">aucun</span>
          ) : i.allergenes.map(a => (
            <span key={a} className="text-sm" title={a}>{iconAllergene(a)}</span>
          ))}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onHistorique} title="Historique des prix">📈</Button>
          {!readOnly && (
            <>
              <Button size="sm" variant="ghost" onClick={onEdit} title="Modifier">✏️</Button>
              <Button size="sm" variant="ghost" onClick={onToggle} title={i.actif ? 'Désactiver' : 'Activer'}>
                {i.actif ? '🚫' : '✓'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} title="Supprimer" className="text-destructive">🗑</Button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Confirm dialog ──────────────────────────────────────────────────
function ConfirmDialog({
  title, message, onCancel, onConfirm,
}: {
  title: string
  message: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-in fade-in duration-150" onClick={onCancel}>
      <div
        className="bg-background w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="p-5">
          <div className="w-10 h-1 bg-muted rounded-full mb-3 sm:hidden mx-auto" />
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-2">{message}</p>
        </div>
        <div className="border-t p-3 flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">Annuler</Button>
          <Button variant="destructive" onClick={onConfirm} className="flex-1">Supprimer</Button>
        </div>
      </div>
    </div>
  )
}
