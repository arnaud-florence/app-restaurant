'use client'

// Module 28 — Navigation latérale admin avec sidebar groupée + mobile hamburger.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, X, LogOut, BarChart3, ChefHat, Wine, ShieldCheck, Users, Wallet,
  Calendar, Building2, Truck, Sparkles, Settings, Tv, GraduationCap,
  AlertTriangle, FileText, Trash2, Zap, NotebookPen, CloudSun, Wrench,
  Store, BookOpen, Trophy, Calculator, ChevronDown, ChevronRight, Home, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/login/actions'
import { canAccess, type CustomPermissions } from '@/lib/permissions'
import NotificationsBell from '@/components/NotificationsBell'

type LinkItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
type Group = { label: string; emoji: string; items: LinkItem[] }

// 7 groupes consolidés (vs 9 avant).
// "Mon profil" = toujours expanded (1 seul item).
// Les autres groupes : collapsibles, l'état est sauvé en localStorage.
const GROUPES: Group[] = [
  {
    label: 'Mon profil', emoji: '🏠',
    items: [
      { href: '/mon-espace',         label: 'Mon espace',      icon: Home },
    ],
  },
  {
    label: 'Pilotage', emoji: '📊',
    items: [
      { href: '/admin/pilotage',     label: 'Tableau de bord', icon: BarChart3 },
      { href: '/admin/assistant',    label: 'Assistant IA',    icon: Sparkles },
      { href: '/admin/journal',      label: 'Journal de bord', icon: NotebookPen },
      { href: '/admin/previsionnel', label: 'Prévisionnel',    icon: CloudSun },
    ],
  },
  {
    label: 'Opérations', emoji: '🍽️',
    items: [
      { href: '/admin/recettes',     label: 'Recettes',     icon: ChefHat },
      { href: '/admin/plats-du-jour', label: 'Plats du jour', icon: Sparkles },
      { href: '/admin/capacite-cuisine', label: 'Capacité cuisine', icon: ChefHat },
      { href: '/admin/ingredients',  label: 'Ingrédients',  icon: Store },
      { href: '/admin/stock',        label: 'Stock',        icon: Truck },
      { href: '/admin/fournisseurs', label: 'Fournisseurs', icon: Truck },
      { href: '/admin/boissons',     label: 'Boissons',     icon: Wine },
      { href: '/admin/allergenes',   label: 'Allergènes',   icon: AlertTriangle },
    ],
  },
  {
    label: 'Clientèle', emoji: '👥',
    items: [
      { href: '/admin/reservations', label: 'Réservations', icon: Calendar },
      { href: '/admin/groupes',      label: 'Groupes',      icon: Users },
      { href: '/admin/clients',      label: 'Clients / CRM', icon: Users },
      { href: '/admin/clients/fidelite', label: 'Programme fidélité', icon: Star },
      { href: '/admin/promotions',   label: 'Promotions',          icon: Sparkles },
      { href: '/admin/codes-promo',  label: 'Codes promo',         icon: BookOpen },
      { href: '/admin/cartes-cadeaux', label: 'Cartes cadeaux',     icon: Sparkles },
      { href: '/admin/affichage',    label: 'Affichage TV', icon: Tv },
    ],
  },
  {
    label: 'Gestion équipe & finances', emoji: '💼',
    items: [
      { href: '/admin/rh',           label: 'Ressources humaines', icon: Users },
      { href: '/formation',          label: 'Mes manuels',         icon: BookOpen },
      { href: '/admin/formation',    label: 'Gérer guides',        icon: GraduationCap },
      { href: '/admin/challenges',   label: 'Challenges',          icon: Trophy },
      { href: '/admin/economie',     label: 'Centre économique',   icon: Calculator },
      { href: '/admin/finances',     label: 'Finances / TVA',      icon: Wallet },
      { href: '/admin/energie',      label: 'Énergie',             icon: Zap },
    ],
  },
  {
    label: 'Conformité', emoji: '🛡️',
    items: [
      { href: '/admin/hygiene',      label: 'Hygiène / HACCP',     icon: ShieldCheck },
      { href: '/admin/dechets',      label: 'Déchets (AGEC)',      icon: Trash2 },
      { href: '/admin/legal',        label: 'Légal',               icon: FileText },
      { href: '/admin/maintenance',  label: 'Maintenance',         icon: Wrench },
    ],
  },
  {
    label: 'Système', emoji: '⚙️',
    items: [
      { href: '/admin/setup',        label: 'Configuration',       icon: Settings },
      { href: '/admin/securite',     label: 'Sécurité',            icon: ShieldCheck },
    ],
  },
]

const STORAGE_KEY = 'admin_nav_collapsed'

const SHORTCUTS_OPS = [
  { href: '/caisse',  label: 'Caisse',  icon: Wallet },
  { href: '/serveur', label: 'Serveur', icon: BookOpen },
  { href: '/cuisine', label: 'Cuisine', icon: ChefHat },
  { href: '/bar',     label: 'Bar',     icon: Wine },
]

type AdminNavProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
}

