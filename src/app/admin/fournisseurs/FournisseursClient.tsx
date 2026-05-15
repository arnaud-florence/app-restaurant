'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import {
  type Fournisseur, type BonCommande, type Facture, type EntreePrix,
  type LigneComparateur, type HaussePrix, type ImpactMarge,
  STATUT_BON_LABEL, STATUT_FACTURE_LABEL,
  scoreFournisseur, alertesFactures, detecterHaussesPrix, impactSurMarges, comparerPrix,
  fmtPrix, fmtPct,
} from '@/lib/fournisseurs'
import { type Ingredient } from '../ingredients/types'
import { type RecetteWithIngredients } from '../recettes/types'

import {
  changerStatutBon, changerStatutFacture, deleteFournisseur, deleteFacture, deleteBonCommande,
  autoGenererBonsDepuisStock,
} from './actions'

import FournisseurFormModal from './FournisseurFormModal'
import BonCommandeFormModal from './BonCommandeFormModal'
import ReceptionModal from './ReceptionModal'
import FactureFormModal from './FactureFormModal'
import FactureScanner from './FactureScanner'

// Données pré-remplies par le scanner OCR (Agent 8) — passées à FactureFormModal
type ScannedFacture = {
  fournisseur_nom: string | null
  numero: string | null
  date_emission: string | null
  date_echeance: string | null
  montant_ht: number | null
  montant_ttc: number | null
  notes: string | null
}

type Tab = 'fournisseurs' | 'bons' | 'factures' | 'comparateur'

