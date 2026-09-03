'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import {
  type Boisson, TYPE_LABEL, COULEUR_LABEL,
  margeBouteille, margeVerre, margePinte, rendementFut,
  statutStockBouteilles, statutStockFuts,
  fmtPrix, fmtPct, type MargeFormat } from '@/lib/boissons'
import { toggleBoissonActif, deleteBoisson } from './actions'
import BoissonFormModal from './BoissonFormModal'

type RecetteShort = { id: string; nom: string; categorie: string; tag_destination: string }

export default function BoissonsClient({
  boissons, recettes, accordsParBoisson, readOnly = false,
}: {
  boissons: Boisson[]
  recettes: RecetteShort[]
  accordsParBoisson: Record<string, { recette_id: string; note: string | null }[]>
  readOnly?: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filtreType, setFiltreType] = useState<Boisson['type'] | ''>('')
  const [filtreStatut, setFiltreStatut] = useState<'actifs' | 'inactifs' | 'tous'>('actifs')

  const [editing, setEditing] = useState<Boisson | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Boisson | null>(null)
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return boissons.filter(b => {
      if (filtreStatut === 'actifs'   && !b.actif) return false
      if (filtreStatut === 'inactifs' &&  b.actif) return false
      if (filtreType && b.type !== filtreType) return false
      if (q && !`${b.nom} ${b.appellation ?? ''} ${b.region ?? ''} ${b.cepage ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [boissons, search, filtreType, filtreStatut])

  // Stats
  const stats = useMemo(() => {
    const actives = boissons.filter(b => b.actif)
    const vinsActifs = actives.filter(b => b.type === 'vin' || b.type === 'champagne').length
    const stockBoutAlerte = actives.filter(b => statutStockBouteilles(b) === 'rouge' || statutStockBouteilles(b) === 'orange').length
    const stockFutAlerte = actives.filter(b => statutStockFuts(b) === 'rouge' || statutStockFuts(b) === 'orange').length
    const ca_potentiel = actives.reduce((s, b) => {
      const r = rendementFut(b)
      return s + (r.applicable ? r.ca_potentiel_par_fut * b.stock_actuel_futs : 0)
    }, 0)
    return { totalActifs: actives.length, vinsActifs, alertesStock: stockBoutAlerte + stockFutAlerte, caPotentielFuts: ca_potentiel }
  }, [boissons])

  function onActiver(b: Boisson, actif: boolean) {
    startTransition(async () => {
      try { await toggleBoissonActif(b.id, actif); router.refresh() }
      catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function onSupprimer(b: Boisson) {
    startTransition(async () => {
      try { await deleteBoisson(b.id); setConfirmDelete(null); router.refresh() }
      catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
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
          accent="violet"
          subtitle="Cuisine & stock"
          title="Vins & boissons"
          description="Multi-format, accords mets-vins, food cost, gestion fûts et bouteilles."
          actions={
            !readOnly && (
              <Button size="lg" onClick={() => setCreating(true)} className="shrink-0">
                <span className="text-lg">+</span>
                <span className="hidden sm:inline">Nouvelle boisson</span>
                <span className="sm:hidden">Ajouter</span>
              </Button>
            )
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <KPI label="Références actives" value={String(stats.totalActifs)} icon="🍶" />
          <KPI label="Vins / champagnes" value={String(stats.vinsActifs)} icon="🍷" />
          <KPI label="Alertes stock" value={String(stats.alertesStock)} icon="⚠"
               tone={stats.alertesStock > 0 ? 'orange' : 'default'} pulse={stats.alertesStock > 0} />
          <KPI label="CA potentiel fûts" value={fmtPrix(stats.caPotentielFuts)} icon="🍺" />
        </div>

        {/* Filtres */}
        <Card>
          <CardContent className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
            <Input
              type="search"
              placeholder="🔍 Nom, appellation, cépage, région…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <Select value={filtreType} onChange={e => setFiltreType(e.target.value as Boisson['type'] | '')} className="md:w-44">
              <option value="">Tous types</option>
              {(Object.keys(TYPE_LABEL) as Boisson['type'][]).map(t => (
                <option key={t} value={t}>{TYPE_LABEL[t].emoji} {TYPE_LABEL[t].label}</option>
              ))}
            </Select>
            <Select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value as 'actifs' | 'inactifs' | 'tous')} className="md:w-40">
              <option value="actifs">Actives uniquement</option>
              <option value="tous">Toutes</option>
              <option value="inactifs">Inactives uniquement</option>
            </Select>
          </CardContent>
        </Card>

        {/* Liste cards */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-5xl mb-3">🍷</p>
              <p className="text-lg font-semibold mb-1">Aucune boisson</p>
              <p className="text-sm text-muted-foreground">
                {search || filtreType || filtreStatut !== 'actifs'
                  ? 'Essaie de relâcher tes filtres.'
                  : 'Crée ta première référence boisson.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(b => (
              <BoissonCard
                key={b.id}
                b={b}
                accordsCount={accordsParBoisson[b.id]?.length ?? 0}
                readOnly={readOnly}
                onEdit={() => setEditing(b)}
                onToggle={() => onActiver(b, !b.actif)}
                onDelete={() => setConfirmDelete(b)}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} boisson{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''} sur {boissons.length}
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
        <BoissonFormModal
          boisson={editing}
          recettes={recettes}
          accordsExplicites={editing ? (accordsParBoisson[editing.id] ?? []) : []}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer cette boisson ?"
          message={`"${confirmDelete.nom}" sera supprimée définitivement avec ses accords. Pour la masquer, utilise plutôt « Désactiver ».`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => onSupprimer(confirmDelete)}
        />
      )}
    </div>
  )
}

// ─── KPI ─────────────────────────────────────────────────────────────
function KPI({ label, value, tone = 'default', icon, pulse }: {
  label: string
  value: string
  tone?: 'default' | 'orange' | 'red'
  icon: string
  pulse?: boolean
}) {
  const cls = {
    default: 'bg-background',
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

// ─── Card boisson ────────────────────────────────────────────────────
function BoissonCard({
  b, accordsCount, readOnly = false, onEdit, onToggle, onDelete,
}: {
  b: Boisson
  accordsCount: number
  readOnly?: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const tag = TYPE_LABEL[b.type]
  const couleur = b.couleur ? COULEUR_LABEL[b.couleur] : null

  const mb = margeBouteille(b)
  const mv = margeVerre(b)
  const mp = margePinte(b)
  const rf = rendementFut(b)

  const stockBout = statutStockBouteilles(b)
  const stockFut  = statutStockFuts(b)

  return (
    <Card className={cn(!b.actif && 'opacity-60')}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={cn('border', tag.cls)}>{tag.emoji} {tag.label}</Badge>
              {couleur && <Badge className={cn('border', couleur.cls)}>{couleur.label}</Badge>}
              {b.millesime && <Badge variant="outline">{b.millesime}</Badge>}
            </div>
            <p className="font-bold text-sm mt-1.5 truncate">{b.nom}</p>
            {(b.appellation || b.region || b.cepage) && (
              <p className="text-[11px] text-muted-foreground truncate">
                {[b.appellation, b.region, b.cepage].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {!b.actif && <Badge variant="secondary" className="shrink-0">inactif</Badge>}
        </div>

        {/* Marges multi-format */}
        <div className="grid grid-cols-3 gap-1.5">
          {mv.applicable && <FormatBadge label="Verre" data={mv} unit={`${b.contenance_verre_cl}cl`} />}
          {mb.applicable && <FormatBadge label="Btl"   data={mb} unit={`${b.contenance_bouteille_cl}cl`} />}
          {mp.applicable && <FormatBadge label="Pinte" data={mp} unit={`${b.contenance_pinte_cl}cl`} />}
          {!mv.applicable && !mb.applicable && !mp.applicable && (
            <div className="col-span-3 text-xs text-muted-foreground italic">
              Prix de vente non renseignés.
            </div>
          )}
        </div>

        {/* Rendement fût */}
        {rf.applicable && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-2.5 py-1.5 text-xs flex justify-between items-center gap-2">
            <span>🍺 <b>{rf.nb_pintes_par_fut.toFixed(0)} pintes/fût</b></span>
            <span className="font-bold tabular-nums">CA potentiel : {fmtPrix(rf.ca_potentiel_par_fut)}</span>
          </div>
        )}

        {/* Stock */}
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {stockBout !== 'na' && (
            <StockLine label="Btl" value={`${b.stock_actuel_bouteilles} / ${b.stock_minimum_bouteilles}`} statut={stockBout} />
          )}
          {stockFut !== 'na' && (
            <StockLine label="Fûts" value={`${b.stock_actuel_futs} / ${b.stock_minimum_futs}`} statut={stockFut} />
          )}
        </div>

        {/* Accords */}
        {accordsCount > 0 && (
          <div className="text-xs text-muted-foreground">
            🍽️ {accordsCount} accord{accordsCount > 1 ? 's' : ''} défini{accordsCount > 1 ? 's' : ''}
          </div>
        )}

        {/* Actions — masquées en lecture seule */}
        {!readOnly && (
          <div className="flex gap-1 pt-1">
            <Button size="sm" variant="outline" onClick={onEdit} className="flex-1">✏️ Modifier</Button>
            <Button size="sm" variant="ghost" onClick={onToggle} title={b.actif ? 'Désactiver' : 'Activer'}>
              {b.actif ? '🚫' : '✓'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive">🗑</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FormatBadge({ label, data, unit }: { label: string; data: MargeFormat; unit: string }) {
  const tone = data.statut === 'vert' ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : data.statut === 'orange' ? 'bg-amber-50 border-amber-200 text-amber-900'
    : 'bg-red-50 border-red-200 text-red-900'
  return (
    <div className={cn('rounded-md border px-2 py-1.5', tone)}>
      <p className="text-[9px] uppercase tracking-wider opacity-70">{label} · {unit}</p>
      <p className="font-bold text-sm tabular-nums">{fmtPrix(data.prix_vente_ht)}</p>
      <p className="text-[10px] tabular-nums">marge {fmtPct(data.marge_pct)}</p>
    </div>
  )
}

function StockLine({ label, value, statut }: { label: string; value: string; statut: 'rouge' | 'orange' | 'vert' | 'na' }) {
  const tone = statut === 'vert' ? 'text-emerald-700'
    : statut === 'orange' ? 'text-amber-700'
    : statut === 'rouge' ? 'text-red-700'
    : 'text-muted-foreground'
  return (
    <div className={cn('rounded bg-muted/40 px-2 py-1 flex justify-between items-center', tone)}>
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
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
