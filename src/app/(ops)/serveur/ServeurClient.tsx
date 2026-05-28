'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  type CommandeService, type StatutTable, type TagDestination,
  STATUT_TABLE_STYLE, STATUT_ARTICLE_LABEL, TAG_DEST_LABEL, fmtPrix,
} from '@/lib/service'
import { creerCommande, changerStatutArticle } from '../actions'
import EncaissementModal from './EncaissementModal'
import { ALLERGENES_EU, ALLERGENE_INFO, type Allergene } from '@/lib/allergenes'
import AppelsServeurBanner from './AppelsServeurBanner'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'
import TachesSequentielles from '@/components/TachesSequentielles'
import ProduitCard from '@/components/ops/ProduitCard'

type Table = {
  id: string
  numero: string
  capacite: number
  zone: string
  statut: StatutTable
  commande_active_id: string | null
}

type Recette = {
  id: string
  nom: string
  categorie: string
  tag_destination: TagDestination
  prix_vente_ht: number
  image_url?: string | null
  photo_url?: string | null
  favori?: boolean
}

type Employe = { id: string; prenom: string; nom: string; poste: string }

type LignePanier = {
  recette_id: string
  recette_nom: string
  prix_unitaire_ht: number
  tag_destination: TagDestination
  quantite: number
  commentaire: string
  allergenes_a_eviter: Allergene[]   // Module 12 — alerte cuisine
}

type Tab = 'plan' | 'a_servir' | 'a_encaisser'

