// /admin/cat — Vue d'ensemble : toutes les catégories en grandes tuiles.
// Sert d'index global de la nav hiérarchique.

import Link from 'next/link'
import { CATEGORIES, type Category } from '@/lib/navigation'
import { getProfile } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accueil — Tableau de bord' }

const TONES: Record<Category['tone'], {
  cardBg: string
  cardBorder: string
  cardHover: string
  emojiGradient: string
  labelColor: string
  pitchColor: string
}> = {
  emerald: {
    cardBg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    cardBorder: 'border-emerald-200',
    cardHover: 'hover:border-emerald-400 hover:shadow-emerald-500/20',
    emojiGradient: 'from-emerald-500 to-teal-600',
    labelColor: 'text-emerald-900',
    pitchColor: 'text-emerald-700',
  },
  amber: {
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
    cardBorder: 'border-amber-200',
    cardHover: 'hover:border-amber-400 hover:shadow-amber-500/20',
    emojiGradient: 'from-amber-500 to-orange-600',
    labelColor: 'text-amber-900',
    pitchColor: 'text-amber-700',
  },
  violet: {
    cardBg: 'bg-gradient-to-br from-violet-50 to-purple-50',
    cardBorder: 'border-violet-200',
    cardHover: 'hover:border-violet-400 hover:shadow-violet-500/20',
    emojiGradient: 'from-violet-500 to-purple-600',
    labelColor: 'text-violet-900',
    pitchColor: 'text-violet-700',
  },
  blue: {
    cardBg: 'bg-gradient-to-br from-blue-50 to-sky-50',
    cardBorder: 'border-blue-200',
    cardHover: 'hover:border-blue-400 hover:shadow-blue-500/20',
    emojiGradient: 'from-blue-500 to-sky-600',
    labelColor: 'text-blue-900',
    pitchColor: 'text-blue-700',
  },
  red: {
    cardBg: 'bg-gradient-to-br from-red-50 to-rose-50',
    cardBorder: 'border-red-200',
    cardHover: 'hover:border-red-400 hover:shadow-red-500/20',
    emojiGradient: 'from-red-500 to-rose-600',
    labelColor: 'text-red-900',
    pitchColor: 'text-red-700',
  },
  rose: {
    cardBg: 'bg-gradient-to-br from-rose-50 to-pink-50',
    cardBorder: 'border-rose-200',
    cardHover: 'hover:border-rose-400 hover:shadow-rose-500/20',
    emojiGradient: 'from-rose-500 to-pink-600',
    labelColor: 'text-rose-900',
    pitchColor: 'text-rose-700',
  },
  zinc: {
    cardBg: 'bg-gradient-to-br from-zinc-50 to-zinc-100',
    cardBorder: 'border-zinc-300',
    cardHover: 'hover:border-zinc-500 hover:shadow-zinc-500/20',
    emojiGradient: 'from-zinc-700 to-zinc-900',
    labelColor: 'text-zinc-900',
    pitchColor: 'text-zinc-700',
  },
}

export default async function CatIndexPage() {
  const profil = await getProfile()
  const isManager = profil?.role === 'manager'
  const peutVoir = (href: string) =>
    isManager || canAccess(profil?.poste, href, profil?.custom_permissions ?? null)

  // Filtre les catégories (au moins 1 sous-module visible)
  const categoriesVisibles = CATEGORIES
    .map(c => ({ ...c, items: c.items.filter(it => peutVoir(it.href)) }))
    .filter(c => c.items.length > 0)

  // Compte les alertes rouges live pour le header
  const sb = await createClient()
  const { count: nbAlertesRouges } = await sb
    .from('agent_findings')
    .select('id', { count: 'exact', head: true })
    .eq('resolu', false)
    .eq('urgence', 'rouge')

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
        {/* Header premium */}
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-3xl shadow-lg ring-4 ring-emerald-500/30 shrink-0">
              🏠
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                Accueil · {categoriesVisibles.length} catégorie{categoriesVisibles.length > 1 ? 's' : ''}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">
                Bienvenue
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1.5">
                Toutes les fonctionnalités de l'app, organisées thématiquement.
                {nbAlertesRouges != null && nbAlertesRouges > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-red-700 font-bold">
                    · 🔴 {nbAlertesRouges} alerte{nbAlertesRouges > 1 ? 's' : ''} urgente{nbAlertesRouges > 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
          </div>
        </header>

        {/* Grille de tuiles catégorie — mode photo gallery (image fond + overlay) */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {categoriesVisibles.map((cat, idx) => {
            const tone = TONES[cat.tone]
            return (
              <Link
                key={cat.slug}
                href={`/admin/cat/${cat.slug}`}
                style={{ ['--stagger' as any]: `${idx * 50}ms` }}
                className="stagger-fadeup group relative flex flex-col justify-end overflow-hidden rounded-2xl border-2 border-zinc-200 bg-zinc-900 active:scale-[0.96] hover:shadow-2xl transition-all min-h-[180px] sm:min-h-[220px] aspect-square sm:aspect-auto"
              >
                {/* Image de fond (Unsplash) avec ken-burns zoom au hover */}
                {cat.imageUrl ? (
                  <img
                    src={cat.imageUrl}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${tone.emojiGradient}`} aria-hidden />
                )}

                {/* Overlay sombre dégradé pour lisibilité du texte */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/20" aria-hidden />

                {/* Badge nb sous-modules en haut à droite */}
                <span className="absolute top-2.5 right-2.5 inline-flex items-center justify-center min-w-[26px] h-7 px-2.5 rounded-full bg-white/95 backdrop-blur text-zinc-900 text-[11px] font-black tabular-nums shadow-lg z-10">
                  {cat.items.length}
                </span>

                {/* Pastille emoji en haut à gauche (petit accent) */}
                <span className={`absolute top-2.5 left-2.5 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br ${tone.emojiGradient} text-white text-xl shadow-lg z-10 group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                  {cat.emoji}
                </span>

                {/* Texte en bas (sur l'overlay) */}
                <div className="relative z-10 p-3 sm:p-4 text-white">
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/80">
                    {cat.items.length} module{cat.items.length > 1 ? 's' : ''}
                  </p>
                  <h3 className="mt-0.5 text-lg sm:text-xl font-black tracking-tight leading-tight drop-shadow-lg">
                    {cat.label}
                  </h3>
                  <p className="mt-1 text-[11px] sm:text-xs text-white/90 line-clamp-2 leading-snug">
                    {cat.pitch}
                  </p>
                </div>
              </Link>
            )
          })}
        </section>
      </main>
    </div>
  )
}
