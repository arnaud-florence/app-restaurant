// /print/plan — « Plan de l'application » imprimable (poster A4).
// La carte complète de l'outil : tous les univers + tous les modules + ce que
// chacun fait. À imprimer et afficher au bureau pour avoir les contours de
// l'app physiquement sous les yeux. Contenu = noms de fonctionnalités (non
// sensible), hérite du root layout (fond blanc), hors layout admin.

import { CATEGORIES } from '@/lib/navigation'
import PrintButton from './PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: "Plan de l'application — CASATASIA" }

const TONE_TXT: Record<string, string> = {
  emerald: 'text-emerald-700 border-emerald-300',
  amber:   'text-amber-700 border-amber-300',
  violet:  'text-violet-700 border-violet-300',
  blue:    'text-blue-700 border-blue-300',
  red:     'text-red-700 border-red-300',
  rose:    'text-rose-700 border-rose-300',
  zinc:    'text-zinc-700 border-zinc-300',
}

export default function PlanPage() {
  const totalModules = CATEGORIES.reduce((s, c) => s + c.items.length, 0)
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="max-w-5xl mx-auto px-5 py-6 print:py-2">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Plan de l'application</h1>
            <p className="text-sm text-zinc-500 mt-1">
              CASATASIA — {CATEGORIES.length} univers · {totalModules} modules · 15 agents IA · 4 canaux de service
            </p>
          </div>
          <PrintButton />
        </div>

        {/* Grille des univers — 2 colonnes en écran/print pour tenir sur la page */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-3">
          {CATEGORIES.map((cat, idx) => (
            <section key={cat.slug} className={`rounded-xl border break-inside-avoid ${TONE_TXT[cat.tone] ?? TONE_TXT.zinc}`}>
              <div className="px-3 py-2 border-b border-inherit flex items-center gap-2">
                <span className="text-xl" aria-hidden>{cat.emoji}</span>
                <div className="min-w-0">
                  <h2 className="font-black leading-tight">{idx + 1}. {cat.label}</h2>
                  <p className="text-[11px] text-zinc-500 leading-tight">{cat.pitch}</p>
                </div>
              </div>
              <ul className="p-3 space-y-1.5">
                {cat.items.map(m => (
                  <li key={m.href} className="flex items-start gap-2 text-zinc-800">
                    <span className="text-sm leading-5 shrink-0" aria-hidden>{m.emoji}</span>
                    <span className="min-w-0">
                      <span className="text-sm font-bold">{m.label}</span>
                      <span className="text-[11px] text-zinc-500"> — {m.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-[10px] text-zinc-400 mt-5 text-center print:mt-3">
          Chaque module est accessible depuis le Centre de contrôle (accueil) ou la recherche « Que cherches-tu ? ».
        </p>
      </div>
    </div>
  )
}
