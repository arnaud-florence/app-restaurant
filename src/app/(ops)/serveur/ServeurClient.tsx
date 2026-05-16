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
        flashOk(`Commande envoyée pour T${tableSelectionnee.numero}`)
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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ═══ HEADER ultra-compact POS pro (h-14) ═══ */}
      <header className="shrink-0 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-700 text-white text-lg shadow-md shrink-0">🪑</span>
            <div className="hidden sm:block min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 leading-none">Service salle</p>
              <h1 className="font-display italic text-lg font-medium text-white tracking-[-0.02em] leading-none mt-0.5 truncate">Plan de table</h1>
            </div>
          </div>

          {/* Stats inline header (CA, Tables, À servir, À encaisser) */}
          <div className="hidden md:flex items-center gap-1.5 text-xs">
            <HeaderStat icon="💶" value={fmtPrix(serveurStats.caEnCours)} label="CA" tone="emerald" />
            <HeaderStat icon="🪑" value={String(serveurStats.nbTables)} label="Tables" tone="amber" />
            <HeaderStat icon="🔔" value={String(nbArticlesPrets)} label="À servir" tone="emerald" pulse={nbArticlesPrets > 0} />
            <HeaderStat icon="💳" value={String(aEncaisser.length)} label="À encais." tone="rose" pulse={aEncaisser.length > 0} />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={serveurId}
              onChange={e => setServeurId(e.target.value)}
              className="text-xs px-2 h-9 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 max-w-[140px]"
            >
              <option value="">— Serveur —</option>
              {employes.map(e => (
                <option key={e.id} value={e.id}>{e.prenom} {e.nom[0]}.</option>
              ))}
            </select>
            <Link href="/caisse" className="text-xs px-3 h-9 inline-flex items-center rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold whitespace-nowrap">
              💰 Caisse
            </Link>
          </div>
        </div>
        <AppelsServeurBanner serveurId={serveurId || null} />
      </header>

      {/* ═══ LAYOUT POS COCKPIT : 2 colonnes desktop, stack mobile ═══ */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] overflow-hidden">
        {/* COLONNE GAUCHE : Plan de salle (scrolle indépendamment) */}
        <section className="overflow-y-auto p-3 sm:p-4 lg:border-r lg:border-zinc-800">
          <PlanSalle
            zones={zones}
            cmdParTable={cmdParTable}
            pretsParTable={pretsParTable}
            onOuvrir={ouvrirTable}
          />
        </section>

        {/* COLONNE DROITE : Activité (À servir + À encaisser empilés, scrolle indépendamment) */}
        <aside className="hidden lg:flex flex-col overflow-hidden bg-zinc-950">
          {/* Section À SERVIR (top half) */}
          <div className="flex-1 flex flex-col overflow-hidden border-b border-zinc-800">
            <header className="shrink-0 px-4 py-2.5 bg-zinc-900/80 backdrop-blur flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔔</span>
                <h2 className="font-display italic text-base font-medium text-white tracking-tight">À servir</h2>
                {nbArticlesPrets > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-black tabular-nums animate-pulse">
                    {nbArticlesPrets}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">Live</span>
            </header>
            <div className="flex-1 overflow-y-auto p-3">
              <ListeAServir
                commandes={cmdsAvecPrets}
                onMarquerServi={marquerServi}
                onMarquerToutServi={marquerToutServi}
              />
            </div>
          </div>

          {/* Section À ENCAISSER (bottom half) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="shrink-0 px-4 py-2.5 bg-zinc-900/80 backdrop-blur flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-lg">💳</span>
                <h2 className="font-display italic text-base font-medium text-white tracking-tight">À encaisser</h2>
                {aEncaisser.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black tabular-nums animate-pulse">
                    {aEncaisser.length}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400">Live</span>
            </header>
            <div className="flex-1 overflow-y-auto p-3">
              <ListeAEncaisser
                commandes={aEncaisser}
                onEncaisser={c => setEncaisserCmd(c)}
              />
            </div>
          </div>
        </aside>

        {/* MOBILE/TABLET : Tabs flottants bottom pour switcher Plan/Servir/Encaisser */}
        <div className="lg:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-zinc-900/95 backdrop-blur-md rounded-full p-1 shadow-2xl border border-zinc-700">
          <TabButton active={tab === 'plan'} onClick={() => setTab('plan')}>🪑 Plan</TabButton>
          <TabButton active={tab === 'a_servir'} onClick={() => setTab('a_servir')}>
            🔔
            {nbArticlesPrets > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold animate-pulse">
                {nbArticlesPrets}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'a_encaisser'} onClick={() => setTab('a_encaisser')}>
            💳
            {aEncaisser.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold animate-pulse">
                {aEncaisser.length}
              </span>
            )}
          </TabButton>
        </div>

        {/* Mobile : afficher liste à servir / à encaisser en plein écran selon tab */}
        {tab === 'a_servir' && (
          <div className="lg:hidden fixed inset-0 z-30 bg-zinc-950 overflow-y-auto p-3 pt-20 pb-24">
            <ListeAServir commandes={cmdsAvecPrets} onMarquerServi={marquerServi} onMarquerToutServi={marquerToutServi} />
          </div>
        )}
        {tab === 'a_encaisser' && (
          <div className="lg:hidden fixed inset-0 z-30 bg-zinc-950 overflow-y-auto p-3 pt-20 pb-24">
            <ListeAEncaisser commandes={aEncaisser} onEncaisser={c => setEncaisserCmd(c)} />
          </div>
        )}
      </main>

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
  const [compact, setCompact] = useState(false)
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* ═══ MOBILE — Dashboard ultra-compact (3 chips en row) ═══ */}
      <section className="lg:hidden mb-3 rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 px-3 py-2.5 shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="text-base font-black text-white tracking-tight flex items-center gap-1.5">
            <span aria-hidden>📊</span>Plan de salle
          </h1>
          <span className="relative flex h-1.5 w-1.5" title="Live">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <MiniChip icon="💶" value={fmtPrix(globalStats.caEnCours)} label="CA"           accent="emerald" />
          <MiniChip icon="🪑" value={`${globalStats.nbTablesOuvertes}`} label="Tables"   accent="amber" />
          <MiniChip icon="💳" value={`${globalStats.nbTablesAEncaisser}`} label="À enc." accent="rose" pulse={globalStats.nbTablesAEncaisser > 0} />
        </div>
      </section>

      {/* ═══ DESKTOP — Dashboard header complet (6 tuiles) ═══ */}
      <section className="hidden lg:block mb-6 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-5 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Service en cours</p>
            <h1 className="text-3xl font-black text-white tracking-tight">Plan de salle</h1>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live · MAJ auto
          </div>
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
          <StatTile icon="💶" label="CA en cours"     value={fmtPrix(globalStats.caEnCours)} accent="emerald" />
          <StatTile icon="🪑" label="Tables ouvertes" value={`${globalStats.nbTablesOuvertes}`} sub={`${globalStats.nbCouvertsOccupes} couverts`} accent="amber" />
          <StatTile icon="🧾" label="Ticket moyen"    value={fmtPrix(globalStats.ticketMoyen)} accent="violet" />
          <StatTile icon="⏱"  label="Durée moy."     value={`${globalStats.dureeMoy} min`} accent="blue" />
          <StatTile icon="🔔" label="À servir"       value={`${globalStats.nbPretsAservir}`} accent="emerald" pulse={globalStats.nbPretsAservir > 0} />
          <StatTile icon="💳" label="À encaisser"    value={`${globalStats.nbTablesAEncaisser}`} accent="rose" pulse={globalStats.nbTablesAEncaisser > 0} />
        </div>
      </section>

      {/* ═══ MOBILE — Tabs zones horizontales scrollables ═══ */}
      {zones.length > 1 && (
        <div className="lg:hidden mb-3 flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-1 snap-x snap-mandatory">
          {zones.map(([zone, ts]) => {
            const s = zoneStats[zone]
            const isActive = activeZone === zone
            const zoneIcon = zone === 'salle' ? '🏠' : zone === 'terrasse' ? '☀️' : '📍'
            return (
              <button
                key={zone}
                onClick={() => setActiveZone(zone)}
                className={cn(
                  'snap-start inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full text-sm font-bold whitespace-nowrap border-2 transition-all',
                  isActive
                    ? 'bg-white text-zinc-900 border-white shadow-lg'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-800',
                )}
              >
                <span className="text-base" aria-hidden>{zoneIcon}</span>
                <span className="capitalize">{zone}</span>
                <span className={cn(
                  'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums',
                  isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-800 text-zinc-500',
                )}>{ts.length}</span>
                {s.aEncaisser > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" aria-label={`${s.aEncaisser} à encaisser`}></span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ Toolbar : filtres rapides + recherche + density toggle ═══ */}
      <div className="sticky top-0 z-10 mb-4 -mx-3 px-3 py-2 bg-zinc-950/90 backdrop-blur-md border-y border-zinc-800">
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto lg:flex-wrap">
          {/* Filtres statut */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-full p-1">
            {([
              { k: 'tous',         lbl: 'Toutes',       dot: 'bg-zinc-400' },
              { k: 'libre',        lbl: 'Libres',       dot: 'bg-emerald-400' },
              { k: 'occupee',      lbl: 'Occupées',     dot: 'bg-amber-400' },
              { k: 'a_encaisser',  lbl: 'À encaisser',  dot: 'bg-rose-400' },
            ] as const).map(f => (
              <button
                key={f.k}
                onClick={() => setFiltre(f.k)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-xs font-bold transition-all',
                  filtre === f.k
                    ? 'bg-white text-zinc-900 shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', f.dot, filtre === f.k && f.k === 'a_encaisser' && 'animate-pulse')}></span>
                {f.lbl}
              </button>
            ))}
          </div>

          {/* Recherche numéro table */}
          <div className="relative flex-1 min-w-[160px] max-w-[280px]">
            <input
              type="search"
              value={searchT}
              onChange={e => setSearchT(e.target.value)}
              placeholder="N° table..."
              className="w-full min-h-[36px] px-3 pr-8 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 outline-none text-xs"
            />
            {searchT && (
              <button onClick={() => setSearchT('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs leading-none">×</button>
            )}
          </div>

          {/* Toggle vue compacte */}
          <button
            onClick={() => setCompact(!compact)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-xs font-bold border transition-all',
              compact
                ? 'bg-white text-zinc-900 border-white'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600',
            )}
            title={compact ? 'Vue détaillée' : 'Vue compacte'}
          >
            {compact ? '⊞ Détaillée' : '⊟ Compacte'}
          </button>
        </div>
      </div>

      <div className="space-y-8">
      {zones.map(([zone, tables]) => {
        const s = zoneStats[zone]
        const tablesFiltrees = tables.filter(shouldShow)
        if (tablesFiltrees.length === 0) return null
        // Sur mobile : cacher si pas la zone active. Sur desktop : tout afficher.
        return (
          <section key={zone} className={cn(
            'animate-in fade-in duration-500',
            zones.length > 1 && activeZone !== zone && 'hidden lg:block',
          )}>
            {/* Header zone — titre dramatique + pastilles stats (caché sur mobile, géré par tabs) */}
            <header className="hidden lg:flex mb-4 items-end justify-between flex-wrap gap-3 px-1">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden>{zone === 'salle' ? '🏠' : zone === 'terrasse' ? '☀️' : '📍'}</span>
                  <h2 className="text-3xl font-black capitalize text-white tracking-tight">{zone}</h2>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 ml-12">
                  {s.couvertsOccupes}/{s.capaTotale} couverts · {s.total} table{s.total > 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                {s.libre > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    {s.libre} libre{s.libre > 1 ? 's' : ''}
                  </span>
                )}
                {s.occupee > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    {s.occupee} occupée{s.occupee > 1 ? 's' : ''}
                  </span>
                )}
                {s.aEncaisser > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 text-rose-200 border border-rose-500/40 shadow-md shadow-rose-900/30">
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                    {s.aEncaisser} à encaisser
                  </span>
                )}
              </div>
            </header>

            <div className={cn(
              'grid gap-2 lg:gap-4',
              compact
                ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
                : 'grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
            )}>
              {tablesFiltrees.map(t => {
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
                      'relative min-h-[120px] lg:min-h-[180px] rounded-xl lg:rounded-2xl border transition-all duration-300',
                      'flex flex-col items-stretch overflow-hidden text-left',
                      'hover:-translate-y-0.5 lg:hover:-translate-y-1 active:scale-[0.98]',
                      sty.card, sty.shadow,
                      statutEffectif === 'a_encaisser' && 'ring-2 ring-rose-500/30',
                    )}
                  >
                    {/* Badge plats prêts en top-right (glow vert) */}
                    {nbPrets > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-8 h-8 px-2.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-xs font-black flex items-center justify-center shadow-lg shadow-emerald-500/50 z-10 ring-2 ring-zinc-950">
                        🔔 {nbPrets}
                      </span>
                    )}

                    {/* Top : numéro de table en grand + capacité subtile */}
                    <div className="px-3 lg:px-4 pt-3 lg:pt-4 pb-1.5 lg:pb-2 flex items-start justify-between">
                      <div>
                        <p className="text-[9px] lg:text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Table</p>
                        <p className={cn('text-4xl lg:text-5xl font-black leading-none mt-0.5 tabular-nums', sty.numero)}>{t.numero}</p>
                      </div>
                      <span className="inline-flex items-center gap-0.5 lg:gap-1 text-[10px] lg:text-[11px] font-bold text-zinc-300 bg-zinc-900/60 px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-full border border-zinc-800 backdrop-blur-sm">
                        <span aria-hidden>👥</span>{t.capacite}
                      </span>
                    </div>

                    {/* Badge statut */}
                    <div className="px-3 lg:px-4 pb-1.5 lg:pb-2">
                      <span className={cn(
                        'inline-flex items-center text-[9px] lg:text-[10px] font-bold uppercase tracking-wider px-2 lg:px-2.5 py-0.5 lg:py-1 rounded-full',
                        sty.badge,
                      )}>
                        {sty.label}
                      </span>
                    </div>

                    {/* Ligne accent (séparateur coloré) */}
                    <div className={cn('h-px mx-3 lg:mx-4', sty.accent)}></div>

                    {/* Footer : infos commande ou état vide */}
                    {cmd ? (
                      <div className="px-3 lg:px-4 py-2 lg:py-3 space-y-0.5 lg:space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] lg:text-[11px] text-zinc-300 tabular-nums">
                          <span className={cn(
                            'inline-flex items-center gap-0.5 lg:gap-1 font-semibold',
                            dureeUrgent ? 'text-red-300' : '',
                          )}>
                            <span aria-hidden>⏱</span>
                            <span>{dureeMin}m</span>
                            {dureeUrgent && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>}
                          </span>
                          <span className="text-zinc-400 hidden lg:inline">{cmd.articles.length} art.</span>
                        </div>
                        {totalCmd > 0 && (
                          <p className="text-base lg:text-xl font-black text-white tabular-nums">
                            {fmtPrix(totalCmd)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="px-3 lg:px-4 py-2 lg:py-3 flex-1 flex items-end">
                        <p className="text-[9px] lg:text-[10px] text-zinc-500 italic hidden lg:block">Tap pour ouvrir une commande</p>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      </div>
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
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 py-16 px-6 text-center shadow-lg">
        <p className="text-6xl mb-3" aria-hidden>✨</p>
        <p className="text-base font-bold text-zinc-200">Tout est sous contrôle</p>
        <p className="text-sm mt-1 text-zinc-500">Aucun plat prêt à servir pour le moment.</p>
        <p className="text-xs mt-3 text-zinc-600">La cuisine et le bar marquent les plats « prêts ».<br/>Tu les retrouveras ici dès qu&apos;un est terminé.</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
      {commandes.map(c => {
        const articlesPrets = c.articles.filter(a => a.statut === 'pret')
        const autresArticles = c.articles.filter(a => a.statut !== 'pret')
        return (
          <div key={c.id} className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/70 via-zinc-900 to-zinc-950 overflow-hidden shadow-lg shadow-emerald-900/20 hover:-translate-y-0.5 transition-all">
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-emerald-500/15 border-b border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">
                  {c.numero_table ? `🪑 T${c.numero_table}` : c.numero}
                </span>
                <span className="text-xs text-zinc-300">{c.numero}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={`/print/bons/${c.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs h-7 px-2 inline-flex items-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold"
                  title="Réimprimer les bons de préparation"
                >🖨</a>
                <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-emerald-400 text-emerald-950 text-xs font-bold animate-pulse">
                  {articlesPrets.length} prêt{articlesPrets.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Articles prêts */}
            <ul className="px-3 py-2 divide-y divide-zinc-800">
              {articlesPrets.map(a => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">
                      <span className="text-emerald-400 font-bold tabular-nums">×{a.quantite}</span> {a.recette_nom}
                    </p>
                    {a.commentaire && (
                      <p className="text-[11px] text-amber-300 italic mt-0.5">⚠ {a.commentaire}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onMarquerServi(a.id)}
                    className="min-h-[44px] px-3 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors active:scale-95"
                  >
                    ✓ Servi
                  </button>
                </li>
              ))}
            </ul>

            {/* Autres articles (en cours / déjà servis) — informatif */}
            {autresArticles.length > 0 && (
              <div className="px-3 pb-2 pt-1 border-t border-zinc-800 text-[11px] text-zinc-500 space-y-0.5">
                {autresArticles.map(a => {
                  const sta = STATUT_ARTICLE_LABEL[a.statut]
                  return (
                    <p key={a.id}>
                      <span className="opacity-60">×{a.quantite} {a.recette_nom}</span>
                      <span className={cn('ml-1.5 px-1.5 py-0.5 rounded text-[9px]', sta.bg, sta.text)}>
                        {sta.emoji} {sta.label}
                      </span>
                    </p>
                  )
                })}
              </div>
            )}

            {/* Action globale */}
            {articlesPrets.length > 1 && (
              <div className="px-3 pb-3 pt-1 border-t border-zinc-800">
                <button
                  onClick={() => onMarquerToutServi(c)}
                  className="w-full min-h-[48px] rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold uppercase tracking-wider text-sm transition-colors active:scale-[0.97]"
                >
                  ✓ Tout marquer servi ({articlesPrets.length})
                </button>
              </div>
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
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 py-16 px-6 text-center shadow-lg">
        <p className="text-6xl mb-3" aria-hidden>✨</p>
        <p className="text-base font-bold text-zinc-200">Tout est encaissé</p>
        <p className="text-sm mt-1 text-zinc-500">Aucune commande à encaisser pour le moment.</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
      {commandes.map(c => {
        const total = c.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)
        return (
          <div key={c.id} className="rounded-2xl border border-rose-500/40 bg-gradient-to-br from-rose-950/70 via-zinc-900 to-zinc-950 overflow-hidden shadow-lg shadow-rose-900/20 hover:-translate-y-0.5 transition-all">
            <div className="px-3.5 py-2.5 bg-rose-500/15 border-b border-rose-500/20 flex items-center justify-between">
              <span className="text-sm font-bold">
                {c.numero_table ? `T${c.numero_table}` : c.numero}
              </span>
              <div className="flex items-center gap-1.5">
                <a
                  href={`/print/ticket/${c.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs h-7 px-2 inline-flex items-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold"
                  title="Aperçu du ticket client (avant règlement)"
                >🖨 Note</a>
                <span className="text-xs text-zinc-300">{c.numero}</span>
              </div>
            </div>
            <ul className="px-3 py-2 divide-y divide-zinc-800">
              {c.articles.map(a => (
                <li key={a.id} className="py-1.5 flex justify-between gap-2 text-sm">
                  <span><b>×{a.quantite}</b> {a.recette_nom}</span>
                  <span className="text-zinc-400 tabular-nums">{fmtPrix(a.quantite * a.prix_unitaire_ht)}</span>
                </li>
              ))}
            </ul>
            <div className="px-3 pb-3 pt-2 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-400">Total HT</span>
              <span className="font-bold tabular-nums">{fmtPrix(total)}</span>
            </div>
            <div className="px-3 pb-3">
              <button
                onClick={() => onEncaisser(c)}
                className="w-full min-h-[48px] rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold uppercase tracking-wider transition-colors active:scale-[0.97]"
              >
                💰 Encaisser
              </button>
            </div>
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
          <h2 className="text-2xl font-bold">T{table.numero} <span className="text-sm font-normal text-zinc-400">· {table.capacite} couverts · {table.zone}</span></h2>
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
