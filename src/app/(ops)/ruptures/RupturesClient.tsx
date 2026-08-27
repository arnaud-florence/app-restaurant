'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { basculerRupture } from './actions'

type Produit = { id: string; nom: string; categorie: string; enRupture: boolean }

export default function RupturesClient({ produits }: { produits: Produit[] }) {
  const router = useRouter()
  const [recherche, setRecherche] = useState('')
  const [local, setLocal] = useState<Record<string, boolean>>(
    () => Object.fromEntries(produits.map(p => [p.id, p.enRupture])),
  )
  const [, startTransition] = useTransition()
  const [erreur, setErreur] = useState('')

  const groupes = useMemo(() => {
    const m = new Map<string, Produit[]>()
    for (const p of produits) {
      if (recherche.trim() && !p.nom.toLowerCase().includes(recherche.toLowerCase())) continue
      if (!m.has(p.categorie)) m.set(p.categorie, [])
      m.get(p.categorie)!.push(p)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [produits, recherche])

  const nbRuptures = Object.values(local).filter(Boolean).length

  function basculer(p: Produit) {
    const voulu = !local[p.id]
    // Bascule optimiste : en plein service, attendre le serveur pour voir le
    // bouton changer de couleur donne l'impression que rien ne s'est passé,
    // et on tape deux fois.
    setLocal(s => ({ ...s, [p.id]: voulu }))
    setErreur('')
    startTransition(async () => {
      try {
        await basculerRupture({ recette_id: p.id, rupture: voulu })
        router.refresh()
      } catch (e) {
        setLocal(s => ({ ...s, [p.id]: !voulu }))
        setErreur(e instanceof Error ? e.message : 'Échec de l\'enregistrement')
      }
    })
  }

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-zinc-100 pb-16">
      <header
        className="sticky top-0 z-10 bg-[#0D0D0D]/95 backdrop-blur border-b border-zinc-800 px-4 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-black">🚫 Ruptures du jour</h1>
          <span className={nbRuptures > 0 ? 'text-amber-400 font-bold tabular-nums' : 'text-zinc-500 tabular-nums'}>
            {nbRuptures} en rupture
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Coupe la vente en ligne et prévient la caisse. La vente au comptoir
          continue. Tout se remet à zéro demain matin.
        </p>
        <input
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Chercher un produit…"
          className="mt-2 w-full h-12 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-base"
        />
        {erreur && <p className="mt-2 text-sm text-red-400">{erreur}</p>}
      </header>

      <div className="px-4 py-3 space-y-5">
        {groupes.length === 0 ? (
          <p className="text-center text-zinc-500 py-12">Aucun produit ne correspond.</p>
        ) : groupes.map(([cat, liste]) => (
          <section key={cat}>
            <h2 className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold mb-2">{cat}</h2>
            <ul className="space-y-1.5">
              {liste.map(p => {
                const off = local[p.id]
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => basculer(p)}
                      className={[
                        'w-full text-left min-h-[56px] px-4 rounded-xl border-2 flex items-center justify-between gap-3 transition-colors',
                        off
                          ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-200',
                      ].join(' ')}
                    >
                      <span className={off ? 'font-bold' : ''}>{p.nom}</span>
                      <span className="text-sm font-bold shrink-0">
                        {off ? '🚫 plus rien' : 'disponible'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <nav className="fixed bottom-0 inset-x-0 bg-[#0D0D0D]/95 backdrop-blur border-t border-zinc-800 px-4 py-2 flex gap-4 text-sm text-zinc-400">
        <Link href="/inventaire" className="py-2">📦 Inventaire</Link>
        <Link href="/invendus" className="py-2">🗑 Invendus</Link>
      </nav>
    </main>
  )
}
