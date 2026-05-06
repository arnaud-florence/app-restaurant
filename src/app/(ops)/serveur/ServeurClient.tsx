'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  type CommandeService, type StatutTable, type TagDestination,
  STATUT_TABLE_STYLE, STATUT_ARTICLE_LABEL, TAG_DEST_LABEL, fmtPrix,
} from '@/lib/service'
import { creerCommande } from '../actions'
import EncaissementModal from './EncaissementModal'

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
}

type Tab = 'plan' | 'a_encaisser'

export default function ServeurClient({
  initialCommandes, tables, recettes, employes,
}: {
  initialCommandes: CommandeService[]
  tables: Table[]
  recettes: Recette[]
  employes: Employe[]
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
          })),
        })
        flashOk(`Commande envoyée pour T${tableSelectionnee.numero}`)
        fermerCatalogue()
        router.refresh()
      } catch (e) { flashKo(e) }
    })
  }

  const totalPanier = panier.reduce((s, p) => s + p.quantite * p.prix_unitaire_ht, 0)

  return (
    <div className="min-h-screen flex flex-col">
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
              className="text-sm px-3 h-10 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100"
            >
              <option value="">— Choisir serveur —</option>
              {employes.map(e => (
                <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-2 flex gap-1">
          <TabButton active={tab === 'plan'} onClick={() => setTab('plan')}>
            🪑 Plan de salle
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
        {tab === 'plan' && (
          <PlanSalle
            zones={zones}
            cmdParTable={cmdParTable}
            onOuvrir={ouvrirTable}
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
          onClose={fermerCatalogue}
          onEnvoyer={envoyerCommande}
        />
      )}

      {/* Modal Encaissement */}
      {encaisserCmd && (
        <EncaissementModal
          commande={encaisserCmd}
          serveurId={serveurId}
          employes={employes}
          onClose={() => setEncaisserCmd(null)}
          onSuccess={() => { setEncaisserCmd(null); flashOk('Encaissement validé'); router.refresh() }}
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
        'inline-flex items-center px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors',
        active ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      )}
    >
      {children}
    </button>
  )
}

// ─── Plan de salle ───────────────────────────────────────────────────
function PlanSalle({
  zones, cmdParTable, onOuvrir,
}: {
  zones: [string, Table[]][]
  cmdParTable: Map<string, CommandeService>
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
                    'min-h-[120px] rounded-xl ring-4 transition-all active:scale-95 p-3 flex flex-col items-center justify-center gap-1',
                    sty.bg, sty.text, sty.ring,
                  )}
                >
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
              <span className="text-xs text-zinc-300">{c.numero}</span>
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
  onAjouter, onModifierQte, onModifierCommentaire, onClose, onEnvoyer,
}: {
  table: Table
  recettes: Recette[]
  panier: LignePanier[]
  totalPanier: number
  commandeExistante: CommandeService | null
  onAjouter: (r: Recette) => void
  onModifierQte: (id: string, delta: number) => void
  onModifierCommentaire: (id: string, c: string) => void
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
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_400px] min-h-0">
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

        {/* Panier */}
        <div className="bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800 flex flex-col">
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
                    placeholder="Commentaire (allergies, cuisson…)"
                    className="mt-1.5 w-full px-2 py-1 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 outline-none"
                  />
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
    </div>
  )
}
