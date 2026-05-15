// /admin — "Tableau de bord" gérant : sous-module de la catégorie Pilotage.
// Vue command-center "10 secondes" : alertes urgentes + KPIs flash + suggestions.
// Tout vient des agents IA, aucune donnée fictive.

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
      <main className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
        {/* Header premium icon-glow — pattern catégorie */}
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-2xl sm:text-3xl shadow-lg ring-4 ring-emerald-500/30 shrink-0">
              📊
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                {bonjourSelonHeure()}{profil?.prenom ? `, ${profil.prenom}` : ''} · Pilotage
              </p>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">
                Tableau de bord
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-500 mt-1 capitalize">
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                {nbRouge > 0 && <span className="ml-2 text-red-700 font-bold normal-case">· {nbRouge} urgent{nbRouge > 1 ? 's' : ''}</span>}
                {nbJaune > 0 && <span className="ml-2 text-amber-700 font-bold normal-case">· {nbJaune} à surveiller</span>}
                {nbRouge === 0 && nbJaune === 0 && <span className="ml-2 text-emerald-700 font-bold normal-case">· tout est ok</span>}
              </p>
            </div>
          </div>

          {/* CTAs : accès rapide aux 2 outils Pilotage les plus utilisés */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/admin/pilotage"
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 active:scale-95 transition shadow-lg shadow-zinc-900/20"
            >
              🎯 KPIs & Objectifs
            </Link>
            <Link
              href="/admin/assistant"
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-white border-2 border-emerald-300 text-emerald-700 text-sm font-bold hover:bg-emerald-50 active:scale-95 transition"
            >
              🤖 Assistant IA
            </Link>
          </div>
        </header>

        {/* Alertes urgentes — liste compacte avec CTA inline (1 ligne par alerte, max 4) */}
        <section>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 px-1">
            Actions à faire ({alertes.length})
          </h2>
          {alertes.length > 0 ? (
            <div className="rounded-2xl border-2 border-red-200 bg-white shadow-sm overflow-hidden">
              <ul className="divide-y divide-zinc-100">
                {alertes.map(a => {
                  const def = AGENTS[a.agent_id as AgentId]
                  const urgent = a.urgence === 'rouge'
                  return (
                    <li key={a.id} className="flex items-center gap-2 px-3 py-2.5">
                      <span className="text-xl shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
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
                              ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/30'
                              : 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/30'
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
              <div className="px-3 py-2 bg-zinc-50 border-t border-zinc-100">
                <Link href="/admin/pilotage" className="text-xs font-bold text-zinc-700 hover:text-zinc-900">
                  Voir toutes les alertes →
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-bold text-emerald-900">✓ Aucune alerte — les 15 agents surveillent en continu</p>
              <Link href="/admin/pilotage" className="text-xs font-bold text-emerald-700 hover:text-emerald-900 whitespace-nowrap">
                Voir agents →
              </Link>
            </div>
          )}
        </section>

        {/* KPIs flash et suggestions — côte à côte sur desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionKPIs />
          <SectionSuggestions />
        </div>
      </main>
    </div>
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
