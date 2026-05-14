// /admin — Home gérant : vue synthétique "10 secondes".
//
// Données :
//   - Salutation personnalisée (profil connecté)
//   - Bandeau alertes urgentes (findings rouges actifs uniquement)
//   - KPIs flash (4 cards alimentées par agents Veilleur/Financier/RH/Météo)
//   - Suggestions du jour top 3 (Stratégique + Météo)
//   - Raccourcis rapides vers les modules les plus utilisés
//
// Tout vient d'agents ou est navigation — aucune donnée fictive.
// Pour le détail des 7 sections agents → /admin/pilotage.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { AGENTS, type AgentId } from '@/lib/agents/types'
import SectionKPIs from './pilotage/sections/SectionKPIs'
import SectionSuggestions from './pilotage/sections/SectionSuggestions'

export const metadata = { title: 'Tableau de bord — Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminHome() {
  const supabase = await createClient()
  const profil = await getProfile()

  // Alertes urgentes : findings rouges actifs, tous agents
  const { data: alertesData } = await supabase
    .from('agent_findings')
    .select('id, agent_id, titre, message, action_label, action_url, created_at')
    .eq('resolu', false)
    .eq('urgence', 'rouge')
    .order('created_at', { ascending: false })
    .limit(3)
  const alertesUrgentes = alertesData ?? []

  // Compteur global pour le bandeau
  const { count: nbAlertesActives } = await supabase
    .from('agent_findings')
    .select('*', { count: 'exact', head: true })
    .eq('resolu', false)

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* En-tête : salutation + date + lien vers pilotage */}
        <header className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">
              {bonjourSelonHeure()}
              {profil?.prenom ? `, ${profil.prenom}` : ''}
            </p>
            <h1 className="text-2xl font-bold text-zinc-900">Tableau de bord</h1>
            <p className="text-xs text-zinc-500 mt-0.5 capitalize">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <Link
            href="/admin/pilotage"
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            Vue détaillée (7 sections agents) →
          </Link>
        </header>

        {/* Bandeau alertes urgentes — uniquement si findings rouges */}
        {alertesUrgentes.length > 0 ? (
          <section className="rounded-xl border-2 border-red-300 bg-red-50 p-3">
            <header className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-red-900">
                🔴 {alertesUrgentes.length} alerte{alertesUrgentes.length > 1 ? 's' : ''} urgente{alertesUrgentes.length > 1 ? 's' : ''}
              </h2>
              <Link
                href="/admin/pilotage"
                className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap"
              >
                Tout voir →
              </Link>
            </header>
            <ul className="space-y-1.5">
              {alertesUrgentes.map(a => {
                const def = AGENTS[a.agent_id as AgentId]
                return (
                  <li key={a.id} className="flex items-center gap-3 p-2 rounded-md bg-white border border-red-200">
                    <span className="text-lg shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
                    <p className="text-sm font-bold text-red-900 truncate flex-1">{a.titre}</p>
                    {a.action_url && a.action_label && (
                      <Link
                        href={a.action_url}
                        className="shrink-0 px-2 py-1 rounded-md bg-red-600 text-white text-xs font-bold hover:bg-red-700 whitespace-nowrap"
                      >
                        {a.action_label}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-sm font-bold text-emerald-900">
              ✓ Aucune alerte urgente
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {nbAlertesActives && nbAlertesActives > 0
                ? `${nbAlertesActives} alerte${nbAlertesActives > 1 ? 's' : ''} à surveiller — voir détails sur le pilotage`
                : 'Les agents surveillent en continu et préviendront ici dès qu\'une action est nécessaire.'}
            </p>
          </section>
        )}

        {/* KPIs flash — réutilise la section du pilotage */}
        <SectionKPIs />

        {/* Suggestions du jour — réutilise la section du pilotage */}
        <SectionSuggestions />

        {/* Raccourcis rapides vers les modules les plus utilisés */}
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-zinc-900 mb-3">⚡ Accès rapide</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Raccourci href="/serveur"             emoji="🍽" label="Service" hint="Plan de salle live" />
            <Raccourci href="/caisse"              emoji="💰" label="Caisse" hint="Encaissement + Z" />
            <Raccourci href="/admin/stock"         emoji="📦" label="Stock" hint="Niveaux + commandes" />
            <Raccourci href="/admin/reservations"  emoji="📅" label="Réservations" hint="Tables + chambres" />
            <Raccourci href="/admin/assistant"     emoji="🤖" label="Assistant IA" hint="Chat connecté" />
            <Raccourci href="/admin/pilotage"      emoji="📊" label="Pilotage" hint="KPIs + agents" />
          </div>
        </section>
      </main>
    </div>
  )
}

function Raccourci({ href, emoji, label, hint }: { href: string; emoji: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center text-center p-3 rounded-lg border border-zinc-200 bg-zinc-50/50 hover:bg-emerald-50 hover:border-emerald-300 transition-colors min-h-[100px]"
    >
      <span className="text-2xl mb-1" aria-hidden>{emoji}</span>
      <span className="text-sm font-bold text-zinc-900 group-hover:text-emerald-900">{label}</span>
      <span className="text-[10px] text-zinc-500 group-hover:text-emerald-700 mt-0.5">{hint}</span>
    </Link>
  )
}

function bonjourSelonHeure(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Bonjour'
  if (h < 14) return 'Bon midi'
  if (h < 18) return 'Bel après-midi'
  if (h < 23) return 'Bonsoir'
  return 'Bonne fin de soirée'
}
