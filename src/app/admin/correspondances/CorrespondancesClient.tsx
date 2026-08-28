'use client'

// Une ligne, une cible, un geste. L'écran ne sert que si le rattachement
// coûte moins cher que de ne pas le faire — d'où les suggestions cliquables
// et la recherche par frappe plutôt qu'un menu de 120 entrées.

import { useMemo, useState, useTransition } from 'react'
import { rattacherLigne, ignorerLigne } from './actions'

type Cible = { cle: string; label: string; sous: string; dejaRef: boolean }
type Ligne = {
  id: string; description: string; reference: string | null
  quantite: number | null; unite: string | null
  prix_unitaire_ht: number | null; total_ht: number | null
  suggestions: Array<{ cle: string; label: string; sous: string; score: number }>
}

export default function CorrespondancesClient({ lignes, cibles }: { lignes: Ligne[]; cibles: Cible[] }) {
  const [faites, setFaites] = useState<Record<string, string>>({})
  const [enCours, demarrer] = useTransition()

  const restantes = lignes.filter(l => !faites[l.id])

  return (
    <div className="mt-6 space-y-3">
      {restantes.map(l => (
        <Rangee key={l.id} ligne={l} cibles={cibles} enCours={enCours}
          onFait={(msg) => setFaites(f => ({ ...f, [l.id]: msg }))} demarrer={demarrer} />
      ))}
      {Object.keys(faites).length > 0 && (
        <p className="pt-4 text-sm text-emerald-700 font-semibold">
          {Object.keys(faites).length} ligne(s) traitée(s) dans cette session.
        </p>
      )}
    </div>
  )
}

function Rangee({ ligne, cibles, enCours, onFait, demarrer }: {
  ligne: Ligne; cibles: Cible[]; enCours: boolean
  onFait: (msg: string) => void; demarrer: (fn: () => void) => void
}) {
  const [q, setQ] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const trouves = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return cibles.filter(c => c.label.toLowerCase().includes(t)).slice(0, 8)
  }, [q, cibles])

  const rattacher = (cle: string) => demarrer(async () => {
    const r = await rattacherLigne({ ligneId: ligne.id, cible: cle, apprendreReference: true })
    if (r.ok) onFait(r.referenceApprise ? 'rattachée, référence apprise' : 'rattachée')
    else setErreur(r.error)
  })

  return (
    <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-zinc-900">{ligne.description}</p>
        <p className="text-sm text-zinc-500 tabular-nums shrink-0">
          {ligne.quantite ?? '—'} {ligne.unite ?? ''} · {ligne.prix_unitaire_ht ?? '—'} € /u
          {ligne.reference && <span className="ml-2 font-mono text-xs text-zinc-400">réf. {ligne.reference}</span>}
        </p>
      </div>

      {ligne.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ligne.suggestions.map(s => (
            <button key={s.cle} type="button" disabled={enCours} onClick={() => rattacher(s.cle)}
              className="min-h-[44px] rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50">
              {s.label}<span className="ml-2 font-normal text-emerald-700/70">{s.sous}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un produit ou une matière…"
          className="h-11 flex-1 min-w-[220px] rounded-lg border border-zinc-300 px-3 text-sm" />
        <button type="button" disabled={enCours}
          onClick={() => demarrer(async () => { const r = await ignorerLigne(ligne.id); if (r.ok) onFait('écartée'); else setErreur(r.error) })}
          className="min-h-[44px] rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
          Écarter
        </button>
      </div>

      {trouves.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {trouves.map(c => (
            <button key={c.cle} type="button" disabled={enCours} onClick={() => rattacher(c.cle)}
              className="min-h-[40px] rounded-lg border border-zinc-300 px-3 text-sm hover:bg-zinc-50 disabled:opacity-50">
              {c.label}<span className="ml-2 text-zinc-400">{c.sous}</span>
              {c.dejaRef && <span className="ml-2 text-[11px] text-amber-700">réf. déjà posée</span>}
            </button>
          ))}
        </div>
      )}

      {erreur && <p className="mt-2 text-sm text-red-700">{erreur}</p>}
    </div>
  )
}
