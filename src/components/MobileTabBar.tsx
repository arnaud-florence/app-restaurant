'use client'

// Barre de navigation mobile « 5 onglets fixes » façon Facebook/Instagram.
// Remplace, sur mobile uniquement (md:hidden), la barre de chips scrollables.
// Toujours au même endroit, au pouce, 5 zones évidentes icône + label.
//
// Les onglets s'adaptent au rôle :
//   - Manager   : Accueil · Service · Alertes · Former · Moi
//   - Employé   : Accueil · Service · Équipe · Former · Moi
//   - Kiosk      : Salle · Cuisine · Bar · Snack · Former (écrans ops directs)
//
// La barre desktop riche (TopActionBar) reste inchangée (hidden md:block là-bas).

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Home, Utensils, Bell, GraduationCap, User, MessageSquare,
  ChefHat, Wine, ShoppingBag, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { canAccess, type CustomPermissions } from '@/lib/permissions'

export type MobileTabBarProfil = {
  email: string
  role: string
  poste: string | null
  custom_permissions: CustomPermissions | null
  /** Mode « aperçu employé » (gérant qui visualise l'appli d'un salarié). */
  apercu?: {
    ciblePoste: string | null
    ciblePerms: CustomPermissions | null
    ciblePrenom: string
    cibleNom: string
  } | null
} | null

type Tab = {
  key: string
  href: string
  label: string
  Icon: LucideIcon
  /** Préfixes de pathname qui activent cet onglet (au-delà de href). */
  match?: string[]
  badge?: number
}

// La vente se fait sur les caisses (src/lib/frontiere-caisse.ts) : ne
// subsistent ici que les écrans de préparation, la tournée et la réception.
const OPS_PREFIXES = ['/comptoir', '/cuisine', '/bar', '/pizza', '/livreur', '/reception', '/inventaire', '/invendus']

function buildTabs(profil: MobileTabBarProfil, isManager: boolean, nbAlertes: number, nbService: number): Tab[] {
  // Kiosk (tablette partagée, pas de session) → tout passe par le Centre opérationnel.
  if (!profil) {
    return [
      { key: 'service',   href: '/service',   label: 'Service', Icon: Utensils, match: OPS_PREFIXES, badge: nbService },
      { key: 'formation', href: '/formation', label: 'Former',  Icon: GraduationCap },
    ]
  }

  if (isManager) {
    return [
      { key: 'accueil',   href: '/admin/cat',          label: 'Accueil', Icon: Home, match: ['/admin'] },
      { key: 'service',   href: '/service',            label: 'Service', Icon: Utensils, match: OPS_PREFIXES, badge: nbService },
      { key: 'alertes',   href: '/admin/pilotage',     label: 'Alertes', Icon: Bell, badge: nbAlertes },
      { key: 'formation', href: '/admin/formation',    label: 'Former',  Icon: GraduationCap, match: ['/formation'] },
      { key: 'moi',       href: '/mon-espace',         label: 'Moi',     Icon: User },
    ]
  }

  // Employé connecté (non-manager)
  return [
    { key: 'accueil',   href: '/admin/cat',          label: 'Accueil', Icon: Home, match: ['/admin'] },
    { key: 'service',   href: '/service',            label: 'Service', Icon: Utensils, match: OPS_PREFIXES, badge: nbService },
    { key: 'equipe',    href: '/equipes',            label: 'Équipe',  Icon: MessageSquare },
    { key: 'formation', href: '/formation',          label: 'Former',  Icon: GraduationCap, match: ['/formation'] },
    { key: 'moi',       href: '/mon-espace',         label: 'Moi',     Icon: User },
  ]
}

/** Compteur live de commandes en cours de service (en_attente → servi). */
function useCommandesActives(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    const sb = createClient()
    const fetchCount = async () => {
      const { count } = await sb.from('commandes')
        .select('id', { count: 'exact', head: true })
        .in('statut', ['en_attente', 'en_preparation', 'pret', 'servi'])
      if (alive) setN(count ?? 0)
    }
    fetchCount()
    const ch = sb.channel('tabbar-commandes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, fetchCount)
      .subscribe()
    return () => { alive = false; sb.removeChannel(ch) }
  }, [])
  return n
}

