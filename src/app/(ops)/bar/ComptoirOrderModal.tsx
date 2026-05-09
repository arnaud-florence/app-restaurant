'use client'

// Modal de saisie commande COMPTOIR depuis le bar.
// Catalogue + panier minimal réutilisant la logique du serveur.
// À la validation : creerCommande(source: 'COMPTOIR') → push en cuisine/bar/pizza.

import { useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { creerCommande } from '../actions'
import { fmtPrix } from '@/lib/service'

type Recette = {
  id: string; nom: string; categorie: string;
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  prix_vente_ht: number
}

type LignePanier = {
  recette_id: string
  recette_nom: string
  prix_unitaire_ht: number
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  quantite: number
  commentaire: string
}

const TAGS = [
  { key: 'BAR' as const,     label: '🍷 Bar',     hint: 'Boissons / cocktails' },
  { key: 'CUISINE' as const, label: '👨‍🍳 Cuisine', hint: 'Plats / snacks' },
  { key: 'PIZZA' as const,   label: '🍕 Pizza',   hint: 'Pizzas' },
]

export default function ComptoirOrderModal({
  recettes, barmanId, onClose, onSuccess,
}: {
  recettes: Recette[]
  barmanId: string | null
  onClose: () => void
  onSuccess: (commandeId: string) => void
}) {
  const [tagActif, setTagActif] = useState<'BAR' | 'CUISINE' | 'PIZZA'>('BAR')
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  const recettesAffichees = useMemo(
    () => recettes.filter(r => r.tag_destination === tagActif),
    [recettes, tagActif]
  )

  // Groupement par catégorie
  const parCategorie = useMemo(() => {
    const map = new Map<string, Recette[]>()
    for (const r of recettesAffichees) {
      const k = r.categorie || 'Autres'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [recettesAffichees])

  const totalPanier = panier.reduce((s, p) => s + p.quantite * p.prix_unitaire_ht, 0)
  const nbArticles = panier.reduce((s, p) => s + p.quantite, 0)

  function ajouter(r: Recette) {
    setPanier(prev => {
      const i = prev.findIndex(p => p.recette_id === r.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], quantite: next[i].quantite + 1 }
        return next
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

  function modifier(recette_id: string, delta: number) {
    setPanier(prev => prev.flatMap(p => {
      if (p.recette_id !== recette_id) return [p]
      const q = p.quantite + delta
      if (q <= 0) return []
      return [{ ...p, quantite: q }]
    }))
  }

  function envoyer() {
    if (panier.length === 0) { setErreur('Panier vide'); return }
    setErreur('')
    startTransition(async () => {
      try {
        const r = await creerCommande({
          source: 'COMPTOIR',
          numero_table: null,
          serveur_id: barmanId || null,
          articles: panier.map(p => ({
            recette_id: p.recette_id,
            quantite: p.quantite,
            prix_unitaire_ht: p.prix_unitaire_ht,
            tag_destination: p.tag_destination,
            commentaire: p.commentaire || null,
            allergenes_a_eviter: [],
          })),
        })
        onSuccess(r.id)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  // Sur mobile : panier en bottom-sheet ouvrable au tap
  const [showPanierMobile, setShowPanierMobile] = useState(false)

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-stretch justify-center">
      <div className="w-full max-w-6xl bg-zinc-900 text-zinc-100 flex flex-col h-full max-h-screen">

        {/* Header — compact */}
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400">Nouvelle commande</p>
            <h2 className="text-xl font-bold">🛒 Comptoir</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="text-zinc-400 hover:text-white w-10 h-10 flex items-center justify-center text-3xl leading-none rounded-full hover:bg-zinc-800"
            aria-label="Fermer"
          >×</button>
        </header>

        {/* Tabs catégories — scrollable horizontal sur mobile */}
        <div className="flex gap-1 px-2 pt-2 bg-zinc-950 border-b border-zinc-800 overflow-x-auto flex-shrink-0">
          {TAGS.map(t => (
            <button
              key={t.key}
              onClick={() => setTagActif(t.key)}
              className={cn(
                'px-3 py-2 rounded-t-md text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
                tagActif === t.key
                  ? 'bg-zinc-900 text-emerald-400 border-emerald-500'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              )}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 2 zones : catalogue + panier (côte à côte sur md+, empilé sur mobile) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_360px] overflow-hidden min-h-0">

          {/* Catalogue */}
          <div className="overflow-y-auto p-3 space-y-4">
            {parCategorie.length === 0 ? (
              <p className="text-zinc-500 italic text-center py-8">
                Aucune recette pour {tagActif}.
              </p>
            ) : parCategorie.map(([cat, items]) => (
              <div key={cat}>
                <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1.5 font-bold">{cat}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {items.map(r => {
                    const dejaAuPanier = panier.find(p => p.recette_id === r.id)
                    return (
                      <button
                        key={r.id}
                        onClick={() => ajouter(r)}
                        className={cn(
                          'min-h-[80px] p-2 rounded-md border text-left transition-all active:scale-95 flex flex-col justify-between',
                          dejaAuPanier
                            ? 'bg-emerald-900/40 border-emerald-500'
                            : 'bg-zinc-950 border-zinc-700 hover:border-emerald-500'
                        )}
                      >
                        <p className="text-sm font-medium leading-tight line-clamp-2">{r.nom}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-zinc-400 tabular-nums">{fmtPrix(r.prix_vente_ht)}</span>
                          {dejaAuPanier && (
                            <span className="text-xs font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                              ×{dejaAuPanier.quantite}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Panier — desktop : sidebar fixe / mobile : bottom-sheet ouvrable */}
          <div className={cn(
            // Desktop : sidebar visible
            'border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-950 flex-col',
            'hidden md:flex',
          )}>
            <PanierContent
              panier={panier}
              totalPanier={totalPanier}
              nbArticles={nbArticles}
              erreur={erreur}
              isPending={isPending}
              modifier={modifier}
              envoyer={envoyer}
              onClose={onClose}
            />
          </div>
        </div>

        {/* MOBILE : bottom bar persistant (toujours visible) */}
        <div className="md:hidden flex-shrink-0 border-t border-zinc-800 bg-zinc-950">
          <button
            onClick={() => setShowPanierMobile(true)}
            disabled={panier.length === 0}
            className={cn(
              'w-full px-4 py-3 flex items-center justify-between gap-2',
              panier.length === 0 ? 'opacity-60' : 'hover:bg-zinc-900',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛍</span>
              <div className="text-left">
                <p className="text-xs text-zinc-400">{nbArticles > 0 ? `${nbArticles} article${nbArticles > 1 ? 's' : ''}` : 'Panier vide'}</p>
                <p className="font-bold tabular-nums">{fmtPrix(totalPanier)}</p>
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-400">{panier.length > 0 ? 'Voir →' : ''}</span>
          </button>

          <button
            onClick={envoyer}
            disabled={isPending || panier.length === 0}
            className="w-full min-h-[56px] bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {isPending ? 'Envoi…' : `✓ Envoyer la commande`}
          </button>
        </div>

        {/* MOBILE : Bottom-sheet panier détaillé (overlay) */}
        {showPanierMobile && (
          <div className="md:hidden fixed inset-0 z-[60] bg-black/80 flex items-end" onClick={() => setShowPanierMobile(false)}>
            <div className="w-full max-h-[80vh] bg-zinc-950 rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                <p className="text-sm font-bold uppercase tracking-wider text-zinc-300">Panier · {fmtPrix(totalPanier)}</p>
                <button onClick={() => setShowPanierMobile(false)} className="text-zinc-400 hover:text-white text-2xl leading-none px-2">×</button>
              </div>
              <PanierContent
                panier={panier}
                totalPanier={totalPanier}
                nbArticles={nbArticles}
                erreur={erreur}
                isPending={isPending}
                modifier={modifier}
                envoyer={() => { setShowPanierMobile(false); envoyer() }}
                onClose={onClose}
                hideHeader
              />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// Sous-composant panier (réutilisé desktop sidebar + mobile bottom-sheet)
function PanierContent({
  panier, totalPanier, nbArticles, erreur, isPending,
  modifier, envoyer, onClose, hideHeader = false,
}: {
  panier: LignePanier[]
  totalPanier: number
  nbArticles: number
  erreur: string
  isPending: boolean
  modifier: (recette_id: string, delta: number) => void
  envoyer: () => void
  onClose: () => void
  hideHeader?: boolean
}) {
  return (
    <>
      {!hideHeader && (
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Panier</p>
          <p className="text-2xl font-bold tabular-nums">{fmtPrix(totalPanier)}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {panier.length === 0 ? (
          <p className="text-zinc-500 italic text-center py-8 text-sm">
            Clique sur les recettes pour les ajouter.
          </p>
        ) : panier.map(p => (
          <div key={p.recette_id} className="rounded-md bg-zinc-900 border border-zinc-800 p-2">
            <p className="text-sm font-medium">{p.recette_nom}</p>
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => modifier(p.recette_id, -1)}
                  className="w-9 h-9 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-lg active:scale-95"
                >−</button>
                <span className="w-9 text-center font-bold tabular-nums">{p.quantite}</span>
                <button
                  onClick={() => modifier(p.recette_id, +1)}
                  className="w-9 h-9 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-lg active:scale-95"
                >+</button>
              </div>
              <span className="text-sm tabular-nums text-zinc-400">
                {fmtPrix(p.prix_unitaire_ht * p.quantite)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {erreur && (
        <div className="px-4 py-2 bg-red-900/30 border-t border-red-800 text-red-300 text-sm">⚠️ {erreur}</div>
      )}

      <div className="p-3 border-t border-zinc-800 space-y-2 flex-shrink-0">
        <button
          onClick={envoyer}
          disabled={isPending || panier.length === 0}
          className="w-full min-h-[56px] rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider"
        >
          {isPending ? 'Envoi…' : `✓ Envoyer ${nbArticles > 0 ? `(${nbArticles} art.)` : ''}`}
        </button>
        <button
          onClick={onClose}
          disabled={isPending}
          className="w-full min-h-[40px] rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium"
        >
          Annuler
        </button>
      </div>
    </>
  )
}
