// /admin — Home gérant : vue commandcenter "10 secondes".
// Tout vient d'agents ou est navigation — aucune donnée fictive.

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

  const { data: alertesData } = await supabase
    .from('agent_findings')
    .select('id, agent_id, titre, message, action_label, action_url, urgence, created_at')
    .eq('resolu', false)
    .in('urgence', ['rouge', 'jaune'])
    .order('urgence', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(4)
  const alertes = alertesData ?? []
  const nbRouge = alertes.filter(a => a.urgence === 'rouge').length
  const nbJaune = alertes.filter(a => a.urgence === 'jaune').length

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 space-y-3">
        {/* Header compact : salutation + date + bandeau actions */}
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xl shadow-lg shadow-emerald-500/30 shrink-0">
              ✨
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                {bonjourSelonHeure()}{profil?.prenom ? `, ${profil.prenom}` : ''}
              </p>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Tableau de bord</h1>
              <p className="text-[11px] text-zinc-500 mt-1 capitalize">
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                {nbRouge > 0 && <span className="ml-2 text-red-700 font-bold">· {nbRouge} urgent{nbRouge > 1 ? 's' : ''}</span>}
                {nbJaune > 0 && <span className="ml-2 text-amber-700 font-bold">· {nbJaune} à surveiller</span>}
                {nbRouge === 0 && nbJaune === 0 && <span className="ml-2 text-emerald-700 font-bold">· tout est ok</span>}
              </p>
            </div>
          </div>

          {/* CTAs principaux — toujours visibles */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/admin/pilotage"
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 active:scale-95 transition"
            >
              📊 Pilotage
            </Link>
            <Link
              href="/admin/assistant"
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-white border-2 border-emerald-300 text-emerald-700 text-sm font-bold hover:bg-emerald-50 active:scale-95 transition"
            >
              🤖 Assistant IA
            </Link>
          </div>
        </header>

        {/* Bandeau actions rapides ultra-dense — 8 boutons tactiles */}
        <section className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          <Raccourci href="/serveur"             emoji="🍽" label="Service" tone="emerald" />
          <Raccourci href="/caisse"              emoji="💰" label="Caisse" tone="amber" />
          <Raccourci href="/cuisine"             emoji="👨‍🍳" label="Cuisine" tone="amber" />
          <Raccourci href="/bar"                 emoji="🍷" label="Bar" tone="violet" />
          <Raccourci href="/admin/stock"         emoji="📦" label="Stock" tone="blue" />
          <Raccourci href="/admin/reservations"  emoji="📅" label="Résa" tone="blue" />
          <Raccourci href="/admin/fournisseurs"  emoji="🚚" label="Fournis." tone="zinc" />
          <Raccourci href="/admin/rh"            emoji="👥" label="Équipe" tone="zinc" />
        </section>

        {/* Alertes — liste compacte avec CTA inline (1 alerte = 1 ligne, max 4) */}
        {alertes.length > 0 ? (
          <section className="rounded-2xl border-2 border-red-200 bg-white p-2 shadow-sm">
            <header className="flex items-center justify-between px-2 py-1.5">
              <h2 className="text-xs font-black uppercase tracking-wider text-red-700">
                ⚠ Actions à faire ({alertes.length})
              </h2>
              <Link href="/admin/pilotage" className="text-xs font-bold text-zinc-600 hover:text-zinc-900">
                Tout voir →
              </Link>
            </header>
            <ul className="divide-y divide-zinc-100">
              {alertes.map(a => {
                const def = AGENTS[a.agent_id as AgentId]
                const urgent = a.urgence === 'rouge'
                return (
                  <li key={a.id} className="flex items-center gap-2 px-2 py-2">
                    <span className="text-lg shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${urgent ? 'text-red-900' : 'text-amber-900'}`}>
                        {a.titre}
                      </p>
                      {a.message && (
                        <p className="text-[11px] text-zinc-500 truncate">{a.message}</p>
                      )}
                    </div>
                    {a.action_url && a.action_label ? (
                      <Link
                        href={a.action_url}
                        className={`shrink-0 inline-flex items-center h-9 px-3 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition ${
                          urgent
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-amber-500 text-white hover:bg-amber-600'
                        }`}
                      >
                        {a.action_label} →
                      </Link>
                    ) : (
                      <Link
                        href="/admin/pilotage"
                        className="shrink-0 inline-flex items-center h-9 px-3 rounded-full text-xs font-bold whitespace-nowrap bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:scale-95 transition"
                      >
                        Voir →
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-center justify-between">
            <p className="text-sm font-bold text-emerald-900">✓ Aucune alerte — les 15 agents surveillent</p>
            <Link href="/admin/pilotage" className="text-xs font-bold text-emerald-700 hover:text-emerald-900">
              Voir agents →
            </Link>
          </section>
        )}

        {/* KPIs flash et suggestions — côte à côte sur desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionKPIs />
          <SectionSuggestions />
        </div>
      </main>
    </div>
  )
}

function Raccourci({ href, emoji, label, tone }: {
  href: string; emoji: string; label: string
  tone: 'emerald' | 'amber' | 'violet' | 'blue' | 'zinc'
}) {
  const tones: Record<typeof tone, string> = {
    emerald: 'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900',
    amber:   'hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900',
    violet:  'hover:bg-violet-50 hover:border-violet-300 hover:text-violet-900',
    blue:    'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-900',
    zinc:    'hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900',
  }
  return (
    <Link
      href={href}
      className={`group flex flex-col items-center justify-center text-center min-h-[64px] p-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 active:scale-95 transition ${tones[tone]}`}
    >
      <span className="text-xl leading-none" aria-hidden>{emoji}</span>
      <span className="text-[11px] font-bold mt-1">{label}</span>
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
