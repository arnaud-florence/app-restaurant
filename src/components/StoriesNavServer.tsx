// Wrapper serveur : calcule les catégories visibles (permissions / aperçu
// employé) + le nombre d'alertes rouges, puis rend <StoriesNav>. À poser en
// haut de n'importe quelle page HORS /admin (mon-espace, formation, equipes…)
// pour retrouver la nav « stories » partout — un clic vers chaque catégorie.
//
// Le layout /admin calcule déjà ces données lui-même (inline) ; ce wrapper sert
// aux routes qui n'héritent pas du layout admin.

import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIES } from '@/lib/navigation'
import { canAccess } from '@/lib/permissions'
import StoriesNav from '@/components/StoriesNav'

export default async function StoriesNavServer() {
  const profil = await getProfile()
  if (!profil) return null

  const ap = profil.apercu ?? null
  const isManager = !ap && profil.role === 'manager'
  const posteNav = ap ? ap.ciblePoste : (profil.poste ?? null)
  const permsNav = ap ? ap.ciblePerms : (profil.custom_permissions ?? null)
  const categoriesNav = CATEGORIES
    // 'service' est déjà un onglet permanent de la barre du bas → pas de doublon.
    .filter(c => c.slug !== 'service')
    .filter(c => isManager || c.items.some(it => canAccess(posteNav, it.href, permsNav)))
    .map(c => ({ slug: c.slug, label: c.label, tone: c.tone }))

  const sb = await createClient()
  const { count } = await sb
    .from('agent_findings')
    .select('id', { count: 'exact', head: true })
    .eq('resolu', false)
    .eq('urgence', 'rouge')

  return <StoriesNav categories={categoriesNav} nbAlertes={count ?? 0} />
}
