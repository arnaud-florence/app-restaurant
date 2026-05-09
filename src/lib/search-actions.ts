'use server'

// Recherche globale — palette Ctrl+K. Cherche en parallèle dans :
//   - Modules de l'app (matrice statique filtrée par permissions)
//   - Recettes (par nom)
//   - Ingrédients (par nom)
//   - Clients (par prénom/nom/email)
//   - Réservations (par nom client + date)
//   - Employés (par prénom/nom)
//
// Les résultats sont filtrés par permissions du profil connecté.

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'

export type SearchResult = {
  emoji: string
  label: string
  sublabel?: string
  href: string
  badge?: string                 // ex: "Pizza" | "Cuisine"
}

export type SearchGroup = {
  kind: string
  label: string
  results: SearchResult[]
}

// Liste statique des modules / pages avec emoji + label.
const MODULES: Array<{ href: string; label: string; emoji: string; aliases?: string }> = [
  { href: '/admin/pilotage',     label: 'Pilotage',           emoji: '📊', aliases: 'kpi tableau bord' },
  { href: '/admin/journal',      label: 'Journal de bord',    emoji: '📓', aliases: 'gerant clôture' },
  { href: '/admin/previsionnel', label: 'Prévisionnel',       emoji: '🌤', aliases: 'meteo prevision' },
  { href: '/admin/assistant',    label: 'Assistant IA',       emoji: '🤖', aliases: 'claude ai chat' },
  { href: '/admin/recettes',     label: 'Recettes',           emoji: '👨‍🍳' },
  { href: '/admin/recettes/engineering', label: 'Engineering recettes', emoji: '📊', aliases: 'star dog plat' },
  { href: '/admin/ingredients',  label: 'Ingrédients',        emoji: '🥬' },
  { href: '/admin/stock',        label: 'Stock & lots',       emoji: '📦', aliases: 'inventaire dlc lot' },
  { href: '/admin/fournisseurs', label: 'Fournisseurs',       emoji: '🚚' },
  { href: '/admin/allergenes',   label: 'Allergènes',         emoji: '⚠️' },
  { href: '/admin/boissons',     label: 'Boissons',           emoji: '🍷', aliases: 'bar carte vin' },
  { href: '/admin/affichage',    label: 'Affichage TV',       emoji: '📺' },
  { href: '/admin/reservations', label: 'Réservations',       emoji: '📅' },
  { href: '/admin/groupes',      label: 'Groupes',            emoji: '👥' },
  { href: '/admin/clients',      label: 'Clients / CRM',      emoji: '🧑' },
  { href: '/admin/rh',           label: 'Ressources humaines', emoji: '👥', aliases: 'employes pointage' },
  { href: '/admin/formation',    label: 'Gérer guides',       emoji: '🎓', aliases: 'admin formation' },
  { href: '/formation',          label: 'Mes manuels',        emoji: '📖' },
  { href: '/admin/hygiene',      label: 'Hygiène / HACCP',    emoji: '🧴', aliases: 'temperature checklist nc' },
  { href: '/admin/legal',        label: 'Légal',              emoji: '📑' },
  { href: '/admin/maintenance',  label: 'Maintenance',        emoji: '🔧' },
  { href: '/admin/dechets',      label: 'Déchets',            emoji: '🗑', aliases: 'agec pesee' },
  { href: '/admin/finances',     label: 'Finances',           emoji: '💰', aliases: 'ca z report' },
  { href: '/admin/energie',      label: 'Énergie',            emoji: '⚡' },
  { href: '/admin/setup',        label: 'Configuration',      emoji: '⚙️' },
  { href: '/admin/securite',     label: 'Sécurité / 2FA',     emoji: '🔐' },
  { href: '/serveur',            label: 'Service salle',      emoji: '🍽️' },
  { href: '/cuisine',            label: 'Service cuisine',    emoji: '🍳' },
  { href: '/bar',                label: 'Service bar',        emoji: '🍷' },
  { href: '/caisse',             label: 'Caisse',             emoji: '💳' },
  { href: '/equipes',            label: 'Chat équipe',        emoji: '💬' },
]

function escapeIlike(q: string) {
  return q.replace(/[%_]/g, m => '\\' + m)
}

