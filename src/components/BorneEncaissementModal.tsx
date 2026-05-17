'use client'

/**
 * Modal d'encaissement d'une commande BORNE COMPTOIR.
 * S'ouvre APRÈS validation du PIN manager (gate dans CaisseBorneBanner).
 *
 * Fonctionnalités :
 *   - Affiche les articles de la commande + total
 *   - Choix mode paiement (carte, espèces, ticket resto, virement, autre)
 *   - Saisie montant (défaut = total)
 *   - Saisie pourboire optionnelle
 *   - Bouton "Encaisser → cuisine" qui valide
 *
 * Au succès : la commande bascule de 'en_attente_paiement_comptoir' → 'en_attente'
 * et part en préparation. Disparaît du banner, apparaît dans l'agenda.
 */

import { useEffect, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { fmtPrix } from '@/lib/service'
import { encaisserBorne, getCommandeBorneDetails } from '@/app/borne/actions'

type Methode = 'especes' | 'carte' | 'ticket_resto' | 'virement' | 'autre'

const METHODES: Array<{ key: Methode; label: string; emoji: string; bg: string }> = [
  { key: 'carte',        label: 'Carte',         emoji: '💳', bg: 'bg-blue-500 hover:bg-blue-400' },
  { key: 'especes',      label: 'Espèces',       emoji: '💵', bg: 'bg-emerald-500 hover:bg-emerald-400' },
  { key: 'ticket_resto', label: 'Ticket resto',  emoji: '🎫', bg: 'bg-amber-500 hover:bg-amber-400' },
  { key: 'virement',     label: 'Virement',      emoji: '🏦', bg: 'bg-violet-500 hover:bg-violet-400' },
]

type Article = {
  id: string
  quantite: number
  prix_unitaire_ht: number
  tag_destination: string
  recette: { nom?: string } | { nom?: string }[] | null
}

type CommandeDetails = {
  id: string
  numero: string
  montant_total_ttc: number
  montant_total_ht: number
  tva_total: number | null
  borne_id: string | null
  created_at: string
  commande_articles: Article[]
}

export default function BorneEncaissementModal({
  commandeId, total, onClose, onSuccess,
}: {
  commandeId: string
  total: number  // total TTC pré-affiché depuis le banner (le détail charge ensuite)
  onClose: () => void
  onSuccess: () => void
}) {
  const [details, setDetails] = useState<CommandeDetails | null>(null)
  const [methode, setMethode] = useState<Methode | null>(null)
  const [montant, setMontant] = useState<number>(total)
  const [pourboire, setPourboire] = useState<number>(0)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Charge les détails commande (articles) au montage
  useEffect(() => {
    let active = true
    getCommandeBorneDetails(commandeId)
      .then(d => {
        if (!active) return
        if (d) {
          setDetails({
            id: d.id as string,
            numero: d.numero as string,
            montant_total_ttc: Number(d.montant_total_ttc ?? total),
            montant_total_ht: Number(d.montant_total_ht ?? 0),
            tva_total: d.tva_total !== null ? Number(d.tva_total) : null,
            borne_id: (d.borne_id as string) ?? null,
            created_at: d.created_at as string,
            commande_articles: (d.commande_articles ?? []) as Article[],
          })
          setMontant(Number(d.montant_total_ttc ?? total))
        }
      })
      .catch(e => setErreur(e instanceof Error ? e.message : 'Erreur'))
    return () => { active = false }
  }, [commandeId, total])

  function encaisser() {
    if (!methode) { setErreur('Sélectionne un mode de paiement'); return }
    if (montant <= 0) { setErreur('Montant invalide'); return }
    setErreur(null)
    startTransition(async () => {
      try {
        await encaisserBorne({
          commande_id: commandeId,
          methode,
          montant,
          pourboire: pourboire || 0,
        })
        onSuccess()
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  const articles = details?.commande_articles ?? []

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-stretch justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl bg-zinc-950 rounded-2xl border-2 border-zinc-800 shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="shrink-0 px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/15 text-red-300 ring-1 ring-red-500/40 text-xl">🛍</span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Borne — encaissement comptoir</p>
              <h2 className="font-display italic text-2xl text-white">
                Commande #{details?.numero?.slice(-4) ?? commandeId.slice(-4)}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xl">×</button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 min-h-0">
          {/* ─── Articles ─── */}
          <section className="space-y-2">
            <h3 className="font-display italic text-lg text-white mb-2">Articles</h3>
            {details === null ? (
              <p className="text-zinc-500 italic text-sm">Chargement…</p>
            ) : articles.length === 0 ? (
              <p className="text-zinc-500 italic text-sm">Aucun article (anomalie)</p>
            ) : (
              <ul className="space-y-1.5">
                {articles.map(a => {
                  const nom = Array.isArray(a.recette)
                    ? a.recette[0]?.nom ?? '—'
                    : a.recette?.nom ?? '—'
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-zinc-800 text-emerald-400 font-black tabular-nums text-xs">
                          ×{a.quantite}
                        </span>
                        <p className="text-sm font-medium text-white truncate">{nom}</p>
                      </div>
                      <p className="text-sm font-black tabular-nums text-zinc-300">
                        {fmtPrix(a.quantite * Number(a.prix_unitaire_ht ?? 0) * 1.10)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ─── Récap + Paiement ─── */}
          <section className="space-y-4">
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/40 p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-emerald-300 font-black">Total à encaisser</p>
              <p className="font-display italic text-4xl font-medium tabular-nums text-white mt-1">
                {fmtPrix(details?.montant_total_ttc ?? total)}
              </p>
            </div>

            {/* Choix mode paiement */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">Mode de paiement</p>
              <div className="grid grid-cols-2 gap-2">
                {METHODES.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMethode(m.key)}
                    className={cn(
                      'h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95',
                      methode === m.key
                        ? cn(m.bg, 'text-white shadow-lg ring-2 ring-white/30')
                        : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-600',
                    )}
                  >
                    <span className="text-xl">{m.emoji}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Montant + pourboire */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Montant €</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  value={montant}
                  onChange={e => setMontant(parseFloat(e.target.value) || 0)}
                  className="w-full h-12 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xl tabular-nums text-right mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Pourboire €</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min="0"
                  value={pourboire}
                  onChange={e => setPourboire(parseFloat(e.target.value) || 0)}
                  className="w-full h-12 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xl tabular-nums text-right mt-1"
                />
              </div>
            </div>

            {erreur && (
              <p className="text-red-400 text-sm font-bold">⚠ {erreur}</p>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t-2 border-zinc-800 bg-zinc-950 flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="h-14 px-5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black uppercase tracking-wider text-sm disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={encaisser}
            disabled={pending || !methode || montant <= 0}
            className={cn(
              'flex-1 h-14 rounded-xl font-black uppercase tracking-wider text-base transition-all active:scale-95',
              pending || !methode || montant <= 0
                ? 'bg-zinc-800 text-zinc-500'
                : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/40',
            )}
          >
            {pending ? '⏳ Encaissement…' : '✓ Encaisser → cuisine'}
          </button>
        </div>
      </div>
    </div>
  )
}