export default function ServeurClient({
  initialCommandes, tables, recettes, employes, navProfil, widgetEmployeId = null, widgetInitialDone = [],
}: {
  initialCommandes: CommandeService[]
  tables: Table[]
  recettes: Recette[]
  employes: Employe[]
  navProfil?: OpsBottomNavProfil
  widgetEmployeId?: string | null
  widgetInitialDone?: string[]
}) {
  const router = useRouter()
  const [commandes, setCommandes] = useState(initialCommandes)
  const [tab, setTab] = useState<Tab>('plan')
  const [serveurId, setServeurId] = useState<string>('')
  const [tableSelectionnee, setTableSelectionnee] = useState<Table | null>(null)
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [encaisserCmd, setEncaisserCmd] = useState<CommandeService | null>(null)
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  const [, startTransition] = useTransition()

  // Sync depuis props (post router.refresh)
  useEffect(() => { setCommandes(initialCommandes) }, [initialCommandes])

  // Realtime sur commandes / commande_articles / tables_restaurant
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('serveur-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables_restaurant' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // Index commandes actives par numéro de table
  const cmdParTable = useMemo(() => {
    const m = new Map<string, CommandeService>()
    for (const c of commandes) {
      if (c.numero_table) m.set(c.numero_table, c)
    }
    return m
  }, [commandes])

  // Tables groupées par zone
  const zones = useMemo(() => {
    const m = new Map<string, Table[]>()
    for (const t of tables) {
      const z = t.zone || 'Salle'
      if (!m.has(z)) m.set(z, [])
      m.get(z)!.push(t)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [tables])

  // Commandes à encaisser (statut = 'servi')
  const aEncaisser = useMemo(
    () => commandes.filter(c => c.statut === 'servi').sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [commandes]
  )

  // Articles prêts à servir (statut = 'pret') groupés par commande
  const cmdsAvecPrets = useMemo(
    () => commandes
      .filter(c => c.articles.some(a => a.statut === 'pret'))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [commandes]
  )
  const nbArticlesPrets = useMemo(
    () => commandes.reduce((s, c) => s + c.articles.filter(a => a.statut === 'pret').length, 0),
    [commandes]
  )

  // Map table → nb articles prêts (pour badge sur le plan)
  const pretsParTable = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of commandes) {
      if (!c.numero_table) continue
      const n = c.articles.filter(a => a.statut === 'pret').length
      if (n > 0) m.set(c.numero_table, (m.get(c.numero_table) ?? 0) + n)
    }
    return m
  }, [commandes])

  // Stats globales pour le header POS (CA en cours, tables ouvertes)
  const serveurStats = useMemo(() => {
    let caEnCours = 0
    let nbTables = 0
    for (const c of commandes) {
      if (c.statut !== 'encaisse' && c.statut !== 'annule') {
        nbTables++
        caEnCours += c.montant_total_ttc ?? c.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)
      }
    }
    return { caEnCours, nbTables }
  }, [commandes])

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 1800) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  function ouvrirTable(t: Table) {
    setTableSelectionnee(t)
    setPanier([])
    setErreur('')
  }
  function fermerCatalogue() {
    setTableSelectionnee(null)
    setPanier([])
  }

  function ajouterAuPanier(r: Recette) {
    setPanier(prev => {
      const existe = prev.find(p => p.recette_id === r.id)
      if (existe) {
        return prev.map(p => p.recette_id === r.id ? { ...p, quantite: p.quantite + 1 } : p)
      }
      return [...prev, {
        recette_id: r.id,
        recette_nom: r.nom,
        prix_unitaire_ht: r.prix_vente_ht,
        tag_destination: r.tag_destination,
        quantite: 1,
        commentaire: '',
        allergenes_a_eviter: [],
      }]
    })
  }
  function modifierQte(id: string, delta: number) {
    setPanier(prev => prev.flatMap(p => {
      if (p.recette_id !== id) return [p]
      const q = p.quantite + delta
      return q <= 0 ? [] : [{ ...p, quantite: q }]
    }))
  }
  function modifierCommentaire(id: string, c: string) {
    setPanier(prev => prev.map(p => p.recette_id === id ? { ...p, commentaire: c } : p))
  }
  function toggleAllergene(id: string, a: Allergene) {
    setPanier(prev => prev.map(p => {
      if (p.recette_id !== id) return p
      const has = p.allergenes_a_eviter.includes(a)
      return { ...p, allergenes_a_eviter: has ? p.allergenes_a_eviter.filter(x => x !== a) : [...p.allergenes_a_eviter, a] }
    }))
  }

  function envoyerCommande() {
    if (!tableSelectionnee) return
    if (panier.length === 0) { flashKo('Panier vide'); return }
    startTransition(async () => {
      try {
        await creerCommande({
          source: 'TABLE',
          numero_table: tableSelectionnee.numero,
          serveur_id: serveurId || null,
          articles: panier.map(p => ({
            recette_id: p.recette_id,
            quantite: p.quantite,
            prix_unitaire_ht: p.prix_unitaire_ht,
            tag_destination: p.tag_destination,
            commentaire: p.commentaire || null,
            allergenes_a_eviter: p.allergenes_a_eviter,
          })),
        })
        flashOk(`Commande envoyée pour ${tableSelectionnee.numero}`)
        fermerCatalogue()
        router.refresh()
      } catch (e) { flashKo(e) }
    })
  }

  function marquerServi(article_id: string) {
    // Optimistic
    setCommandes(prev => prev.map(c => ({
      ...c,
      articles: c.articles.map(a => a.id === article_id ? { ...a, statut: 'servi' as const } : a),
    })))
    startTransition(async () => {
      try {
        await changerStatutArticle({ article_id, nouveau_statut: 'servi' })
        flashOk('Plat marqué servi')
      } catch (e) {
        flashKo(e)
        router.refresh()
      }
    })
  }

  function marquerToutServi(commande: CommandeService) {
    const ids = commande.articles.filter(a => a.statut === 'pret').map(a => a.id)
    if (ids.length === 0) return
    setCommandes(prev => prev.map(c => c.id === commande.id ? {
      ...c,
      articles: c.articles.map(a => ids.includes(a.id) ? { ...a, statut: 'servi' as const } : a),
    } : c))
    startTransition(async () => {
      try {
        for (const id of ids) {
          await changerStatutArticle({ article_id: id, nouveau_statut: 'servi' })
        }
        flashOk(`${ids.length} plat${ids.length > 1 ? 's' : ''} servi${ids.length > 1 ? 's' : ''}`)
      } catch (e) {
        flashKo(e)
        router.refresh()
      }
    })
  }

  const totalPanier = panier.reduce((s, p) => s + p.quantite * p.prix_unitaire_ht, 0)

  const [modalActif, setModalActif] = useState<null | 'a_servir' | 'a_encaisser'>(null)

  return (
    <div className="min-h-screen flex flex-col">
      {/* ═══ BARRE DE NAVIGATION FULL-WIDTH ═══ */}
      <header className="shrink-0 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>

        {/* ─── MOBILE (sm-) : grid 2 lignes propres ─── */}
        <div className="md:hidden p-2 space-y-2">
          {/* Ligne 1 : Logo + Stats compactes + Caisse */}
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white text-lg shadow-md shrink-0">🪑</span>
            <span className="flex-1 inline-flex items-center gap-1 px-2 h-10 rounded-xl bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30 text-xs font-black tabular-nums whitespace-nowrap overflow-hidden">
              <span className="text-sm shrink-0">💶</span>
              <span className="truncate">{fmtPrix(serveurStats.caEnCours)}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 h-10 rounded-xl bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 text-xs font-black tabular-nums shrink-0">
              <span className="text-sm">🪑</span>{serveurStats.nbTables}
            </span>
            <Link
              href="/caisse"
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 text-lg shadow-lg active:scale-95 shrink-0"
              aria-label="Caisse"
            >💰</Link>
          </div>

          {/* Ligne 2 : 🔔 À servir + 💳 À encaisser + Serveur */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setModalActif('a_servir')}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-2 h-11 rounded-xl font-black text-xs transition-all active:scale-95 shadow-lg',
                nbArticlesPrets > 0
                  ? 'bg-emerald-500 text-white shadow-emerald-500/40 animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700',
              )}
            >
              <span className="text-base">🔔</span>
              <span>À servir</span>
              <span className={cn(
                'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black tabular-nums',
                nbArticlesPrets > 0 ? 'bg-white text-emerald-700' : 'bg-zinc-700 text-zinc-400',
              )}>{nbArticlesPrets}</span>
            </button>
            <button
              onClick={() => setModalActif('a_encaisser')}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-2 h-11 rounded-xl font-black text-xs transition-all active:scale-95 shadow-lg',
                aEncaisser.length > 0
                  ? 'bg-rose-600 text-white shadow-rose-500/40 animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700',
              )}
            >
              <span className="text-base">💳</span>
              <span>Encaisser</span>
              <span className={cn(
                'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black tabular-nums',
                aEncaisser.length > 0 ? 'bg-white text-rose-700' : 'bg-zinc-700 text-zinc-400',
              )}>{aEncaisser.length}</span>
            </button>
            <select
              value={serveurId}
              onChange={e => setServeurId(e.target.value)}
              className="text-xs px-2 h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 font-black max-w-[110px]"
            >
              <option value="">Serveur</option>
              {employes.map(e => (
                <option key={e.id} value={e.id}>{e.prenom} {e.nom[0]}.</option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── DESKTOP (md+) : 1 ligne unique ─── */}
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white text-xl shadow-md">🪑</span>
            <div className="hidden lg:block">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 leading-none">Service</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">Plan de table</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30 text-xs font-black tabular-nums whitespace-nowrap">
              <span className="text-base">💶</span>{fmtPrix(serveurStats.caEnCours)}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 text-xs font-black tabular-nums whitespace-nowrap">
              <span className="text-base">🪑</span>{serveurStats.nbTables}
            </span>
          </div>
          <div className="flex-1 min-w-2" />
          <button
            onClick={() => setModalActif('a_servir')}
            className={cn(
              'inline-flex items-center gap-2 px-2.5 h-10 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shrink-0',
              nbArticlesPrets > 0
                ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/40 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700',
            )}
          >
            <span className="text-lg">🔔</span>
            <span>À servir</span>
            <span className={cn('inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-black tabular-nums', nbArticlesPrets > 0 ? 'bg-white text-emerald-700' : 'bg-zinc-700 text-zinc-400')}>
              {nbArticlesPrets}
            </span>
          </button>
          <button
            onClick={() => setModalActif('a_encaisser')}
            className={cn(
              'inline-flex items-center gap-2 px-2.5 h-10 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shrink-0',
              aEncaisser.length > 0
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/40 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700',
            )}
          >
            <span className="text-lg">💳</span>
            <span>À encaisser</span>
            <span className={cn('inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-black tabular-nums', aEncaisser.length > 0 ? 'bg-white text-rose-700' : 'bg-zinc-700 text-zinc-400')}>
              {aEncaisser.length}
            </span>
          </button>
          <select
            value={serveurId}
            onChange={e => setServeurId(e.target.value)}
            className="text-xs px-2.5 h-10 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 font-black max-w-[160px] shrink-0"
          >
            <option value="">— Serveur —</option>
            {employes.map(e => (
              <option key={e.id} value={e.id}>{e.prenom} {e.nom[0]}.</option>
            ))}
          </select>
          <Link
            href="/caisse"
            className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0"
          >
            <span className="text-lg">💰</span>
            <span>Caisse</span>
          </Link>
        </div>
        <AppelsServeurBanner serveurId={serveurId || null} />
      </header>

      {/* ═══ PLAN DE TABLES — full-width, scroll naturel ═══ */}
      <main className="flex-1 p-3 sm:p-4">
        <PlanSalle
          zones={zones}
          cmdParTable={cmdParTable}
          pretsParTable={pretsParTable}
          onOuvrir={ouvrirTable}
        />
      </main>

      {/* ═══ MODAL À SERVIR (full-screen overlay) ═══ */}
      {modalActif === 'a_servir' && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <header className="shrink-0 px-5 py-4 bg-emerald-500/10 border-b border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔔</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Live</p>
                  <h2 className="font-display italic text-2xl font-medium text-white tracking-tight">À servir</h2>
                </div>
                {nbArticlesPrets > 0 && (
                  <span className="inline-flex items-center justify-center min-w-7 h-7 px-2.5 rounded-full bg-emerald-500 text-white text-sm font-black tabular-nums animate-pulse">
                    {nbArticlesPrets}
                  </span>
                )}
              </div>
              <button
                onClick={() => setModalActif(null)}
                className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-lg font-bold transition-all active:scale-95"
                aria-label="Fermer"
              >✕</button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              <ListeAServir
                commandes={cmdsAvecPrets}
                onMarquerServi={marquerServi}
                onMarquerToutServi={marquerToutServi}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL À ENCAISSER (full-screen overlay) ═══ */}
      {modalActif === 'a_encaisser' && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <header className="shrink-0 px-5 py-4 bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💳</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400">Live</p>
                  <h2 className="font-display italic text-2xl font-medium text-white tracking-tight">À encaisser</h2>
                </div>
                {aEncaisser.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-7 h-7 px-2.5 rounded-full bg-rose-600 text-white text-sm font-black tabular-nums animate-pulse">
                    {aEncaisser.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setModalActif(null)}
                className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-lg font-bold transition-all active:scale-95"
                aria-label="Fermer"
              >✕</button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              <ListeAEncaisser
                commandes={aEncaisser}
                onEncaisser={c => { setEncaisserCmd(c); setModalActif(null) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {erreur && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 max-w-[90vw] text-center cursor-pointer" onClick={() => setErreur('')}>
          ⚠️ {erreur}
        </div>
      )}
      {success && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">
          ✓ {success}
        </div>
      )}

      {/* Modal Catalogue (sélection d'une table) */}
      {tableSelectionnee && (
        <CatalogueModal
          table={tableSelectionnee}
          recettes={recettes}
          panier={panier}
          totalPanier={totalPanier}
          commandeExistante={cmdParTable.get(tableSelectionnee.numero) ?? null}
          onAjouter={ajouterAuPanier}
          onModifierQte={modifierQte}
          onModifierCommentaire={modifierCommentaire}
          onToggleAllergene={toggleAllergene}
          onClose={fermerCatalogue}
          onEnvoyer={envoyerCommande}
        />
      )}

      {/* Bottom nav mobile + drawer modules admin selon poste utilisateur */}
      <OpsBottomNav profil={navProfil} />

      {/* Modal Encaissement */}
      {encaisserCmd && (
        <EncaissementModal
          commande={encaisserCmd}
          serveurId={serveurId}
          employes={employes}
          onClose={() => setEncaisserCmd(null)}
          onSuccess={() => {
            const id = encaisserCmd.id
            setEncaisserCmd(null)
            flashOk('Encaissement validé — ticket envoyé à l\'impression')
            // Ouvre le ticket client en nouvel onglet (auto-print)
            try { window.open(`/print/ticket/${id}?auto=1`, '_blank', 'noopener') } catch { /* ignore */ }
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Tab Button ──────────────────────────────────────────────────────
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 min-h-[40px] sm:min-h-0 sm:py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all border-2',
        active
          ? 'bg-white text-zinc-900 border-white shadow-lg shadow-white/10 scale-105'
          : 'bg-zinc-900/80 text-zinc-300 border-zinc-800 hover:border-zinc-600 backdrop-blur',
      )}
    >
      {children}
    </button>
  )
}

// ─── Header Stat pill ─ Mini KPI tactile pour le header POS ─────────
function HeaderStat({ icon, value, label, tone, pulse }: {
  icon: string; value: string; label: string
  tone: 'emerald' | 'amber' | 'rose' | 'blue' | 'violet'
  pulse?: boolean
}) {
  const tones: Record<typeof tone, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
    amber:   'bg-amber-500/15 text-amber-200 ring-amber-500/30',
    rose:    'bg-rose-500/15 text-rose-200 ring-rose-500/30',
    blue:    'bg-blue-500/15 text-blue-200 ring-blue-500/30',
    violet:  'bg-violet-500/15 text-violet-200 ring-violet-500/30',
  }
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg ring-1 backdrop-blur whitespace-nowrap',
      tones[tone],
      pulse && 'animate-pulse',
    )}>
      <span className="text-sm" aria-hidden>{icon}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-black tabular-nums leading-none">{value}</span>
        <span className="text-[9px] uppercase tracking-wider font-bold opacity-70 leading-none">{label}</span>
      </div>
    </div>
  )
}

