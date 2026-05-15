'use client'

// Bouton de retour vers la page catégorie correspondante au pathname courant.
// Auto-détection via findCategoryByHref + usePathname.
//
// Ne s'affiche PAS sur :
//   - /admin (home tableau de bord)
//   - /admin/cat (index catégories)
//   - /admin/cat/[slug] (page catégorie elle-même)
//   - /login, /
//   - tout pathname dont aucune catégorie ne contient le href
//
// S'affiche sur toutes les autres pages (sous-modules) avec le label
// et la couleur de la catégorie correspondante.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronLeft, BarChart3, Utensils, ChefHat, Users, GraduationCap, Wallet,
  ShieldCheck, Settings, type LucideIcon,
} from 'lucide-react'
import { findCategoryByHref, type Category } from '@/lib/navigation'

const ICON_BY_CAT: Record<string, LucideIcon> = {
  pilotage:        BarChart3,
  service:         Utensils,
  'cuisine-stock': ChefHat,
  clientele:       Users,
  equipe:          GraduationCap,
  finances:        Wallet,
  conformite:      ShieldCheck,
  systeme:         Settings,
}

const TONE_BG: Record<Category['tone'], string> = {
  emerald: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200 hover:border-emerald-400',
  amber:   'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200 hover:border-amber-400',
  violet:  'bg-violet-50 hover:bg-violet-100 text-violet-900 border-violet-200 hover:border-violet-400',
  blue:    'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-200 hover:border-blue-400',
  red:     'bg-red-50 hover:bg-red-100 text-red-900 border-red-200 hover:border-red-400',
  rose:    'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200 hover:border-rose-400',
  zinc:    'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-300 hover:border-zinc-500',
}

const TONE_BG_DARK: Record<Category['tone'], string> = {
  emerald: 'bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-300 border-emerald-700/50 hover:border-emerald-500',
  amber:   'bg-amber-900/20 hover:bg-amber-900/40 text-amber-300 border-amber-700/50 hover:border-amber-500',
  violet:  'bg-violet-900/20 hover:bg-violet-900/40 text-violet-300 border-violet-700/50 hover:border-violet-500',
  blue:    'bg-blue-900/20 hover:bg-blue-900/40 text-blue-300 border-blue-700/50 hover:border-blue-500',
  red:     'bg-red-900/20 hover:bg-red-900/40 text-red-300 border-red-700/50 hover:border-red-500',
  rose:    'bg-rose-900/20 hover:bg-rose-900/40 text-rose-300 border-rose-700/50 hover:border-rose-500',
  zinc:    'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 hover:border-zinc-500',
}

export default function BackToCategoryButton({
  theme = 'light',
}: {
  theme?: 'light' | 'dark'
}) {
  const pathname = usePathname() ?? '/'

  // Pages à exclure : home, cat index, cat slug, public
  if (
    pathname === '/' ||
    pathname === '/admin' ||
    pathname === '/admin/cat' ||
    pathname.startsWith('/admin/cat/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/print')
  ) {
    return null
  }

  const cat = findCategoryByHref(pathname)
  if (!cat) return null

  const cls = theme === 'dark' ? TONE_BG_DARK[cat.tone] : TONE_BG[cat.tone]
  const CatIcon = ICON_BY_CAT[cat.slug] ?? Settings

  return (
    <div className="px-3 sm:px-4 pt-3">
      <Link
        href={`/admin/cat/${cat.slug}`}
        className={`group inline-flex items-center gap-2 h-10 pl-1.5 pr-4 rounded-full border-2 text-xs sm:text-sm font-bold active:scale-95 transition ${cls}`}
        aria-label={`Retour à la catégorie ${cat.label}`}
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/80 text-zinc-900 shadow-sm group-hover:bg-white transition">
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <CatIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        <span>Retour à {cat.label}</span>
      </Link>
    </div>
  )
}
