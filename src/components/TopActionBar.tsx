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
import {
  Menu, X, LogOut, Search, AlertTriangle, Loader2, Flame, Star,
  Home, BarChart3, Utensils, ChefHat, Users, Wallet, ShieldCheck, Settings,
  Wine, Pizza, ShoppingBag, Bike, BellRing, Receipt, GraduationCap,
  Target, Sparkles, Notebook, CloudSun, Leaf, Package, Truck,
  Calendar, BedDouble, User, Gift, Tag, Ticket, Award, Megaphone,
  MessageSquare, BookOpen, Trophy, Calculator, Zap, Trash2, ScrollText,
  Wrench, Lock, Tv,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccess, type CustomPermissions } from '@/lib/permissions'
import { logoutAction } from '@/app/login/actions'
import PushNotifSwitch from '@/components/PushNotifSwitch'
import { useLiveFindings, type Finding } from '@/hooks/useLiveFindings'
import { usePinnedModules, MAX_PINNED } from '@/hooks/usePinnedModules'
import { CATEGORIES, resolveActiveCategory, POSTE_PRIORITES_CATEGORIES, type Category } from '@/lib/navigation'

export type TopActionBarTheme = 'light' | 'dark'

export type TopActionBarProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
} | null

type Tone = 'emerald' | 'amber' | 'violet' | 'blue' | 'red' | 'rose' | 'zinc'

// ─── Mapping icônes Lucide pour chaque chip ───────────────────────
// Remplace les emojis par de vraies icônes vectorielles pour un look pro.
const ICON_BY_CAT_SLUG: Record<string, LucideIcon> = {
  pilotage:      BarChart3,
  service:       Utensils,
  'cuisine-stock': ChefHat,
  clientele:     Users,
  equipe:        GraduationCap,
  finances:      Wallet,
  conformite:    ShieldCheck,
  systeme:       Settings,
}

/** Mapping exhaustif href → icône Lucide pour tous les sous-modules
 *  (ops + admin). Utilisé par les chips épingles, le drawer Modules
 *  et la propagation des icônes partout dans la navigation. */
const ICON_BY_HREF: Record<string, LucideIcon> = {
  // Ops (service)
  '/serveur':                 Utensils,
  '/caisse':                  Receipt,
  '/cuisine':                 ChefHat,
  '/pizza':                   Pizza,
  '/bar':                     Wine,
  '/emporter':                ShoppingBag,
  '/livreur':                 Bike,
  '/reception':               BellRing,
  // Pilotage
  '/mon-espace':              Home,
  '/admin':                   BarChart3,
  '/admin/pilotage':          Target,
  '/admin/assistant':         Sparkles,
  '/admin/journal':           Notebook,
  '/admin/previsionnel':      CloudSun,
  // Cuisine & stock
  '/admin/recettes':          ChefHat,
  '/admin/plats-du-jour':     Sparkles,
  '/admin/capacite-cuisine':  Settings,
  '/admin/ingredients':       Leaf,
  '/admin/stock':             Package,
  '/admin/fournisseurs':      Truck,
  '/admin/boissons':          Wine,
  '/admin/allergenes':        AlertTriangle,
  // Clientèle
  '/admin/reservations':      Calendar,
  '/admin/chambres':          BedDouble,
  '/admin/groupes':           Users,
  '/admin/clients':           User,
  '/admin/clients/fidelite':  Star,
  '/admin/promotions':        Gift,
  '/admin/codes-promo':       Tag,
  '/admin/cartes-cadeaux':    Ticket,
  '/admin/reputation':        Award,
  '/admin/marketing':         Megaphone,
  '/admin/affichage':         Tv,
  // Équipe & formation
  '/admin/rh':                Users,
  '/equipes':                 MessageSquare,
  '/formation':               BookOpen,
  '/admin/formation':         GraduationCap,
  '/admin/challenges':        Trophy,
  // Finances
  '/admin/finances':          Wallet,
  '/admin/economie':          Calculator,
  '/admin/energie':           Zap,
  // Conformité
  '/admin/hygiene':           Sparkles,
  '/admin/dechets':           Trash2,
  '/admin/legal':             ScrollText,
  '/admin/maintenance':       Wrench,
  // Système
  '/admin/setup':             Settings,
  '/admin/securite':          Lock,
}