function isActiveTab(tab: Tab, tabs: Tab[], pathname: string): boolean {
  // Match exact ou préfixe du href.
  const hrefMatch = pathname === tab.href || pathname.startsWith(tab.href + '/')
  // Match via les préfixes additionnels, MAIS seulement si aucun autre onglet
  // n'a un href plus spécifique qui matche (évite que « Accueil /admin » vole
  // l'actif à « Alertes /admin/pilotage »).
  const prefixMatch = (tab.match ?? []).some(p => pathname === p || pathname.startsWith(p + '/'))
  if (hrefMatch) return true
  if (!prefixMatch) return false
  // Un autre onglet a-t-il un href exact qui matche mieux ce pathname ?
  const meilleurAutre = tabs.some(t =>
    t.key !== tab.key && (pathname === t.href || pathname.startsWith(t.href + '/')),
  )
  return !meilleurAutre
}

export default function MobileTabBar({
  theme = 'light', profil = null, nbAlertesRouges = 0,
}: {
  theme?: 'light' | 'dark'
  profil?: MobileTabBarProfil
  nbAlertesRouges?: number
}) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const ap = profil?.apercu ?? null
  // Mode « aperçu employé » : on construit la nav AVEC l'identité du salarié visé
  // (poste + permissions), comme s'il était connecté — sans changer le rôle réel.
  const profilNav: MobileTabBarProfil = ap && profil
    ? { ...profil, role: 'employe', poste: ap.ciblePoste, custom_permissions: ap.ciblePerms }
    : profil
  const isManager = !ap && profil?.role === 'manager'
  const nbService = useCommandesActives()
  const tabs = buildTabs(profilNav, !!isManager, nbAlertesRouges, nbService)
    // Sécurité permissions : on retire un onglet si l'employé n'y a pas droit
    // (sauf Accueil/Moi/Former toujours visibles). En pratique tous nos onglets
    // sont accessibles, ce filtre est une ceinture de sécurité.
    .filter(t => {
      if (!profilNav || isManager) return true
      if (['accueil', 'moi', 'formation', 'equipe', 'service'].includes(t.key)) return true
      return canAccess(profilNav.poste, t.href, profilNav.custom_permissions)
    })

  function tapHaptic() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(8) } catch { /* ignore */ }
    }
  }

  const dark = theme === 'dark'

  // Le chat /equipes est plein écran (façon conversation Messenger) : on masque
  // la barre d'onglets du bas pour libérer toute la hauteur au chat + composer.
  if (pathname.startsWith('/equipes')) return null

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-30">
      {/* Bandeau « aperçu employé » (gérant) : rappelle qui on visualise + quitter */}
      {ap && (
        <a
          href="/api/apercu/stop"
          className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-500 text-white text-xs font-black active:scale-[0.99]"
        >
          <span className="truncate">👁 Aperçu de {ap.ciblePrenom} {ap.cibleNom}</span>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5">Quitter ✕</span>
        </a>
      )}
      <nav
        className={cn(
          'border-t',
          dark
            ? 'bg-zinc-950/95 backdrop-blur-xl border-zinc-800'
            : 'bg-white/95 backdrop-blur-xl border-zinc-200',
        )}
        // Padding bas = safe-area iOS + marge pour remonter les boutons au-dessus
        // de la zone du « home indicator » (plus accessible au pouce).
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
        aria-label="Navigation principale"
      >
      <div className="flex items-stretch">
        {tabs.map(tab => {
          const active = isActiveTab(tab, tabs, pathname)
          const Icon = tab.Icon
          return (
            <Link
              key={tab.key}
              href={tab.href}
              onClick={(e) => {
                tapHaptic()
                // Re-tap de l'onglet déjà actif (réflexe Insta/FB) : on remonte
                // en haut de la page et on rafraîchit, au lieu de re-naviguer.
                if (active) {
                  e.preventDefault()
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                  router.refresh()
                }
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[64px] pt-2.5 pb-1 active:scale-95 transition-transform',
              )}
            >
              {/* Barre d'indicateur actif en haut (style Facebook) */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-emerald-500" aria-hidden />
              )}
              <span className="relative">
                <Icon
                  className={cn(
                    'h-6 w-6 transition-colors',
                    active ? 'text-emerald-500' : (dark ? 'text-zinc-400' : 'text-zinc-400'),
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
                {!!tab.badge && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-black tabular-nums border-2 border-white">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </span>
              <span className={cn(
                'text-[10px] font-bold leading-none',
                active ? 'text-emerald-600' : (dark ? 'text-zinc-400' : 'text-zinc-500'),
              )}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
      </nav>
    </div>
  )
}
