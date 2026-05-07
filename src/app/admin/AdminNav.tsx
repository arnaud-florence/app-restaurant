'use client'

// Module 28 — Navigation latérale admin avec sidebar groupée + mobile hamburger.

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu, X, LogOut, BarChart3, ChefHat, Wine, ShieldCheck, Users, Wallet,
  Calendar, Building2, Truck, Sparkles, Settings, Tv, GraduationCap,
  AlertTriangle, FileText, Trash2, Zap, NotebookPen, CloudSun, Wrench,
  Store, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/login/actions'

type LinkItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
type Group = { label: string; items: LinkItem[] }

const GROUPES: Group[] = [
  {
    label: 'Pilotage',
    items: [
      { href: '/admin/pilotage',     label: 'Tableau de bord', icon: BarChart3 },
      { href: '/admin/assistant',    label: 'Assistant IA',    icon: Sparkles },
      { href: '/admin/journal',      label: 'Journal de bord', icon: NotebookPen },
      { href: '/admin/previsionnel', label: 'Prévisionnel',    icon: CloudSun },
    ],
  },
  {
    label: 'Cuisine',
    items: [
      { href: '/admin/recettes',     label: 'Recettes',     icon: ChefHat },
      { href: '/admin/ingredients',  label: 'Ingrédients',  icon: Store },
      { href: '/admin/stock',        label: 'Stock',        icon: Truck },
      { href: '/admin/fournisseurs', label: 'Fournisseurs', icon: Truck },
      { href: '/admin/allergenes',   label: 'Allergènes',   icon: AlertTriangle },
      { href: '/admin/boissons',     label: 'Boissons',     icon: Wine },
    ],
  },
  {
    label: 'Service',
    items: [
      { href: '/admin/affichage',    label: 'Affichage TV', icon: Tv },
      { href: '/admin/reservations', label: 'Réservations', icon: Calendar },
      { href: '/admin/groupes',      label: 'Groupes',      icon: Users },
      { href: '/admin/clients',      label: 'Clients/CRM',  icon: Users },
    ],
  },
  {
    label: 'Équipe',
    items: [
      { href: '/admin/rh',         label: 'Ressources humaines', icon: Users },
      { href: '/admin/formation',  label: 'Formation',           icon: GraduationCap },
    ],
  },
  {
    label: 'Conformité',
    items: [
      { href: '/admin/hygiene',     label: 'Hygiène / HACCP', icon: ShieldCheck },
      { href: '/admin/legal',       label: 'Légal',           icon: FileText },
      { href: '/admin/maintenance', label: 'Maintenance',     icon: Wrench },
      { href: '/admin/dechets',     label: 'Déchets',         icon: Trash2 },
    ],
  },
  {
    label: 'Finances',
    items: [
      { href: '/admin/finances', label: 'P&L / TVA / trésorerie', icon: Wallet },
      { href: '/admin/energie',  label: 'Énergie',                icon: Zap },
    ],
  },
  {
    label: 'Système',
    items: [
      { href: '/admin/setup',    label: 'Configuration', icon: Settings },
      { href: '/admin/securite', label: 'Sécurité',      icon: ShieldCheck },
    ],
  },
]

const SHORTCUTS_OPS = [
  { href: '/caisse',  label: 'Caisse',  icon: Wallet },
  { href: '/serveur', label: 'Serveur', icon: BookOpen },
  { href: '/cuisine', label: 'Cuisine', icon: ChefHat },
  { href: '/bar',     label: 'Bar',     icon: Wine },
]

export default function AdminNav({ profil }: { profil: { email: string; role: string } }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Top bar mobile */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b flex items-center px-3 h-12">
        <button onClick={() => setOpen(true)} aria-label="Menu" className="p-2 -ml-2">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex-1 text-center font-semibold truncate text-sm">
          {GROUPES.flatMap(g => g.items).find(i => pathname?.startsWith(i.href))?.label ?? 'Admin'}
        </div>
        <Building2 className="h-5 w-5 text-emerald-600" />
      </header>

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpen(false)} />
      )}

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

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4 text-sm">
          {GROUPES.map(g => (
            <div key={g.label}>
              <h3 className="px-2 mb-1 text-xs font-bold uppercase tracking-wider text-stone-400">{g.label}</h3>
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
            </div>
          ))}

          <div>
            <h3 className="px-2 mb-1 text-xs font-bold uppercase tracking-wider text-stone-400">Opérations</h3>
            <ul className="space-y-0.5">
              {SHORTCUTS_OPS.map(it => {
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
        </nav>

        {/* Footer profil + logout */}
        <div className="border-t border-stone-700 p-3 text-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-full bg-emerald-600 flex items-center justify-center font-bold uppercase">
              {profil.email[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-xs">{profil.email}</div>
              <div className="text-xs text-stone-400">{profil.role}</div>
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
