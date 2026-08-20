'use client'

import { useState, useTransition } from 'react'
import { synchroniserSumUp, type ResultatSync } from './actions'

export default function SyncSumUpClient() {
  const [jours, setJours] = useState(7)
  const [res, setRes] = useState<ResultatSync | null>(null)
  const [enCours, demarrer] = useTransition()

  function lancer() {
    setRes(null)
    demarrer(async () => setRes(await synchroniserSumUp(jours)))
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="font-bold text-zinc-900">Synchroniser SumUp</h2>
      <p className="text-sm text-zinc-600 mt-1">
        Récupère les transactions SumUp et les fait entrer dans le chiffre d’affaires.
        Rejouable sans risque : un ticket déjà importé n’est jamais compté deux fois.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-zinc-700">
          Derniers
          <input
            type="number" min={1} max={60} value={jours}
            onChange={e => setJours(Number(e.target.value))}
            className="mx-2 w-20 h-12 rounded-lg border border-zinc-300 px-3 text-lg tabular-nums text-right"
          />
          jours
        </label>
        <button
          onClick={lancer}
          disabled={enCours}
          className="min-h-[48px] px-5 rounded-xl bg-zinc-900 text-white font-bold disabled:opacity-40"
        >
          {enCours ? 'Synchronisation…' : 'Lancer la synchronisation'}
        </button>
      </div>

      {res && (
        <div className={`mt-4 rounded-xl border p-3 text-sm ${res.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>
          <p className="font-bold">{res.ok ? '✓' : '✗'} {res.message}</p>
          {res.detail && (
            <pre className="mt-2 text-[11px] whitespace-pre-wrap break-all opacity-80">{res.detail}</pre>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
        <strong>À vérifier au premier lancement :</strong> l’API SumUp expose les paiements
        qu’elle traite. Si vos ventes en espèces saisies sur SumUp Caisse n’apparaissent pas
        dans le résultat ci-dessus, le chiffre d’affaires remonté ne sera que le CA carte —
        et il faudra passer par l’export de SumUp Caisse plutôt que par cette API.
      </p>
    </section>
  )
}
