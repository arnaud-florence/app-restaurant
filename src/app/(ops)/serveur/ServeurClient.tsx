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
    <div className="min-h-screen flex flex-col pb-mobile-nav">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Service — Salle</p>
            <h1 className="text-2xl sm:text-3xl font-bold">🪑 Serveur</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={serveurId}
              onChange={e => setServeurId(e.target.value)}
              className="text-base px-3 h-12 sm:h-10 sm:text-sm rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100"
            >
              <option value="">— Choisir serveur —</option>
              {employes.map(e => (
                <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
              ))}
            </select>
            <Link href="/caisse" className="text-base sm:text-sm px-4 h-12 sm:h-10 inline-flex items-center rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold whitespace-nowrap">
              💰 Caisse
            </Link>
          </div>
        </div>
        <AppelsServeurBanner serveurId={serveurId || null} />

        {/* Tabs */}
        <div className="px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabButton active={tab === 'plan'} onClick={() => setTab('plan')}>
            🪑 Plan de salle
          </TabButton>
          <TabButton active={tab === 'a_servir'} onClick={() => setTab('a_servir')}>
            🔔 À servir
            {nbArticlesPrets > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold animate-pulse">
                {nbArticlesPrets}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'a_encaisser'} onClick={() => setTab('a_encaisser')}>
            💰 À encaisser
            {aEncaisser.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold animate-pulse">
                {aEncaisser.length}
              </span>
            )}
          </TabButton>
        </div>
      </header>

      {/* Contenu de l'onglet */}
      <main className="flex-1 p-4 space-y-4">
        <TachesDuJourWidget poste="serveur" theme="dark" employeId={widgetEmployeId} initialDone={widgetInitialDone} />
        {tab === 'plan' && (
          <PlanSalle
            zones={zones}
            cmdParTable={cmdParTable}
            pretsParTable={pretsParTable}
            onOuvrir={ouvrirTable}
          />
        )}
        {tab === 'a_servir' && (
          <ListeAServir
            commandes={cmdsAvecPrets}
            onMarquerServi={marquerServi}
            onMarquerToutServi={marquerToutServi}
          />
        )}
        {tab === 'a_encaisser' && (
          <ListeAEncaisser
            commandes={aEncaisser}
            onEncaisser={c => setEncaisserCmd(c)}
          />
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
        'inline-flex items-center px-4 min-h-[44px] sm:min-h-0 sm:py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors',
        active ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      )}
    >
      {children}
    </button>
  )
}

// ─── Plan de salle ───────────────────────────────────────────────────
function PlanSalle({
  zones, cmdParTable, pretsParTable, onOuvrir,
}: {
  zones: [string, Table[]][]
  cmdParTable: Map<string, CommandeService>
  pretsParTable: Map<string, number>
  onOuvrir: (t: Table) => void
}) {
  return (
    <div className="space-y-6">
      {zones.map(([zone, tables]) => (
        <section key={zone}>
          <h2 className="text-lg font-bold mb-2 capitalize">{zone}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {tables.map(t => {
              const cmd = cmdParTable.get(t.numero)
              const nbPrets = pretsParTable.get(t.numero) ?? 0
              // Statut d'affichage : a_encaisser si commande servi sur cette table, sinon t.statut
              const statutEffectif: StatutTable = cmd?.statut === 'servi' ? 'a_encaisser'
                : cmd ? 'occupee'
                : t.statut
              const sty = STATUT_TABLE_STYLE[statutEffectif]
              return (
                <button
                  key={t.id}
                  onClick={() => onOuvrir(t)}
                  className={cn(
                    'relative min-h-[120px] rounded-xl ring-4 transition-all active:scale-95 p-3 flex flex-col items-center justify-center gap-1',
                    sty.bg, sty.text, sty.ring,
                  )}
                >
                  {nbPrets > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-7 h-7 px-2 rounded-full bg-emerald-400 text-emerald-950 border-2 border-zinc-900 text-xs font-bold flex items-center justify-center shadow-lg animate-pulse">
                      🔔 {nbPrets}
                    </span>
                  )}
                  <p className="text-3xl font-bold">T{t.numero}</p>
                  <p className="text-xs opacity-90">{t.capacite} couvert{t.capacite > 1 ? 's' : ''}</p>
                  <p className="text-[10px] uppercase tracking-wider font-bold opacity-90">{sty.label}</p>
                  {cmd && (
                    <p className="text-[10px] opacity-80 mt-0.5">
                      {cmd.articles.length} article{cmd.articles.length > 1 ? 's' : ''}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
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
      <div className="text-center py-16 text-zinc-500">
        <p className="text-6xl mb-3">✨</p>
        <p className="text-base">Aucun plat prêt à servir pour le moment.</p>
        <p className="text-sm mt-2 text-zinc-600">La cuisine et le bar marquent les plats « prêts ».<br/>Tu les retrouveras ici dès qu&apos;un est terminé.</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {commandes.map(c => {
        const articlesPrets = c.articles.filter(a => a.statut === 'pret')
        const autresArticles = c.articles.filter(a => a.statut !== 'pret')
        return (
          <div key={c.id} className="rounded-lg border-2 border-emerald-500/60 bg-zinc-900 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 bg-emerald-600/30 flex items-center justify-between">
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
      <div className="text-center py-16 text-zinc-500">
        <p className="text-6xl mb-3">✨</p>
        <p className="text-base">Aucune commande à encaisser pour le moment.</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {commandes.map(c => {
        const total = c.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)
        return (
          <div key={c.id} className="rounded-lg border-2 border-red-500/50 bg-zinc-900 overflow-hidden">
            <div className="px-3 py-2 bg-red-600/30 flex items-center justify-between">
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
  const [filtreCat, setFiltreCat] = useState<string>('')

  const categories = useMemo(() => {
    const set = new Set<string>()
    recettes.forEach(r => set.add(r.categorie))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [recettes])

  const filtered = useMemo(() => {
    return filtreCat ? recettes.filter(r => r.categorie === filtreCat) : recettes
  }, [recettes, filtreCat])

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
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              onClick={() => setFiltreCat('')}
              className={cn('px-3 py-1.5 rounded-full text-xs font-bold', !filtreCat ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400')}
            >
              Toutes
            </button>
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setFiltreCat(c)}
                className={cn('px-3 py-1.5 rounded-full text-xs font-bold', filtreCat === c ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400')}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {filtered.map(r => {
              const dest = TAG_DEST_LABEL[r.tag_destination]
              return (
                <button
                  key={r.id}
                  onClick={() => onAjouter(r)}
                  className="min-h-[100px] rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 active:scale-95 transition-all p-3 text-left flex flex-col"
                >
                  <span className={cn('inline-block self-start text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1', dest.cls)}>
                    {dest.emoji} {dest.label}
                  </span>
                  <p className="font-semibold text-sm leading-tight flex-1">{r.nom}</p>
                  <p className="text-emerald-400 font-bold text-base mt-1">{fmtPrix(r.prix_vente_ht)}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Panier — caché sur mobile (footer sticky en bas remplace), visible sur lg+ */}
        <div className="hidden lg:flex bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800 flex-col">
          <div className="px-4 py-2 border-b border-zinc-800">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Panier</p>
            <p className="text-2xl font-bold tabular-nums">{fmtPrix(totalPanier)}</p>
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
          <div className="p-3 border-t border-zinc-800" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
            <button
              onClick={onEnvoyer}
              disabled={panier.length === 0}
              className="w-full min-h-[56px] rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider text-base transition-colors active:scale-[0.97]"
            >
              📡 Envoyer la commande {fmtPrix(totalPanier)}
            </button>
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
