'use client'

// Barre de navigation tactile en bas d'écran pour l'espace OPÉRATIONNEL
// (/serveur, /cuisine, /bar, /caisse). 4 boutons fixes + un 5e bouton
// « Plus » qui ouvre un drawer listant les modules admin autorisés à
// l'utilisateur connecté. En mode kiosk (sans profil), seul les 4 boutons
// ops sont affichés.

import { useEffect, useState } from 'react'
import PushNotifSwitch from '@/components/PushNotifSwitch'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccess, type CustomPermissions } from '@/lib/permissions'
import { logoutAction } from '@/app/login/actions'

const NAV: Array<{ href: string; label: string; emoji: string }> = [
  { href: '/serveur', label: 'Serveur', emoji: '🍽️' },
  { href: '/cuisine', label: 'Cuisine', emoji: '👨‍🍳' },
  { href: '/pizza',   label: 'Pizza',   emoji: '🍕' },
  { href: '/bar',     label: 'Bar',     emoji: '🍺' },
  { href: '/caisse',  label: 'Caisse',  emoji: '💰' },
]

// Liste exhaustive des modules /admin/* — filtrés par canAccess à l'usage.
const ADMIN_MODULES: Array<{ groupe: string; items: Array<{ href: string; label: string; emoji: string }> }> = [
  {
    groupe: 'Pilotage',
    items: [
      { href: '/admin/pilotage',     label: 'Tableau de bord', emoji: '📊' },
      { href: '/admin/assistant',    label: 'Assistant IA',    emoji: '✨' },
      { href: '/admin/journal',      label: 'Journal',         emoji: '📓' },
      { href: '/admin/previsionnel', label: 'Prévisionnel',    emoji: '🌤️' },
    ],
  },
  {
    groupe: 'Cuisine',
    items: [
      { href: '/admin/recettes',     label: 'Recettes',     emoji: '👨‍🍳' },
      { href: '/admin/ingredients',  label: 'Ingrédients',  emoji: '🥬' },
      { href: '/admin/stock',        label: 'Stock',        emoji: '📦' },
      { href: '/admin/fournisseurs', label: 'Fournisseurs', emoji: '🚚' },
      { href: '/admin/allergenes',   label: 'Allergènes',   emoji: '⚠️' },
      { href: '/admin/boissons',     label: 'Boissons',     emoji: '🍷' },
    ],
  },
  {
    groupe: 'Service',
    items: [
      { href: '/admin/affichage',    label: 'Affichage TV', emoji: '📺' },
      { href: '/admin/reservations', label: 'Réservations', emoji: '📅' },
      { href: '/admin/groupes',      label: 'Groupes',      emoji: '👥' },
      { href: '/admin/clients',      label: 'Clients/CRM',  emoji: '🧑' },
    ],
  },
  {
    groupe: 'Mon profil',
    items: [
      { href: '/mon-espace',       label: 'Mon espace',    emoji: '🏠' },
    ],
  },
  {
    groupe: 'Équipe',
    items: [
      { href: '/admin/rh',         label: 'RH',           emoji: '👥' },
      { href: '/formation',        label: 'Mes manuels',  emoji: '📖' },
      { href: '/admin/formation',  label: 'Gérer guides', emoji: '🎓' },
      { href: '/equipes',          label: 'Chat équipe',  emoji: '💬' },
    ],
  },
  {
    groupe: 'Conformité',
    items: [
      { href: '/admin/hygiene',     label: 'Hygiène',     emoji: '🧴' },
      { href: '/admin/legal',       label: 'Légal',       emoji: '📑' },
      { href: '/admin/maintenance', label: 'Maintenance', emoji: '🔧' },
      { href: '/admin/dechets',     label: 'Déchets',     emoji: '🗑️' },
    ],
  },
  {
    groupe: 'Performance',
    items: [
      { href: '/admin/challenges', label: 'Challenges', emoji: '🏆' },
      { href: '/admin/economie',   label: 'Économie',   emoji: '🧮' },
    ],
  },
  {
    groupe: 'Finances',
    items: [
      { href: '/admin/finances', label: 'Finances', emoji: '💰' },
      { href: '/admin/energie',  label: 'Énergie',  emoji: '⚡' },
    ],
  },
  {
    groupe: 'Système',
    items: [
      { href: '/admin/setup',    label: 'Configuration', emoji: '⚙️' },
      { href: '/admin/securite', label: 'Sécurité',      emoji: '🔐' },
    ],
  },
]

