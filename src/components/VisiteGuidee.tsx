'use client'

// ─── Panneau de visite guidée ────────────────────────────────────────
//
// Posé dans un coin de l'écran, JAMAIS en fenêtre modale. C'est la décision
// la plus importante de ce composant : un accompagnement qui empêche de
// travailler est fermé au premier client qui entre, et jamais rouvert.
//
// Il suit la personne d'écran en écran. Quand elle n'est pas sur la bonne
// route, il le dit et propose d'y aller — plutôt que de l'y envoyer de force,
// ce qui lui ferait perdre ce qu'elle était en train de faire.
//
// Réduit en pastille : la visite reste reprenable sans réoccuper l'écran.

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { visitePourPoste, VISITE_TERMINEE, type EtapeVisite } from '@/lib/visite-guidee'

export default function VisiteGuidee({
  poste, role, etapeInitiale,
}: {
  poste: string | null
  role: string | null
  /** null = jamais commencée, -1 = terminée/passée, N = étape en cours. */
  etapeInitiale: number | null
}) {
  const etapes = visitePourPoste(poste, role)
  const [etape, setEtape] = useState<number | null>(etapeInitiale)
  const [reduit, setReduit] = useState(false)
  const [, startTransition] = useTransition()
  const pathname = usePathname()
  const router = useRouter()

  // L'écriture ne bloque jamais l'interface : on avance à l'écran d'abord, on
  // enregistre ensuite. Si le réseau tombe, la personne continue sa visite —
  // elle la reprendra au pire une étape en arrière.
  function enregistrer(n: number) {
    void fetch('/api/visite-guidee', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etape: n }),
    }).catch(() => {})
  }

  function aller(n: number) {
    setEtape(n); enregistrer(n)
    const cible = etapes[n - 1]
    if (cible && cible.route !== pathname) startTransition(() => router.push(cible.route))
  }
  function terminer() { setEtape(VISITE_TERMINEE); enregistrer(VISITE_TERMINEE) }

  const [monte, setMonte] = useState(false)
  useEffect(() => { setMonte(true) }, [])
  if (!monte) return null
  if (etape === VISITE_TERMINEE) return null

  // Jamais commencée : on PROPOSE, on n'impose pas. Une visite qui démarre
  // toute seule et prend l'écran serait fermée en réflexe — et « Non merci »
  // doit être aussi visible que « Commencer », sinon c'est un piège à clic.
  if (etape === null) {
    return (
      <div className="fixed z-[60] bottom-0 right-0 left-0 sm:left-auto sm:bottom-4 sm:right-4 sm:w-[22rem]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="m-2 sm:m-0 rounded-xl bg-white text-zinc-900 shadow-2xl ring-1 ring-zinc-200 p-4 space-y-3">
          <p className="font-bold text-sm flex items-center gap-2">
            <span aria-hidden>🧭</span> Première visite ?
          </p>
          <p className="text-sm text-zinc-700 leading-relaxed">
            Je peux t&apos;accompagner écran par écran — {etapes.length} étapes,
            une quinzaine de minutes. Tu peux l&apos;interrompre et la reprendre
            quand tu veux, même sur une autre machine.
          </p>
          <div className="flex gap-2">
            <button onClick={terminer}
              className="flex-1 min-h-[44px] rounded-lg bg-zinc-100 hover:bg-zinc-200 text-sm font-bold">
              Non merci
            </button>
            <button onClick={() => aller(1)}
              className="flex-[2] min-h-[44px] rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold">
              Commencer
            </button>
          </div>
        </div>
      </div>
    )
  }

  const idx = Math.min(Math.max(etape, 1), etapes.length)
  const e: EtapeVisite | undefined = etapes[idx - 1]
  if (!e) return null
  const surPlace = pathname === e.route
  const dernier = idx >= etapes.length

  if (reduit) {
    return (
      <button onClick={() => setReduit(false)}
        className="fixed bottom-4 right-4 z-[60] h-12 px-4 rounded-full bg-zinc-900 text-white
                   shadow-lg text-sm font-bold flex items-center gap-2 hover:bg-zinc-800"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <span aria-hidden>🧭</span> Visite {idx}/{etapes.length}
      </button>
    )
  }

  return (
    <div
      role="complementary" aria-label="Visite guidée"
      className="fixed z-[60] bottom-0 right-0 left-0 sm:left-auto sm:bottom-4 sm:right-4 sm:w-[24rem]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="m-2 sm:m-0 rounded-xl bg-white text-zinc-900 shadow-2xl ring-1 ring-zinc-200 overflow-hidden">

        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white">
          <span aria-hidden>🧭</span>
          <span className="text-xs font-bold tracking-wide">
            VISITE GUIDÉE · {idx}/{etapes.length}
          </span>
          <button onClick={() => setReduit(true)}
            className="ml-auto h-8 px-2 text-xs text-zinc-300 hover:text-white" aria-label="Réduire">
            Réduire
          </button>
        </div>

        <div className="h-1 bg-zinc-200">
          <div className="h-full bg-emerald-500 transition-all"
            style={{ width: `${(idx / etapes.length) * 100}%` }} />
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <h2 className="font-bold text-base leading-snug">{e.titre}</h2>
          <p className="text-sm text-zinc-700 leading-relaxed">{e.corps}</p>

          {e.piege && (
            <p className="text-sm rounded-lg bg-red-50 text-red-900 ring-1 ring-red-200 px-3 py-2 leading-relaxed">
              <strong>⚠ </strong>{e.piege}
            </p>
          )}

          {!surPlace && (
            <button onClick={() => startTransition(() => router.push(e.route))}
              className="w-full min-h-[44px] rounded-lg bg-zinc-100 hover:bg-zinc-200
                         text-sm font-bold text-zinc-800">
              Ouvrir cet écran →
            </button>
          )}
          {surPlace && e.geste && (
            <p className="text-xs text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200
                          rounded-lg px-3 py-2">
              À essayer maintenant : <strong>{e.geste}</strong>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-200 bg-zinc-50">
          <button onClick={terminer}
            className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2">
            Passer la visite
          </button>
          <div className="ml-auto flex gap-2">
            {idx > 1 && (
              <button onClick={() => aller(idx - 1)}
                className="min-h-[40px] px-3 rounded-lg bg-white ring-1 ring-zinc-300
                           text-sm font-bold hover:bg-zinc-100">
                ←
              </button>
            )}
            <button onClick={() => (dernier ? terminer() : aller(idx + 1))}
              className="min-h-[40px] px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800
                         text-white text-sm font-bold">
              {dernier ? 'Terminer' : 'Suivant →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