export default function AdminNav({ profil }: { profil: AdminNavProfil }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Filtrage par permissions : un employé voit uniquement les modules auxquels il a accès.
  // Le manager voit tout.
  const isManager = profil.role === 'manager'
  const peutVoir = (href: string) =>
    isManager || canAccess(profil.poste, href, profil.custom_permissions)

  const groupesFiltres = GROUPES
    .map(g => ({ ...g, items: g.items.filter(it => peutVoir(it.href)) }))
    .filter(g => g.items.length > 0)

  // Hydrate les groupes collapsed depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCollapsed(new Set(JSON.parse(raw)))
    } catch { /* ignore */ }
  }, [])

  function toggleGroup(label: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  // Le groupe contenant l'URL actuelle est toujours expanded
  function isGroupCollapsed(g: Group) {
    if (g.items.length <= 1) return false                    // Mon profil = jamais collapsed
    const containsActive = g.items.some(it =>
      pathname === it.href || pathname?.startsWith(it.href + '/'),
    )
    if (containsActive) return false
    return collapsed.has(g.label)
  }

  // Raccourcis bottom-nav mobile : 4 postes ops + bouton menu (5 zones tactiles).
  const BOTTOM_NAV_ALL: Array<{ href: string; label: string; emoji: string }> = [
    { href: '/serveur', label: 'Serveur', emoji: '🍽️' },
    { href: '/bar',     label: 'Bar',     emoji: '🍺' },
    { href: '/cuisine', label: 'Cuisine', emoji: '👨‍🍳' },
    { href: '/caisse',  label: 'Caisse',  emoji: '💰' },
  ]
  const BOTTOM_NAV = BOTTOM_NAV_ALL.filter(it => peutVoir(it.href))

  return (
    <>      {/* Top bar mobile (titre courant + logo) */}
      <header className="md:hidden sticky top-0 z-30 bg-white border-b flex items-center px-3 h-12">
        <Building2 className="h-5 w-5 text-emerald-600" />
        <div className="flex-1 text-center font-semibold truncate text-sm">
          {groupesFiltres.flatMap(g => g.items).find(i => pathname === i.href || pathname?.startsWith(i.href + '/'))?.label ?? 'Admin'}
        </div>
        <NotificationsBell />
      </header>

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Bottom nav mobile — accessible au pouce */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {BOTTOM_NAV.map(it => {
          const active = pathname === it.href || pathname?.startsWith(it.href + '/')
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center min-h-[64px] py-1 text-[11px] gap-0.5 font-semibold',
                active ? 'text-emerald-700 bg-emerald-50' : 'text-zinc-600',
              )}
            >
              <span className="text-2xl leading-none">{it.emoji}</span>
              <span>{it.label}</span>
            </Link>
          )
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center min-h-[64px] py-1 text-[11px] gap-0.5 text-zinc-600"
          aria-label="Plus de modules"
        >
          <Menu className="h-6 w-6" />
          <span>Plus</span>
        </button>
      </nav>

      {/* Sidebar */}
      <aside className={cn(
        'bg-stone-900 text-stone-100 flex flex-col w-72 shrink-0 z-50 transition-transform',
        'md:sticky md:top-0 md:translate-x-0 md:h-screen',
        'fixed inset-y-0 left-0',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        <div className="px-4 py-4 border-b border-stone-700 flex items-center justify-between">
          <Link href="/admin/pilotage" className="flex items-center gap-2 font-bold" onClick={() => setOpen(false)}>
            <Building2 className="h-5 w-5 text-emerald-400" />
            App Restaurant
          </Link>
          <button onClick={() => setOpen(false)} className="md:hidden p-1 -mr-1" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-2 text-sm">
          {groupesFiltres.map(g => {
            const isCol = isGroupCollapsed(g)
            const isSingle = g.items.length === 1
            return (
              <div key={g.label}>
                {isSingle ? (
                  // Pas de header collapsible pour les groupes à 1 item
                  <ul className="space-y-0.5">
                    {g.items.map(it => {
                      const active = pathname === it.href || pathname?.startsWith(it.href + '/')
                      const Icon = it.icon
                      return (
                        <li key={it.href}>
                          <Link
                            href={it.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
                              active ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:bg-stone-800 hover:text-white',
                            )}
                          >
                            <span className="text-base">{g.emoji}</span>
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate font-medium">{it.label}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.label)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-stone-400 hover:text-stone-200 hover:bg-stone-800/40 rounded-md"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm">{g.emoji}</span>
                        {g.label}
                        <span className="text-stone-500">({g.items.length})</span>
                      </span>
                      {isCol ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {!isCol && (
                      <ul className="space-y-0.5 mt-0.5 ml-1">
                        {g.items.map(it => {
                          const active = pathname === it.href || pathname?.startsWith(it.href + '/')
                          const Icon = it.icon
                          return (
                            <li key={it.href}>
                              <Link
                                href={it.href}
                                onClick={() => setOpen(false)}
                                className={cn(
                                  'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                                  active ? 'bg-emerald-600 text-white' : 'text-stone-300 hover:bg-stone-800 hover:text-white',
                                )}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{it.label}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )
          })}

          {SHORTCUTS_OPS.filter(it => peutVoir(it.href)).length > 0 && (
            <div>
              <h3 className="px-2 mb-1 text-xs font-bold uppercase tracking-wider text-stone-400">Opérations</h3>
              <ul className="space-y-0.5">
                {SHORTCUTS_OPS.filter(it => peutVoir(it.href)).map(it => {
                  const Icon = it.icon
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-stone-300 hover:bg-stone-800 hover:text-white transition-colors"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{it.label}</span>
                        <span className="ml-auto text-xs opacity-50">↗</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </nav>

        {/* Footer profil + logout */}
        <div className="border-t border-stone-700 p-3 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-full bg-emerald-600 flex items-center justify-center font-bold uppercase">
              {profil.email[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-xs">{profil.email}</div>
              <div className="text-xs text-stone-400">
                {profil.role === 'manager' ? 'Gérant' : (profil.poste ?? 'Employé')}
              </div>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="w-full flex items-center justify-center gap-1 rounded-md bg-stone-800 hover:bg-stone-700 px-2 py-1.5 text-xs font-medium">
              <LogOut className="h-3.5 w-3.5" /> Déconnexion
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
