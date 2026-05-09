'use client'

// Palette de recherche globale — Ctrl+K (ou ⌘+K) ouvre le modal.
// Recherche en parallèle dans modules / recettes / ingrédients / clients /
// réservations / employés via rechercheGlobale().
//
// Navigation clavier : ↑↓ pour bouger, Enter pour ouvrir, Esc pour fermer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Search, Loader2, ArrowRight, Command } from 'lucide-react'
import { cn } from '@/lib/utils'
import { rechercheGlobale, type SearchGroup, type SearchResult } from '@/lib/search-actions'

const HIDE_ON = ['/login', '/wifi-signup', '/menu-allergenes', '/affichage', '/print', '/table']
function shouldHide(pathname: string) {
  return HIDE_ON.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export default function GlobalSearch() {
  const router = useRouter()
  const pathname = usePathname() || ''
  const hidden = shouldHide(pathname)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Index plat pour navigation clavier (ne dépend pas du regroupement visuel)
  const flat = useMemo<SearchResult[]>(
    () => groups.flatMap(g => g.results),
    [groups],
  )

  // ─── Raccourcis clavier globaux : Ctrl/⌘+K, /, Esc ────────────
  useEffect(() => {
    if (hidden) return
    const onKey = (e: KeyboardEvent) => {
      const isMeta = (e.ctrlKey || e.metaKey)
      // Ctrl+K ou ⌘+K
      if (isMeta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        return
      }
      // "/" (sauf si on tape dans un input)
      if (e.key === '/' && !isMeta) {
        const target = e.target as HTMLElement
        const tag = target?.tagName
        const editing = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
        if (!editing) {
          e.preventDefault()
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hidden])

  // Reset quand on ouvre
  useEffect(() => {
    if (open) {
      setQuery('')
      setGroups([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Recherche debouncée (200ms)
  useEffect(() => {
    if (!open) return
    if (query.trim().length < 2) { setGroups([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await rechercheGlobale(query)
        setGroups(r.groups)
        setSelected(0)
      } catch { setGroups([]) }
      finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  // Navigation clavier dans la liste (↑↓ Enter Esc)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected(s => Math.min(flat.length - 1, s + 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected(s => Math.max(0, s - 1))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const r = flat[selected]
        if (r) { setOpen(false); router.push(r.href) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flat, selected, router])

  // Scroll the selected element into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (hidden || !open) return null

  // Compteur global flat
  let runningIdx = 0

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Recherche globale">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="absolute inset-x-0 top-[10vh] mx-auto max-w-2xl px-4">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden border border-zinc-200">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 border-b">
            <Search className="h-5 w-5 text-zinc-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Cherche une recette, un client, un module…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 py-3.5 text-base outline-none border-0 bg-transparent placeholder:text-zinc-400"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
            <kbd className="hidden md:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border">esc</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
            {query.trim().length < 2 ? (
              <EmptyState />
            ) : groups.length === 0 && !loading ? (
              <p className="text-sm text-zinc-500 italic text-center py-12">Aucun résultat pour « {query} »</p>
            ) : (
              <div className="py-2">
                {groups.map(g => (
                  <div key={g.kind} className="px-2">
                    <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      {g.label}
                    </p>
                    <ul>
                      {g.results.map(r => {
                        const idx = runningIdx++
                        const active = idx === selected
                        return (
                          <li key={`${g.kind}-${idx}`}>
                            <button
                              type="button"
                              data-idx={idx}
                              onClick={() => { setOpen(false); router.push(r.href) }}
                              onMouseEnter={() => setSelected(idx)}
                              className={cn(
                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                                active ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-zinc-50',
                              )}
                            >
                              <span className="text-xl shrink-0">{r.emoji}</span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium truncate">{r.label}</span>
                                {r.sublabel && (
                                  <span className="block text-xs text-zinc-500 truncate">{r.sublabel}</span>
                                )}
                              </span>
                              <ArrowRight className={cn(
                                'h-4 w-4 shrink-0 transition-opacity',
                                active ? 'opacity-100 text-emerald-600' : 'opacity-0 group-hover:opacity-100',
                              )} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer help */}
          <div className="border-t bg-zinc-50 px-4 py-2 flex items-center justify-between text-[11px] text-zinc-500">
            <div className="flex items-center gap-3">
              <span><kbd className="font-mono px-1 py-0.5 rounded bg-white border">↑</kbd> <kbd className="font-mono px-1 py-0.5 rounded bg-white border">↓</kbd> naviguer</span>
              <span><kbd className="font-mono px-1 py-0.5 rounded bg-white border">↵</kbd> ouvrir</span>
            </div>
            <span><kbd className="font-mono px-1 py-0.5 rounded bg-white border">esc</kbd> fermer</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="px-6 py-10 text-center">
      <Command className="h-10 w-10 mx-auto text-zinc-300 mb-2" />
      <p className="text-sm text-zinc-500">
        Cherche dans toute l'app : recettes, ingrédients, clients, réservations, modules…
      </p>
      <p className="text-xs text-zinc-400 mt-2">
        Astuce : ouvre cette palette n'importe où avec <kbd className="font-mono px-1 rounded bg-zinc-100 border">Ctrl</kbd>/<kbd className="font-mono px-1 rounded bg-zinc-100 border">⌘</kbd> + <kbd className="font-mono px-1 rounded bg-zinc-100 border">K</kbd> ou <kbd className="font-mono px-1 rounded bg-zinc-100 border">/</kbd>
      </p>
    </div>
  )
}
