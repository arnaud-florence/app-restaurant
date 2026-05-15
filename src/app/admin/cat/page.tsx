// /admin/cat — Page d'accueil principale (premium hero + grille catégories).
// Design haut de gamme : typo black tracking-tight, bento stats, hero photo immersif,
// stagger fade-in, glassmorphism, hover scale ken-burns.

import Link from 'next/link'
import { CATEGORIES, type Category } from '@/lib/navigation'
import { getProfile } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { ArrowRight, Sparkles, AlertTriangle, TrendingUp, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accueil — Tableau de bord' }

const TONES: Record<Category['tone'], { gradient: string; emojiGradient: string; ring: string }> = {
  emerald: { gradient: 'from-emerald-500 to-teal-600',   emojiGradient: 'from-emerald-500 to-teal-600',  ring: 'ring-emerald-500/40' },
  amber:   { gradient: 'from-amber-500 to-orange-600',   emojiGradient: 'from-amber-500 to-orange-600',  ring: 'ring-amber-500/40' },
  violet:  { gradient: 'from-violet-500 to-purple-600',  emojiGradient: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/40' },
  blue:    { gradient: 'from-blue-500 to-sky-600',       emojiGradient: 'from-blue-500 to-sky-600',      ring: 'ring-blue-500/40' },
  red:     { gradient: 'from-red-500 to-rose-600',       emojiGradient: 'from-red-500 to-rose-600',      ring: 'ring-red-500/40' },
  rose:    { gradient: 'from-rose-500 to-pink-600',      emojiGradient: 'from-rose-500 to-pink-600',     ring: 'ring-rose-500/40' },
  zinc:    { gradient: 'from-zinc-700 to-zinc-900',      emojiGradient: 'from-zinc-700 to-zinc-900',     ring: 'ring-zinc-500/40' },
}

function bonjourSelonHeure(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Bonjour'
  if (h < 14) return 'Bon midi'
  if (h < 18) return 'Bel après-midi'
  if (h < 23) return 'Bonsoir'
  return 'Bonne fin de soirée'
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

  // Stats live pour le bento
  const sb = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const monthStart = new Date()
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const [alertesRes, caRes, equipeRes] = await Promise.all([
    sb.from('agent_findings').select('id', { count: 'exact', head: true })
      .eq('resolu', false).eq('urgence', 'rouge'),
    sb.from('commandes').select('montant_total_ttc').eq('statut', 'encaisse')
      .gte('created_at', monthStart.toISOString()),
    sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true),
  ])
  const nbAlertesRouges = alertesRes.count ?? 0
  const caMois = (caRes.data ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const nbEquipe = equipeRes.count ?? 0

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Subtle dot pattern background (premium texture) */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
        {/* ─── HERO HEADER ─────────────────────────────────────────── */}
        <header className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="space-y-2 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {bonjourSelonHeure()}{profil?.email ? ` · ${profil.email.split('@')[0]}` : ''}
              </p>
              <h1 className="text-3xl sm:text-5xl font-black text-zinc-900 tracking-[-0.03em] leading-[0.95]">
                Tableau de bord
              </h1>
              <p className="text-sm sm:text-base text-zinc-500 max-w-xl leading-relaxed">
                Tout ce qu'il faut piloter ton restaurant, organisé thématiquement.
                <span className="text-zinc-400"> Clique sur une catégorie pour explorer.</span>
              </p>
            </div>
          </div>

          {/* Bento stats — 3 cards alertes / CA / équipe */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard
              label="Alertes urgentes"
              value={nbAlertesRouges.toString()}
              icon={<AlertTriangle className="h-4 w-4" strokeWidth={2.5} />}
              tone={nbAlertesRouges > 0 ? 'red' : 'emerald'}
              hint={nbAlertesRouges > 0 ? 'à traiter maintenant' : 'tout est sous contrôle'}
              href="/admin/cat/pilotage"
            />
            <StatCard
              label="CA du mois"
              value={caMois.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'}
              icon={<TrendingUp className="h-4 w-4" strokeWidth={2.5} />}
              tone="emerald"
              hint="commandes encaissées"
              href="/admin/cat/finances"
            />
            <StatCard
              label="Équipe active"
              value={nbEquipe.toString()}
              icon={<Users className="h-4 w-4" strokeWidth={2.5} />}
              tone="violet"
              hint="employés"
              href="/admin/cat/equipe"
            />
          </div>
        </header>

        {/* ─── SECTION CATÉGORIES ──────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                Vos catégories
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">{categoriesVisibles.length} accessibles selon ton profil</p>
            </div>
          </div>

          {/* Grille bento premium */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {categoriesVisibles.map((cat, idx) => {
              const tone = TONES[cat.tone]
              return (
                <Link
                  key={cat.slug}
                  href={`/admin/cat/${cat.slug}`}
                  style={{ ['--stagger' as any]: `${idx * 50}ms` }}
                  className="stagger-fadeup group relative flex flex-col justify-end overflow-hidden rounded-3xl bg-zinc-900 ring-1 ring-zinc-200 hover:ring-2 hover:ring-zinc-900/20 active:scale-[0.98] transition-all duration-300 min-h-[220px] sm:min-h-[260px]"
                >
                  {/* Image de fond Unsplash avec ken-burns zoom au hover */}
                  {cat.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={cat.imageUrl}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
                    />
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${tone.emojiGradient}`} aria-hidden />
                  )}

                  {/* Overlay multi-couche pour lisibilité et profondeur */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/0" aria-hidden />
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/30" aria-hidden />

                  {/* Badge nb sous-modules — top right */}
                  <span className="absolute top-3 right-3 inline-flex items-center justify-center min-w-[28px] h-7 px-2.5 rounded-full bg-white/95 backdrop-blur text-zinc-900 text-[11px] font-black tabular-nums shadow-xl z-10 ring-1 ring-black/5">
                    {cat.items.length}
                  </span>

                  {/* Pastille emoji — top left */}
                  <span className={`absolute top-3 left-3 inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${tone.emojiGradient} text-white text-2xl shadow-2xl z-10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 ring-2 ring-white/40`}>
                    {cat.emoji}
                  </span>

                  {/* Texte + flèche en bas (sur l'overlay) */}
                  <div className="relative z-10 p-3.5 sm:p-4 text-white space-y-1">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-white/75">
                      {cat.items.length} module{cat.items.length > 1 ? 's' : ''}
                    </p>
                    <div className="flex items-end justify-between gap-2">
                      <h3 className="text-lg sm:text-xl font-black tracking-[-0.02em] leading-tight drop-shadow-lg">
                        {cat.label}
                      </h3>
                      <ArrowRight className="h-4 w-4 text-white/70 shrink-0 mb-0.5 group-hover:translate-x-1 group-hover:text-white transition-all duration-300" strokeWidth={2.5} />
                    </div>
                    <p className="text-[11px] sm:text-xs text-white/85 line-clamp-2 leading-snug pt-0.5">
                      {cat.pitch}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

// ─── Composant Bento Stat Card ───────────────────────────────────
function StatCard({
  label, value, icon, tone, hint, href,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'emerald' | 'red' | 'violet' | 'amber'
  hint: string
  href: string
}) {
  const tones: Record<typeof tone, { bg: string; iconBg: string; iconText: string; valueText: string; labelText: string }> = {
    emerald: { bg: 'bg-white hover:bg-emerald-50/40', iconBg: 'bg-emerald-100', iconText: 'text-emerald-700', valueText: 'text-emerald-700', labelText: 'text-emerald-600' },
    red:     { bg: 'bg-white hover:bg-red-50/40',     iconBg: 'bg-red-100',     iconText: 'text-red-700',     valueText: 'text-red-700',     labelText: 'text-red-600' },
    violet:  { bg: 'bg-white hover:bg-violet-50/40',  iconBg: 'bg-violet-100',  iconText: 'text-violet-700',  valueText: 'text-violet-700',  labelText: 'text-violet-600' },
    amber:   { bg: 'bg-white hover:bg-amber-50/40',   iconBg: 'bg-amber-100',   iconText: 'text-amber-700',   valueText: 'text-amber-700',   labelText: 'text-amber-600' },
  }
  const t = tones[tone]
  return (
    <Link
      href={href}
      className={`group flex flex-col p-3 sm:p-4 rounded-2xl ring-1 ring-zinc-200 hover:ring-zinc-300 active:scale-[0.98] transition-all duration-300 ${t.bg}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${t.iconBg} ${t.iconText}`}>
          {icon}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-600 group-hover:translate-x-0.5 transition-all" strokeWidth={2.5} />
      </div>
      <p className={`mt-2 sm:mt-3 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] ${t.labelText} truncate`}>
        {label}
      </p>
      <p className={`text-lg sm:text-2xl font-black tracking-[-0.02em] tabular-nums leading-none mt-1 ${t.valueText} truncate`}>
        {value}
      </p>
      <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5 truncate">{hint}</p>
    </Link>
  )
}
