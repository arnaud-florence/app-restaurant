'use client'

// « Carte complète » du Centre de contrôle : TOUS les univers + modules sur une
// page, avec recherche instantanée, repli/dépli, description « ce que ça fait »
// et badges live (nombre de signalements agents pointant vers chaque module).
//
// Filtrée en amont par rôle (le serveur ne passe que les modules autorisés).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ChevronDown, ArrowRight, X, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MapModule = { href: string; emoji: string; label: string; description: string }
export type MapCategory = {
  slug: string
  label: string
  emoji: string
  tone: string
  pitch: string
  items: MapModule[]
}
export type Badge = { count: number; urg: 'rouge' | 'orange' | 'jaune' | 'info' }

const TONE: Record<string, { chip: string; bar: string; ring: string }> = {
  emerald: { chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', ring: 'hover:ring-emerald-300' },
  amber:   { chip: 'bg-amber-100 text-amber-700',     bar: 'bg-amber-500',   ring: 'hover:ring-amber-300' },
  violet:  { chip: 'bg-violet-100 text-violet-700',   bar: 'bg-violet-500',  ring: 'hover:ring-violet-300' },
  blue:    { chip: 'bg-blue-100 text-blue-700',       bar: 'bg-blue-500',    ring: 'hover:ring-blue-300' },
  red:     { chip: 'bg-red-100 text-red-700',         bar: 'bg-red-500',     ring: 'hover:ring-red-300' },
  rose:    { chip: 'bg-rose-100 text-rose-700',       bar: 'bg-rose-500',    ring: 'hover:ring-rose-300' },
  zinc:    { chip: 'bg-zinc-200 text-zinc-700',       bar: 'bg-zinc-500',    ring: 'hover:ring-zinc-300' },
}
const BADGE_CLS: Record<Badge['urg'], string> = {
  rouge:  'bg-red-600 text-white',
  orange: 'bg-amber-500 text-white',
  jaune:  'bg-yellow-400 text-yellow-950',
  info:   'bg-blue-500 text-white',
}

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

export default function AppMap({
  categories, badges, totalModules,
}: {
  categories: MapCategory[]
  badges: Record<string, Badge>
  totalModules: number
}) {
  const [q, setQ] = useState('')
  // Par défaut : tout REPLIÉ → on voit les 8 univers compacts sans scroll
  // interminable ; on déplie celui qu'on veut d'un tap. La recherche déplie
  // automatiquement les résultats.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(categories.map(c => c.slug)))
  const searching = q.trim().length > 0
  const nq = norm(q)

  // Filtrage par recherche (nom + description + univers)
  const filtered = useMemo(() => {
    if (!searching) return categories
    return categories
      .map(c => {
        const catHit = norm(c.label).includes(nq) || norm(c.pitch).includes(nq)
        const items = c.items.filter(m =>
          catHit || norm(m.label).includes(nq) || norm(m.description).includes(nq))
        return { ...c, items }
      })
      .filter(c => c.items.length > 0)
  }, [categories, nq, searching])

  const nbResultats = filtered.reduce((s, c) => s + c.items.length, 0)
  const allCollapsed = collapsed.size >= categories.length

  function toggle(slug: string) {
    setCollapsed(prev => {
      const n = new Set(prev)
      if (n.has(slug)) n.delete(slug); else n.add(slug)
      return n
    })
  }
  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(categories.map(c => c.slug)))
  }

  return (
    <section className="space-y-3">
      {/* En-tête + recherche */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.15em] text-zinc-500">Carte de l'application</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {categories.length} univers · {totalModules} module{totalModules > 1 ? 's' : ''} — tout ce que l'outil sait faire
          </p>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-bold text-zinc-600 bg-white ring-1 ring-zinc-200 hover:ring-zinc-300 active:scale-95 transition"
        >
          {allCollapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          {allCollapsed ? 'Tout déplier' : 'Tout replier'}
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" strokeWidth={2.5} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          inputMode="search"
          placeholder="Que cherches-tu ? (ex : TVA, allergènes, planning…)"
          className="w-full h-12 pl-10 pr-10 rounded-2xl bg-white ring-1 ring-zinc-200 focus:ring-2 focus:ring-zinc-900/20 outline-none text-base text-zinc-900 placeholder:text-zinc-400"
        />
        {searching && (
          <button onClick={() => setQ('')} aria-label="Effacer"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {searching && (
        <p className="text-xs text-zinc-500 -mt-1">
          {nbResultats > 0 ? `${nbResultats} résultat${nbResultats > 1 ? 's' : ''}` : 'Aucun module ne correspond.'}
        </p>
      )}

      {/* Grille des univers */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        {filtered.map(cat => {
          const t = TONE[cat.tone] ?? TONE.zinc
          const open = searching || !collapsed.has(cat.slug)
          // Somme des badges de l'univers (pour la pastille sur l'en-tête replié)
          const catBadge = cat.items.reduce((s, m) => s + (badges[m.href]?.count ?? 0), 0)
          return (
            <div key={cat.slug} className="rounded-3xl bg-white ring-1 ring-zinc-200 overflow-hidden">
              {/* En-tête d'univers (cliquable = replier) */}
              <button
                type="button"
                onClick={() => !searching && toggle(cat.slug)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-zinc-50 transition"
              >
                <span className={cn('inline-flex items-center justify-center h-10 w-10 rounded-xl text-xl shrink-0', t.chip)}>{cat.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-black text-zinc-900 truncate">{cat.label}</span>
                    {catBadge > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black tabular-nums">{catBadge > 9 ? '9+' : catBadge}</span>
                    )}
                  </span>
                  <span className="block text-[11px] text-zinc-400 truncate">{cat.items.length} module{cat.items.length > 1 ? 's' : ''} · {cat.pitch}</span>
                </span>
                {!searching && (
                  <ChevronDown className={cn('h-4 w-4 text-zinc-400 shrink-0 transition-transform', open ? 'rotate-180' : '')} strokeWidth={2.5} />
                )}
              </button>

              {/* Modules */}
              {open && (
                <div className="px-2 pb-2 space-y-0.5">
                  {cat.items.map(m => {
                    const b = badges[m.href]
                    return (
                      <Link
                        key={m.href}
                        href={m.href}
                        className="group flex items-start gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-zinc-50 active:scale-[0.99] transition"
                      >
                        <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>{m.emoji}</span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="font-bold text-sm text-zinc-900 truncate">{m.label}</span>
                            {b && (
                              <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black tabular-nums shrink-0', BADGE_CLS[b.urg])}>
                                {b.count > 9 ? '9+' : b.count}
                              </span>
                            )}
                          </span>
                          <span className="block text-[11px] text-zinc-500 leading-snug line-clamp-2">{m.description}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-600 group-hover:translate-x-0.5 transition mt-1 shrink-0" strokeWidth={2} />
                      </Link>
                    )
                  })}
                </div>
              )}
              {/* Liseré de couleur de l'univers */}
              <div className={cn('h-1 w-full', t.bar)} aria-hidden />
            </div>
          )
        })}
      </div>
    </section>
  )
}
