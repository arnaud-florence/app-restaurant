'use client'

// Bouton flottant « ? » + drawer affichant l'aide contextuelle de la page courante.
// Lookup dynamique sur le pathname via getHelpFor().
//
// Visible globalement : monté dans le RootLayout. Auto-hide si aucune aide
// pour la page (login, kiosk client, etc.).

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { marked } from 'marked'
import { HelpCircle, X, ExternalLink, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getHelpFor, type HelpEntry } from '@/lib/help-content'

marked.setOptions({ gfm: true, breaks: false })

// Pages où on ne montre PAS le bouton (kiosk public, login, écran qui doivent
// rester clean — affichage TV, ticket d'impression, écran client…).
const HIDE_ON = [
  '/login',
  '/wifi-signup',
  '/menu-allergenes',
  '/affichage',
  '/print',
  '/table',
]

function shouldHide(pathname: string) {
  return HIDE_ON.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export default function ContextualHelp() {
  const pathname = usePathname() || ''
  const [open, setOpen] = useState(false)
  const help = useMemo<HelpEntry | null>(
    () => (shouldHide(pathname) ? null : getHelpFor(pathname)),
    [pathname],
  )

  // Ferme sur Échap
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!help) return null

  return (
    <>
      {/* Bouton flottant */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed z-30 h-12 w-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl',
          'flex items-center justify-center transition-transform active:scale-95',
          'right-4 bottom-20 md:bottom-6',  // au-dessus de la bottom-nav mobile
        )}
        aria-label="Aide contextuelle"
        title="Aide pour cette page"
      >
        <HelpCircle className="h-6 w-6" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 bg-white max-h-[85vh] overflow-y-auto transition-transform',
          'rounded-t-xl shadow-2xl',
          'md:max-w-lg md:right-4 md:left-auto md:bottom-4 md:top-auto md:mb-0 md:rounded-xl',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        role="dialog"
        aria-label={help.title}
      >
        {/* Header */}
        <div className="sticky top-0 bg-emerald-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <HelpCircle className="h-5 w-5 shrink-0" />
            <h2 className="text-sm font-bold truncate">{help.title}</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 hover:bg-emerald-500 rounded"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {help.intro && (
            <p className="text-sm text-zinc-700 italic bg-emerald-50 border-l-4 border-emerald-500 px-3 py-2 rounded">
              {help.intro}
            </p>
          )}

          {help.shortcuts && help.shortcuts.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-zinc-500 mb-2">Raccourcis</p>
              <div className="grid grid-cols-2 gap-2">
                {help.shortcuts.map(s => (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-md border border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50 px-3 py-2 text-sm font-medium transition-colors"
                  >
                    <span>{s.emoji ?? '➡️'}</span>
                    <span className="truncate flex-1">{s.label}</span>
                    <ExternalLink className="h-3 w-3 text-zinc-400" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {help.sections.map((s, i) => {
            const html = marked.parse(s.markdown) as string
            return (
              <div key={i}>
                <h3 className="font-semibold text-zinc-900 flex items-center gap-1.5 mb-1">
                  {s.emoji && <span>{s.emoji}</span>}
                  <span>{s.heading}</span>
                </h3>
                <div
                  className="prose prose-sm prose-zinc max-w-none
                             prose-p:my-1 prose-li:my-0.5
                             prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-zinc-800 prose-code:before:content-none prose-code:after:content-none
                             prose-strong:text-zinc-900"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            )
          })}

          <div className="pt-2 border-t">
            <Link
              href="/formation"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium"
            >
              <BookOpen className="h-4 w-4" /> Lire mon manuel complet
            </Link>
          </div>
        </div>
      </aside>
    </>
  )
}