// ─── Plan de salle ───────────────────────────────────────────────────

// Styles premium par statut — gradients + shadows colorées (override local de STATUT_TABLE_STYLE)
const TABLE_STYLE_PREMIUM: Record<StatutTable, {
  label: string
  card: string       // background gradient + border
  shadow: string     // shadow colorée pour la profondeur
  numero: string     // couleur du numéro de table
  badge: string      // pastille label
  accent: string     // ligne accent au-dessus du footer
}> = {
  libre: {
    label: 'Disponible',
    card: 'bg-gradient-to-br from-emerald-950/80 via-zinc-900 to-zinc-950 border-emerald-700/40',
    shadow: 'shadow-lg shadow-emerald-900/30',
    numero: 'text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    accent: 'bg-emerald-500/40',
  },
  occupee: {
    label: 'Service en cours',
    card: 'bg-gradient-to-br from-amber-950/80 via-zinc-900 to-zinc-950 border-amber-700/40',
    shadow: 'shadow-lg shadow-amber-900/30',
    numero: 'text-amber-200',
    badge: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    accent: 'bg-amber-500/40',
  },
  reservee: {
    label: 'Réservée',
    card: 'bg-gradient-to-br from-blue-950/80 via-zinc-900 to-zinc-950 border-blue-700/40',
    shadow: 'shadow-lg shadow-blue-900/30',
    numero: 'text-blue-200',
    badge: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
    accent: 'bg-blue-500/40',
  },
  a_encaisser: {
    label: 'À encaisser',
    card: 'bg-gradient-to-br from-rose-950/90 via-red-950/60 to-zinc-950 border-rose-600/50',
    shadow: 'shadow-xl shadow-rose-900/50',
    numero: 'text-rose-200',
    badge: 'bg-rose-500/20 text-rose-200 border border-rose-500/40',
    accent: 'bg-rose-500/60',
  },
}

type FiltreStatut = 'tous' | 'libre' | 'occupee' | 'a_encaisser'

