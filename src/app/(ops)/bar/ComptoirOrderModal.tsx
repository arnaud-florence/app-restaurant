'use client'

// Modal de saisie commande COMPTOIR depuis le bar OU /emporter (poste snack).
// Catalogue + panier minimal réutilisant la logique du serveur.
// À la validation : creerCommande(source: 'COMPTOIR') → push en cuisine/bar/pizza/snacking.
//
// Multi-créneaux : si withCreneaux.tagsAvecPlanning est fourni, on affiche un
// sélecteur de créneau pour CHAQUE tag présent dans le panier qui fait partie de
// cette liste. Ex : panier mixte snack+pizza sur /emporter → 2 sélecteurs.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { creerCommande, listerCreneauxDisponibles } from '../actions'
import { fmtPrix } from '@/lib/service'
import { createClient } from '@/lib/supabase/client'

type TagPanier = 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
type TagPlanning = 'SNACKING' | 'PIZZA' | 'BAR'

type Recette = {
  id: string; nom: string; categorie: string;
  tag_destination: TagPanier
  prix_vente_ht: number
}

type LignePanier = {
  recette_id: string
  recette_nom: string
  prix_unitaire_ht: number
  tag_destination: TagPanier
  quantite: number
  commentaire: string
}

type Slot = { heure: string; iso: string; disponible: boolean; count: number; max: number }

const TAGS = [
  { key: 'BAR' as const,      label: '🍷 Bar',      hint: 'Boissons / cocktails' },
  { key: 'CUISINE' as const,  label: '👨‍🍳 Cuisine',  hint: 'Plats' },
  { key: 'SNACKING' as const, label: '🥪 Snacking', hint: 'Snacks rapides' },
  { key: 'PIZZA' as const,    label: '🍕 Pizza',    hint: 'Pizzas' },
]

// Libellés courts pour les titres de sélecteurs créneaux (1 par zone)
const TAG_LABEL_COURT: Record<TagPlanning, { emoji: string; label: string }> = {
  SNACKING: { emoji: '🥪', label: 'Snack' },
  PIZZA:    { emoji: '🍕', label: 'Pizza' },
  BAR:      { emoji: '🍷', label: 'Bar' },
}

