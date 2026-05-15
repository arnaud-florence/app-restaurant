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

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccess, type CustomPermissions } from '@/lib/permissions'
import { logoutAction } from '@/app/login/actions'
import PushNotifSwitch from '@/components/PushNotifSwitch'

export type TopActionBarTheme = 'light' | 'dark'

export type TopActionBarProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
} | null

type Tone = 'emerald' | 'amber' | 'violet' | 'blue' | 'red' | 'zinc'

type Chip = { href: string; emoji: string; label: string; tone: Tone }
type Group = { groupe: string; emoji: string; items: Array<{ href: string; label: string; emoji: string }> }

// ─── Chips primaires (visibles dans la barre, scrollable horizontal) ───
// Tous les écrans opérationnels + les 3 raccourcis admin les plus utilisés.
const CHIPS_PRIMAIRES: Chip[] = [
  // Mon profil (tonalité "soft" emerald)
  { href: '/mon-espace',         emoji: '🏠', label: 'Accueil',   tone: 'emerald' },
  // Pilotage stratégique
  { href: '/admin/pilotage',     emoji: '📊', label: 'Pilotage',  tone: 'emerald' },
  { href: '/admin/assistant',    emoji: '🤖', label: 'IA',        tone: 'violet' },
  // Service en cours
  { href: '/serveur',            emoji: '🍽',  label: 'Salle',     tone: 'blue' },
  { href: '/caisse',             emoji: '💰', label: 'Caisse',    tone: 'amber' },
  { href: '/cuisine',            emoji: '👨‍🍳', label: 'Cuisine',  tone: 'amber' },
  { href: '/pizza',              emoji: '🍕', label: 'Pizza',     tone: 'red' },
  { href: '/bar',                emoji: '🍷', label: 'Bar',       tone: 'violet' },
  { href: '/emporter',           emoji: '🛒', label: 'Snack',     tone: 'emerald' },
  { href: '/livreur',            emoji: '🛵', label: 'Livreur',   tone: 'emerald' },
  { href: '/reception',          emoji: '🛎',  label: 'Réception', tone: 'blue' },
  // Admin courant
  { href: '/admin/stock',        emoji: '📦', label: 'Stock',     tone: 'blue' },
  { href: '/admin/reservations', emoji: '📅', label: 'Résa',      tone: 'blue' },
]

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

const TONES_LIGHT: Record<Tone, { base: string; active: string }> = {
  emerald: { base: 'border-zinc-200 text-zinc-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900',
             active: 'bg-emerald-600 border-emerald-600 text-white' },
  amber:   { base: 'border-zinc-200 text-zinc-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900',
             active: 'bg-amber-500 border-amber-500 text-white' },
  violet:  { base: 'border-zinc-200 text-zinc-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-900',
             active: 'bg-violet-600 border-violet-600 text-white' },
  blue:    { base: 'border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-900',
             active: 'bg-blue-600 border-blue-600 text-white' },
  red:     { base: 'border-zinc-200 text-zinc-700 hover:bg-red-50 hover:border-red-300 hover:text-red-900',
             active: 'bg-red-600 border-red-600 text-white' },
  zinc:    { base: 'border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 hover:text-zinc-900',
             active: 'bg-zinc-900 border-zinc-900 text-white' },
}

const TONES_DARK: Record<Tone, { base: string; active: string }> = {
  emerald: { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-300',
             active: 'bg-emerald-600 border-emerald-500 text-white' },
  amber:   { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-amber-300',
             active: 'bg-amber-500 border-amber-400 text-zinc-900' },
  violet:  { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-violet-500/60 hover:text-violet-300',
             active: 'bg-violet-600 border-violet-500 text-white' },
  blue:    { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-blue-500/60 hover:text-blue-300',
             active: 'bg-blue-600 border-blue-500 text-white' },
  red:     { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-red-500/60 hover:text-red-300',
             active: 'bg-red-600 border-red-500 text-white' },
  zinc:    { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white',
             active: 'bg-white border-white text-zinc-900' },
}

export default function TopActionBar({
  theme = 'light',
  profil = null,
}: {
  theme?: TopActionBarTheme
  profil?: TopActionBarProfil
}) {
  const pathname = usePathname() ?? '/'
  const [open, setOpen] = useState(false)

  // Ferme le drawer sur Échap
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Permissions : pas de profil = anon (kiosk) → seuls les ops sont visibles dans le drawer.
  const isManager = profil?.role === 'manager'
  const peutVoir = (href: string) =>
    isManager || canAccess(profil?.poste, href, profil?.custom_permissions ?? null)

  const groupesFiltres = ALL_GROUPES
    .map(g => ({ ...g, items: g.items.filter(i => peutVoir(i.href)) }))
    .filter(g => g.items.length > 0)

  const chipsVisibles = CHIPS_PRIMAIRES.filter(c => peutVoir(c.href))

  const tones = theme === 'dark' ? TONES_DARK : TONES_LIGHT

  // Mobile : fixed en bas (zone du pouce, plus accessible)
  // Desktop : static en haut (intégré au flux de la page)
  const wrapperCls = theme === 'dark'
    ? cn(
        'fixed bottom-0 inset-x-0 z-30 bg-[#0D0D0D]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0D0D0D]/85 border-t border-zinc-800 shadow-[0_-2px_10px_rgba(0,0,0,0.3)]',
        'md:static md:bg-[#0D0D0D] md:border-t-0 md:border-b md:shadow-none md:backdrop-blur-0',
      )
    : cn(
        'fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 border-t border-zinc-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]',
        'md:static md:bg-white md:border-t-0 md:border-b md:shadow-none md:backdrop-blur-0',
      )

  // Bouton "☰ Modules" : ouvre le drawer
  const plusBtnCls = theme === 'dark'
    ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500'
    : 'bg-zinc-900 border-zinc-900 text-white hover:bg-zinc-800'

  return (
    <>
      <div
        className={wrapperCls}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="overflow-x-auto scrollbar-thin" style={{ scrollSnapType: 'x mandatory' }}>
          <div className="flex items-center gap-1.5 px-3 py-2 min-w-max">
            {chipsVisibles.map(it => {
              const active = pathname === it.href || (it.href !== '/admin' && pathname.startsWith(it.href + '/'))
              const cls = active ? tones[it.tone].active : tones[it.tone].base
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  style={{ scrollSnapAlign: 'start' }}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border-2 text-xs font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                    cls,
                  )}
                >
                  <span className="text-base leading-none" aria-hidden>{it.emoji}</span>
                  <span>{it.label}</span>
                </Link>
              )
            })}

            {/* Bouton "☰ Modules" — ouvre le drawer complet */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                'inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border-2 text-xs font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                plusBtnCls,
              )}
              aria-label="Tous les modules"
            >
              <Menu className="h-4 w-4" />
              <span>Modules</span>
            </button>
          </div>
        </div>
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
            <div className="bg-zinc-900 text-white px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
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
                className="p-2 -mr-1 hover:bg-white/10 rounded-full active:scale-95 transition"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Contenu scrollable : groupes */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {groupesFiltres.length === 0 ? (
                <p className="text-sm text-zinc-500 italic text-center py-8">
                  Aucun module disponible pour ton poste.
                </p>
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
