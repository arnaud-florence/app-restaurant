// Navigation « stories » — carrousel horizontal de pastilles rondes (façon
// Instagram) donnant accès à TOUTES les catégories en un clic, présent en haut
// de chaque page admin (mobile). Remplace, sur mobile, la grille des catégories.
// Filtré par permissions / aperçu employé. Le badge live d'alertes est porté
// par la pastille Pilotage.

import Link from 'next/link'
import { cn } from '@/lib/utils'

const EMOJI: Record<string, string> = {
  pilotage: '📊', service: '🍴', 'cuisine-stock': '👨‍🍳', clientele: '🧑',
  equipe: '🎓', finances: '💰', conformite: '🛡️', systeme: '⚙️',
}
const RING: Record<string, string> = {
  emerald: 'bg-gradient-to-tr from-emerald-500 to-teal-400',
  amber:   'bg-gradient-to-tr from-amber-500 to-orange-400',
  violet:  'bg-gradient-to-tr from-violet-500 to-fuchsia-400',
  blue:    'bg-gradient-to-tr from-blue-500 to-cyan-400',
  red:     'bg-gradient-to-tr from-red-500 to-orange-400',
  rose:    'bg-gradient-to-tr from-rose-500 to-pink-400',
  zinc:    'bg-gradient-to-tr from-zinc-400 to-zinc-300',
}

export default function StoriesNav({
  categories, nbAlertes = 0,
}: {
  categories: Array<{ slug: string; label: string; tone: string }>
  nbAlertes?: number
}) {
  if (!categories || categories.length === 0) return null
  return (
    <nav
      className="md:hidden sticky top-0 z-20 border-b border-zinc-200 bg-stone-50/95 backdrop-blur supports-[backdrop-filter]:bg-stone-50/80"
      aria-label="Catégories"
    >
      <div className="flex gap-3 overflow-x-auto px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {categories.map(c => {
          const badge = c.slug === 'pilotage' && nbAlertes > 0 ? nbAlertes : 0
          return (
            <Link
              key={c.slug}
              href={`/admin/cat/${c.slug}`}
              className="flex flex-col items-center gap-1 shrink-0 w-[60px] active:scale-95 transition"
            >
              <span className={cn('relative inline-flex items-center justify-center h-14 w-14 rounded-full p-[2.5px]', RING[c.tone] ?? RING.zinc)}>
                <span className="inline-flex items-center justify-center h-full w-full rounded-full bg-white text-xl">{EMOJI[c.slug] ?? '•'}</span>
                {badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black border-2 border-white tabular-nums">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-bold text-zinc-700 leading-tight text-center w-full truncate">{c.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