export default function FournisseursClient({
  fournisseurs, bons, factures, ingredients, recettes, entreesPrix,
}: {
  fournisseurs: Fournisseur[]
  bons: BonCommande[]
  factures: Facture[]
  ingredients: Ingredient[]
  recettes: RecetteWithIngredients[]
  entreesPrix: EntreePrix[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('fournisseurs')
  const [search, setSearch] = useState('')

  const [editingFournisseur, setEditingFournisseur] = useState<Fournisseur | null>(null)
  const [creatingFournisseur, setCreatingFournisseur] = useState(false)
  const [editingBon, setEditingBon] = useState<BonCommande | null>(null)
  const [creatingBon, setCreatingBon] = useState(false)
  const [receptionBon, setReceptionBon] = useState<BonCommande | null>(null)
  const [creatingFacture, setCreatingFacture] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannedData, setScannedData] = useState<ScannedFacture | null>(null)

  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  const [, startTransition] = useTransition()

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  // ─── Derived ──────────────────────────────────────────────────────
  const alertesFac = useMemo(() => alertesFactures(factures, 7), [factures])
  const haussesPrix = useMemo(() => detecterHaussesPrix(
    entreesPrix,
    ingredients.map(i => ({ id: i.id, nom: i.nom, unite: i.unite })),
    5,
  ), [entreesPrix, ingredients])

  const comparateur = useMemo(() => comparerPrix(
    entreesPrix,
    ingredients.map(i => ({ id: i.id, nom: i.nom, unite: i.unite, prix_achat_ht: i.prix_achat_ht })),
    fournisseurs.map(f => ({ id: f.id, nom: f.nom })),
  ), [entreesPrix, ingredients, fournisseurs])

  const recettesPourImpact = useMemo(() => recettes.filter(r => r.actif).map(r => ({
    id: r.id,
    nom: r.nom,
    nb_portions: r.nb_portions,
    prix_vente_ht: r.prix_vente_ht,
    ingredients: r.ingredients.map(li => ({
      ingredient_id: li.ingredient_id,
      quantite: li.quantite,
      prix_achat_ht_actuel: li.ingredient_prix_achat_ht,
    })),
  })), [recettes])

  // KPIs
  const stats = useMemo(() => {
    const actifs = fournisseurs.filter(f => f.actif)
    const moyenneScore = actifs.length > 0
      ? actifs.reduce((s, f) => s + scoreFournisseur(f).score, 0) / actifs.length
      : 0
    const factA_payer = factures.filter(f => f.statut === 'a_payer' || f.statut === 'en_retard').reduce((s, f) => s + f.montant_ttc, 0)
    return {
      nbActifs: actifs.length,
      moyenneScore,
      bonsBrouillons: bons.filter(b => b.statut === 'brouillon').length,
      facturesAlertes: alertesFac.length,
      facturesAPayer: factA_payer,
    }
  }, [fournisseurs, bons, factures, alertesFac])

  function autoGenerer() {
    startTransition(async () => {
      try {
        const r = await autoGenererBonsDepuisStock()
        flashOk(r.message)
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
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white text-xl shadow-lg shadow-indigo-500/30 shrink-0">
                🚚
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Achats</p>
                <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Fournisseurs</h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={autoGenerer} variant="outline" size="sm" title="Génère un brouillon par fournisseur depuis les ingrédients sous le seuil minimum">
                ✨ Auto-bons depuis stock
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
            <TabButton active={tab === 'fournisseurs'} onClick={() => setTab('fournisseurs')}>
              👥 Fournisseurs <Badge variant="secondary" className="ml-1.5">{fournisseurs.length}</Badge>
            </TabButton>
            <TabButton active={tab === 'bons'} onClick={() => setTab('bons')}>
              📑 Bons de commande <Badge variant="secondary" className="ml-1.5">{bons.length}</Badge>
            </TabButton>
            <TabButton active={tab === 'factures'} onClick={() => setTab('factures')}>
              💸 Factures
              {alertesFac.length > 0 && (
                <Badge variant="destructive" className="ml-1.5 animate-pulse">{alertesFac.length}</Badge>
              )}
            </TabButton>
            <TabButton active={tab === 'comparateur'} onClick={() => setTab('comparateur')}>
              📊 Comparateur prix
            </TabButton>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* KPIs globaux */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
          <KPI label="Fournisseurs"     value={String(stats.nbActifs)}                  icon="👥" />
          <KPI label="Score moyen"       value={`${stats.moyenneScore.toFixed(1)}/5`}    icon="⭐" />
          <KPI label="Bons brouillons"   value={String(stats.bonsBrouillons)}            icon="📝" />
          <KPI label="Factures à payer"  value={fmtPrix(stats.facturesAPayer)}           icon="💸"
               tone={stats.facturesAlertes > 0 ? 'orange' : 'default'} />
          <KPI label="Alertes paiement"  value={String(stats.facturesAlertes)}           icon="🚨"
               tone={stats.facturesAlertes > 0 ? 'red' : 'default'} pulse={stats.facturesAlertes > 0} />
        </div>

        {/* Alertes hausses prix (toujours visible si présentes) */}
        {haussesPrix.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <div>
                <p className="font-bold text-amber-900">📈 {haussesPrix.length} alerte{haussesPrix.length > 1 ? 's' : ''} hausse de prix &gt; 5%</p>
                <p className="text-xs text-amber-800">Impact calculé sur les marges des recettes utilisant ces ingrédients.</p>
              </div>
              <div className="space-y-2">
                {haussesPrix.slice(0, 5).map(h => (
                  <HaussePrixCard key={h.ingredient_id} hausse={h} recettes={recettesPourImpact} />
                ))}
                {haussesPrix.length > 5 && (
                  <p className="text-xs text-muted-foreground italic">… et {haussesPrix.length - 5} autre{haussesPrix.length - 5 > 1 ? 's' : ''}.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contenu de l'onglet actif */}
        {tab === 'fournisseurs' && (
          <FournisseursTab
            fournisseurs={fournisseurs}
            search={search}
            onSearch={setSearch}
            onCreate={() => setCreatingFournisseur(true)}
            onEdit={f => setEditingFournisseur(f)}
            onDelete={f => {
              if (confirm(`Supprimer "${f.nom}" ?`)) {
                startTransition(async () => {
                  try { await deleteFournisseur(f.id); flashOk(`${f.nom} supprimé`); router.refresh() }
                  catch (e) { flashKo(e) }
                })
              }
            }}
          />
        )}

        {tab === 'bons' && (
          <BonsTab
            bons={bons}
            fournisseurs={fournisseurs}
            onCreate={() => setCreatingBon(true)}
            onEdit={b => setEditingBon(b)}
            onReception={b => setReceptionBon(b)}
            onDelete={b => {
              if (confirm(`Supprimer le bon de commande à ${b.fournisseur_nom} ?`)) {
                startTransition(async () => {
                  try { await deleteBonCommande(b.id); flashOk('Bon supprimé'); router.refresh() }
                  catch (e) { flashKo(e) }
                })
              }
            }}
            onChangerStatut={(id, statut) => startTransition(async () => {
              try { await changerStatutBon(id, statut); flashOk('Statut mis à jour'); router.refresh() }
              catch (e) { flashKo(e) }
            })}
          />
        )}

        {tab === 'factures' && (
          <FacturesTab
            factures={factures}
            alertes={alertesFac}
            onCreate={() => setCreatingFacture(true)}
            onScan={() => setScannerOpen(true)}
            onChangerStatut={(id, statut) => startTransition(async () => {
              try { await changerStatutFacture(id, statut); flashOk('Statut facture mis à jour'); router.refresh() }
              catch (e) { flashKo(e) }
            })}
            onDelete={f => {
              if (confirm(`Supprimer la facture ${f.numero} ?`)) {
                startTransition(async () => {
                  try { await deleteFacture(f.id); flashOk('Facture supprimée'); router.refresh() }
                  catch (e) { flashKo(e) }
                })
              }
            }}
          />
        )}

        {tab === 'comparateur' && (
          <ComparateurTab lignes={comparateur} />
        )}
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
      {(creatingFournisseur || editingFournisseur) && (
        <FournisseurFormModal
          fournisseur={editingFournisseur}
          onClose={() => { setCreatingFournisseur(false); setEditingFournisseur(null) }}
          onSaved={() => { setCreatingFournisseur(false); setEditingFournisseur(null); router.refresh() }}
        />
      )}
      {(creatingBon || editingBon) && (
        <BonCommandeFormModal
          bon={editingBon}
          fournisseurs={fournisseurs.filter(f => f.actif)}
          ingredients={ingredients.filter(i => i.actif)}
          onClose={() => { setCreatingBon(false); setEditingBon(null) }}
          onSaved={() => { setCreatingBon(false); setEditingBon(null); router.refresh() }}
        />
      )}
      {receptionBon && (
        <ReceptionModal
          bon={receptionBon}
          onClose={() => setReceptionBon(null)}
          onSaved={() => { setReceptionBon(null); router.refresh() }}
        />
      )}
      {creatingFacture && (
        <FactureFormModal
          fournisseurs={fournisseurs.filter(f => f.actif)}
          bons={bons}
          initial={scannedData ?? undefined}
          onClose={() => { setCreatingFacture(false); setScannedData(null) }}
          onSaved={() => { setCreatingFacture(false); setScannedData(null); router.refresh() }}
        />
      )}
      {scannerOpen && (
        <FactureScanner
          onClose={() => setScannerOpen(false)}
          onExtractionComplete={(data) => {
            setScannedData({
              fournisseur_nom: data.fournisseur_nom,
              numero: data.numero,
              date_emission: data.date_emission,
              date_echeance: data.date_echeance,
              montant_ht: data.montant_ht,
              montant_ttc: data.montant_ttc,
              notes: data.notes
                ? `Scanné par Agent IA. Notes : ${data.notes}`
                : 'Scanné par Agent IA',
            })
            setScannerOpen(false)
            setCreatingFacture(true)
          }}
        />
      )}
    </div>
  )
}

// ─── Helpers UI ──────────────────────────────────────────────────────
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
      )}
    >
      {children}
    </button>
  )
}

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

// ─── Hausse prix card avec impact marges ─────────────────────────────
function HaussePrixCard({
  hausse, recettes,
}: {
  hausse: HaussePrix
  recettes: Array<{
    id: string; nom: string; nb_portions: number; prix_vente_ht: number
    ingredients: Array<{ ingredient_id: string; quantite: number; prix_achat_ht_actuel: number }>
  }>
}) {
  const impacts: ImpactMarge[] = useMemo(() => impactSurMarges(hausse, recettes), [hausse, recettes])
  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <p className="font-bold text-sm">{hausse.ingredient_nom} <span className="text-xs text-muted-foreground font-normal">/{hausse.ingredient_unite}</span></p>
          <p className="text-xs text-muted-foreground">
            {fmtPrix(hausse.prix_avant)} → <b className="text-red-700">{fmtPrix(hausse.prix_actuel)}</b>
            {' '}<span className="text-red-700 font-bold">+{fmtPct(hausse.delta_pct)}</span>
          </p>
        </div>
        <Badge variant="destructive">+{fmtPct(hausse.delta_pct)}</Badge>
      </div>

      {impacts.length > 0 && (
        <div className="text-xs space-y-1">
          <p className="text-muted-foreground font-semibold">Impact sur les marges :</p>
          {impacts.map(im => (
            <div key={im.recette_id} className="flex justify-between items-center bg-red-50 border border-red-100 rounded px-2 py-1">
              <span className="truncate">{im.recette_nom}</span>
              <span className="text-right shrink-0 ml-2">
                <span className="text-red-700 font-bold tabular-nums">−{fmtPrix(im.surcout_par_portion)}</span>
                <span className="text-muted-foreground ml-1.5">({fmtPct(im.food_cost_avant_pct)} → {fmtPct(im.food_cost_apres_pct)})</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Onglet : Fournisseurs ───────────────────────────────────────────
function FournisseursTab({
  fournisseurs, search, onSearch, onCreate, onEdit, onDelete,
}: {
  fournisseurs: Fournisseur[]
  search: string
  onSearch: (s: string) => void
  onCreate: () => void
  onEdit: (f: Fournisseur) => void
  onDelete: (f: Fournisseur) => void
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fournisseurs.filter(f => {
      if (!q) return true
      return `${f.nom} ${f.contact ?? ''} ${f.email ?? ''} ${f.adresse ?? ''}`.toLowerCase().includes(q)
    })
  }, [fournisseurs, search])

  return (
    <>
      <Card>
        <CardContent className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <Input
            type="search"
            placeholder="🔍 Rechercher (nom, contact, email)…"
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
          <Button onClick={onCreate}>+ Nouveau fournisseur</Button>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground italic">Aucun fournisseur.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(f => (
            <FournisseurCard key={f.id} f={f} onEdit={() => onEdit(f)} onDelete={() => onDelete(f)} />
          ))}
        </div>
      )}
    </>
  )
}

function FournisseurCard({ f, onEdit, onDelete }: { f: Fournisseur; onEdit: () => void; onDelete: () => void }) {
  const score = scoreFournisseur(f)
  const stars = '★'.repeat(Math.round(score.score)) + '☆'.repeat(5 - Math.round(score.score))
  return (
    <Card className={cn(!f.actif && 'opacity-60')}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate">{f.nom}</p>
            {f.contact && <p className="text-[11px] text-muted-foreground truncate">👤 {f.contact}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-amber-600">{stars}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{score.score.toFixed(1)}/5</p>
          </div>
        </div>

        <div className="text-xs space-y-0.5 text-muted-foreground">
          {f.telephone && <p>📞 {f.telephone}</p>}
          {f.email && <p>✉️ {f.email}</p>}
          {f.adresse && <p className="truncate">📍 {f.adresse}</p>}
        </div>

        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <Stat label="Délai"   value={`${f.delai_livraison_jours}j`} />
          <Stat label="Min."    value={`${f.minimum_commande}€`} />
          <Stat label="Jours"   value={f.jours_livraison.length > 0 ? f.jours_livraison.length + 'j/sem' : '—'} />
        </div>

        {f.jours_livraison.length > 0 && (
          <p className="text-[10px] text-muted-foreground capitalize">
            Livraison : {f.jours_livraison.join(', ')}
          </p>
        )}

        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="outline" onClick={onEdit} className="flex-1">✏️ Modifier</Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive">🗑</Button>
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

// ─── Onglet : Bons de commande ───────────────────────────────────────
function BonsTab({
  bons, fournisseurs, onCreate, onEdit, onReception, onDelete, onChangerStatut,
}: {
  bons: BonCommande[]
  fournisseurs: Fournisseur[]
  onCreate: () => void
  onEdit: (b: BonCommande) => void
  onReception: (b: BonCommande) => void
  onDelete: (b: BonCommande) => void
  onChangerStatut: (id: string, statut: 'brouillon'|'envoye'|'recu'|'annule') => void
}) {
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={onCreate} disabled={fournisseurs.length === 0}>+ Nouveau bon</Button>
      </div>
      {bons.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground italic">Aucun bon de commande.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {bons.map(b => {
            const cfg = STATUT_BON_LABEL[b.statut]
            return (
              <Card key={b.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn('border', cfg.cls)}>{cfg.emoji} {cfg.label}</Badge>
                        <span className="font-bold text-sm">{b.fournisseur_nom ?? '—'}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Commande {format(parseISO(b.date_commande), 'd MMM', { locale: fr })}
                        {b.date_livraison_prevue && ` · Livraison prévue ${format(parseISO(b.date_livraison_prevue), 'd MMM', { locale: fr })}`}
                        {' · '} {b.lignes.length} article{b.lignes.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <p className="font-bold tabular-nums shrink-0">{fmtPrix(b.montant_total_ht)}</p>
                  </div>

                  {b.notes && <p className="text-xs text-muted-foreground italic">{b.notes}</p>}

                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button size="sm" variant="outline" onClick={() => onEdit(b)}>📝 Détails</Button>
                    <Link href={`/admin/fournisseurs/bons/${b.id}/print`} target="_blank">
                      <Button size="sm" variant="outline">🖨 Imprimer</Button>
                    </Link>
                    {b.statut === 'brouillon' && (
                      <Button size="sm" variant="default" onClick={() => onChangerStatut(b.id, 'envoye')}>📧 Envoyer</Button>
                    )}
                    {b.statut === 'envoye' && (
                      <Button size="sm" variant="success" onClick={() => onReception(b)}>✓ Réception</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => onDelete(b)} className="text-destructive">🗑</Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─── Onglet : Factures ───────────────────────────────────────────────
function FacturesTab({
  factures, alertes, onCreate, onScan, onChangerStatut, onDelete,
}: {
  factures: Facture[]
  alertes: ReturnType<typeof alertesFactures>
  onCreate: () => void
  onScan: () => void
  onChangerStatut: (id: string, statut: 'a_payer'|'paye'|'en_retard'|'litige'|'annule') => void
  onDelete: (f: Facture) => void
}) {
  return (
    <>
      <div className="flex justify-end gap-2">
        <Button onClick={onScan} variant="outline" title="Photographier ou uploader une facture — Claude Vision extrait les données">
          📷 Scanner une facture
        </Button>
        <Button onClick={onCreate}>+ Nouvelle facture</Button>
      </div>

      {alertes.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-3 sm:p-4 space-y-2">
            <p className="font-bold text-red-900">🚨 Alertes paiement</p>
            <ul className="space-y-1 text-xs">
              {alertes.map(a => (
                <li key={a.facture.id} className="flex justify-between items-center bg-background border rounded px-2 py-1.5">
                  <span className="min-w-0 truncate">
                    <b>{a.facture.fournisseur_nom ?? '—'}</b> · {a.facture.numero}
                  </span>
                  <span className="text-right shrink-0 ml-2">
                    {a.jours_avant_echeance < 0
                      ? <Badge variant="destructive">{Math.abs(a.jours_avant_echeance)}j en retard</Badge>
                      : <Badge variant="warning">{a.jours_avant_echeance}j</Badge>}
                    <span className="ml-2 font-bold tabular-nums">{fmtPrix(a.facture.montant_ttc)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {factures.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground italic">Aucune facture.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="responsive-table w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2.5 px-3">Numéro</th>
                    <th className="text-left py-2.5 px-2">Fournisseur</th>
                    <th className="text-left py-2.5 px-2">Émise</th>
                    <th className="text-left py-2.5 px-2">Échéance</th>
                    <th className="text-right py-2.5 px-2">Montant</th>
                    <th className="text-left py-2.5 px-2">Statut</th>
                    <th className="text-right py-2.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map(f => {
                    const cfg = STATUT_FACTURE_LABEL[f.statut]
                    return (
                      <tr key={f.id} className="border-t hover:bg-muted/30">
                        <td className="py-2 px-3 font-semibold">{f.numero}</td>
                        <td className="py-2 px-2 truncate max-w-40">{f.fournisseur_nom ?? '—'}</td>
                        <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                          {format(parseISO(f.date_emission), 'd MMM', { locale: fr })}
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                          {f.date_echeance ? format(parseISO(f.date_echeance), 'd MMM', { locale: fr }) : '—'}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtPrix(f.montant_ttc)}</td>
                        <td className="py-2 px-2"><Badge className={cn('border', cfg.cls)}>{cfg.emoji} {cfg.label}</Badge></td>
                        <td className="py-2 px-3">
                          <div className="flex justify-end gap-1">
                            {f.statut !== 'paye' && (
                              <Button size="sm" variant="outline" onClick={() => onChangerStatut(f.id, 'paye')} title="Marquer payée">✓</Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => onDelete(f)} className="text-destructive">🗑</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

// ─── Onglet : Comparateur ────────────────────────────────────────────
function ComparateurTab({ lignes }: { lignes: LigneComparateur[] }) {
  if (lignes.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-5xl mb-3">📊</p>
          <p className="font-semibold mb-1">Pas encore de comparaison disponible</p>
          <p className="text-sm text-muted-foreground">
            Le comparateur affiche les ingrédients pour lesquels au moins 2 fournisseurs ont livré.
            Plus tu enregistres de livraisons via les bons de commande, plus la comparaison s&apos;enrichira.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {lignes.length} ingrédient{lignes.length > 1 ? 's' : ''} avec 2+ fournisseurs. Trié par écart de prix décroissant.
      </p>
      {lignes.map(l => (
        <Card key={l.ingredient_id}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div>
                <p className="font-bold">{l.ingredient_nom} <span className="text-xs text-muted-foreground font-normal">/{l.unite}</span></p>
                <p className="text-[11px] text-muted-foreground">
                  Prix de référence actuel : <b>{fmtPrix(l.prix_actuel)}</b>
                </p>
              </div>
              <Badge variant={l.ecart_pct > 20 ? 'destructive' : l.ecart_pct > 10 ? 'warning' : 'secondary'}>
                Écart {fmtPct(l.ecart_pct)}
              </Badge>
            </div>
            <ul className="space-y-1.5">
              {l.fournisseurs.map(f => {
                const isMin = f.dernier_prix === l.prix_min
                const isMax = f.dernier_prix === l.prix_max
                return (
                  <li key={f.fournisseur_id ?? '_inconnu'} className={cn(
                    'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm',
                    isMin ? 'border-emerald-300 bg-emerald-50' : isMax ? 'border-red-200 bg-red-50/30' : ''
                  )}>
                    <span className="min-w-0 truncate">
                      {isMin && <span className="text-emerald-700 font-bold mr-1">⭐ Le moins cher</span>}
                      {f.fournisseur_nom}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="font-bold tabular-nums">{fmtPrix(f.dernier_prix)}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">
                        {format(parseISO(f.derniere_date), 'd MMM', { locale: fr })}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
