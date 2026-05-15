'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getRecettePhoto } from '@/lib/recettePhoto'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import {
  synthese, fmtPrix, fmtPct, STATUT_FOOD_COST_STYLE,
} from '@/lib/foodCost'
import { iconAllergene } from '../ingredients/types'
import { type Ingredient } from '../ingredients/types'
import {
  type RecetteWithIngredients, TAGS_DESTINATION, TAG_STYLE, type TagDestination,
} from './types'
import { toggleRecetteActif, deleteRecette } from './actions'
import RecetteFormModal from './RecetteFormModal'
import { installerCatalogueDemarrage, seedCatalogueOnline } from '../setup/seed-actions'
import { Loader2, Sparkles } from 'lucide-react'
import { PillTab, PillCount, PillDivider } from '@/components/ui/PillTab'

export default function RecettesClient({
  initialRecettes, ingredients, readOnly = false,
}: {
  initialRecettes: RecetteWithIngredients[]
  ingredients: Ingredient[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filtreTag, setFiltreTag] = useState<TagDestination | ''>('')
  const [filtreFC, setFiltreFC] = useState<'tous' | 'vert' | 'orange' | 'rouge' | 'alerte'>('tous')
  const [filtreStatut, setFiltreStatut] = useState<'actifs' | 'inactifs' | 'tous'>('actifs')
  const [filtreOnline, setFiltreOnline] = useState<'tous' | 'online' | 'offline'>('tous')

  const [editing, setEditing]   = useState<RecetteWithIngredients | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<RecetteWithIngredients | null>(null)
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  // Synthèse pour chaque recette (calculée à la volée — single source of truth = ingrédients)
  const enriched = useMemo(() => initialRecettes.map(r => ({
    recette: r,
    s: synthese(
      r.ingredients.map(li => ({ quantite: li.quantite, prix_achat_ht: li.ingredient_prix_achat_ht })),
      r.nb_portions,
      r.prix_vente_ht
    ),
  })), [initialRecettes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enriched.filter(({ recette: r, s }) => {
      if (filtreStatut === 'actifs'   && !r.actif) return false
      if (filtreStatut === 'inactifs' &&  r.actif) return false
      if (filtreOnline === 'online'  && !r.vendable_online) return false
      if (filtreOnline === 'offline' &&  r.vendable_online) return false
      if (filtreTag && r.tag_destination !== filtreTag) return false
      if (filtreFC === 'alerte' && !s.alerte) return false
      if (filtreFC !== 'tous' && filtreFC !== 'alerte' && s.statut !== filtreFC) return false
      if (q && !(r.nom.toLowerCase().includes(q) || r.categorie.toLowerCase().includes(q))) return false
      return true
    })
  }, [enriched, search, filtreTag, filtreFC, filtreStatut, filtreOnline])

  const stats = useMemo(() => {
    const actifs = enriched.filter(e => e.recette.actif)
    const fcMoyen = actifs.length > 0
      ? actifs.reduce((sum, e) => sum + (e.s.food_cost_pct || 0), 0) / actifs.length
      : 0
    const margeMoyenne = actifs.length > 0
      ? actifs.reduce((sum, e) => sum + e.s.marge_eur, 0) / actifs.length
      : 0
    return {
      total: actifs.length,
      fcMoyen,
      alertes: actifs.filter(e => e.s.alerte).length,
      margeMoyenne,
    }
  }, [enriched])

  function onActiver(r: RecetteWithIngredients, actif: boolean) {
    startTransition(async () => {
      try {
        await toggleRecetteActif(r.id, actif)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function onSupprimer(r: RecetteWithIngredients) {
    startTransition(async () => {
      try {
        await deleteRecette(r.id)
        setConfirmDelete(null)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <AdminPageHeader
          accent="amber"
          subtitle="Cuisine & stock"
          title="Recettes"
          description="Fiches techniques, food cost, allergènes, menu engineering."
          actions={
            <>
              <Link href="/admin/recettes/engineering">
                <Button size="lg" variant="outline">
                  <span className="hidden sm:inline">📊 Menu engineering</span>
                  <span className="sm:hidden">📊 Engineering</span>
                </Button>
              </Link>
              {!readOnly && (
                <>
                  <PackDemarrageButton />
                  <SeedOnlineButton />
                  <Button size="lg" onClick={() => setCreating(true)}>
                    <span className="text-lg">+</span>
                    <span className="hidden sm:inline">Nouvelle recette</span>
                    <span className="sm:hidden">Ajouter</span>
                  </Button>
                </>
              )}
            </>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <KPI label="Recettes actives" value={String(stats.total)} icon="📖" tone="default" />
          <KPI label="Food cost moyen" value={stats.total > 0 ? fmtPct(stats.fcMoyen) : '—'} icon="📊"
               tone={stats.fcMoyen > 32 ? 'red' : stats.fcMoyen > 28 ? 'orange' : 'green'} />
          <KPI label="Alertes (>30%)" value={String(stats.alertes)} icon="🚨"
               tone={stats.alertes > 0 ? 'red' : 'green'} pulse={stats.alertes > 0} />
          <KPI label="Marge moyenne" value={stats.total > 0 ? fmtPrix(stats.margeMoyenne) : '—'} icon="💰" tone="default" />
        </div>

        {/* Filtres */}
        {/* Toolbar premium — recherche + 4 segmented controls pills (tactile mobile/tablette) */}
        <div className="sticky top-[64px] z-10 -mx-4 px-4 py-3 bg-zinc-50/95 backdrop-blur-md border-b border-zinc-200 space-y-2">
          <Input
            type="search"
            placeholder="🔍 Rechercher un plat..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-11 text-base"
          />
          {/* Niveau 1 : Destination (gros pills tactiles) */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab active={filtreTag === ''} onClick={() => setFiltreTag('')}>
              ✦ Toutes <PillCount n={enriched.length} active={filtreTag === ''} />
            </PillTab>
            {TAGS_DESTINATION.map(t => {
              const n = enriched.filter(e => e.recette.tag_destination === t).length
              if (n === 0) return null
              return (
                <PillTab key={t} active={filtreTag === t} onClick={() => setFiltreTag(t)}>
                  {TAG_STYLE[t].emoji} {TAG_STYLE[t].label} <PillCount n={n} active={filtreTag === t} />
                </PillTab>
              )
            })}
          </div>

          {/* Niveau 2 : Food cost + Statut + Online — pills compactes */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab small active={filtreFC === 'tous'}   onClick={() => setFiltreFC('tous')}>📊 Tout FC</PillTab>
            <PillTab small active={filtreFC === 'vert'}   onClick={() => setFiltreFC('vert')}>🟢 Sain</PillTab>
            <PillTab small active={filtreFC === 'orange'} onClick={() => setFiltreFC('orange')}>🟡 Surveiller</PillTab>
            <PillTab small active={filtreFC === 'rouge'}  onClick={() => setFiltreFC('rouge')}>🔴 Élevé</PillTab>
            <PillTab small active={filtreFC === 'alerte'} onClick={() => setFiltreFC('alerte')}>🚨 Alerte</PillTab>
            <PillDivider />
            <PillTab small active={filtreStatut === 'actifs'}   onClick={() => setFiltreStatut('actifs')}>✓ Actifs</PillTab>
            <PillTab small active={filtreStatut === 'tous'}     onClick={() => setFiltreStatut('tous')}>Tous</PillTab>
            <PillTab small active={filtreStatut === 'inactifs'} onClick={() => setFiltreStatut('inactifs')}>🚫 Inactifs</PillTab>
            <PillDivider />
            <PillTab small active={filtreOnline === 'tous'}    onClick={() => setFiltreOnline('tous')}>Tous</PillTab>
            <PillTab small active={filtreOnline === 'online'}  onClick={() => setFiltreOnline('online')}>🌐 En ligne</PillTab>
            <PillTab small active={filtreOnline === 'offline'} onClick={() => setFiltreOnline('offline')}>🚫 Hors ligne</PillTab>
          </div>
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-5xl mb-3">📖</p>
              <p className="text-lg font-semibold mb-1">Aucune recette</p>
              <p className="text-sm text-muted-foreground">
                {search || filtreTag || filtreFC !== 'tous' || filtreStatut !== 'actifs'
                  ? 'Essaie de relâcher tes filtres.'
                  : 'Crée ta première recette pour démarrer.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(({ recette, s }) => (
              <RecetteCard
                key={recette.id}
                recette={recette}
                synth={s}
                readOnly={readOnly}
                onEdit={() => setEditing(recette)}
                onToggle={() => onActiver(recette, !recette.actif)}
                onDelete={() => setConfirmDelete(recette)}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} recette{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''} sur {initialRecettes.length}
        </p>
      </main>

      {erreur && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 max-w-[90vw] text-center cursor-pointer"
          onClick={() => setErreur('')}
        >
          ⚠️ {erreur}
        </div>
      )}

      {(creating || editing) && (
        <RecetteFormModal
          recette={editing}
          ingredients={ingredients}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer cette recette ?"
          message={`"${confirmDelete.nom}" sera supprimée définitivement avec ses ${confirmDelete.ingredients.length} ingrédient(s) liés. Pour la masquer temporairement, utilise plutôt « Désactiver ».`}
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
  value: string
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
        <p className="text-2xl sm:text-3xl font-bold mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Carte recette ───────────────────────────────────────────────────
function RecetteCard({
  recette: r, synth: s, readOnly = false, onEdit, onToggle, onDelete,
}: {
  recette: RecetteWithIngredients
  synth: ReturnType<typeof synthese>
  readOnly?: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const tag = TAG_STYLE[r.tag_destination]
  const fcSty = STATUT_FOOD_COST_STYLE[s.statut]

  // Allergènes auto-dérivés depuis ingrédients
  const allergenes = useMemo(() => {
    const set = new Set<string>()
    r.ingredients.forEach(li => li.ingredient_allergenes.forEach(a => set.add(a)))
    return Array.from(set).sort()
  }, [r.ingredients])

  return (
    <Card className={cn('overflow-hidden flex flex-col', !r.actif && 'opacity-60')}>
      {/* Photo (fallback Unsplash thématique si aucune photo en DB) */}
      <div className="relative aspect-[16/9] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getRecettePhoto({
            photo_url: r.photo_url,
            image_url: (r as any).image_url,
            tag_destination: r.tag_destination,
            categorie: r.categorie,
            nom: r.nom,
          })}
          alt={r.nom}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <Badge className={cn('absolute top-2 left-2 border', tag.cls)}>
          {tag.emoji} {tag.label}
        </Badge>
        {r.vendable_online && (
          <Badge className="absolute bottom-2 left-2 bg-emerald-500 text-white border-0">
            🌐 En ligne
          </Badge>
        )}
        {s.alerte && (
          <Badge className="absolute top-2 right-2 bg-red-600 text-white border-0 animate-pulse">
            🚨 Alerte food cost
          </Badge>
        )}
      </div>

      <CardContent className="p-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base truncate">{r.nom}</p>
            <p className="text-xs text-muted-foreground">
              {r.categorie} · {r.nb_portions} portion{r.nb_portions > 1 ? 's' : ''} · {r.temps_preparation} min
            </p>
          </div>
          {!r.actif && <Badge variant="secondary" className="shrink-0">inactif</Badge>}
        </div>

        {/* Bandeau food cost */}
        <div className={cn('rounded-md border p-2.5 mb-2', fcSty.bg, fcSty.border)}>
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('text-xs font-bold uppercase tracking-wider', fcSty.text)}>
              Food cost
            </span>
            <span className={cn('text-2xl font-bold tabular-nums', fcSty.text)}>
              {fmtPct(s.food_cost_pct)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-xs mt-1.5">
            <div>
              <p className="text-muted-foreground">Coût/p.</p>
              <p className="font-semibold tabular-nums">{fmtPrix(s.cout_portion)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Vente HT</p>
              <p className="font-semibold tabular-nums">{fmtPrix(r.prix_vente_ht)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Marge</p>
              <p className="font-semibold tabular-nums">{fmtPrix(s.marge_eur)}</p>
            </div>
          </div>
        </div>

        {/* Ingrédients */}
        <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
          {r.ingredients.length === 0
            ? <span className="italic">Aucun ingrédient lié.</span>
            : r.ingredients.map(li => `${li.quantite} ${li.unite} ${li.ingredient_nom}`).join(' · ')
          }
        </div>

        {/* Allergènes auto */}
        {allergenes.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mb-2">
            {allergenes.map(a => (
              <span key={a} className="text-sm" title={a}>{iconAllergene(a)}</span>
            ))}
          </div>
        )}

        {/* Actions — masquées en lecture seule */}
        {!readOnly && (
          <div className="flex gap-1 mt-auto pt-2">
            <Button size="sm" variant="outline" onClick={onEdit} className="flex-1">✏️ Modifier</Button>
            <Button size="sm" variant="ghost" onClick={onToggle} title={r.actif ? 'Désactiver' : 'Activer'}>
              {r.actif ? '🚫' : '✓'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive" title="Supprimer">🗑</Button>
          </div>
        )}
      </CardContent>
    </Card>
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

// Bouton « Pack démarrage » : installe 5 fournisseurs + 50 ingrédients + 20 recettes en 1 click.
function PackDemarrageButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ f: number; i: number; r: number; details: string[] } | null>(null)

  function lancer() {
    if (!confirm(
      'Installer le pack démarrage ?\n\n' +
      'Cela créera :\n' +
      '• 5 fournisseurs typiques (Metro, Pomona, Sysco...)\n' +
      '• 50 ingrédients de base avec prix d\'achat\n' +
      '• 20 recettes prêtes à l\'emploi (pizzas, burgers, salades, plats, desserts, boissons)\n\n' +
      'Idempotent : ne crée pas de doublons.'
    )) return
    startTransition(async () => {
      try {
        const r = await installerCatalogueDemarrage()
        setResult({ f: r.fournisseurs.crees, i: r.ingredients.crees, r: r.recettes.crees, details: r.details })
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        onClick={lancer}
        disabled={pending}
        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1"
        title="Installer 20 recettes + 50 ingrédients + 5 fournisseurs"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        <span className="hidden sm:inline">Pack démarrage</span>
        <span className="sm:hidden">Pack</span>
      </Button>

      {result && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setResult(null)}>
          <div className="bg-white rounded-lg max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              Pack démarrage installé
            </h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-md bg-emerald-50 p-2 text-center">
                <p className="text-2xl font-bold text-emerald-700">{result.f}</p>
                <p className="text-[10px] text-zinc-500 uppercase">Fournisseurs</p>
              </div>
              <div className="rounded-md bg-emerald-50 p-2 text-center">
                <p className="text-2xl font-bold text-emerald-700">{result.i}</p>
                <p className="text-[10px] text-zinc-500 uppercase">Ingrédients</p>
              </div>
              <div className="rounded-md bg-emerald-50 p-2 text-center">
                <p className="text-2xl font-bold text-emerald-700">{result.r}</p>
                <p className="text-[10px] text-zinc-500 uppercase">Recettes</p>
              </div>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-600">Voir le détail ({result.details.length} lignes)</summary>
              <ul className="mt-2 space-y-0.5 text-[11px] font-mono text-zinc-700 max-h-48 overflow-y-auto">
                {result.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </details>
            <Button onClick={() => setResult(null)} className="w-full mt-3">Fermer</Button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Bouton « Activer site web » ─────────────────────────────
// Active vendable_online sur toutes les recettes SNACKING/PIZZA/BAR existantes
// + crée 16 recettes starter (5 snacking, 5 pizzas, 6 bar) avec photos
// + ajoute photo placeholder sur toutes les recettes online sans image.
function SeedOnlineButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ activees: number; creees: number; photos: number; total: number; details: string[] } | null>(null)

  function lancer() {
    if (!confirm(
      'Activer le catalogue ONLINE pour le site web ?\n\n' +
      'Cela va :\n' +
      '• Activer « vendable_online » sur toutes tes recettes SNACKING/PIZZA/BAR existantes\n' +
      '• Créer 16 recettes starter manquantes (5 snacking + 5 pizzas + 6 bar) avec photos\n' +
      '• Ajouter une photo placeholder sur les recettes online sans image\n\n' +
      'Idempotent : ne crée pas de doublons.'
    )) return
    startTransition(async () => {
      try {
        const r = await seedCatalogueOnline()
        setResult({ activees: r.activees, creees: r.creees, photos: r.photos_ajoutees, total: r.total_online, details: r.details })
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        onClick={lancer}
        disabled={pending}
        className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1"
        title="Active toutes les recettes pour le site web + crée des plats si manquants"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>🌐</span>}
        <span className="hidden sm:inline">Activer site web</span>
        <span className="sm:hidden">Site web</span>
      </Button>

      {result && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setResult(null)}>
          <div className="bg-white rounded-lg max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <span className="text-2xl">🌐</span>
              Catalogue site web activé
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-md bg-blue-50 p-2 text-center">
                <p className="text-2xl font-bold text-blue-700">{result.total}</p>
                <p className="text-[10px] uppercase tracking-wider">Recettes online</p>
              </div>
              <div className="rounded-md bg-emerald-50 p-2 text-center">
                <p className="text-2xl font-bold text-emerald-700">+{result.creees}</p>
                <p className="text-[10px] uppercase tracking-wider">Créées</p>
              </div>
              <div className="rounded-md bg-amber-50 p-2 text-center">
                <p className="text-2xl font-bold text-amber-700">{result.activees}</p>
                <p className="text-[10px] uppercase tracking-wider">Activées</p>
              </div>
              <div className="rounded-md bg-pink-50 p-2 text-center">
                <p className="text-2xl font-bold text-pink-700">{result.photos}</p>
                <p className="text-[10px] uppercase tracking-wider">Photos ajoutées</p>
              </div>
            </div>
            <p className="text-xs text-zinc-600 mb-2">
              ✓ Va vérifier sur <a href="https://site-restaurant-beta.vercel.app/menu" target="_blank" rel="noopener" className="text-blue-600 underline">le site /menu</a> (hard reload Ctrl+Shift+R).
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700">Détails ({result.details.length})</summary>
              <ul className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
                {result.details.map((d, i) => <li key={i} className="text-[11px] text-zinc-600">{d}</li>)}
              </ul>
            </details>
            <Button onClick={() => setResult(null)} className="w-full mt-3">Fermer</Button>
          </div>
        </div>
      )}
    </>
  )
}