// Alias pour compat (utilisé dans le code ops chips)
const ICON_BY_OPS_HREF = ICON_BY_HREF

/** Style éditorial premium : juste un trait vertical coloré + icône line discrète.
 *  Inspiré des menus de restaurants haut de gamme — moins "jeu mobile", plus "magazine". */
function ChipIcon({
  Icon, tone, active,
}: { Icon: LucideIcon; tone: Tone; active: boolean }) {
  const colors: Record<Tone, string> = {
    emerald: 'bg-emerald-500',
    amber:   'bg-amber-500',
    violet:  'bg-violet-500',
    blue:    'bg-blue-500',
    red:     'bg-red-500',
    rose:    'bg-rose-500',
    zinc:    'bg-zinc-900',
  }
  return (
    <span className="inline-flex items-center gap-2 shrink-0" aria-hidden>
      {/* Trait vertical de couleur (style "marker éditorial") */}
      <span className={cn('w-[3px] h-5 md:h-4 rounded-full', active ? 'bg-current' : colors[tone])} />
      {/* Icône ligne discrète, pas de carré encadrant */}
      <Icon className={cn('h-4 w-4 md:h-3.5 md:w-3.5', active ? 'opacity-100' : 'opacity-70')} strokeWidth={2} />
    </span>
  )
}