function PlanSalle({
  zones, cmdParTable, pretsParTable, onOuvrir,
}: {
  zones: [string, Table[]][]
  cmdParTable: Map<string, CommandeService>
  pretsParTable: Map<string, number>
  onOuvrir: (t: Table) => void
}) {
  // tick chaque 30s pour rafraîchir la durée d'occupation des tables
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(i)
  }, [])

  const [filtre, setFiltre] = useState<FiltreStatut>('tous')
  const [compact, setCompact] = useState(true) // POS pro : ultra-dense par défaut
  const [searchT, setSearchT] = useState('')
  // Mobile : tab zone active (sur desktop toutes les zones s'affichent)
  const [activeZone, setActiveZone] = useState<string>(zones[0]?.[0] ?? '')

  // Helper : calcule le statut effectif d'une table
  function statutEffectif(t: Table): StatutTable {
    const cmd = cmdParTable.get(t.numero)
    return cmd?.statut === 'servi' ? 'a_encaisser' : cmd ? 'occupee' : t.statut
  }

  // Stats globales par zone (toujours sur toutes les tables, pas filtré)
  const zoneStats = useMemo(() => {
    const stats: Record<string, { libre: number; occupee: number; aEncaisser: number; total: number; couvertsOccupes: number; capaTotale: number }> = {}
    for (const [zone, tables] of zones) {
      const s = { libre: 0, occupee: 0, aEncaisser: 0, total: tables.length, couvertsOccupes: 0, capaTotale: 0 }
      for (const t of tables) {
        s.capaTotale += t.capacite
        const se = statutEffectif(t)
        if (se === 'libre') s.libre++
        else if (se === 'a_encaisser') { s.aEncaisser++; s.couvertsOccupes += t.capacite }
        else if (se === 'occupee') { s.occupee++; s.couvertsOccupes += t.capacite }
      }
      stats[zone] = s
    }
    return stats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, cmdParTable])

  // Stats globales de l'établissement (tous postes confondus, calculées en live)
  const globalStats = useMemo(() => {
    let caEnCours = 0
    let nbCouvertsOccupes = 0
    let nbTablesOuvertes = 0
    let totalDureeMin = 0
    let nbTablesAvecCmd = 0
    let nbPretsAservir = 0
    let nbTablesAEncaisser = 0
    for (const [, ts] of zones) {
      for (const t of ts) {
        const cmd = cmdParTable.get(t.numero)
        if (cmd) {
          nbTablesAvecCmd++
          const total = cmd.montant_total_ttc ?? cmd.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)
          caEnCours += total
          nbCouvertsOccupes += t.capacite
          if (cmd.statut !== 'encaisse' && cmd.statut !== 'annule') nbTablesOuvertes++
          totalDureeMin += Math.max(0, Math.round((now - new Date(cmd.created_at).getTime()) / 60_000))
          const se = statutEffectif(t)
          if (se === 'a_encaisser') nbTablesAEncaisser++
        }
        nbPretsAservir += pretsParTable.get(t.numero) ?? 0
      }
    }
    const ticketMoyen = nbTablesAvecCmd > 0 ? caEnCours / nbTablesAvecCmd : 0
    const dureeMoy = nbTablesAvecCmd > 0 ? Math.round(totalDureeMin / nbTablesAvecCmd) : 0
    return { caEnCours, nbCouvertsOccupes, nbTablesOuvertes, ticketMoyen, dureeMoy, nbPretsAservir, nbTablesAEncaisser }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, cmdParTable, pretsParTable, now])

  // Filtre les tables affichées
  function shouldShow(t: Table): boolean {
    if (searchT.trim() && !t.numero.toLowerCase().includes(searchT.toLowerCase().trim())) return false
    if (filtre === 'tous') return true
    return statutEffectif(t) === filtre
  }

  // Concatène toutes les tables de toutes les zones (ou juste la zone active mobile)
  const allTablesFiltered = useMemo(() => {
    const list: Array<Table & { __zone: string }> = []
    for (const [zone, tables] of zones) {
      // Mobile : ne montrer que la zone active. Desktop : toutes
      const tablesAaffilcher = tables.filter(shouldShow)
      for (const t of tablesAaffilcher) {
        list.push({ ...t, __zone: zone })
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, cmdParTable, filtre, searchT])

  return (
    <div className="flex flex-col gap-2">
      {/* ═══ Toolbar pro : tabs zones + filtres + recherche ═══ */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto whitespace-nowrap">
        {/* Tabs zones (visible si > 1) */}
        {zones.length > 1 && (
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-full p-0.5 sm:p-1 shrink-0">
            {zones.map(([zone, ts]) => {
              const s = zoneStats[zone]
              const isActive = activeZone === zone
              const zoneIcon = zone === 'salle' ? '🏠' : zone === 'terrasse' ? '☀️' : '📍'
              return (
                <button
                  key={zone}
                  onClick={() => setActiveZone(zone)}
                  className={cn(
                    'inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 h-8 sm:h-9 rounded-full text-xs font-bold whitespace-nowrap transition-all',
                    isActive
                      ? 'bg-white text-zinc-900 shadow-md'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <span className="text-sm" aria-hidden>{zoneIcon}</span>
                  <span className="capitalize">{zone}</span>
                  <span className="text-[10px] opacity-70 tabular-nums hidden sm:inline">({ts.length})</span>
                  {s.aEncaisser > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Filtres statut */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-full p-0.5 sm:p-1 shrink-0">
          {([
            { k: 'tous',         lbl: 'Toutes',  dot: 'bg-zinc-400' },
            { k: 'libre',        lbl: 'Libres',  dot: 'bg-emerald-400' },
            { k: 'occupee',      lbl: 'Occ.',    dot: 'bg-amber-400' },
            { k: 'a_encaisser',  lbl: 'Enc.',    dot: 'bg-rose-400' },
          ] as const).map(f => (
            <button
              key={f.k}
              onClick={() => setFiltre(f.k)}
              className={cn(
                'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 h-8 sm:h-9 rounded-full text-xs font-bold transition-all',
                filtre === f.k
                  ? 'bg-white text-zinc-900 shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', f.dot, filtre === f.k && f.k === 'a_encaisser' && 'animate-pulse')}></span>
              {f.lbl}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-1" />

        {/* Recherche — cachée sur très petit mobile */}
        <input
          type="search"
          value={searchT}
          onChange={e => setSearchT(e.target.value)}
          placeholder="N° table"
          className="hidden sm:block w-[140px] h-9 px-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 outline-none text-xs shrink-0"
        />
      </div>

      {/* ═══ PLAN DE SALLE — Grid auto-fit avec tables TAILLE FIXE confortable + scroll si débord ═══ */}
      {allTablesFiltered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          <div className="text-center">
            <p className="text-4xl mb-2">🔍</p>
            <p className="font-bold">Aucune table ne correspond aux filtres</p>
            <button
              onClick={() => { setFiltre('tous'); setSearchT('') }}
              className="mt-3 px-4 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-2 sm:gap-3 lg:gap-4 content-start',
            'grid-cols-[repeat(auto-fit,minmax(105px,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]',
            'auto-rows-[105px] sm:auto-rows-[140px] lg:auto-rows-[150px]',
          )}
        >
          {/* Itère TOUTES les tables (toutes zones combinées) en 1 seul grid */}
          {zones.flatMap(([zone, tables]) => {
            const tablesFiltrees = tables.filter(shouldShow)
            // Sur mobile (sm-) : ne montrer que la zone active si plusieurs zones
            const hideOnMobile = zones.length > 1 && activeZone !== zone
            return tablesFiltrees.map(t => {
                const cmd = cmdParTable.get(t.numero)
                const nbPrets = pretsParTable.get(t.numero) ?? 0
                const statutEffectif: StatutTable = cmd?.statut === 'servi' ? 'a_encaisser'
                  : cmd ? 'occupee'
                  : t.statut
                const sty = TABLE_STYLE_PREMIUM[statutEffectif]

                // Durée d'occupation en min depuis ouverture commande
                const dureeMin = cmd ? Math.max(0, Math.round((now - new Date(cmd.created_at).getTime()) / 60_000)) : null
                const dureeUrgent = dureeMin !== null && dureeMin > 90  // > 1h30 = potentiel oubli

                // Total addition
                const totalCmd = cmd ? (cmd.montant_total_ttc ?? cmd.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)) : 0

                return (
                  <button
                    key={t.id}
                    onClick={() => onOuvrir(t)}
                    className={cn(
                      'relative rounded-xl border transition-all duration-200 h-full w-full',
                      'flex flex-col items-stretch overflow-hidden text-left',
                      'hover:-translate-y-0.5 active:scale-[0.97]',
                      sty.card, sty.shadow,
                      statutEffectif === 'a_encaisser' && 'ring-2 ring-rose-500/40',
                      hideOnMobile && 'hidden lg:flex',
                    )}
                  >
                    {/* Badge plats prêts en top-right */}
                    {nbPrets > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-7 h-7 px-1.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-xs font-black flex items-center justify-center shadow-lg shadow-emerald-500/50 z-10 ring-2 ring-zinc-950 animate-pulse">
                        🔔{nbPrets}
                      </span>
                    )}

                    {compact ? (
                      /* MODE COMPACT POS — remplit toute la cellule, numéro géant qui s'adapte */
                      <div className="h-full w-full flex flex-col items-center justify-between px-2 py-2 relative">
                        {/* Top : capacité + statut dot */}
                        <div className="self-stretch flex items-center justify-between">
                          <span className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            statutEffectif === 'libre' ? 'bg-emerald-400'
                              : statutEffectif === 'occupee' ? 'bg-amber-400'
                              : statutEffectif === 'a_encaisser' ? 'bg-rose-400 animate-pulse'
                              : 'bg-zinc-500',
                          )}></span>
                          <span className="text-[10px] text-zinc-400 font-black tabular-nums">{t.capacite}p</span>
                        </div>

                        {/* Centre : numéro géant qui prend tout l'espace */}
                        <div className="flex-1 w-full flex items-center justify-center">
                          <p className={cn('font-black leading-none tabular-nums text-center', sty.numero,
                            'text-[clamp(2rem,6vw,4.5rem)]'
                          )}>
                            {t.numero}
                          </p>
                        </div>

                        {/* Bottom : total + durée si commande */}
                        {cmd && totalCmd > 0 ? (
                          <div className="self-stretch flex items-center justify-between gap-1 text-xs font-black text-white tabular-nums">
                            <span className="truncate">{fmtPrix(totalCmd)}</span>
                            {dureeMin !== null && (
                              <span className={cn('text-[10px] font-bold shrink-0', dureeUrgent ? 'text-red-300' : 'text-zinc-400')}>
                                {dureeMin}m
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={cn(
                            'self-stretch text-center text-[10px] font-black uppercase tracking-wider',
                            statutEffectif === 'libre' ? 'text-emerald-400' : 'text-zinc-500',
                          )}>
                            {statutEffectif === 'libre' ? 'Libre' : 'Réservée'}
                          </span>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* MODE DÉTAILLÉ (l'ancien layout) */}
                        <div className="px-3 lg:px-4 pt-3 lg:pt-4 pb-1.5 lg:pb-2 flex items-start justify-between">
                          <div>
                            <p className="text-[9px] lg:text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Table</p>
                            <p className={cn('text-4xl lg:text-5xl font-black leading-none mt-0.5 tabular-nums', sty.numero)}>{t.numero}</p>
                          </div>
                          <span className="inline-flex items-center gap-0.5 lg:gap-1 text-[10px] lg:text-[11px] font-bold text-zinc-300 bg-zinc-900/60 px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-full border border-zinc-800 backdrop-blur-sm">
                            <span aria-hidden>👥</span>{t.capacite}
                          </span>
                        </div>
                        <div className="px-3 lg:px-4 pb-1.5 lg:pb-2">
                          <span className={cn(
                            'inline-flex items-center text-[9px] lg:text-[10px] font-bold uppercase tracking-wider px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full',
                            sty.badge,
                          )}>
                            {sty.label}
                          </span>
                        </div>
                        <div className={cn('h-px mx-3 lg:mx-4', sty.accent)}></div>
                        {cmd ? (
                          <div className="px-3 lg:px-4 py-2 lg:py-3 space-y-0.5 lg:space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] lg:text-[11px] text-zinc-300 tabular-nums">
                              <span className={cn('inline-flex items-center gap-0.5 lg:gap-1 font-semibold', dureeUrgent && 'text-red-300')}>
                                <span aria-hidden>⏱</span>
                                <span>{dureeMin}m</span>
                                {dureeUrgent && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>}
                              </span>
                              <span className="text-zinc-400 hidden lg:inline">{cmd.articles.length} art.</span>
                            </div>
                            {totalCmd > 0 && (
                              <p className="text-base lg:text-xl font-black text-white tabular-nums">{fmtPrix(totalCmd)}</p>
                            )}
                          </div>
                        ) : (
                          <div className="px-3 lg:px-4 py-2 lg:py-3 flex-1 flex items-end">
                            <p className="text-[9px] lg:text-[10px] text-zinc-500 italic hidden lg:block">Tap pour ouvrir</p>
                          </div>
                        )}
                      </>
                    )}
                  </button>
                )
              })
          })}
        </div>
      )}
    </div>
  )
}

// ─── Mini chip (mobile compact) ─────────────────────────────────────────
function MiniChip({
  icon, value, label, accent = 'zinc', pulse = false,
}: {
  icon: string
  value: string
  label: string
  accent?: 'emerald' | 'amber' | 'rose' | 'zinc'
  pulse?: boolean
}) {
  const ACCENTS: Record<string, { value: string; bg: string }> = {
    emerald: { value: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    amber:   { value: 'text-amber-300',   bg: 'bg-amber-500/10 border-amber-500/20' },
    rose:    { value: 'text-rose-300',    bg: 'bg-rose-500/10 border-rose-500/20' },
    zinc:    { value: 'text-zinc-100',    bg: 'bg-zinc-800 border-zinc-700' },
  }
  const a = ACCENTS[accent]
  return (
    <div className={cn('rounded-lg px-2 py-1.5 border flex items-center gap-1.5', a.bg, pulse && 'ring-1 ring-rose-500/50')}>
      <span className="text-base shrink-0" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className={cn('text-sm font-black tabular-nums leading-none', a.value, pulse && 'animate-pulse')}>{value}</p>
        <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mt-0.5 truncate">{label}</p>
      </div>
    </div>
  )
}

// ─── Tuile statistique pour le dashboard plan de salle ─────────────────
function StatTile({
  icon, label, value, sub, accent = 'zinc', pulse = false,
}: {
  icon: string
  label: string
  value: string | number
  sub?: string
  accent?: 'emerald' | 'amber' | 'rose' | 'blue' | 'violet' | 'zinc'
  pulse?: boolean
}) {
  const ACCENTS: Record<string, { iconBg: string; valueText: string; border: string }> = {
    emerald: { iconBg: 'bg-emerald-500/15 text-emerald-300', valueText: 'text-emerald-300', border: 'border-emerald-500/20' },
    amber:   { iconBg: 'bg-amber-500/15 text-amber-300',     valueText: 'text-amber-200',   border: 'border-amber-500/20' },
    rose:    { iconBg: 'bg-rose-500/15 text-rose-300',       valueText: 'text-rose-200',    border: 'border-rose-500/20' },
    blue:    { iconBg: 'bg-blue-500/15 text-blue-300',       valueText: 'text-blue-200',    border: 'border-blue-500/20' },
    violet:  { iconBg: 'bg-violet-500/15 text-violet-300',   valueText: 'text-violet-200',  border: 'border-violet-500/20' },
    zinc:    { iconBg: 'bg-zinc-800 text-zinc-300',          valueText: 'text-zinc-100',    border: 'border-zinc-800' },
  }
  const a = ACCENTS[accent]
  return (
    <div className={cn('rounded-xl p-3 bg-zinc-900/50 border backdrop-blur-sm transition-all hover:scale-[1.02]', a.border, pulse && 'ring-2 ring-rose-500/30')}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('inline-flex items-center justify-center w-8 h-8 rounded-lg text-base', a.iconBg)}>{icon}</span>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold leading-tight">{label}</p>
      </div>
      <p className={cn('text-xl lg:text-2xl font-black tabular-nums leading-tight', a.valueText, pulse && 'animate-pulse')}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Liste à servir ──────────────────────────────────────────────────
function ListeAServir({
  commandes, onMarquerServi, onMarquerToutServi,
}: {
  commandes: CommandeService[]
  onMarquerServi: (article_id: string) => void
  onMarquerToutServi: (commande: CommandeService) => void
}) {
  if (commandes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-6 px-4 text-center">
        <p className="text-3xl mb-1.5" aria-hidden>✨</p>
        <p className="text-xs font-bold text-zinc-300">Tout est sous contrôle</p>
        <p className="text-[10px] mt-0.5 text-zinc-500">Aucun plat prêt à servir.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {commandes.map(c => {
        const articlesPrets = c.articles.filter(a => a.statut === 'pret')
        return (
          <div key={c.id} className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 overflow-hidden">
            {/* Header table ULTRA-COMPACT */}
            <div className="px-2.5 py-1.5 bg-emerald-500/15 border-b border-emerald-500/20 flex items-center justify-between">
              <span className="text-sm font-black text-white tabular-nums">
                🪑 {c.numero_table ?? '?'}
              </span>
              <div className="flex items-center gap-1">
                <a
                  href={`/print/bons/${c.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-[10px] h-5 w-5 inline-flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  title="Réimprimer"
                >🖨</a>
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-emerald-400 text-emerald-950 text-[10px] font-black animate-pulse">
                  {articlesPrets.length}
                </span>
              </div>
            </div>

            {/* Articles prêts ULTRA-COMPACT */}
            <ul className="divide-y divide-zinc-800/50">
              {articlesPrets.map(a => (
                <li key={a.id} className="px-2.5 py-1.5 flex items-center justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate text-zinc-100">
                      <span className="text-emerald-400 font-bold tabular-nums">×{a.quantite}</span> {a.recette_nom}
                    </p>
                    {a.commentaire && (
                      <p className="text-[10px] text-amber-300 italic truncate">⚠ {a.commentaire}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onMarquerServi(a.id)}
                    className="h-8 px-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-black text-[11px] transition-colors active:scale-95 whitespace-nowrap shrink-0"
                  >
                    ✓
                  </button>
                </li>
              ))}
            </ul>

            {/* Action globale si > 1 article */}
            {articlesPrets.length > 1 && (
              <button
                onClick={() => onMarquerToutServi(c)}
                className="w-full h-8 bg-emerald-500/80 hover:bg-emerald-400 text-white font-black uppercase tracking-wider text-[10px] transition-colors active:scale-[0.98] border-t border-emerald-400/30"
              >
                ✓ Tout servi ({articlesPrets.length})
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Liste à encaisser ───────────────────────────────────────────────
function ListeAEncaisser({
  commandes, onEncaisser,
}: {
  commandes: CommandeService[]
  onEncaisser: (c: CommandeService) => void
}) {
  if (commandes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-6 px-4 text-center">
        <p className="text-3xl mb-1.5" aria-hidden>✨</p>
        <p className="text-xs font-bold text-zinc-300">Tout est encaissé</p>
        <p className="text-[10px] mt-0.5 text-zinc-500">Aucune commande à encaisser.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {commandes.map(c => {
        const total = c.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)
        return (
          <div key={c.id} className="rounded-lg border border-rose-500/40 bg-rose-950/30 overflow-hidden">
            {/* Header ULTRA-COMPACT */}
            <div className="px-2.5 py-1.5 bg-rose-500/15 border-b border-rose-500/20 flex items-center justify-between">
              <span className="text-sm font-black text-white tabular-nums">
                🪑 {c.numero_table ?? '?'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-white tabular-nums">{fmtPrix(total)}</span>
                <a
                  href={`/print/ticket/${c.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-[10px] h-5 w-5 inline-flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  title="Aperçu ticket"
                >🖨</a>
              </div>
            </div>

            {/* Articles compacts (1 ligne max 2-3) */}
            <ul className="px-2.5 py-1 divide-y divide-zinc-800/50">
              {c.articles.slice(0, 3).map(a => (
                <li key={a.id} className="py-1 flex justify-between gap-1 text-[11px]">
                  <span className="truncate"><b>×{a.quantite}</b> {a.recette_nom}</span>
                  <span className="text-zinc-400 tabular-nums shrink-0">{fmtPrix(a.quantite * a.prix_unitaire_ht)}</span>
                </li>
              ))}
              {c.articles.length > 3 && (
                <li className="py-1 text-[10px] text-zinc-500 italic">+ {c.articles.length - 3} autres…</li>
              )}
            </ul>

            {/* Bouton encaisser ULTRA-COMPACT */}
            <button
              onClick={() => onEncaisser(c)}
              className="w-full h-9 bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-wider text-xs transition-colors active:scale-[0.98] border-t border-emerald-400/30"
            >
              💰 Encaisser
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Catalogue (Modal) ───────────────────────────────────────────────
function CatalogueModal({
  table, recettes, panier, totalPanier, commandeExistante,
  onAjouter, onModifierQte, onModifierCommentaire, onToggleAllergene, onClose, onEnvoyer,
}: {
  table: Table
  recettes: Recette[]
  panier: LignePanier[]
  totalPanier: number
  commandeExistante: CommandeService | null
  onAjouter: (r: Recette) => void
  onModifierQte: (id: string, delta: number) => void
  onModifierCommentaire: (id: string, c: string) => void
  onToggleAllergene: (id: string, a: Allergene) => void
  onClose: () => void
  onEnvoyer: () => void
}) {
  // Onglet destination (CUISINE / PIZZA / BAR / SNACKING) en premier niveau,
  // puis filtre catégorie (entrées, plats, vins, cocktails…) en second niveau.
  // Évite à la serveuse de scroller dans tout le menu pour trouver une pizza.
  const [tagActif, setTagActif] = useState<TagDestination>('CUISINE')
  const [filtreCat, setFiltreCat] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Compteurs par destination (sur l'ensemble du menu, pas filtré)
  const countByTag = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of recettes) m[r.tag_destination] = (m[r.tag_destination] ?? 0) + 1
    return m
  }, [recettes])

  // 1er niveau : filtre par destination
  const recettesParTag = useMemo(() => {
    return recettes.filter(r => r.tag_destination === tagActif)
  }, [recettes, tagActif])

  // 2nd niveau : catégories disponibles dans cette destination
  const categories = useMemo(() => {
    const set = new Set<string>()
    recettesParTag.forEach(r => set.add(r.categorie))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [recettesParTag])

  // Reset le filtre catégorie quand on change de destination (sinon catégorie orpheline)
  useEffect(() => { setFiltreCat('') }, [tagActif])

  const filtered = useMemo(() => {
    let r = filtreCat ? recettesParTag.filter(r => r.categorie === filtreCat) : recettesParTag
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      r = r.filter(x => x.nom.toLowerCase().includes(q) || x.categorie.toLowerCase().includes(q))
    }
    return r
  }, [recettesParTag, filtreCat, searchQuery])

  return (
    <div className="fixed inset-0 z-50 bg-[#0D0D0D] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Table</p>
          <h2 className="text-2xl font-bold">{table.numero} <span className="text-sm font-normal text-zinc-400">· {table.capacite} couverts · {table.zone}</span></h2>
        </div>
        <button onClick={onClose} className="min-h-[48px] px-4 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold">
          ✕ Fermer
        </button>
      </header>

      {/* Commande existante */}
      {commandeExistante && (
        <div className="bg-amber-900/30 border-b border-amber-800 px-4 py-2 text-sm">
          <p className="font-bold text-amber-200">⚠ Commande déjà ouverte sur cette table ({commandeExistante.numero})</p>
          <ul className="mt-1 text-xs space-y-0.5">
            {commandeExistante.articles.map(a => {
              const sta = STATUT_ARTICLE_LABEL[a.statut]
              return (
                <li key={a.id} className="flex justify-between">
                  <span><b>×{a.quantite}</b> {a.recette_nom}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded', sta.bg, sta.text)}>
                    {sta.emoji} {sta.label}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-[11px] text-amber-300">
            Ajouter de nouveaux articles créera une commande supplémentaire — préviens la cuisine si c&apos;est volontaire.
          </p>
        </div>
      )}

      {/* 2 zones : catalogue + panier */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_400px] min-h-0 pb-[110px] lg:pb-0">
        {/* Catalogue */}
        <div className="overflow-y-auto p-4">
          {/* Recherche plein-texte */}
          <div className="relative mb-3">
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Rechercher un plat ou une catégorie..."
              className="w-full min-h-[48px] px-4 pr-10 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 outline-none text-base"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-lg leading-none"
                aria-label="Effacer recherche"
              >×</button>
            )}
          </div>

          {/* 1er niveau : destination — STYLE KIOSQUE big boutons emoji XL */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {(['CUISINE', 'PIZZA', 'BAR', 'SNACKING'] as const).map(t => {
              const isActive = tagActif === t
              const count = countByTag[t] ?? 0
              if (count === 0) return null
              const def = TAG_DEST_LABEL[t]
              // Couleur dominante par destination
              const ACCENTS: Record<string, { active: string; idle: string; iconBg: string }> = {
                CUISINE:  { active: 'bg-amber-500 border-amber-400 shadow-amber-500/30',   idle: 'bg-zinc-900 border-zinc-800 hover:border-amber-700',  iconBg: 'bg-amber-950/60' },
                PIZZA:    { active: 'bg-red-500 border-red-400 shadow-red-500/30',         idle: 'bg-zinc-900 border-zinc-800 hover:border-red-700',     iconBg: 'bg-red-950/60' },
                BAR:      { active: 'bg-violet-500 border-violet-400 shadow-violet-500/30', idle: 'bg-zinc-900 border-zinc-800 hover:border-violet-700', iconBg: 'bg-violet-950/60' },
                SNACKING: { active: 'bg-emerald-500 border-emerald-400 shadow-emerald-500/30', idle: 'bg-zinc-900 border-zinc-800 hover:border-emerald-700', iconBg: 'bg-emerald-950/60' },
              }
              const accent = ACCENTS[t]
              return (
                <button
                  key={t}
                  onClick={() => setTagActif(t)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all active:scale-95',
                    isActive ? `${accent.active} text-white shadow-lg` : `${accent.idle} text-zinc-200`,
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center justify-center w-12 h-12 rounded-full text-3xl',
                    isActive ? 'bg-white/15' : accent.iconBg,
                  )} aria-hidden>
                    {def.emoji}
                  </span>
                  <span className="text-sm font-bold uppercase tracking-wide">{def.label}</span>
                  <span className={cn(
                    'inline-flex items-center justify-center min-w-6 h-5 px-2 rounded-full text-[10px] font-bold tabular-nums',
                    isActive ? 'bg-white/25 text-white' : 'bg-zinc-800 text-zinc-400',
                  )}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* 2nd niveau : catégorie au sein de la destination — pills avec compteurs */}
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setFiltreCat('')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-sm font-bold border transition-colors',
                  !filtreCat ? 'bg-white text-zinc-900 border-white' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500',
                )}
              >
                ✦ Toutes
                <span className={cn(
                  'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums',
                  !filtreCat ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-800 text-zinc-400',
                )}>{recettesParTag.length}</span>
              </button>
              {categories.map(c => {
                const n = recettesParTag.filter(r => r.categorie === c).length
                const isActive = filtreCat === c
                return (
                  <button
                    key={c}
                    onClick={() => setFiltreCat(c)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-sm font-bold border transition-colors',
                      isActive ? 'bg-white text-zinc-900 border-white' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500',
                    )}
                  >
                    {c}
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums',
                      isActive ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-800 text-zinc-400',
                    )}>{n}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Quick access — Favoris (badge ⭐) du catalogue actif, en 1ʳᵉ ligne */}
          {!searchQuery && !filtreCat && (() => {
            const favoris = recettesParTag.filter(r => r.favori === true)
            if (favoris.length === 0) return null
            return (
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-2 flex items-center gap-2">
                  <span>⭐</span>
                  <span>Favoris du gérant</span>
                  <span className="text-[10px] text-yellow-600 font-normal">{favoris.length}</span>
                  <span className="h-px flex-1 bg-yellow-900/40"></span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {favoris.map(r => {
                    const dejaAuPanier = panier.find(p => p.recette_id === r.id)
                    return (
                      <ProduitCard
                        key={r.id}
                        produit={r}
                        compteur={dejaAuPanier?.quantite ?? 0}
                        onClick={() => onAjouter(r)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Grille produits — cards plus grosses style kiosque (3 cols max) */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <span className="text-5xl mb-2 opacity-50" aria-hidden>🔍</span>
              <p className="text-base font-medium">Aucun plat ne correspond</p>
              <p className="text-xs mt-1">Essaie de changer de catégorie ou d'effacer ta recherche</p>
            </div>
          ) : !filtreCat && categories.length > 1 ? (
            // Groupé par catégorie quand "Toutes" est sélectionné
            <div className="space-y-6">
              {categories.map(cat => {
                const items = filtered.filter(r => r.categorie === cat)
                if (items.length === 0) return null
                return (
                  <div key={cat}>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
                      <span className="h-px flex-1 bg-zinc-800"></span>
                      <span>{cat}</span>
                      <span className="text-[10px] text-zinc-500 font-normal">{items.length}</span>
                      <span className="h-px flex-1 bg-zinc-800"></span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {items.map(r => {
                        const dejaAuPanier = panier.find(p => p.recette_id === r.id)
                        return (
                          <ProduitCard
                            key={r.id}
                            produit={r}
                            compteur={dejaAuPanier?.quantite ?? 0}
                            onClick={() => onAjouter(r)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Grille simple quand une catégorie est filtrée
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map(r => {
                const dejaAuPanier = panier.find(p => p.recette_id === r.id)
                return (
                  <ProduitCard
                    key={r.id}
                    produit={r}
                    compteur={dejaAuPanier?.quantite ?? 0}
                    onClick={() => onAjouter(r)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Panier — caché sur mobile (footer sticky en bas remplace), visible sur lg+ */}
        {/* min-h-0 OBLIGATOIRE pour que flex-1 overflow-y-auto interne fonctionne dans le grid parent */}
        <div className="hidden lg:flex bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800 flex-col min-h-0">
          {/* Header panier — emerald accent + badge nb articles */}
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="text-xl" aria-hidden>🛒</span>
                Panier
              </h2>
              {panier.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-emerald-500 text-white text-xs font-bold tabular-nums">
                  {panier.reduce((s, p) => s + p.quantite, 0)}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              {panier.length === 0
                ? 'Aucun article'
                : `${panier.length} ligne${panier.length > 1 ? 's' : ''} · ${panier.reduce((s, p) => s + p.quantite, 0)} article${panier.reduce((s, p) => s + p.quantite, 0) > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {panier.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8 italic">Aucun article — clique sur le catalogue.</p>
            ) : (
              panier.map(p => (
                <div key={p.recette_id} className="rounded-md bg-zinc-900 border border-zinc-800 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm flex-1 min-w-0 truncate">{p.recette_nom}</p>
                    <p className="text-emerald-400 font-bold tabular-nums shrink-0">{fmtPrix(p.quantite * p.prix_unitaire_ht)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onModifierQte(p.recette_id, -1)} className="min-h-[40px] min-w-[40px] rounded-md bg-zinc-800 hover:bg-zinc-700 font-bold">−</button>
                      <span className="min-w-[2rem] text-center font-bold tabular-nums">{p.quantite}</span>
                      <button onClick={() => onModifierQte(p.recette_id, 1)} className="min-h-[40px] min-w-[40px] rounded-md bg-zinc-800 hover:bg-zinc-700 font-bold">+</button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={p.commentaire}
                    onChange={e => onModifierCommentaire(p.recette_id, e.target.value)}
                    placeholder="Commentaire (cuisson, ajout, sans X…)"
                    className="mt-1.5 w-full px-2 py-1 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 outline-none"
                  />
                  {/* Allergènes à éviter (Module 12) */}
                  <details className="mt-1.5">
                    <summary className={cn(
                      'text-[10px] cursor-pointer px-2 py-1 rounded font-bold',
                      p.allergenes_a_eviter.length > 0
                        ? 'bg-red-900/40 text-red-300 border border-red-800'
                        : 'text-zinc-400 hover:text-zinc-200',
                    )}>
                      🚨 ALLERGIE — {p.allergenes_a_eviter.length === 0
                        ? 'aucune (cliquer pour signaler)'
                        : `${p.allergenes_a_eviter.length} allergène${p.allergenes_a_eviter.length > 1 ? 's' : ''} à éviter`}
                    </summary>
                    <div className="flex flex-wrap gap-1 mt-1.5 p-1.5 bg-zinc-950 border border-zinc-800 rounded">
                      {ALLERGENES_EU.map(a => {
                        const sel = p.allergenes_a_eviter.includes(a)
                        const info = ALLERGENE_INFO[a]
                        return (
                          <button key={a} onClick={() => onToggleAllergene(p.recette_id, a)}
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border',
                              sel
                                ? 'bg-red-600 text-white border-red-400'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:bg-zinc-800',
                            )}
                            title={info.label}>
                            {info.emoji} {info.label}
                          </button>
                        )
                      })}
                    </div>
                  </details>
                </div>
              ))
            )}
          </div>
          {/* Footer panier — total séparé + bouton ENVOYER gros */}
          <div className="border-t border-zinc-800 bg-zinc-900/50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {panier.length > 0 && (
              <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Total à envoyer</span>
                <span className="text-2xl font-black text-white tabular-nums">{fmtPrix(totalPanier)}</span>
              </div>
            )}
            <div className="p-3">
              <button
                onClick={onEnvoyer}
                disabled={panier.length === 0}
                className={cn(
                  'w-full min-h-[64px] rounded-lg font-bold uppercase tracking-wider text-base transition-all active:scale-[0.97] flex items-center justify-center gap-2',
                  panier.length === 0
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30',
                )}
              >
                {panier.length === 0 ? (
                  <span>Panier vide</span>
                ) : (
                  <>
                    <span className="text-xl" aria-hidden>📡</span>
                    <span>Envoyer en cuisine</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE : footer fixe — toujours visible, panier ouvrable en overlay */}
      <MobileCartFooter
        panier={panier}
        totalPanier={totalPanier}
        onEnvoyer={onEnvoyer}
        onModifierQte={onModifierQte}
        onModifierCommentaire={onModifierCommentaire}
        onToggleAllergene={onToggleAllergene}
      />
    </div>
  )
}

// Footer mobile sticky avec total + bouton envoyer + accès panier détaillé
function MobileCartFooter({
  panier, totalPanier, onEnvoyer, onModifierQte, onModifierCommentaire, onToggleAllergene,
}: {
  panier: LignePanier[]
  totalPanier: number
  onEnvoyer: () => void
  onModifierQte: (id: string, delta: number) => void
  onModifierCommentaire: (id: string, c: string) => void
  onToggleAllergene: (id: string, a: Allergene) => void
}) {
  const [openSheet, setOpenSheet] = useState(false)
  const nbArt = panier.reduce((s, p) => s + p.quantite, 0)

  return (
    <>
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 border-t border-zinc-800 shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-2 p-2">
          <button
            onClick={() => setOpenSheet(true)}
            disabled={panier.length === 0}
            className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50"
          >
            <div className="text-left min-w-0">
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{nbArt > 0 ? `${nbArt} article${nbArt > 1 ? 's' : ''}` : 'Panier vide'}</p>
              <p className="font-bold tabular-nums text-base">{fmtPrix(totalPanier)}</p>
            </div>
            {panier.length > 0 && <span className="text-xs text-emerald-400 font-bold">Voir →</span>}
          </button>
          <button
            onClick={onEnvoyer}
            disabled={panier.length === 0}
            className="flex-[2] min-h-[56px] rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider text-sm"
          >
            📡 Envoyer
          </button>
        </div>
      </div>

      {/* Bottom-sheet panier détaillé */}
      {openSheet && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/80 flex items-end" onClick={() => setOpenSheet(false)}>
          <div className="w-full max-h-[85vh] bg-zinc-950 rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-wider text-zinc-300">Panier · {fmtPrix(totalPanier)}</p>
              <button onClick={() => setOpenSheet(false)} className="text-zinc-400 hover:text-white text-2xl leading-none px-2">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {panier.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8 italic">Aucun article — clique sur le catalogue.</p>
              ) : panier.map(p => (
                <div key={p.recette_id} className="rounded-md bg-zinc-900 border border-zinc-800 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm flex-1 min-w-0 truncate">{p.recette_nom}</p>
                    <p className="text-emerald-400 font-bold tabular-nums shrink-0">{fmtPrix(p.quantite * p.prix_unitaire_ht)}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <button onClick={() => onModifierQte(p.recette_id, -1)} className="min-h-[44px] min-w-[44px] rounded-md bg-zinc-800 font-bold">−</button>
                    <span className="min-w-[2rem] text-center font-bold tabular-nums">{p.quantite}</span>
                    <button onClick={() => onModifierQte(p.recette_id, 1)} className="min-h-[44px] min-w-[44px] rounded-md bg-zinc-800 font-bold">+</button>
                  </div>
                  <input
                    type="text"
                    value={p.commentaire}
                    onChange={e => onModifierCommentaire(p.recette_id, e.target.value)}
                    placeholder="Commentaire (cuisson, ajout…)"
                    className="mt-1.5 w-full px-2 py-1 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100"
                  />
                  <details className="mt-1.5">
                    <summary className={cn(
                      'text-[10px] cursor-pointer px-2 py-1 rounded font-bold',
                      p.allergenes_a_eviter.length > 0
                        ? 'bg-red-900/40 text-red-300 border border-red-800'
                        : 'text-zinc-400',
                    )}>
                      🚨 ALLERGIE — {p.allergenes_a_eviter.length === 0 ? 'aucune' : `${p.allergenes_a_eviter.length} à éviter`}
                    </summary>
                    <div className="flex flex-wrap gap-1 mt-1.5 p-1.5 bg-zinc-950 border border-zinc-800 rounded">
                      {ALLERGENES_EU.map(a => {
                        const sel = p.allergenes_a_eviter.includes(a)
                        const info = ALLERGENE_INFO[a]
                        return (
                          <button key={a} onClick={() => onToggleAllergene(p.recette_id, a)}
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border',
                              sel
                                ? 'bg-red-600 text-white border-red-400'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-700',
                            )}>
                            {info.emoji} {info.label}
                          </button>
                        )
                      })}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
