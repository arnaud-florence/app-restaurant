'use client'

// Fil d'ariane cliquable « Accueil › Catégorie › Module » — remplace l'ancien
// simple bouton « Retour à … ». Chaque niveau est navigable (façon grandes apps :
// on remonte l'arbre à n'importe quel niveau d'un seul tap). Reste collant en
// haut quand on descend dans les détails.
//
// Ne s'affiche PAS sur : /admin (home), /admin/cat (index), /admin/cat/[slug]
// (page catégorie elle-même), /login, /, /print/*, ou tout pathname sans catégorie.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight, Home, Search, BarChart3, Utensils, ChefHat, Users, GraduationCap, Wallet,
  ShieldCheck, Settings, type LucideIcon,
} from 'lucide-react'
import { findCategoryByHref, CATEGORIES, type Category } from '@/lib/navigation'

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

const TONE_TEXT: Record<Category['tone'], string> = {
  emerald: 'text-emerald-700',
  amber:   'text-amber-700',
  violet:  'text-violet-700',
  blue:    'text-blue-700',
  red:     'text-red-700',
  rose:    'text-rose-700',
  zinc:    'text-zinc-700',
}
const TONE_TEXT_DARK: Record<Category['tone'], string> = {
  emerald: 'text-emerald-300',
  amber:   'text-amber-300',
  violet:  'text-violet-300',
  blue:    'text-blue-300',
  red:     'text-red-300',
  rose:    'text-rose-300',
  zinc:    'text-zinc-300',
}

/** Retrouve le sous-module (label + emoji) correspondant au pathname courant. */
function findModule(pathname: string): { label: string; emoji: string } | null {
  let best: { label: string; emoji: string; len: number } | null = null
  for (const c of CATEGORIES) {
    for (const it of c.items) {
      if (it.href === pathname || pathname.startsWith(it.href + '/')) {
        if (!best || it.href.length > best.len) best = { label: it.label, emoji: it.emoji, len: it.href.length }
      }
    }
  }
  return best ? { label: best.label, emoji: best.emoji } : null
}

export default function BackToCategoryButton({
  theme = 'light',
}: {
  theme?: 'light' | 'dark'
}) {
  const pathname = usePathname() ?? '/'

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

  const dark = theme === 'dark'
  const CatIcon = ICON_BY_CAT[cat.slug] ?? Settings
  const mod = findModule(pathname)
  const toneText = dark ? TONE_TEXT_DARK[cat.tone] : TONE_TEXT[cat.tone]
  const linkBase = dark ? 'text-zinc-400 hover:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900'
  const chevron = dark ? 'text-zinc-600' : 'text-zinc-300'

  return (
    <div className={`relative md:sticky md:top-0 z-20 px-3 sm:px-4 py-2 backdrop-blur ${dark ? 'bg-[#0D0D0D]/85' : 'bg-stone-50/85'}`}>
     <div className="flex items-center gap-2">
      <nav
        className="flex-1 flex items-center gap-1 text-xs sm:text-sm font-semibold overflow-hidden"
        aria-label="Fil d'ariane"
      >
        {/* Accueil */}
        <Link
          href="/admin/cat"
          className={`inline-flex items-center gap-1 h-9 px-2 rounded-lg shrink-0 active:scale-95 transition ${linkBase}`}
          aria-label="Retour à l'accueil"
        >
          <Home className="h-4 w-4" strokeWidth={2.4} />
          <span className="hidden sm:inline">Accueil</span>
        </Link>

        <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${chevron}`} strokeWidth={2.5} aria-hidden />

        {/* Catégorie */}
        <Link
          href={`/admin/cat/${cat.slug}`}
          className={`inline-flex items-center gap-1.5 h-9 px-2 rounded-lg shrink-0 active:scale-95 transition ${toneText} hover:opacity-80`}
        >
          <CatIcon className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          <span className="truncate max-w-[7rem] sm:max-w-none">{cat.label}</span>
        </Link>

        {/* Module courant (non cliquable) */}
        {mod && (
          <>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${chevron}`} strokeWidth={2.5} aria-hidden />
            <span className={`inline-flex items-center gap-1 h-9 px-1 min-w-0 ${dark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              <span className="shrink-0" aria-hidden>{mod.emoji}</span>
              <span className="truncate">{mod.label}</span>
            </span>
          </>
        )}
      </nav>

      {/* Loupe : ouvre la recherche globale (réflexe « je tape, je trouve » façon Insta) */}
      <button
        type="button"
        onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('open-global-search')) }}
        aria-label="Rechercher"
        className={`shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full active:scale-90 transition ${
          dark ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 shadow-sm'
        }`}
      >
        <Search className="h-4 w-4" strokeWidth={2.5} />
      </button>
     </div>
    </div>
  )
}
