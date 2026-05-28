// /admin/cat — Page d'accueil principale (premium hero + grille catégories).
// Design haut de gamme : typo black tracking-tight, bento stats, hero photo immersif,
// stagger fade-in, glassmorphism, hover scale ken-burns.

import Link from 'next/link'
import { CATEGORIES, type Category } from '@/lib/navigation'
import { getProfile } from '@/lib/auth'
import { foodCostMoyenEtAlertes } from '@/lib/foodCostAgg'
import { canAccess } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { ArrowRight, Sparkles, AlertTriangle, TrendingUp, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  const [alertesRes, caRes, equipeRes, foodCostAgg] = await Promise.all([
    sb.from('agent_findings').select('id', { count: 'exact', head: true })
      .eq('resolu', false).eq('urgence', 'rouge'),
    sb.from('commandes').select('montant_total_ttc').eq('statut', 'encaisse')
      .gte('created_at', monthStart.toISOString()),
    sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true),
    foodCostMoyenEtAlertes(sb),  // food cost moyen calculé runtime
  ])
  const nbAlertesRouges = alertesRes.count ?? 0
  const caMois = (caRes.data ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const nbEquipe = equipeRes.count ?? 0
  const fcMoyen = foodCostAgg.moyen  // 0 si recettes pas encore composées

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
        {/* ─── HERO BANNER avec vidéo + logo restaurant ────────────── */}
        <header className="relative overflow-hidden rounded-3xl bg-zinc-900 shadow-2xl ring-1 ring-zinc-200 min-h-[280px] sm:min-h-[360px]">
          {/* Vidéo background autoplay loop muted */}
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=75"
            className="absolute inset-0 w-full h-full object-cover"
            aria-hidden
          >
            <source src="/videos/hero.mp4.mp4" type="video/mp4" />
          </video>
          {/* Overlay multi-couche premium pour lisibilité texte */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/30" aria-hidden />

          {/* Contenu hero — logo + texte */}
          <div className="relative z-10 h-full min-h-[280px] sm:min-h-[360px] flex flex-col justify-between p-5 sm:p-8 text-white">
            {/* Top : logo restaurant + status badge */}
            <div className="flex items-start justify-between gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/videos/logo%20casatasia.png"
                alt="Logo CASATASIA"
                className="h-12 sm:h-16 w-auto drop-shadow-2xl"
              />
              <span className="inline-flex items-center gap-1.5 h-7 sm:h-8 px-3 rounded-full bg-white/15 backdrop-blur-md text-white text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] ring-1 ring-white/30">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>

            {/* Bottom : title + subtitle */}
            <div className="space-y-2">
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-white/80">
                {bonjourSelonHeure()}{profil?.email ? ` · ${profil.email.split('@')[0]}` : ''}
              </p>
              <h1 className="font-display text-5xl sm:text-7xl font-medium tracking-[-0.03em] leading-[0.9] drop-shadow-2xl italic">
                Tableau<br className="sm:hidden" /> de bord
              </h1>
              <p className="text-sm sm:text-base text-white/90 max-w-xl leading-relaxed">
                Pilote ton restaurant en temps réel — toutes les fonctionnalités organisées thématiquement.
              </p>
            </div>
          </div>
        </header>

        {/* Bento stats — 4 cards : alertes / CA / food cost / équipe */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            label="Alertes urgentes"
            value={nbAlertesRouges.toString()}
            icon={<AlertTriangle className="h-4 w-4" strokeWidth={2.5} />}
            tone={nbAlertesRouges > 0 ? 'red' : 'emerald'}
            hint={nbAlertesRouges > 0 ? 'à traiter maintenant' : 'tout est sous contrôle'}
            href="/admin/cat/pilotage"
          />
          <StatCard
            label="Food cost"
            value={fcMoyen > 0 ? fcMoyen.toFixed(1).replace('.', ',') + ' %' : '—'}
            icon={<TrendingUp className="h-4 w-4" strokeWidth={2.5} />}
            tone={fcMoyen > 32 ? 'red' : 'emerald'}
            hint={fcMoyen > 0 ? (fcMoyen > 32 ? 'trop élevé' : fcMoyen >= 28 ? 'à surveiller' : 'sain') : 'composez vos recettes'}
            href="/admin/recettes/engineering"
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
        </section>

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
                  prefetch={false}
                  style={{ ['--stagger' as any]: `${idx * 50}ms` }}
                  className="stagger-fadeup lift-on-hover group relative flex flex-col justify-end overflow-hidden rounded-3xl bg-zinc-900 ring-1 ring-zinc-200 hover:ring-2 hover:ring-zinc-900/30 hover:shadow-2xl hover:shadow-zinc-900/20 active:scale-[0.98] active:translate-y-0 min-h-[220px] sm:min-h-[260px]"
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

                  {/* Numéro éditorial — top right, style magazine (Fraunces italic) */}
                  <span className="absolute top-4 right-4 text-white/95 font-display italic text-3xl sm:text-4xl tracking-tight tabular-nums drop-shadow-2xl z-10 leading-none" style={{ fontWeight: 500 }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  {/* Trait décoratif vertical à gauche (signature éditoriale) */}
                  <span className="absolute top-1/4 bottom-1/4 left-0 w-[3px] bg-white/40 z-10" aria-hidden />

                  {/* Texte + flèche en bas (sur l'overlay) */}
                  <div className="relative z-10 p-4 sm:p-5 text-white space-y-1.5">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                      {cat.items.length} module{cat.items.length > 1 ? 's' : ''}
                    </p>
                    <div className="flex items-end justify-between gap-2">
                      <h3 className="font-display text-2xl sm:text-3xl font-medium tracking-[-0.02em] leading-[1.05] drop-shadow-lg">
                        {cat.label}
                      </h3>
                      <ArrowRight className="h-5 w-5 text-white/70 shrink-0 mb-1 group-hover:translate-x-1 group-hover:text-white transition-all duration-300" strokeWidth={1.75} />
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
  // Style éditorial : trait vertical coloré + grand chiffre + label uppercase
  const tones: Record<typeof tone, { accent: string; valueText: string; labelText: string; iconColor: string }> = {
    emerald: { accent: 'bg-emerald-500', valueText: 'text-zinc-900', labelText: 'text-emerald-700', iconColor: 'text-emerald-700' },
    red:     { accent: 'bg-red-500',     valueText: 'text-red-900',  labelText: 'text-red-700',     iconColor: 'text-red-700' },
    violet:  { accent: 'bg-violet-500',  valueText: 'text-zinc-900', labelText: 'text-violet-700',  iconColor: 'text-violet-700' },
    amber:   { accent: 'bg-amber-500',   valueText: 'text-zinc-900', labelText: 'text-amber-700',   iconColor: 'text-amber-700' },
  }
  const t = tones[tone]
  return (
    <Link
      href={href}
      className="lift-on-hover group relative flex bg-white rounded-2xl ring-1 ring-zinc-200 hover:ring-zinc-400 hover:shadow-xl active:scale-[0.98] active:translate-y-0 overflow-hidden"
    >
      {/* Trait vertical coloré — signature éditoriale gauche */}
      <span className={cn('w-1 self-stretch shrink-0', t.accent)} aria-hidden />

      <div className="flex-1 p-3 sm:p-4 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('inline-flex items-center justify-center', t.iconColor)}>
            {icon}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition-all" strokeWidth={1.75} />
        </div>
        <p className={cn('mt-3 sm:mt-4 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] truncate', t.labelText)}>
          {label}
        </p>
        <p className={cn('text-xl sm:text-3xl font-black tracking-[-0.035em] tabular-nums leading-none mt-1.5 truncate', t.valueText)}>
          {value}
        </p>
        <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-1.5 truncate">{hint}</p>
      </div>
    </Link>
  )
}