export async function rechercheGlobale(rawQuery: string): Promise<{ groups: SearchGroup[] }> {
  const query = rawQuery.trim()
  if (query.length < 2) return { groups: [] }

  const profil = await getProfile()
  const isManager = profil?.role === 'manager'
  const can = (path: string) =>
    isManager || canAccess(profil?.poste, path, profil?.custom_permissions ?? null)

  const supabase = await createClient()
  const q = escapeIlike(query)
  const ql = q.toLowerCase()
  const groups: SearchGroup[] = []

  // ─── Modules (statique) ────────────────────────────────────────
  const modMatches = MODULES.filter(m => can(m.href)).filter(m => {
    const haystack = (m.label + ' ' + (m.aliases ?? '')).toLowerCase()
    return haystack.includes(ql)
  }).slice(0, 8)
  if (modMatches.length > 0) {
    groups.push({
      kind: 'modules',
      label: 'Modules & pages',
      results: modMatches.map(m => ({
        emoji: m.emoji,
        label: m.label,
        sublabel: m.href,
        href: m.href,
      })),
    })
  }

  // ─── Recettes ──────────────────────────────────────────────────
  if (can('/admin/recettes')) {
    const { data } = await supabase.from('recettes')
      .select('id, nom, categorie, tag_destination, prix_vente_ht')
      .ilike('nom', `%${q}%`)
      .eq('actif', true)
      .order('nom').limit(6)
    if (data && data.length > 0) {
      groups.push({
        kind: 'recettes',
        label: 'Recettes',
        results: data.map(r => ({
          emoji: r.tag_destination === 'PIZZA' ? '🍕'
               : r.tag_destination === 'BAR'   ? '🍷'
               :                                 '🍽',
          label: String(r.nom),
          sublabel: `${String(r.categorie ?? '')} · ${Number(r.prix_vente_ht ?? 0).toFixed(2)} €`,
          href: '/admin/recettes',
        })),
      })
    }
  }

  // ─── Ingrédients ───────────────────────────────────────────────
  if (can('/admin/ingredients')) {
    const { data } = await supabase.from('ingredients')
      .select('id, nom, categorie, unite_base')
      .ilike('nom', `%${q}%`)
      .order('nom').limit(6)
    if (data && data.length > 0) {
      groups.push({
        kind: 'ingredients',
        label: 'Ingrédients',
        results: data.map(i => ({
          emoji: '🥬',
          label: String(i.nom),
          sublabel: `${String(i.categorie ?? '')} · ${String(i.unite_base ?? '')}`,
          href: '/admin/ingredients',
        })),
      })
    }
  }

  // ─── Clients ───────────────────────────────────────────────────
  if (can('/admin/clients')) {
    const { data } = await supabase.from('clients')
      .select('id, prenom, nom, email, telephone')
      .or(`prenom.ilike.%${q}%,nom.ilike.%${q}%,email.ilike.%${q}%,telephone.ilike.%${q}%`)
      .order('nom').limit(6)
    if (data && data.length > 0) {
      groups.push({
        kind: 'clients',
        label: 'Clients',
        results: data.map(c => ({
          emoji: '🧑',
          label: `${String(c.prenom ?? '')} ${String(c.nom ?? '')}`.trim() || String(c.email ?? ''),
          sublabel: [c.email, c.telephone].filter(Boolean).join(' · '),
          href: '/admin/clients',
        })),
      })
    }
  }

  // ─── Réservations ──────────────────────────────────────────────
  if (can('/admin/reservations')) {
    const { data } = await supabase.from('reservations_tables')
      .select('id, client_nom, date_resa, nb_personnes, statut')
      .ilike('client_nom', `%${q}%`)
      .order('date_resa', { ascending: false }).limit(6)
    if (data && data.length > 0) {
      groups.push({
        kind: 'reservations',
        label: 'Réservations',
        results: data.map(r => ({
          emoji: '📅',
          label: String(r.client_nom),
          sublabel: `${String(r.date_resa)} · ${r.nb_personnes ?? '?'} pers. · ${String(r.statut ?? '')}`,
          href: '/admin/reservations',
        })),
      })
    }
  }

  // ─── Employés ──────────────────────────────────────────────────
  if (can('/admin/rh') || isManager) {
    const { data } = await supabase.from('employes')
      .select('id, prenom, nom, poste, email')
      .or(`prenom.ilike.%${q}%,nom.ilike.%${q}%,email.ilike.%${q}%`)
      .eq('actif', true)
      .order('prenom').limit(6)
    if (data && data.length > 0) {
      groups.push({
        kind: 'employes',
        label: 'Employés',
        results: data.map(e => ({
          emoji: '👤',
          label: `${String(e.prenom)} ${String(e.nom)}`,
          sublabel: `${String(e.poste ?? '')} · ${String(e.email ?? '')}`,
          href: '/admin/rh',
        })),
      })
    }
  }

  return { groups }
}
