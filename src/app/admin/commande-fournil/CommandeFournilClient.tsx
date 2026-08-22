'use client'

// Tableau des suggestions + quantités ajustables + copie de la commande.
//
// La suggestion est un POINT DE DÉPART : le gérant sait des choses que les
// chiffres ignorent (le marché de dimanche, le car de touristes annoncé).
// Chaque colis s'ajuste en ± ; « Copier la commande » produit la liste
// texte prête à coller dans un e-mail ou un SMS à Gineys.

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export type LigneSuggestion = {
  nom: string
  categorie: string
  ventesJour: number
  casseJour: number
  conditionnement: number | null
  pieces: number
  colis: number | null
  piecesLivrees: number | null
  surCommande: boolean
}

export default function CommandeFournilClient({
  lignes, joursACouvrir,
}: { lignes: LigneSuggestion[]; joursACouvrir: number }) {
  // Quantité retenue par produit : colis si connu, sinon pièces
  const [retenu, setRetenu] = useState<Record<string, number>>(() =>
    Object.fromEntries(lignes.map(l => [l.nom, l.colis ?? l.pieces])))
  const [copie, setCopie] = useState(false)

  const parFamille = useMemo(() => {
    const m = new Map<string, LigneSuggestion[]>()
    for (const l of lignes) {
      if (!m.has(l.categorie)) m.set(l.categorie, [])
      m.get(l.categorie)!.push(l)
    }
    return Array.from(m.entries())
  }, [lignes])

  function bouger(nom: string, delta: number) {
    setRetenu(r => ({ ...r, [nom]: Math.max(0, (r[nom] ?? 0) + delta) }))
  }

  async function copier() {
    const date = new Date().toLocaleDateString('fr-FR')
    const txt = [
      `Commande CasaTasia — Le Fournil (${date}, couverture ${joursACouvrir} j)`,
      '',
      ...lignes
        .filter(l => (retenu[l.nom] ?? 0) > 0)
        .map(l => l.conditionnement != null
          ? `• ${l.nom} : ${retenu[l.nom]} colis de ${l.conditionnement}`
          : `• ${l.nom} : ${retenu[l.nom]} pièce(s)`),
    ].join('\n')
    await navigator.clipboard.writeText(txt)
    setCopie(true)
    setTimeout(() => setCopie(false), 2500)
  }

  if (lignes.length === 0) {
    return <p className="text-sm text-zinc-500 py-8 text-center">Aucune vente sur les 14 derniers jours — rien à suggérer.</p>
  }

  return (
    <div className="space-y-5 pb-24">
      {parFamille.map(([famille, prods]) => (
        <section key={famille} className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <h2 className="px-4 py-2 text-xs uppercase tracking-wider text-zinc-500 font-bold bg-zinc-50 border-b border-zinc-200">
            {famille}
          </h2>
          <ul className="divide-y divide-zinc-100">
            {prods.map(l => {
              const q = retenu[l.nom] ?? 0
              return (
                <li key={l.nom} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 truncate">
                      {l.nom}
                      {l.surCommande && (
                        <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                          ⚠ casse élevée — réduit
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 tabular-nums">
                      {l.ventesJour.toLocaleString('fr-FR')}/j vendu
                      {l.casseJour > 0 && <span className="text-red-600"> · {l.casseJour.toLocaleString('fr-FR')}/j jeté</span>}
                      {l.conditionnement != null && ` · colis de ${l.conditionnement}`}
                    </p>
                  </div>
                  <button onClick={() => bouger(l.nom, -1)} disabled={q === 0}
                    aria-label={`Réduire ${l.nom}`}
                    className="h-11 w-11 rounded-lg border border-zinc-300 disabled:opacity-30 text-lg font-bold shrink-0">−</button>
                  <div className="w-20 text-center shrink-0">
                    <p className={cn('text-lg font-black tabular-nums leading-none', q === 0 ? 'text-zinc-300' : 'text-zinc-900')}>{q}</p>
                    <p className="text-[10px] text-zinc-400">{l.conditionnement != null ? 'colis' : 'pièces'}</p>
                  </div>
                  <button onClick={() => bouger(l.nom, +1)}
                    aria-label={`Augmenter ${l.nom}`}
                    className="h-11 w-11 rounded-lg border border-zinc-300 hover:border-zinc-500 text-lg font-bold shrink-0">＋</button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t border-zinc-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 tabular-nums">
            {lignes.filter(l => (retenu[l.nom] ?? 0) > 0).length} produit(s) dans la commande
          </p>
          <button onClick={copier}
            className="min-h-[48px] px-5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">
            {copie ? '✓ Copiée !' : '📋 Copier la commande'}
          </button>
        </div>
      </div>
    </div>
  )
}
