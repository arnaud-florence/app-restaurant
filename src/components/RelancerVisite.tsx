'use client'

// Relancer la visite guidée.
//
// Sans ce bouton, un « Non merci » cliqué par réflexe le premier jour est
// définitif : le panneau ne se propose qu'une fois, et personne ne devine
// qu'il existe encore. Or c'est exactement le geste qu'on fait sans réfléchir
// quand un client attend au comptoir.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function RelancerVisite({ etat }: { etat: number | null }) {
  const [fait, setFait] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  // En cours : le panneau est déjà à l'écran, un second bouton n'aiderait pas.
  if (etat !== null && etat !== -1) return null

  const jamais = etat === null
  return (
    <button
      disabled={pending || fait}
      onClick={() => start(async () => {
        await fetch('/api/visite-guidee', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ etape: 1 }),
        })
        setFait(true)
        router.refresh()
      })}
      className="w-full min-h-[48px] px-4 rounded-lg bg-white ring-1 ring-zinc-300
                 hover:bg-zinc-50 text-sm font-bold text-zinc-800 flex items-center
                 justify-center gap-2 disabled:opacity-60">
      <span aria-hidden>🧭</span>
      {fait ? 'La visite démarre…' : jamais ? 'Faire la visite guidée' : 'Refaire la visite guidée'}
    </button>
  )
}
