// État vide élégant pour les widgets du dashboard gérant.
// Affiche une icône, un message clair, et optionnellement un hint sur
// quand l'agent va alimenter ce widget, plus un bouton d'action.

import Link from 'next/link'
import { type ReactNode } from 'react'

export default function EmptyWidget({
  icon, message, hint, action,
}: {
  icon: ReactNode
  message: string
  hint?: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-8 text-zinc-500">
      <div className="text-3xl mb-2 opacity-60" aria-hidden>{icon}</div>
      <p className="text-sm font-medium text-zinc-700">{message}</p>
      {hint && <p className="text-xs mt-1 text-zinc-400">{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
        >
          {action.label} →
        </Link>
      )}
    </div>
  )
}
