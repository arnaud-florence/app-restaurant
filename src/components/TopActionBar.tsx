'use client'

// Barre de raccourcis UNIVERSELLE — affichée en haut de toutes les pages.
//
// Structure :
//   1. Rangée horizontale scrollable de "chips" tactiles vers les pages
//      opérationnelles + 2-3 pages admin clés. Page active highlighted.
//   2. Bouton "☰ Modules" en bout de barre qui ouvre un Drawer plein écran
//      contenant TOUS les modules admin groupés par thème, filtrés par
//      permissions (canAccess).
//
// Remplace OpsBottomNav (qui était fixed en bas) et la bottom nav mobile
// de AdminNav. Un seul point de navigation, en haut, identique partout.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, LogOut, Search, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccess, type CustomPermissions } from '@/lib/permissions'
import { logoutAction } from '@/app/login/actions'
import PushNotifSwitch from '@/components/PushNotifSwitch'
import { useLiveFindings, type Finding } from '@/hooks/useLiveFindings'
import { CATEGORIES, resolveActiveCategory, POSTE_PRIORITES_CATEGORIES, type Category } from '@/lib/navigation'

export type TopActionBarTheme = 'light' | 'dark'

export type TopActionBarProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
} | null

type Tone = 'emerald' | 'amber' | 'violet' | 'blue' | 'red' | 'rose' | 'zinc'

type Group = { groupe: string; emoji: string; items: Array<{ href: string; label: string; emoji: string }> }

// ─── Tous les modules pour le drawer "Plus" (filtré canAccess) ──────
const ALL_GROUPES: Group[] = [
  {
    groupe: 'Pilotage', emoji: '📊',
    items: [
      { href: '/mon-espace',         label: 'Mon espace',      emoji: '🏠' },
      { href: '/admin',              label: 'Tableau de bord', emoji: '🏠' },
      { href: '/admin/pilotage',     label: 'Pilotage',        emoji: '📊' },
      { href: '/admin/assistant',    label: 'Assistant IA',    emoji: '🤖' },
      { href: '/admin/journal',      label: 'Journal',         emoji: '📓' },
      { href: '/admin/previsionnel', label: 'Prévisionnel',    emoji: '🌤' },
    ],
  },
  {
    groupe: 'Service opérationnel', emoji: '🍽',
    items: [
      { href: '/serveur',     label: 'Salle / Serveur',  emoji: '🍽' },
      { href: '/caisse',      label: 'Caisse',           emoji: '💰' },
      { href: '/cuisine',     label: 'Cuisine',          emoji: '👨‍🍳' },
      { href: '/pizza',       label: 'Pizza',            emoji: '🍕' },
      { href: '/bar',         label: 'Bar',              emoji: '🍷' },
      { href: '/emporter',    label: 'Snack / Emporter', emoji: '🛒' },
      { href: '/livreur',     label: 'Livreur',          emoji: '🛵' },
      { href: '/reception',   label: 'Réception',        emoji: '🛎' },
      { href: '/admin/affichage', label: 'Affichage TV', emoji: '📺' },
    ],
  },
  {
    groupe: 'Cuisine & stocks', emoji: '🥬',
    items: [
      { href: '/admin/recettes',          label: 'Recettes',         emoji: '👨‍🍳' },
      { href: '/admin/plats-du-jour',     label: 'Plats du jour',    emoji: '✨' },
      { href: '/admin/capacite-cuisine',  label: 'Capacité cuisine', emoji: '⚙️' },
      { href: '/admin/ingredients',       label: 'Ingrédients',      emoji: '🥬' },
      { href: '/admin/stock',             label: 'Stock',            emoji: '📦' },
      { href: '/admin/fournisseurs',      label: 'Fournisseurs',     emoji: '🚚' },
      { href: '/admin/boissons',          label: 'Boissons',         emoji: '🍷' },
      { href: '/admin/allergenes',        label: 'Allergènes',       emoji: '⚠️' },
    ],
  },
  {
    groupe: 'Clientèle', emoji: '👥',
    items: [
      { href: '/admin/reservations',    label: 'Réservations',    emoji: '📅' },
      { href: '/admin/chambres',        label: 'Chambres',        emoji: '🛏' },
      { href: '/admin/groupes',         label: 'Groupes',         emoji: '👥' },
      { href: '/admin/clients',         label: 'Clients / CRM',   emoji: '🧑' },
      { href: '/admin/clients/fidelite', label: 'Fidélité',       emoji: '⭐' },
      { href: '/admin/promotions',      label: 'Promotions',      emoji: '🎁' },
      { href: '/admin/codes-promo',     label: 'Codes promo',     emoji: '🏷' },
      { href: '/admin/cartes-cadeaux',  label: 'Cartes cadeaux',  emoji: '🎫' },
      { href: '/admin/reputation',      label: 'Réputation',      emoji: '🏆' },
      { href: '/admin/marketing',       label: 'Marketing IA',    emoji: '📢' },
    ],
  },
  {
    groupe: 'Équipe & formation', emoji: '👨‍🍳',
    items: [
      { href: '/admin/rh',         label: 'Ressources humaines', emoji: '👥' },
      { href: '/equipes',          label: 'Chat équipe',         emoji: '💬' },
      { href: '/formation',        label: 'Mes manuels',         emoji: '📖' },
      { href: '/admin/formation',  label: 'Gérer guides',        emoji: '🎓' },
      { href: '/admin/challenges', label: 'Challenges',          emoji: '🏆' },
    ],
  },
  {
    groupe: 'Finances', emoji: '💰',
    items: [
      { href: '/admin/finances', label: 'Finances / TVA',  emoji: '💰' },
      { href: '/admin/economie', label: 'Centre économique', emoji: '🧮' },
      { href: '/admin/energie',  label: 'Énergie',          emoji: '⚡' },
    ],
  },
  {
    groupe: 'Conformité', emoji: '🛡',
    items: [
      { href: '/admin/hygiene',     label: 'Hygiène / HACCP', emoji: '🧴' },
      { href: '/admin/dechets',     label: 'Déchets (AGEC)',  emoji: '🗑' },
      { href: '/admin/legal',       label: 'Légal',           emoji: '📑' },
      { href: '/admin/maintenance', label: 'Maintenance',     emoji: '🔧' },
    ],
  },
  {
    groupe: 'Système', emoji: '⚙️',
    items: [
      { href: '/admin/setup',    label: 'Configuration', emoji: '⚙️' },
      { href: '/admin/securite', label: 'Sécurité',      emoji: '🔐' },
    ],
  },
]