export default function ComptoirOrderModal({
  recettes, barmanId, onClose, onSuccess, withCreneaux = null, tagInitial = 'BAR',
}: {
  recettes: Recette[]
  barmanId: string | null
  onClose: () => void
  onSuccess: (commandeId: string) => void
  // Si fourni : la modal proposera un sélecteur de créneau pour chaque tag du
  // panier qui figure dans `tagsAvecPlanning`. Si null/absent : commande
  // immédiate (pas de creneau_retrait, pas de creneaux_par_tag).
  withCreneaux?: { tagsAvecPlanning: TagPlanning[] } | null
  // Onglet sélectionné à l'ouverture (utile pour préfiltrer selon le poste appelant)
  tagInitial?: TagPanier
}) {
  const [tagActif, setTagActif] = useState<TagPanier>(tagInitial)
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  // ─── Créneaux retrait multi-zones ────────────────────────────
  // Une seule date partagée (le client passe chercher tout le même jour),
  // mais un slot distinct par tag (planning séparé snack/pizza/bar).
  const [dateChoisie, setDateChoisie] = useState<string>(() => new Date().toISOString().slice(0, 10))
  // Map tag → slot ISO choisi (null = ASAP/pas encore choisi)
  const [creneauxParTag, setCreneauxParTag] = useState<Partial<Record<TagPlanning, string | null>>>({})
  // Map tag → liste des slots disponibles (chargés via listerCreneauxDisponibles)
  const [slotsParTag, setSlotsParTag] = useState<Partial<Record<TagPlanning, Slot[]>>>({})
  // Map tag → en cours de chargement
  const [loadingParTag, setLoadingParTag] = useState<Partial<Record<TagPlanning, boolean>>>({})

  // Tags qui ont un planning configuré (passé par le parent)
  const tagsAvecPlanning = useMemo(() => withCreneaux?.tagsAvecPlanning ?? [], [withCreneaux])

  // Tags actuellement présents dans le panier ET ayant un planning → besoin d'un sélecteur
  const tagsAReserver = useMemo<TagPlanning[]>(() => {
    if (tagsAvecPlanning.length === 0) return []
    const tagsDuPanier = new Set(panier.map(p => p.tag_destination))
    return tagsAvecPlanning.filter(t => tagsDuPanier.has(t))
  }, [panier, tagsAvecPlanning])

  // Clé stable de la liste des tags à réserver (pour dépendance useEffect)
  const tagsAReserverKey = tagsAReserver.slice().sort().join(',')

  // Fetch des créneaux : pour chaque tag à réserver, charge ses slots.
  // Re-déclenché quand la date change ou quand on ajoute/retire un tag du panier.
  useEffect(() => {
    if (tagsAReserver.length === 0) return
    let cancelled = false
    setLoadingParTag(prev => {
      const next = { ...prev }
      for (const t of tagsAReserver) next[t] = true
      return next
    })
    Promise.all(tagsAReserver.map(async t => {
      try {
        const slots = await listerCreneauxDisponibles(t, dateChoisie)
        return [t, slots] as const
      } catch {
        return [t, [] as Slot[]] as const
      }
    })).then(results => {
      if (cancelled) return
      setSlotsParTag(prev => {
        const next = { ...prev }
        for (const [t, slots] of results) next[t] = slots
        return next
      })
      setLoadingParTag(prev => {
        const next = { ...prev }
        for (const [t] of results) next[t] = false
        return next
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsAReserverKey, dateChoisie])

  // Reset les choix de créneaux quand on change de date (les slots changent)
  useEffect(() => {
    setCreneauxParTag({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateChoisie])

  // Realtime : refetch tous les créneaux des tags concernés dès qu'une commande
  // est créée/modifiée (ONLINE depuis le site web ou COMPTOIR depuis un autre poste).
  // Évite que le snack-man réserve un slot qu'un client web vient de prendre.
  useEffect(() => {
    if (tagsAReserver.length === 0) return
    const supabase = createClient()
    const channel = supabase
      .channel('comptoir-creneaux-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, () => {
        Promise.all(tagsAReserver.map(async t => {
          try {
            const slots = await listerCreneauxDisponibles(t, dateChoisie)
            return [t, slots] as const
          } catch { return [t, [] as Slot[]] as const }
        })).then(results => {
          setSlotsParTag(prev => {
            const next = { ...prev }
            for (const [t, slots] of results) next[t] = slots
            return next
          })
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsAReserverKey, dateChoisie])

  // Génère les 7 prochains jours pour le sélecteur de date
  const datesDispo = useMemo(() => {
    const out: Array<{ key: string; label: string; date: string }> = []
    const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const date = d.toISOString().slice(0, 10)
      const label = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : `${JOURS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
      out.push({ key: date, label, date })
    }
    return out
  }, [])

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
      if (q <= 0) return [] as LignePanier[]
      return [{ ...p, quantite: q }]
    }))
  }

  function setSlotPourTag(tag: TagPlanning, iso: string | null) {
    setCreneauxParTag(prev => ({ ...prev, [tag]: iso }))
  }

  function envoyer() {
    if (panier.length === 0) { setErreur('Panier vide'); return }
    setErreur('')
    startTransition(async () => {
      try {
        // Pour chaque tag à réserver : si pas de choix explicite, on prend le
        // PROCHAIN slot libre de ce tag. Si rien de libre → on échoue
        // explicitement (la cuisine est saturée pour ce jour).
        const creneauxFinaux: Record<TagPlanning, string> = {} as Record<TagPlanning, string>
        for (const t of tagsAReserver) {
          let iso = creneauxParTag[t] ?? null
          if (!iso) {
            const prochain = (slotsParTag[t] ?? []).find(s => s.disponible)
            if (prochain) iso = prochain.iso
          }
          if (!iso) {
            throw new Error(`Aucun créneau libre pour ${TAG_LABEL_COURT[t].label.toLowerCase()} à cette date.`)
          }
          creneauxFinaux[t] = iso
        }

        const hasCreneaux = Object.keys(creneauxFinaux).length > 0
        const r = await creerCommande({
          source: 'COMPTOIR',
          numero_table: null,
          serveur_id: barmanId || null,
          // Multi-créneaux (envoyé seulement s'il y en a)
          ...(hasCreneaux ? { creneaux_par_tag: creneauxFinaux } : {}),
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

  const hasAnyPlanning = tagsAReserver.length > 0

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

        {/* Bande créneaux MOBILE — visible si au moins un tag à réserver. Empile un sélecteur par tag. */}
        {hasAnyPlanning && (
          <div className="md:hidden flex-shrink-0 bg-zinc-950 border-b border-zinc-800">
            <SelecteurDate
              datesDispo={datesDispo}
              dateChoisie={dateChoisie}
              setDateChoisie={setDateChoisie}
              compact
            />
            {tagsAReserver.map(tag => (
              <SelecteurSlotTag
                key={tag}
                tag={tag}
                slots={slotsParTag[tag] ?? []}
                slotChoisi={creneauxParTag[tag] ?? null}
                setSlotChoisi={iso => setSlotPourTag(tag, iso)}
                loading={!!loadingParTag[tag]}
                isToday={dateChoisie === datesDispo[0]?.date}
                compact
              />
            ))}
          </div>
        )}

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
              tagsAReserver={tagsAReserver}
              slotsParTag={slotsParTag}
              creneauxParTag={creneauxParTag}
              setSlotPourTag={setSlotPourTag}
              loadingParTag={loadingParTag}
              datesDispo={datesDispo}
              dateChoisie={dateChoisie}
              setDateChoisie={setDateChoisie}
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
                tagsAReserver={tagsAReserver}
                slotsParTag={slotsParTag}
                creneauxParTag={creneauxParTag}
                setSlotPourTag={setSlotPourTag}
                loadingParTag={loadingParTag}
                datesDispo={datesDispo}
                dateChoisie={dateChoisie}
                setDateChoisie={setDateChoisie}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Sous-composant : sélecteur de date (1 seule date partagée pour tous les tags) ───
function SelecteurDate({
  datesDispo, dateChoisie, setDateChoisie, compact = false,
}: {
  datesDispo: Array<{ key: string; label: string; date: string }>
  dateChoisie: string
  setDateChoisie: (d: string) => void
  compact?: boolean
}) {
  const padding = compact ? 'p-2' : 'px-3 pt-3'
  const labelCls = compact
    ? 'text-[10px] font-bold uppercase tracking-wider text-zinc-400'
    : 'text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2'
  return (
    <div className={cn(padding, 'flex-shrink-0')}>
      <p className={labelCls}>📅 Jour de retrait</p>
      <div className="flex gap-1 mt-1 mb-1 overflow-x-auto -mx-1 px-1 pb-1">
        {datesDispo.map(d => (
          <button
            key={d.key}
            onClick={() => setDateChoisie(d.date)}
            className={cn(
              'inline-flex items-center px-3 min-h-[36px] rounded text-xs font-bold whitespace-nowrap border transition-colors',
              dateChoisie === d.date
                ? 'bg-emerald-500 text-white border-emerald-400'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800',
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Sous-composant : sélecteur de slot pour 1 tag (Snack / Pizza / Bar) ───
function SelecteurSlotTag({
  tag, slots, slotChoisi, setSlotChoisi, loading, isToday, compact = false,
}: {
  tag: TagPlanning
  slots: Slot[]
  slotChoisi: string | null
  setSlotChoisi: (iso: string | null) => void
  loading: boolean
  isToday: boolean
  compact?: boolean
}) {
  const lib = TAG_LABEL_COURT[tag]
  const padding = compact ? 'px-2 pb-2' : 'px-3 pt-3 pb-2'
  const labelCls = compact
    ? 'text-[10px] font-bold uppercase tracking-wider text-zinc-400'
    : 'text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5'
  const slotsMax = compact ? 'max-h-[80px]' : 'max-h-[140px]'
  const heureChoisie = slotChoisi ? slots.find(s => s.iso === slotChoisi)?.heure : null
  return (
    <div className={cn(padding, !compact && 'border-t border-zinc-800', 'flex-shrink-0')}>
      <p className={labelCls}>
        <span className="text-base mr-1">{lib.emoji}</span>
        Retrait {lib.label.toLowerCase()}
        {heureChoisie && <span className="ml-2 text-emerald-400 normal-case font-bold">{heureChoisie}</span>}
      </p>
      {isToday && (
        <button
          onClick={() => {
            const prochain = slots.find(s => s.disponible)
            setSlotChoisi(prochain ? prochain.iso : null)
          }}
          disabled={slots.length > 0 && !slots.some(s => s.disponible)}
          className={cn(
            'w-full rounded-md text-xs font-bold mb-1 transition-colors border',
            compact ? 'min-h-[32px]' : 'min-h-[40px]',
            'bg-zinc-900 text-emerald-300 border-emerald-700 hover:bg-emerald-950',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          🚀 Dès que possible
        </button>
      )}
      {loading ? (
        <p className="text-xs text-zinc-500 italic text-center py-2">Chargement créneaux…</p>
      ) : slots.length === 0 ? (
        <p className="text-[11px] text-zinc-500 italic text-center py-1">
          Aucun créneau planifié {isToday ? "aujourd'hui" : 'ce jour'} pour {lib.label.toLowerCase()}.
        </p>
      ) : (
        <div className={cn('grid grid-cols-4 sm:grid-cols-3 gap-1 overflow-y-auto', slotsMax)}>
          {slots.map(s => {
            const isActive = slotChoisi === s.iso
            return (
              <button
                key={s.iso}
                onClick={() => s.disponible && setSlotChoisi(s.iso)}
                disabled={!s.disponible}
                className={cn(
                  'rounded text-xs font-bold tabular-nums transition-colors border flex flex-col items-center justify-center px-1 py-0.5',
                  compact ? 'min-h-[34px]' : 'min-h-[40px]',
                  !s.disponible
                    ? 'bg-zinc-900 text-zinc-600 border-zinc-800 line-through cursor-not-allowed opacity-50'
                    : isActive
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800',
                )}
                title={s.disponible ? `Réserver ${s.heure}` : 'Saturé'}
              >
                <span className="text-sm">{s.heure}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Sous-composant panier (réutilisé desktop sidebar + mobile bottom-sheet) ───
function PanierContent({
  panier, totalPanier, nbArticles, erreur, isPending,
  modifier, envoyer, onClose, hideHeader = false,
  tagsAReserver, slotsParTag, creneauxParTag, setSlotPourTag, loadingParTag,
  datesDispo, dateChoisie, setDateChoisie,
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
  tagsAReserver: TagPlanning[]
  slotsParTag: Partial<Record<TagPlanning, Slot[]>>
  creneauxParTag: Partial<Record<TagPlanning, string | null>>
  setSlotPourTag: (tag: TagPlanning, iso: string | null) => void
  loadingParTag: Partial<Record<TagPlanning, boolean>>
  datesDispo: Array<{ key: string; label: string; date: string }>
  dateChoisie: string
  setDateChoisie: (d: string) => void
}) {
  const isToday = dateChoisie === datesDispo[0]?.date
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

      {/* Sélecteur date + slot par tag — desktop uniquement (mobile = bande en haut du modal) */}
      {tagsAReserver.length > 0 && (
        <div className="border-t border-zinc-800 flex-shrink-0">
          <SelecteurDate
            datesDispo={datesDispo}
            dateChoisie={dateChoisie}
            setDateChoisie={setDateChoisie}
          />
          {tagsAReserver.map(tag => (
            <SelecteurSlotTag
              key={tag}
              tag={tag}
              slots={slotsParTag[tag] ?? []}
              slotChoisi={creneauxParTag[tag] ?? null}
              setSlotChoisi={iso => setSlotPourTag(tag, iso)}
              loading={!!loadingParTag[tag]}
              isToday={isToday}
            />
          ))}
        </div>
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
