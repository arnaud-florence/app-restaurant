// /admin — "Tableau de bord" gérant : sous-module de la catégorie Pilotage.
// Vue command-center "10 secondes" : alertes urgentes + KPIs flash + suggestions.
// Design haut de gamme aligné sur /admin/cat.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { AGENTS, type AgentId } from '@/lib/agents/types'
import SectionKPIs from './pilotage/sections/SectionKPIs'
import SectionSuggestions from './pilotage/sections/SectionSuggestions'
import { Target, Sparkles, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react'

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
    <div className="min-h-screen bg-zinc-50">
      {/* Dot pattern subtil cohérent avec /admin/cat */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
        {/* ─── HERO HEADER premium ──────────────────────────────────── */}
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {bonjourSelonHeure()}{profil?.prenom ? `, ${profil.prenom}` : ''} · Pilotage
            </p>
            <h1 className="text-3xl sm:text-5xl font-black text-zinc-900 tracking-[-0.03em] leading-[0.95]">
              Tableau de bord
            </h1>
            <p className="text-sm sm:text-base text-zinc-500 capitalize leading-relaxed">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              {nbRouge > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-red-700 font-bold normal-case">
                  · <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} /> {nbRouge} urgent{nbRouge > 1 ? 's' : ''}
                </span>
              )}
              {nbJaune > 0 && (
                <span className="ml-2 inline-flex items-center text-amber-700 font-bold normal-case">
                  · {nbJaune} à surveiller
                </span>
              )}
              {nbRouge === 0 && nbJaune === 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 font-bold normal-case">
                  · <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} /> tout est ok
                </span>
              )}
            </p>
          </div>

          {/* CTAs premium avec icons Lucide + glow */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/admin/pilotage"
              className="group inline-flex items-center gap-2 h-11 pl-3 pr-4 rounded-full bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 active:scale-95 transition shadow-xl shadow-zinc-900/25 ring-1 ring-zinc-900/10"
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
                <Target className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <span>KPIs & Objectifs</span>
              <ArrowRight className="h-3.5 w-3.5 opacity-70 group-hover:translate-x-0.5 transition" strokeWidth={2.5} />
            </Link>
            <Link
              href="/admin/assistant"
              className="group inline-flex items-center gap-2 h-11 pl-3 pr-4 rounded-full bg-white text-zinc-900 text-sm font-bold hover:bg-violet-50 active:scale-95 transition shadow-sm ring-1 ring-zinc-200 hover:ring-violet-300"
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/30">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <span>Assistant IA</span>
            </Link>
          </div>
        </header>

        {/* ─── ALERTES URGENTES (premium card list) ────────────────── */}
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
                Actions à faire
                <span className="text-zinc-300">· {alertes.length}</span>
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">Détectées par les 15 agents IA</p>
            </div>
          </div>
          {alertes.length > 0 ? (
            <div className="overflow-hidden rounded-3xl ring-1 ring-red-200 bg-white shadow-lg shadow-red-500/5">
              <ul className="divide-y divide-zinc-100">
                {alertes.map(a => {
                  const def = AGENTS[a.agent_id as AgentId]
                  const urgent = a.urgence === 'rouge'
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-3.5 py-3 hover:bg-zinc-50/50 transition">
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl shadow-md text-xl shrink-0 ${
                        urgent ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-red-500/30'
                               : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-500/30'
                      }`} aria-hidden>{def?.emoji ?? '🤖'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-black truncate tracking-[-0.01em] ${urgent ? 'text-red-900' : 'text-amber-900'}`}>
                          {a.titre}
                        </p>
                        {a.message && (
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">{a.message}</p>
                        )}
                      </div>
                      {a.action_url && a.action_label ? (
                        <Link
                          href={a.action_url}
                          className={`shrink-0 group inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-bold whitespace-nowrap active:scale-95 transition shadow-lg ${
                            urgent
                              ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-500/40'
                              : 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/40'
                          }`}
                        >
                          {a.action_label}
                          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition" strokeWidth={2.5} />
                        </Link>
                      ) : (
                        <Link
                          href="/admin/pilotage"
                          className="shrink-0 inline-flex items-center h-9 px-3 rounded-full text-xs font-bold whitespace-nowrap bg-zinc-100 text-zinc-700 hover:bg-zinc-200 active:scale-95 transition"
                        >
                          Voir
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
              <Link
                href="/admin/pilotage"
                className="group flex items-center justify-between px-4 py-2.5 bg-zinc-50 border-t border-zinc-100 hover:bg-zinc-100/70 transition"
              >
                <span className="text-xs font-bold text-zinc-700 group-hover:text-zinc-900">Voir toutes les alertes</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition" strokeWidth={2.5} />
              </Link>
            </div>
          ) : (
            <div className="rounded-3xl ring-1 ring-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 shrink-0">
                  <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-emerald-900 tracking-[-0.01em]">Aucune alerte urgente</p>
                  <p className="text-[11px] text-emerald-700">Les 15 agents surveillent en continu</p>
                </div>
              </div>
              <Link
                href="/admin/pilotage"
                className="group inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 whitespace-nowrap shrink-0"
              >
                Voir agents
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition" strokeWidth={2.5} />
              </Link>
            </div>
          )}
        </section>

        {/* ─── KPIs flash & suggestions (bento 2 cols) ─────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" strokeWidth={2.5} />
              Aperçu live
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">Indicateurs et suggestions du jour</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SectionKPIs />
            <SectionSuggestions />
          </div>
        </section>
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