/** Magic-line indicator : petit underline animé sous le chip actif (signature visuelle). */
function ChipActiveIndicator({ tone }: { tone: Tone }) {
  const colors: Record<Tone, string> = {
    emerald: 'bg-emerald-500',
    amber:   'bg-amber-500',
    violet:  'bg-violet-500',
    blue:    'bg-blue-500',
    red:     'bg-red-500',
    rose:    'bg-rose-500',
    zinc:    'bg-zinc-900',
  }
  return (
    <>
      {/* Mobile : barre en bas → indicateur en HAUT du chip (pointe vers le haut/contenu) */}
      <span
        className={cn(
          'md:hidden absolute -top-1.5 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full shadow-lg',
          colors[tone],
        )}
        aria-hidden
      />
      {/* Desktop : barre en haut → indicateur en BAS du chip (pointe vers le bas/contenu) */}
      <span
        className={cn(
          'hidden md:block absolute -bottom-2 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full',
          colors[tone],
        )}
        aria-hidden
      />
    </>
  )
}

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

  /** Sous-modules épinglés par l'utilisateur (localStorage). Apparaissent dans
   *  la barre entre Accueil et les catégories. Max 5. Pinning/unpinning via
   *  l'étoile dans le drawer Modules. */
  const { pinned, isPinned, togglePin, count: nbPinned } = usePinnedModules()

  // Résout les hrefs pinnés en items concrets (label/emoji/tone) depuis CATEGORIES
  const pinnedItems = useMemo(() => {
    const allItems: Array<{ href: string; emoji: string; label: string; tone: Tone }> = []
    for (const c of CATEGORIES) {
      for (const it of c.items) {
        allItems.push({ href: it.href, emoji: it.emoji, label: it.label, tone: c.tone as Tone })
      }
    }
    const byHref = new Map(allItems.map(i => [i.href, i]))
    return pinned.map(href => byHref.get(href)).filter(Boolean) as Array<{ href: string; emoji: string; label: string; tone: Tone }>
  }, [pinned])

  /** Mode "Service intensif" : remplace les chips catégorie par les écrans ops directs.
   *  Persisté en localStorage 'service_intense_mode' (boolean).
   *  Utile pendant le rush où on veut accéder à Salle/Caisse/Cuisine en 1 clic
   *  sans s'embarrasser des catégories admin (Finances, Conformité, etc.). */
  const [serviceMode, setServiceMode] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem('service_intense_mode')
      if (v === '1') setServiceMode(true)
    } catch { /* SSR / private mode */ }
  }, [])
  function toggleServiceMode() {
    setServiceMode(prev => {
      const next = !prev
      try { localStorage.setItem('service_intense_mode', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

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

  // Chips OPS pour le mode service intensif (sous-modules directs de cat 'service')
  const opsChipsBruts: Array<{ href: string; emoji: string; label: string; tone: Tone }> = [
    { href: '/serveur',   emoji: '🍽',   label: 'Salle',     tone: 'blue' },
    { href: '/caisse',    emoji: '💰',   label: 'Caisse',    tone: 'amber' },
    { href: '/cuisine',   emoji: '👨‍🍳', label: 'Cuisine',   tone: 'amber' },
    { href: '/pizza',     emoji: '🍕',   label: 'Pizza',     tone: 'red' },
    { href: '/bar',       emoji: '🍷',   label: 'Bar',       tone: 'violet' },
    { href: '/emporter',  emoji: '🛒',   label: 'Snack',     tone: 'emerald' },
    { href: '/livreur',   emoji: '🛵',   label: 'Livreur',   tone: 'emerald' },
    { href: '/reception', emoji: '🛎',   label: 'Réception', tone: 'blue' },
  ]
  const opsChipsVisibles = useMemo(
    () => opsChipsBruts.filter(c => peutVoir(c.href)),
    [profil?.poste, profil?.custom_permissions, isManager],
  )

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
  // Design premium frosted glass : backdrop-blur fort + gradient subtil + glow colored
  // Mode service intensif : bordure ambre + ring glow
  const wrapperCls = theme === 'dark'
    ? cn(
        // Page sombre → barre CLAIRE en frosted glass
        'fixed bottom-3 inset-x-3 z-30 rounded-[28px] overflow-hidden',
        'bg-white/95 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/85',
        'border shadow-[0_8px_32px_-4px_rgba(0,0,0,0.25),0_4px_12px_-2px_rgba(0,0,0,0.15),0_-1px_0_0_rgba(255,255,255,0.6)_inset]',
        serviceMode
          ? 'border-amber-500/80 ring-2 ring-amber-400/40 shadow-amber-500/20'
          : 'border-zinc-200/80 ring-1 ring-black/5',
        'md:static md:inset-auto md:rounded-none md:border-0 md:border-b md:border-zinc-200 md:shadow-none md:overflow-visible md:ring-0 md:bg-white md:backdrop-blur-0',
      )
    : cn(
        // Page claire → barre SOMBRE en frosted glass premium
        'fixed bottom-3 inset-x-3 z-30 rounded-[28px] overflow-hidden',
        'bg-zinc-900/95 backdrop-blur-2xl supports-[backdrop-filter]:bg-zinc-900/85',
        'border shadow-[0_8px_32px_-4px_rgba(0,0,0,0.45),0_4px_12px_-2px_rgba(0,0,0,0.25),0_-1px_0_0_rgba(255,255,255,0.08)_inset]',
        serviceMode
          ? 'border-amber-500/80 ring-2 ring-amber-400/40 shadow-amber-500/30'
          : 'border-white/10 ring-1 ring-white/5',
        'md:static md:inset-auto md:rounded-none md:border-0 md:border-b md:border-zinc-800 md:shadow-none md:overflow-visible md:ring-0 md:bg-zinc-900 md:backdrop-blur-0',
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
          {/* Tous les chips sur 1 seule ligne, scroll horizontal si débord */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2.5 md:py-1.5 min-w-max flex-nowrap">
            {/* Chip "Accueil" spéciale — toujours en premier, pointe vers la vue d'ensemble */}
            {(() => {
              const href = '/admin/cat'
              const active = pathname === '/admin/cat'
              const isPending = pendingHref === href
              const cls = active ? tones.emerald.active : tones.emerald.base
              return (
                <Link
                  href={href}
                  ref={active && !serviceMode ? activeChipRef : undefined}
                  onClick={() => { tapHaptic(); setPendingHref(href) }}
                  style={{ scrollSnapAlign: 'start' }}
                  aria-current={active ? 'page' : undefined}
                  title="Accueil · Vue d'ensemble"
                  className={cn(
                    'relative group inline-flex items-center gap-2 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0 md:hover:-translate-y-0.5',
                    'h-14 pl-2 pr-4 text-[13px] md:h-10 md:pl-1.5 md:pr-3.5 md:text-xs',
                    isPending && 'animate-pulse',
                    cls,
                  )}
                >
                  {isPending ? (
                    <span className="inline-flex items-center justify-center w-7 h-7 md:w-6 md:h-6 rounded-lg bg-white/20" aria-hidden>
                      <Loader2 className="h-4 w-4 md:h-3.5 md:w-3.5 animate-spin" />
                    </span>
                  ) : (
                    <ChipIcon Icon={Home} tone="emerald" active={active} />
                  )}
                  <span>Accueil</span>
                  {active && <ChipActiveIndicator tone="emerald" />}
                </Link>
              )
            })()}

            {/* Toggle "Mode service intensif" — bouton flamme visible juste après Accueil */}
            <button
              type="button"
              onClick={() => { tapHaptic(); toggleServiceMode() }}
              className={cn(
                'group inline-flex items-center gap-2 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                'h-14 pl-2 pr-4 text-[13px] md:h-10 md:pl-1.5 md:pr-3.5 md:text-xs',
                serviceMode
                  ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/40 animate-pulse'
                  : (theme === 'dark'
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-amber-500/60 hover:text-amber-300'),
              )}
              aria-label={serviceMode ? 'Désactiver le mode service intensif' : 'Activer le mode service intensif'}
              title={serviceMode ? 'Service en cours — clic pour mode complet' : 'Mode service intensif (ops uniquement)'}
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-lg shadow-md shrink-0 transition-transform group-active:scale-90',
                  'w-7 h-7 md:w-6 md:h-6',
                  serviceMode ? 'bg-white text-amber-600' : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
                )}
                aria-hidden
              >
                <Flame className={cn('h-4 w-4 md:h-3.5 md:w-3.5', serviceMode && 'fill-current')} strokeWidth={2.5} />
              </span>
              <span>Service</span>
            </button>

            {/* Chips ÉPINGLÉS (favoris perso) — entre Accueil/Service et les autres */}
            {pinnedItems.filter(p => peutVoir(p.href)).map(p => {
              const active = pathname === p.href || pathname.startsWith(p.href + '/')
              const isPending = pendingHref === p.href
              const cls = active ? tones[p.tone].active : tones[p.tone].base
              // Icône : ops mapping en priorité, sinon fallback Star (chip épinglé générique)
              const PinIcon = ICON_BY_OPS_HREF[p.href] ?? Star
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  ref={active ? activeChipRef : undefined}
                  onClick={() => { tapHaptic(); setPendingHref(p.href) }}
                  style={{ scrollSnapAlign: 'start' }}
                  aria-current={active ? 'page' : undefined}
                  title={`⭐ ${p.label}`}
                  className={cn(
                    'group relative inline-flex items-center gap-2 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                    'h-14 pl-2 pr-4 text-[13px] md:h-10 md:pl-1.5 md:pr-3.5 md:text-xs',
                    isPending && 'animate-pulse',
                    cls,
                  )}
                >
                  {/* Mini étoile en haut à droite pour signaler le pin */}
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-amber-900 shadow-md z-10">
                    <Star className="w-2.5 h-2.5 fill-current" aria-hidden />
                  </span>
                  {isPending ? (
                    <span className="inline-flex items-center justify-center w-7 h-7 md:w-6 md:h-6 rounded-lg bg-white/20" aria-hidden>
                      <Loader2 className="h-4 w-4 md:h-3.5 md:w-3.5 animate-spin" />
                    </span>
                  ) : (
                    <ChipIcon Icon={PinIcon} tone={p.tone} active={active} />
                  )}
                  <span>{p.label}</span>
                  {active && <ChipActiveIndicator tone={p.tone} />}
                </Link>
              )
            })}

            {/* En MODE SERVICE INTENSIF : on remplace les chips catégorie par les 8 ops directs */}
            {serviceMode ? opsChipsVisibles.map(op => {
              const active = pathname === op.href || pathname.startsWith(op.href + '/')
              const isPending = pendingHref === op.href
              const cls = active ? tones[op.tone].active : tones[op.tone].base
              const OpIcon = ICON_BY_OPS_HREF[op.href] ?? Utensils
              return (
                <Link
                  key={op.href}
                  href={op.href}
                  ref={active ? activeChipRef : undefined}
                  onClick={() => { tapHaptic(); setPendingHref(op.href) }}
                  style={{ scrollSnapAlign: 'start' }}
                  aria-current={active ? 'page' : undefined}
                  title={op.label}
                  className={cn(
                    'relative group inline-flex items-center gap-2 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0 md:hover:-translate-y-0.5',
                    'h-14 pl-2 pr-4 text-[13px] md:h-10 md:pl-1.5 md:pr-3.5 md:text-xs',
                    isPending && 'animate-pulse',
                    cls,
                  )}
                >
                  {isPending ? (
                    <span className="inline-flex items-center justify-center w-7 h-7 md:w-6 md:h-6 rounded-lg bg-white/20" aria-hidden>
                      <Loader2 className="h-4 w-4 md:h-3.5 md:w-3.5 animate-spin" />
                    </span>
                  ) : (
                    <ChipIcon Icon={OpIcon} tone={op.tone} active={active} />
                  )}
                  <span>{op.label}</span>
                  {active && <ChipActiveIndicator tone={op.tone} />}
                </Link>
              )
            }) : chipsVisibles.map((cat, idx) => {
              // Toutes les catégories pointent vers leur page /admin/cat/<slug>
              const href = `/admin/cat/${cat.slug}`
              const active = activeCategory?.slug === cat.slug
              const isPending = pendingHref === href
              const cls = active ? tones[cat.tone].active : tones[cat.tone].base
              const shortcut = idx < 9 ? `Alt+${idx + 1}` : undefined
              const CatIcon = ICON_BY_CAT_SLUG[cat.slug] ?? Settings
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
                    'relative group inline-flex items-center gap-2 rounded-full border-2 font-bold whitespace-nowrap active:scale-95 transition shrink-0 md:hover:-translate-y-0.5',
                    'h-14 pl-2 pr-4 text-[13px] md:h-10 md:pl-1.5 md:pr-3.5 md:text-xs',
                    isPending && 'animate-pulse',
                    cls,
                  )}
                >
                  {isPending ? (
                    <span className="inline-flex items-center justify-center w-7 h-7 md:w-6 md:h-6 rounded-lg bg-white/20" aria-hidden>
                      <Loader2 className="h-4 w-4 md:h-3.5 md:w-3.5 animate-spin" />
                    </span>
                  ) : (
                    <ChipIcon Icon={CatIcon} tone={cat.tone as Tone} active={active} />
                  )}
                  <span>{cat.label}</span>
                  {active && <ChipActiveIndicator tone={cat.tone as Tone} />}
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
              {!query && (
                <div className="mt-2 flex items-center justify-between gap-2 px-2">
                  {nbAlertesRouges > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {nbAlertesRouges} alerte{nbAlertesRouges > 1 ? 's' : ''} urgente{nbAlertesRouges > 1 ? 's' : ''}
                    </span>
                  ) : <span />}
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {nbPinned} / {MAX_PINNED} épinglés
                  </span>
                </div>
              )}
            </div>

            {/* Contenu scrollable — 2 modes selon query */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {query ? (
                // ── MODE RECHERCHE : résultats flat (sous-modules qui matchent) ──
                (() => {
                  const flatResults = groupesFiltres.flatMap(g => g.items.map(it => ({ ...it, groupe: g.groupe, groupeEmoji: g.emoji })))
                  if (flatResults.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-3xl mb-2">🔍</p>
                        <p className="text-sm text-zinc-500 italic">
                          Aucun module ne correspond à <span className="font-bold text-zinc-700">«&nbsp;{query}&nbsp;»</span>.
                        </p>
                      </div>
                    )
                  }
                  return (
                    <div>
                      <h3 className="px-1 mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        Résultats · {flatResults.length}
                      </h3>
                      <div className="space-y-1.5">
                        {flatResults.map(it => {
                          const active = pathname === it.href || (it.href !== '/admin' && pathname.startsWith(it.href + '/'))
                          const pinnedThis = isPinned(it.href)
                          const pinDisabled = !pinnedThis && nbPinned >= MAX_PINNED
                          const ResIcon = ICON_BY_HREF[it.href] ?? Settings
                          return (
                            <div key={it.href} className="relative">
                              <Link
                                href={it.href}
                                onClick={() => setOpen(false)}
                                className={cn(
                                  'flex items-center gap-3 rounded-xl px-2.5 py-2.5 pr-12 text-sm font-bold min-h-[52px] border-2 active:scale-[0.98] transition',
                                  active
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                    : 'bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300',
                                )}
                              >
                                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-100 text-zinc-700 shrink-0">
                                  <ResIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="truncate">{it.label}</p>
                                  <p className="text-[10px] text-zinc-400 font-normal truncate">{it.groupeEmoji} {it.groupe}</p>
                                </div>
                              </Link>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); if (!pinDisabled) togglePin(it.href) }}
                                disabled={pinDisabled}
                                aria-label={pinnedThis ? `Désépingler ${it.label}` : `Épingler ${it.label}`}
                                className={cn(
                                  'absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-full active:scale-90 transition',
                                  pinnedThis
                                    ? 'text-amber-500 hover:bg-amber-100'
                                    : 'text-zinc-300 hover:text-amber-500 hover:bg-amber-50',
                                  pinDisabled && 'opacity-40 cursor-not-allowed',
                                )}
                              >
                                <Star className={cn('h-4 w-4', pinnedThis && 'fill-current')} aria-hidden />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()
              ) : (
                // ── MODE PAR DÉFAUT (query vide) : chips catégories + épingles ──
                <>
                  {/* Mes épingles (si > 0) */}
                  {pinnedItems.filter(p => peutVoir(p.href)).length > 0 && (
                    <div>
                      <h3 className="px-1 mb-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        Mes épingles · {pinnedItems.filter(p => peutVoir(p.href)).length}
                      </h3>
                      <div className="space-y-1.5">
                        {pinnedItems.filter(p => peutVoir(p.href)).map(p => {
                          const PinIcon = ICON_BY_HREF[p.href] ?? Star
                          return (
                            <div key={p.href} className="relative">
                              <Link
                                href={p.href}
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 pr-12 text-sm font-bold min-h-[48px] border-2 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:border-amber-400 active:scale-[0.98] transition"
                              >
                                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shrink-0`}>
                                  <PinIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                                </span>
                                <span className="truncate flex-1">{p.label}</span>
                              </Link>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); togglePin(p.href) }}
                                aria-label={`Désépingler ${p.label}`}
                                title="Désépingler"
                                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-full text-amber-600 hover:bg-amber-200 active:scale-90 transition"
                              >
                                <Star className="h-4 w-4 fill-current" aria-hidden />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Catégories en tuiles colorées — raccourci vers /admin/cat/<slug> */}
                  <div>
                    <h3 className="px-1 mb-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Catégories · {groupesFiltres.length}
                    </h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CATEGORIES
                        .filter(c => c.items.some(it => peutVoir(it.href)))
                        .map(cat => {
                          const slug = cat.slug
                          const itemsVisibles = cat.items.filter(it => peutVoir(it.href)).length
                          const active = pathname === `/admin/cat/${slug}` || pathname.startsWith(`/admin/cat/${slug}/`)
                          const CatIcon = ICON_BY_CAT_SLUG[slug] ?? Settings
                          const gradients: Record<Tone, string> = {
                            emerald: 'from-emerald-500 to-teal-600',
                            amber:   'from-amber-500 to-orange-600',
                            violet:  'from-violet-500 to-purple-600',
                            blue:    'from-blue-500 to-sky-600',
                            red:     'from-red-500 to-rose-600',
                            rose:    'from-rose-500 to-pink-600',
                            zinc:    'from-zinc-700 to-zinc-900',
                          }
                          return (
                            <Link
                              key={slug}
                              href={`/admin/cat/${slug}`}
                              onClick={() => setOpen(false)}
                              className={cn(
                                'group flex items-center gap-2.5 rounded-xl px-3 py-3 text-xs font-bold min-h-[56px] border-2 active:scale-[0.97] transition',
                                active
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                  : 'bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300',
                              )}
                            >
                              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${gradients[cat.tone as Tone]} text-white shadow-md shrink-0 group-hover:scale-105 transition-transform`}>
                                <CatIcon className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-black tracking-tight truncate">{cat.label}</p>
                                <p className="text-[10px] text-zinc-500 font-normal">{itemsVisibles} module{itemsVisibles > 1 ? 's' : ''}</p>
                              </div>
                            </Link>
                          )
                        })}
                    </div>
                    <p className="text-[10px] text-zinc-400 italic mt-2 px-1">
                      Tape un nom dans la barre ci-dessus pour chercher directement un sous-module.
                    </p>
                  </div>
                </>
              )}

              {/* Notifications push (si profil) */}
              {profil && !query && (
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
