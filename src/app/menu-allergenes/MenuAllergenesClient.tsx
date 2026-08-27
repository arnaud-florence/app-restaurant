'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { type Allergene, ALLERGENES_EU, ALLERGENE_INFO } from '@/lib/allergenes'
import type { PlatPublic } from './page'

const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export default function MenuAllergenesClient({
  plats, nomEtablissement,
}: {
  plats: PlatPublic[]
  nomEtablissement: string
}) {
  // Mode "j'évite" : les plats contenant l'un des allergènes sélectionnés
  // sont grisés. Mode neutre : tout est affiché clairement.
  const [eviter, setEviter] = useState<Set<Allergene>>(new Set())

  function toggle(a: Allergene) {
    setEviter(prev => {
      const n = new Set(prev)
      if (n.has(a)) n.delete(a); else n.add(a)
      return n
    })
  }

  const groupes = useMemo(() => {
    const m = new Map<string, PlatPublic[]>()
    for (const p of plats) {
      if (!m.has(p.categorie)) m.set(p.categorie, [])
      m.get(p.categorie)!.push(p)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [plats])

  // ⚠️ Un plat non vérifié n'est PAS compatible : il est inconnu. Le compter
  // comme compatible annonçait « 85 / 85 plats compatibles » à un client
  // allergique au gluten, alors qu'aucun produit n'avait été vérifié.
  const nbPlatsCompatibles = eviter.size === 0
    ? plats.length
    : plats.filter(p => p.valide && !p.allergenes.some(a => eviter.has(a))).length
  const nbPlatsInconnus = plats.filter(p => !p.valide).length

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <style>{`
        @media print {
          @page { size: A4; margin: 1cm; }
          .no-print { display: none !important; }
          body { background: white; }
          .plat-incompatible { opacity: 1 !important; }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-zinc-200 print:border-zinc-900">
        <div className="max-w-3xl mx-auto px-4 py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{nomEtablissement}</p>
          <h1 className="text-2xl font-bold mt-0.5">⚠️ Menu — fiche allergènes</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Liste réglementaire des 14 allergènes (Règl. UE 1169/2011) présents dans nos plats.
          </p>
        </div>
      </header>

      {/* Filtres : "j'évite ces allergènes" */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-zinc-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
            Touche un allergène pour griser les plats à éviter
          </p>
          <div className="flex flex-wrap gap-1">
            {ALLERGENES_EU.map(a => {
              const info = ALLERGENE_INFO[a]
              const sel = eviter.has(a)
              return (
                <button key={a} onClick={() => toggle(a)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 h-9 rounded-full text-xs font-bold border transition-colors',
                    sel ? info.cls + ' border-current ring-2 ring-current ring-offset-1' : 'bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50',
                  )}>
                  {info.emoji} {info.label}
                </button>
              )
            })}
            {eviter.size > 0 && (
              <button onClick={() => setEviter(new Set())}
                className="inline-flex items-center px-3 h-9 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                ✕ Réinitialiser
              </button>
            )}
          </div>
          {eviter.size > 0 && (
            <p className="text-xs text-zinc-600 mt-2">
              <b className="text-emerald-700">{nbPlatsCompatibles}</b> / {plats.length} plats compatibles avec votre régime.
              {nbPlatsInconnus > 0 && (
                <span className="block text-amber-800 font-semibold mt-0.5">
                  {nbPlatsInconnus} plat{nbPlatsInconnus > 1 ? 's' : ''} dont la composition
                  n&apos;est pas encore vérifiée — demandez-nous avant de commander.
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Liste plats par catégorie */}
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-5">
        {groupes.length === 0 ? (
          <p className="text-center py-12 text-zinc-400">Aucun plat actif au menu.</p>
        ) : groupes.map(([cat, items]) => (
          <section key={cat}>
            <h2 className="text-base font-bold uppercase tracking-wider text-zinc-700 border-b-2 border-zinc-300 pb-1 mb-2">{cat}</h2>
            <ul className="divide-y divide-zinc-100 bg-white rounded-lg border border-zinc-200 overflow-hidden">
              {items.map(p => {
                const incompatible = eviter.size > 0 && p.allergenes.some(a => eviter.has(a))
                // Un produit non vérifié ne peut pas passer un filtre « sans
                // gluten » comme s'il était sûr : sa liste est vide parce que
                // personne n'a regardé, pas parce qu'il ne contient rien.
                const incertain = eviter.size > 0 && !p.valide
                return (
                  <li key={p.id} className={cn(
                    'px-3 py-2.5',
                    incompatible && 'plat-incompatible opacity-30',
                    !incompatible && incertain && 'bg-amber-50/60 border-l-4 border-amber-400',
                  )}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-bold text-sm">{p.nom}</h3>
                      <span className="text-sm font-bold tabular-nums text-zinc-700 shrink-0">{fmtPrix(p.prix_vente_ht)}</span>
                    </div>
                    {p.description && <p className="text-xs text-zinc-600 mt-0.5">{p.description}</p>}
                    {/* ⚠️ Une liste vide ne suffit PAS à dire « aucun allergène ».
                        Tant que personne n'a vérifié le produit, afficher une
                        coche verte revient à affirmer à un client allergique
                        qu'un croissant ne contient pas de gluten. */}
                    {!p.valide ? (
                      <p className="text-[10px] text-amber-900 bg-amber-100 border border-amber-300 rounded px-1.5 py-1 mt-1 font-semibold">
                        ⚠ Information allergènes non disponible — {incertain
                          ? 'ne peut pas être garanti sans allergène, demandez-nous'
                          : 'demandez-nous avant de commander'}
                      </p>
                    ) : p.allergenes.length === 0 ? (
                      <p className="text-[10px] text-emerald-700 mt-1">✓ Aucun des 14 allergènes réglementaires</p>
                    ) : (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.allergenes.map(a => {
                          const info = ALLERGENE_INFO[a]
                          const flagged = eviter.has(a)
                          return (
                            <span key={a}
                              className={cn(
                                'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                                info.cls,
                                flagged && 'ring-2 ring-red-500 ring-offset-1',
                              )}>
                              {info.emoji} {info.label}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <p className="text-[11px] text-zinc-400 text-center pt-4 italic">
          Si vous avez une allergie sévère, signalez-la à votre serveur avant de commander.
          Liste indicative — ingrédients susceptibles d&apos;évoluer selon disponibilités fournisseurs.
        </p>
      </main>
    </div>
  )
}