export type OpsBottomNavProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
} | null

export default function OpsBottomNav({ profil = null }: { profil?: OpsBottomNavProfil }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Ferme le drawer sur Échap
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Manager = tout autorisé. Sinon on filtre via la matrice.
  const isManager = profil?.role === 'manager'
  const peutVoir = (href: string) =>
    isManager || canAccess(profil?.poste, href, profil?.custom_permissions ?? null)

  const groupesFiltres = profil
    ? ADMIN_MODULES.map(g => ({ ...g, items: g.items.filter(i => peutVoir(i.href)) }))
                   .filter(g => g.items.length > 0)
    : []

  return (
    <>
      {/* Backdrop : couvre TOUT l'écran (mobile + desktop) pour fermer au clic-outside */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      {profil && (
        <aside className={cn(
          'fixed inset-x-0 bottom-0 z-50 bg-white max-h-[85vh] overflow-y-auto transition-transform',
          'rounded-t-xl shadow-2xl md:max-w-md md:right-4 md:left-auto md:mb-4 md:rounded-xl',
          open ? 'translate-y-0' : 'translate-y-full',
        )}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center uppercase shrink-0">
                {profil.email[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{profil.email}</p>
                <p className="text-xs text-zinc-500">
                  {isManager ? 'Gérant' : (profil.poste ?? 'Employé')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-2 -mr-1 hover:bg-zinc-100 rounded"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Modules autorisés */}
          {groupesFiltres.length === 0 ? (
            <div className="p-4 text-sm text-zinc-500 text-center">
              Aucun module admin disponible pour ton poste.
            </div>
          ) : (
            <nav className="p-2 space-y-3">
              {groupesFiltres.map(g => (
                <div key={g.groupe}>
                  <h3 className="px-2 mb-1 text-xs font-bold uppercase tracking-wider text-zinc-400">{g.groupe}</h3>
                  <ul className="space-y-0.5">
                    {g.items.map(it => {
                      const active = pathname === it.href || pathname?.startsWith(it.href + '/')
                      return (
                        <li key={it.href}>
                          <Link
                            href={it.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium min-h-[44px] transition-colors',
                              active ? 'bg-emerald-50 text-emerald-900' : 'text-zinc-700 hover:bg-zinc-50',
                            )}
                          >
                            <span className="text-lg">{it.emoji}</span>
                            <span className="truncate">{it.label}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          )}

          {/* Notifications PWA */}
          <div className="px-3 pt-2">
            <PushNotifSwitch />
          </div>

          {/* Footer logout */}
          <div className="sticky bottom-0 bg-white border-t p-3">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white px-3 py-2.5 text-sm font-medium min-h-[44px]"
              >
                <LogOut className="h-4 w-4" /> Déconnexion
              </button>
            </form>
          </div>
        </aside>
      )}

      {/* Bottom nav fixe — 4 ops + (Plus si profil) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t flex shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV.map(it => {
          const active = pathname === it.href || pathname?.startsWith(it.href + '/')
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center min-h-[64px] py-1 gap-0.5 text-xs font-semibold',
                active ? 'text-emerald-700 bg-emerald-50' : 'text-zinc-700 hover:bg-zinc-50',
              )}
            >
              <span className="text-2xl leading-none">{it.emoji}</span>
              <span>{it.label}</span>
            </Link>
          )
        })}
        {profil && (
          <button
            onClick={() => setOpen(true)}
            className="flex-1 flex flex-col items-center justify-center min-h-[64px] py-1 gap-0.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            aria-label="Plus de modules"
          >
            <Menu className="h-6 w-6" />
            <span>Plus</span>
          </button>
        )}
      </nav>

      {/* Top-right floating bar (desktop) — accès rapide aux 4 ops + modules admin */}
      <div className="hidden md:flex fixed top-4 right-4 z-30 items-center gap-1 bg-white/95 backdrop-blur border border-zinc-200 rounded-full shadow-lg p-1">
        {NAV.map(it => {
          const active = pathname === it.href || pathname?.startsWith(it.href + '/')
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                active ? 'bg-emerald-600 text-white' : 'text-zinc-700 hover:bg-zinc-100',
              )}
              title={it.label}
            >
              <span>{it.emoji}</span>
              <span>{it.label}</span>
            </Link>
          )
        })}
        {profil && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800"
            aria-label="Mes modules admin"
          >
            <Menu className="h-4 w-4" />
            <span>Modules</span>
          </button>
        )}
      </div>
    </>
  )
}
