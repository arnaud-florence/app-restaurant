'use client'

// Comptage d'inventaire — pensé pour la réserve, téléphone à la main :
// saisie DIRECTE du nombre (un carton de 96 ne se tape pas au stepper),
// ± pour ajuster, repère « la dernière fois : N » sous chaque produit,
// valeur du stock en euros mise à jour en continu.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { enregistrerInventaire } from './actions'

type Produit = { id: string; nom: string; categorie: string; cout: number | null }

const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export default function InventaireClient({
  produits, dejaSaisi, precedent, datePrecedente, valeurPrecedente, dateJour,
}: {
  produits: Produit[]
  dejaSaisi: Record<string, number>
  precedent: Record<string, number>
  datePrecedente: string | null
  valeurPrecedente: number
  dateJour: string
}) {
  const [quantites, setQuantites] = useState<Record<string, number>>(dejaSaisi)
  const [date, setDate] = useState(dateJour)
  const [filtre, setFiltre] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase()
    return q ? produits.filter(p => p.nom.toLowerCase().includes(q)) : produits
  }, [produits, filtre])

  const parFamille = useMemo(() => {
    const m = new Map<string, Produit[]>()
    for (const p of visibles) {
      if (!m.has(p.categorie)) m.set(p.categorie, [])
      m.get(p.categorie)!.push(p)
    }
    return Array.from(m.entries())
  }, [visibles])

  const valeur = useMemo(() => produits.reduce((s, p) =>
    s + (quantites[p.id] ?? 0) * (p.cout ?? 0), 0), [produits, quantites])
  const nbComptes = useMemo(() =>
    Object.values(quantites).filter(q => q > 0).length, [quantites])

  function fixer(id: string, v: number) {
    setQuantites(q => ({ ...q, [id]: Math.max(0, Math.min(9999, v)) }))
  }

  function enregistrer() {
    setMessage('')
    startTransition(async () => {
      try {
        const r = await enregistrerInventaire({
          date_inventaire: date,
          lignes: produits.map(p => ({ cible: p.id, quantite: quantites[p.id] ?? 0 })),
        })
        setMessage(`✓ Inventaire enregistré — ${r.lignes} produit(s), stock ${fmtEur(r.valeur_ht)} HT`)
        router.refresh()
      } catch (e) {
        setMessage(`✗ ${e instanceof Error ? e.message : 'Erreur'}`)
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-zinc-100 pb-36">
      <header className="sticky top-0 z-20 bg-[#0D0D0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold">📦 Inventaire du stock</h1>
            <Link href="/comptoir/fournil/kds" className="text-xs text-zinc-400 hover:text-zinc-200 shrink-0">← Comptoir</Link>
          </div>
          <div className="flex gap-2">
            <input type="date" value={date} max={dateJour}
              onChange={e => setDate(e.target.value)}
              aria-label="Date de l'inventaire"
              className="h-11 px-3 rounded-lg bg-zinc-900 ring-1 ring-zinc-800 text-sm tabular-nums" />
            <input value={filtre} onChange={e => setFiltre(e.target.value)}
              placeholder="🔍 Chercher un produit…"
              className="flex-1 h-11 px-3 rounded-lg bg-zinc-900 ring-1 ring-zinc-800 text-sm min-w-0" />
          </div>
          {datePrecedente && (
            <p className="text-xs text-zinc-500">
              Dernier inventaire : {new Date(datePrecedente + 'T12:00:00').toLocaleDateString('fr-FR')}
              {' · '}stock valorisé {fmtEur(valeurPrecedente)} HT — les repères « dernière fois » viennent de lui.
            </p>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-6">
        {parFamille.map(([famille, prods]) => (
          <section key={famille}>
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">{famille}</h2>
            <ul className="space-y-1.5">
              {prods.map(p => {
                const q = quantites[p.id] ?? 0
                const avant = precedent[p.id]
                return (
                  <li key={p.id} className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 ring-1',
                    q > 0 ? 'bg-emerald-950/30 ring-emerald-900/50' : 'bg-zinc-900 ring-zinc-800',
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.nom}</p>
                      <p className="text-xs text-zinc-500 tabular-nums">
                        {avant != null && `dernière fois : ${avant}`}
                        {avant != null && p.cout != null && ' · '}
                        {p.cout != null && q > 0 && <span className="text-emerald-300">{fmtEur(q * p.cout)}</span>}
                      </p>
                    </div>
                    <button onClick={() => fixer(p.id, q - 1)} disabled={q === 0}
                      aria-label={`Retirer un ${p.nom}`}
                      className="h-12 w-11 rounded-lg bg-zinc-800 disabled:opacity-30 text-xl font-bold shrink-0">−</button>
                    <input
                      type="number" inputMode="numeric" min={0} max={9999}
                      value={q === 0 ? '' : q}
                      placeholder="0"
                      onChange={e => fixer(p.id, e.target.value === '' ? 0 : Number(e.target.value))}
                      aria-label={`Quantité en stock de ${p.nom}`}
                      className={cn('h-12 w-16 rounded-lg bg-zinc-950 ring-1 text-center text-lg font-bold tabular-nums shrink-0',
                        q > 0 ? 'ring-emerald-700 text-emerald-300' : 'ring-zinc-700 text-zinc-500')} />
                    <button onClick={() => fixer(p.id, q + 1)}
                      aria-label={`Ajouter un ${p.nom}`}
                      className="h-12 w-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xl font-bold shrink-0">＋</button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#0D0D0D]/95 backdrop-blur border-t border-zinc-800 px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold tabular-nums leading-tight">
              {nbComptes} produit{nbComptes > 1 ? 's' : ''} · <span className="text-emerald-400">{fmtEur(valeur)}</span>
            </p>
            <p className="text-xs text-zinc-500 truncate">
              {message || 'Valeur du stock compté (HT, au coût d’achat du jour)'}
            </p>
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