// Chips sur barre CLAIRE (utilisés quand page = dark/ops, barre = bg-white)
// Inactif : bg-zinc-50 pour ressortir du fond blanc de barre.
const TONES_LIGHT: Record<Tone, { base: string; active: string }> = {
  emerald: { base: 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900',
             active: 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/30' },
  amber:   { base: 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900',
             active: 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/30' },
  violet:  { base: 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-900',
             active: 'bg-violet-600 border-violet-600 text-white shadow-lg shadow-violet-500/30' },
  blue:    { base: 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-900',
             active: 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30' },
  red:     { base: 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-red-50 hover:border-red-300 hover:text-red-900',
             active: 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-500/30' },
  rose:    { base: 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900',
             active: 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-500/30' },
  zinc:    { base: 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 hover:text-zinc-900',
             active: 'bg-zinc-900 border-zinc-900 text-white shadow-lg shadow-zinc-900/30' },
}

// Chips sur barre SOMBRE (utilisés quand page = light/admin, barre = bg-zinc-900)
// Inactif : bg-zinc-800 pour ressortir du fond noir de barre.
const TONES_DARK: Record<Tone, { base: string; active: string }> = {
  emerald: { base: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-emerald-500/60 hover:text-emerald-300',
             active: 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/40' },
  amber:   { base: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-amber-500/60 hover:text-amber-300',
             active: 'bg-amber-400 border-amber-300 text-zinc-900 shadow-lg shadow-amber-400/40' },
  violet:  { base: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-violet-500/60 hover:text-violet-300',
             active: 'bg-violet-500 border-violet-400 text-white shadow-lg shadow-violet-500/40' },
  blue:    { base: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-blue-500/60 hover:text-blue-300',
             active: 'bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/40' },
  red:     { base: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-red-500/60 hover:text-red-300',
             active: 'bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/40' },
  rose:    { base: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-rose-500/60 hover:text-rose-300',
             active: 'bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-500/40' },
  zinc:    { base: 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-zinc-500 hover:text-white',
             active: 'bg-white border-white text-zinc-900 shadow-lg shadow-white/30' },
}

export default function TopActionBar({
  theme = 'light',
  profil = null,
  initialFindingsRouges = [],
}: {
  theme?: TopActionBarTheme
  profil?: TopActionBarProfil
  /** Findings urgence='rouge' non résolus, fetché server-side, pour le badge live. */
  initialFindingsRouges?: Finding[]
}) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  /** Href de la chip cliquée, en attente que la navigation se complète. */
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // Quand le pathname change, on est arrivés à destination : reset pending.
  useEffect(() => { setPendingHref(null) }, [pathname])

  // Sécurité : si la navigation prend > 8s, reset (sinon spinner bloqué).
  useEffect(() => {
    if (!pendingHref) return
    const t = setTimeout(() => setPendingHref(null), 8000)
    return () => clearTimeout(t)
  }, [pendingHref])

  // ─── Badge alerte rouge : live via useLiveFindings ────────────────
  const { findings: findingsRouges } = useLiveFindings(initialFindingsRouges, {
    urgences: ['rouge'],
  })
  const nbAlertesRouges = findingsRouges.length

  // ─── Ferme le drawer sur Échap ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Reset la query de recherche quand le drawer se ferme
  useEffect(() => { if (!open) setQuery('') }, [open])

  // ─── Permissions ──────────────────────────────────────────────────
  const isManager = profil?.role === 'manager'
  const peutVoir = (href: string) =>
    isManager || canAccess(profil?.poste, href, profil?.custom_permissions ?? null)

  // Drawer : filtré par permissions + par query de recherche
  const groupesFiltres = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ALL_GROUPES
      .map(g => ({
        ...g,
        items: g.items.filter(i => {
          if (!peutVoir(i.href)) return false
          if (!q) return true
          return i.label.toLowerCase().includes(q) || g.groupe.toLowerCase().includes(q)
        }),
      }))
      .filter(g => g.items.length > 0)
  }, [profil?.poste, profil?.custom_permissions, isManager, query])

  // Catégories visibles filtrées (au moins 1 sous-module visible) et réordonnées par poste
  const chipsVisibles = useMemo<Category[]>(() => {
    const cats = CATEGORIES
      .map(c => ({ ...c, items: c.items.filter(it => peutVoir(it.href)) }))
      .filter(c => c.items.length > 0)

    const priorites = profil?.poste ? POSTE_PRIORITES_CATEGORIES[profil.poste] : undefined
    if (!priorites) return cats

    const bySlug = new Map(cats.map(c => [c.slug, c]))
    const prioritaires: Category[] = []
    const dejaVu = new Set<string>()
    for (const slug of priorites) {
      const c = bySlug.get(slug)
      if (c) { prioritaires.push(c); dejaVu.add(slug) }
    }
    return [...prioritaires, ...cats.filter(c => !dejaVu.has(c.slug))]
  }, [profil?.poste, profil?.custom_permissions, isManager])

  /** Catégorie active pour highlight de chip. */
  const activeCategory = useMemo(() => resolveActiveCategory(pathname), [pathname])

  // ─── Auto-scroll : centre la chip active au montage et au changement ─
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeChipRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (!activeChipRef.current || !scrollContainerRef.current) return
    activeChipRef.current.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [pathname])

  // ─── Détection scroll left/right pour fades intelligents ─────────────
  const [scrollState, setScrollState] = useState<{ canLeft: boolean; canRight: boolean }>({
    canLeft: false,
    canRight: true,
  })
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => {
      const canLeft = el.scrollLeft > 4
      const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
      setScrollState(prev =>
        prev.canLeft === canLeft && prev.canRight === canRight ? prev : { canLeft, canRight },
      )
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [chipsVisibles.length])

  // ─── Haptic feedback léger au tap sur mobile ─────────────────────────
  function tapHaptic() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(8) } catch { /* ignore */ }
    }
  }

  // ─── Raccourcis clavier Alt+1..9 (desktop only) ──────────────────────
  // Permet au gérant en bureau de switcher entre chips en 1 touche.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore si focus dans un input/textarea/contenteditable
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      // Alt+1..9 = chip d'index 0..8 ; Alt+0 = bouton Modules
      if (e.key === '0') {
        e.preventDefault()
        setOpen(true)
        return
      }
      const n = parseInt(e.key, 10)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const cat = chipsVisibles[n - 1]
      if (!cat) return
      const href = `/admin/cat/${cat.slug}`
      e.preventDefault()
      setPendingHref(href)
      router.push(href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chipsVisibles, router])

  // INVERSION du thème pour la barre : forte distinction visuelle avec le fond de page.
  // Page light → barre sombre · Page dark → barre claire.
  // Les chips utilisent donc le jeu de tones inversé.
  const tones = theme === 'dark' ? TONES_LIGHT : TONES_DARK

  // Mobile : barre flottante remontée du bord bas (pouce confortable)
  // Desktop : static en haut (intégré au flux de la page)
  const wrapperCls = theme === 'dark'
    ? cn(
        // Page sombre → barre CLAIRE pour ressortir
        'fixed bottom-3 inset-x-3 z-30 rounded-3xl bg-white border-2 border-zinc-300 shadow-[0_-8px_30px_rgba(255,255,255,0.15)] overflow-hidden',
        'md:static md:inset-auto md:rounded-none md:border-0 md:border-b md:border-zinc-200 md:shadow-none md:overflow-visible',
      )
    : cn(
        // Page claire → barre SOMBRE pour ressortir
        'fixed bottom-3 inset-x-3 z-30 rounded-3xl bg-zinc-900 border-2 border-zinc-700 shadow-[0_-8px_30px_rgba(0,0,0,0.25)] overflow-hidden',
        'md:static md:inset-auto md:rounded-none md:border-0 md:border-b md:border-zinc-800 md:shadow-none md:overflow-visible',
      )

  // Bouton "☰ Modules" : couleur accent emerald, ressort dans les 2 thèmes
  const plusBtnCls = 'bg-emerald-500 border-emerald-400 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/30'

  return (
    <>
      <div className={wrapperCls}>
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-thin"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2.5 md:py-1.5 min-w-max">
            {/* Chip "Accueil" spéciale — toujours en premier, pointe vers la vue d'ensemble */}
            {(() => {
              const href = '/admin/cat'
              const active = pathname === '/admin/cat'
              const isPending = pendingHref === href
              const cls = active ? tones.emerald.active : tones.emerald.base
              return (
                <Link
                  href={href}
                  ref={active ? activeChipRef : undefined}
                  onClick={() => { tapHaptic(); setPendingHref(href) }}
                  style={{ scrollSnapAlign: 'start' }}
                  aria-current={active ? 'page' : undefined}
                  title="Accueil · Vue d'ensemble"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                    'h-14 px-4 text-[13px] md:h-10 md:px-3.5 md:text-xs',
                    isPending && 'animate-pulse',
                    cls,
                  )}
                >
                  {isPending ? (
                    <Loader2 className="h-5 w-5 md:h-4 md:w-4 animate-spin" aria-hidden />
                  ) : (
                    <span className="text-xl md:text-base leading-none" aria-hidden>🏠</span>
                  )}
                  <span>Accueil</span>
                </Link>
              )
            })()}

            {chipsVisibles.map((cat, idx) => {
              // Toutes les catégories pointent vers leur page /admin/cat/<slug>
              // (y compris Accueil — l'utilisateur veut voir ses sous-modules en tuiles).
              const href = `/admin/cat/${cat.slug}`
              const active = activeCategory?.slug === cat.slug
              const isPending = pendingHref === href
              const cls = active ? tones[cat.tone].active : tones[cat.tone].base
              const shortcut = idx < 9 ? `Alt+${idx + 1}` : undefined
              return (
                <Link
                  key={cat.slug}
                  href={href}
                  ref={active ? activeChipRef : undefined}
                  onClick={() => { tapHaptic(); setPendingHref(href) }}
                  style={{ scrollSnapAlign: 'start' }}
                  aria-current={active ? 'page' : undefined}
                  title={shortcut ? `${cat.label} · ${shortcut}` : cat.label}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                    'h-14 px-4 text-[13px] md:h-10 md:px-3.5 md:text-xs',
                    isPending && 'animate-pulse',
                    cls,
                  )}
                >
                  {isPending ? (
                    <Loader2 className="h-5 w-5 md:h-4 md:w-4 animate-spin" aria-hidden />
                  ) : (
                    <span className="text-xl md:text-base leading-none" aria-hidden>{cat.emoji}</span>
                  )}
                  <span>{cat.label}</span>
                </Link>
              )
            })}

            {/* Bouton "☰ Modules" — ouvre le drawer complet, avec badge alerte rouge live */}
            <button
              type="button"
              onClick={() => { tapHaptic(); setOpen(true) }}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                'h-14 px-4 text-[13px] md:h-10 md:px-3.5 md:text-xs',
                plusBtnCls,
              )}
              aria-label={`Tous les modules${nbAlertesRouges > 0 ? ` — ${nbAlertesRouges} alerte${nbAlertesRouges > 1 ? 's' : ''} urgente${nbAlertesRouges > 1 ? 's' : ''}` : ''}`}
            >
              <Menu className="h-5 w-5 md:h-4 md:w-4" />
              <span>Modules</span>
              {nbAlertesRouges > 0 && (
                <>
                  <span
                    className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-600 border-2 border-white text-white text-[10px] font-black tabular-nums shadow-lg shadow-red-600/40"
                    aria-hidden
                  >
                    {nbAlertesRouges > 9 ? '9+' : nbAlertesRouges}
                  </span>
                  <span
                    className="absolute -top-1.5 -right-1.5 inline-flex w-5 h-5 rounded-full bg-red-500 animate-ping opacity-60"
                    aria-hidden
                  />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Gradient fade conditionnel — visible uniquement si scroll possible dans la direction */}
        <div
          className={cn(
            'md:hidden pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-3xl transition-opacity duration-200',
            scrollState.canLeft ? 'opacity-100' : 'opacity-0',
            theme === 'dark'
              ? 'bg-gradient-to-r from-white via-white/80 to-transparent'
              : 'bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-transparent',
          )}
          aria-hidden
        />
        <div
          className={cn(
            'md:hidden pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-3xl transition-opacity duration-200',
            scrollState.canRight ? 'opacity-100' : 'opacity-0',
            theme === 'dark'
              ? 'bg-gradient-to-l from-white via-white/80 to-transparent'
              : 'bg-gradient-to-l from-zinc-900 via-zinc-900/80 to-transparent',
          )}
          aria-hidden
        />
      </div>

      {/* ─── Drawer modules ──────────────────────────────────────── */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Header du drawer */}
            <div className="bg-zinc-900 text-white px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Navigation complète</p>
                <h2 className="text-base font-black tracking-tight leading-none mt-0.5">Tous les modules</h2>
                {profil && (
                  <p className="text-[11px] text-zinc-400 mt-1 truncate">
                    {isManager ? '👑 Gérant' : (profil.poste ?? 'Employé')} · {profil.email}
                  </p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition shrink-0"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lien "Vue d'ensemble" — page index toutes catégories */}
            <Link
              href="/admin/cat"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] transition"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 text-2xl shrink-0">🧭</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black tracking-tight leading-none">Vue d&apos;ensemble</p>
                <p className="text-[11px] text-emerald-100 mt-0.5">Toutes les catégories en grand format</p>
              </div>
              <span className="text-xl">→</span>
            </Link>

            {/* Barre de recherche sticky */}
            <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-3 py-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Chercher un module… (ex: stock, TVA, allergènes)"
                  className="w-full h-11 pl-10 pr-9 rounded-full border-2 border-zinc-200 bg-zinc-50 text-sm font-medium placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-200 active:scale-95 transition"
                    aria-label="Effacer la recherche"
                  >
                    <X className="h-3.5 w-3.5 text-zinc-600" />
                  </button>
                )}
              </div>
              {nbAlertesRouges > 0 && !query && (
                <p className="mt-2 px-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {nbAlertesRouges} alerte{nbAlertesRouges > 1 ? 's' : ''} urgente{nbAlertesRouges > 1 ? 's' : ''} non résolue{nbAlertesRouges > 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Contenu scrollable : groupes */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {groupesFiltres.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-2">{query ? '🔍' : '🔒'}</p>
                  <p className="text-sm text-zinc-500 italic">
                    {query
                      ? <>Aucun module ne correspond à <span className="font-bold text-zinc-700">«&nbsp;{query}&nbsp;»</span>.</>
                      : 'Aucun module disponible pour ton poste.'}
                  </p>
                </div>
              ) : groupesFiltres.map(g => (
                <div key={g.groupe}>
                  <h3 className="px-1 mb-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                    <span className="text-base">{g.emoji}</span>
                    {g.groupe}
                    <span className="text-zinc-300 font-normal">· {g.items.length}</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.items.map(it => {
                      const active = pathname === it.href || (it.href !== '/admin' && pathname.startsWith(it.href + '/'))
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-xs font-bold min-h-[44px] border-2 active:scale-95 transition',
                            active
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : 'bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300',
                          )}
                        >
                          <span className="text-lg leading-none shrink-0">{it.emoji}</span>
                          <span className="truncate">{it.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Notifications push (si profil) */}
              {profil && (
                <div className="pt-2">
                  <PushNotifSwitch />
                </div>
              )}
            </nav>

            {/* Footer : déconnexion */}
            {profil && (
              <div className="border-t border-zinc-200 p-3 bg-zinc-50">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold active:scale-95 transition"
                  >
                    <LogOut className="h-4 w-4" /> Déconnexion
                  </button>
                </form>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  )
}
