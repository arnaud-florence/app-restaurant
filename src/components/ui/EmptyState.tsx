// État vide amical façon Facebook/Instagram : une icône/emoji, un titre clair,
// une phrase d'explication, et — quand c'est pertinent — un gros bouton d'action.
// Remplace les états vides « arides » (texte gris seul) qui laissent l'utilisateur
// sans savoir quoi faire.
//
// Usage :
//   <EmptyState emoji="🧑" titre="Aucun client" description="Ajoute ton premier client pour suivre sa fidélité." action={{ label: '+ Nouveau client', onClick: ouvrir }} />

import type { ReactNode } from 'react'

export default function EmptyState({
  emoji = '📭',
  titre,
  description,
  action,
  dark = false,
  className = '',
}: {
  emoji?: string
  titre: string
  description?: string
  action?: { label: string; onClick: () => void } | ReactNode
  dark?: boolean
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center ${
        dark ? 'border-zinc-800 bg-zinc-950/40' : 'border-zinc-200 bg-zinc-50/60'
      } ${className}`}
    >
      <div className="text-5xl mb-3" role="img" aria-hidden>{emoji}</div>
      <p className={`text-base font-bold ${dark ? 'text-zinc-100' : 'text-zinc-800'}`}>{titre}</p>
      {description && (
        <p className={`text-sm mt-1 max-w-sm mx-auto ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>{description}</p>
      )}
      {action && (
        <div className="mt-5">
          {/* action peut être un descripteur {label,onClick} ou un noeud déjà prêt */}
          {typeof action === 'object' && action !== null && 'label' in action ? (
            <button
              type="button"
              onClick={(action as { label: string; onClick: () => void }).onClick}
              className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold active:scale-[0.97] transition"
            >
              {(action as { label: string }).label}
            </button>
          ) : (
            (action as ReactNode)
          )}
        </div>
      )}
    </div>
  )
}
