'use client'

// Comptage des invendus à la fermeture. Pensé pour une main fatiguée à
// 19h30 : gros steppers − / +, produits groupés par famille, total € en
// permanence, un seul bouton Enregistrer. Repasser corrige (upsert).

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { enregistrerInvendus } from './actions'

type Produit = { id: string; nom: string; categorie: string; cout: number | null }
type Histo = { date: string; nom: string; quantite: number; cout: number | null }

const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export default function InvendusClient({
  produits, dejaSaisi, dateJour, historique,
}: {
  produits: Produit[]
  dejaSaisi: Record<string, number>
  dateJour: string
  historique: Histo[]
}) {
  const [quantites, setQuantites] = useState<Record<string, number>>(dejaSaisi)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const parFamille = useMemo(() => {
    const m = new Map<string, Produit[]>()
    for (const p of produits) {
      if (!m.has(p.categorie)) m.set(p.categorie, [])
      m.get(p.categorie)!.push(p)
    }
    return Array.from(m.entries())
  }, [produits])

  const totalJour = useMemo(() => produits.reduce((s, p) =>
    s + (quantites[p.id] ?? 0) * (p.cout ?? 0), 0), [produits, quantites])
  const nbPieces = useMemo(() => Object.values(quantites).reduce((s, q) => s + q, 0), [quantites])

  // Synthèse 7 jours : total € + produits les plus jetés
  const synth7j = useMemo(() => {
    let total = 0
    const parProduit = new Map<string, { q: number; eur: number }>()
    for (const h of historique) {
      const eur = h.quantite * (h.cout ?? 0)
      total += eur
      const cur = parProduit.get(h.nom) ?? { q: 0, eur: 0 }
      parProduit.set(h.nom, { q: cur.q + h.quantite, eur: cur.eur + eur })
    }
    const top = Array.from(parProduit.entries())
      .sort((a, b) => b[1].eur - a[1].eur).slice(0, 5)
    return { total, top }
  }, [historique])

  function bouger(id: string, delta: number) {
    setQuantites(q => {
      const v = Math.max(0, (q[id] ?? 0) + delta)
      return { ...q, [id]: v }
    })
  }

  function enregistrer() {
    setMessage('')
    startTransition(async () => {
      try {
        const r = await enregistrerInvendus({
          date_invendu: dateJour,
          lignes: produits.map(p => ({ recette_id: p.id, quantite: quantites[p.id] ?? 0 })),
        })
        setMessage(`✓ Enregistré — ${r.lignes} produit(s), ${fmtEur(r.cout_total_ht)} HT jetés`)
        router.refresh()
      } catch (e) {
        setMessage(`✗ ${e instanceof Error ? e.message : 'Erreur'}`)
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-zinc-100 pb-32">
      <header className="sticky top-0 z-20 bg-[#0D0D0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">🗑 Invendus du soir</h1>
            <p className="text-xs text-zinc-400">
              {new Date(dateJour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' · '}compte ce qui reste, le coût se calcule tout seul
            </p>
          </div>
          <Link href="/comptoir/fournil/kds" className="text-xs text-zinc-400 hover:text-zinc-200 shrink-0">
            ← Comptoir
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-6">
        {/* Synthèse 7 jours — la raison d'être du comptage */}
        {synth7j.total > 0 && (
          <section className="rounded-xl bg-zinc-900 ring-1 ring-zinc-800 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-1">7 derniers jours</p>
            <p className="text-2xl font-bold tabular-nums text-red-400">{fmtEur(synth7j.total)} <span className="text-sm text-zinc-400 font-normal">jetés</span></p>
            <ul className="mt-2 space-y-0.5 text-sm text-zinc-300">
              {synth7j.top.map(([nom, v]) => (
                <li key={nom} className="flex justify-between gap-2">
                  <span className="truncate">{nom}</span>
                  <span className="tabular-nums text-zinc-400 shrink-0">{v.q} pce · {fmtEur(v.eur)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-zinc-500">
              Un produit qui revient chaque soir = une commande fournisseur à réduire.
            </p>
          </section>
        )}

        {parFamille.map(([famille, prods]) => (
          <section key={famille}>
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">{famille}</h2>
            <ul className="space-y-1.5">
              {prods.map(p => {
                const q = quantites[p.id] ?? 0
                return (
                  <li key={p.id} className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 ring-1',
                    q > 0 ? 'bg-red-950/40 ring-red-900/60' : 'bg-zinc-900 ring-zinc-800',
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.nom}</p>
                      {q > 0 && p.cout != null && (
                        <p className="text-xs text-red-300 tabular-nums">{fmtEur(q * p.cout)} jetés</p>
                      )}
                    </div>
                    <button onClick={() => bouger(p.id, -1)} disabled={q === 0}
                      aria-label={`Retirer un ${p.nom}`}
                      className="h-12 w-12 rounded-lg bg-zinc-800 disabled:opacity-30 text-xl font-bold shrink-0">−</button>
                    <span className={cn('w-8 text-center text-lg font-bold tabular-nums shrink-0',
                      q > 0 ? 'text-red-300' : 'text-zinc-600')}>{q}</span>
                    <button onClick={() => bouger(p.id, +1)}
                      aria-label={`Ajouter un ${p.nom}`}
                      className="h-12 w-12 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xl font-bold shrink-0">＋</button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>

      {/* Barre d'action fixe */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#0D0D0D]/95 backdrop-blur border-t border-zinc-800 px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold tabular-nums leading-tight">
              {nbPieces} pièce{nbPieces > 1 ? 's' : ''} · <span className="text-red-400">{fmtEur(totalJour)}</span>
            </p>
            {message && <p className="text-xs text-zinc-400 truncate">{message}</p>}
          </div>
          <button onClick={enregistrer} disabled={isPending}
            className="min-h-[52px] px-6 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 font-bold shrink-0">
            {isPending ? '…' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
