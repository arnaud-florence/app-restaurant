// /admin/cat/[slug] — Page de catégorie : affiche tous les sous-modules
// d'une catégorie sous forme de cartes tactiles avec emoji + label + description.
// Niveau 2 de la navigation hiérarchique (le niveau 1 = chips catégorie dans la TopActionBar).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, type Category } from '@/lib/navigation'
import { getProfile } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ─── Compteurs live par sous-module ─────────────────────────────────
// Fetch des stats clés selon la catégorie active. Affiche un badge sur
// la tuile : "12" pour un nombre simple, "🔴 3" si urgence détectée.

type Compteur = { count: number; urgent?: boolean; label?: string }

async function fetchCompteurs(slug: string): Promise<Record<string, Compteur>> {
  const sb = await createClient()
  const result: Record<string, Compteur> = {}
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  try {
    if (slug === 'service') {
      const [enCours, resaJour] = await Promise.all([
        sb.from('commandes').select('id', { count: 'exact', head: true })
          .in('statut', ['en_attente', 'en_preparation', 'pret', 'servi']),
        sb.from('reservations_tables').select('id', { count: 'exact', head: true })
          .gte('date_resa', today).lt('date_resa', tomorrow),
      ])
      result['/serveur']            = { count: enCours.count ?? 0, label: 'en service' }
      result['/caisse']             = { count: enCours.count ?? 0, label: 'à encaisser' }
      result['/cuisine']            = { count: enCours.count ?? 0, label: 'en cours' }
      result['/admin/reservations'] = { count: resaJour.count ?? 0, label: 'aujourd\'hui' }
    }

    if (slug === 'cuisine-stock') {
      const [recettes, ingredients, ruptures, fournisseurs, boissons, allergenes] = await Promise.all([
        sb.from('recettes').select('id', { count: 'exact', head: true }),
        sb.from('ingredients').select('id', { count: 'exact', head: true }),
        sb.from('ingredients').select('id', { count: 'exact', head: true }).lte('stock_actuel', 0),
        sb.from('fournisseurs').select('id', { count: 'exact', head: true }),
        sb.from('boissons').select('id', { count: 'exact', head: true }),
        sb.from('allergenes').select('id', { count: 'exact', head: true }),
      ])
      const nbRuptures = ruptures.count ?? 0
      result['/admin/recettes']     = { count: recettes.count ?? 0, label: 'recettes' }
      result['/admin/ingredients']  = { count: ingredients.count ?? 0, label: 'ingrédients' }
      result['/admin/stock']        = { count: nbRuptures, urgent: nbRuptures > 0, label: nbRuptures > 0 ? 'ruptures' : 'OK' }
      result['/admin/fournisseurs'] = { count: fournisseurs.count ?? 0, label: 'partenaires' }
      result['/admin/boissons']     = { count: boissons.count ?? 0, label: 'boissons' }
      result['/admin/allergenes']   = { count: allergenes.count ?? 0, label: 'allergènes' }
    }

    if (slug === 'clientele') {
      const [clients, resa, chambres, groupes, cadeaux] = await Promise.all([
        sb.from('clients').select('id', { count: 'exact', head: true }),
        sb.from('reservations_tables').select('id', { count: 'exact', head: true })
          .gte('date_resa', today),
        sb.from('chambres').select('id', { count: 'exact', head: true }),
        sb.from('groupes').select('id', { count: 'exact', head: true }),
        sb.from('cartes_cadeaux').select('id', { count: 'exact', head: true }).eq('statut', 'active'),
      ])
      result['/admin/clients']        = { count: clients.count ?? 0, label: 'clients' }
      result['/admin/reservations']   = { count: resa.count ?? 0, label: 'à venir' }
      result['/admin/chambres']       = { count: chambres.count ?? 0, label: 'chambres' }
      result['/admin/groupes']        = { count: groupes.count ?? 0, label: 'groupes' }
      result['/admin/cartes-cadeaux'] = { count: cadeaux.count ?? 0, label: 'actives' }
    }

    if (slug === 'equipe') {
      const [employes, guides] = await Promise.all([
        sb.from('employes').select('id', { count: 'exact', head: true }),
        sb.from('guides_formation').select('id', { count: 'exact', head: true }).eq('actif', true),
      ])
      result['/admin/rh']        = { count: employes.count ?? 0, label: 'employés' }
      result['/formation']       = { count: guides.count ?? 0, label: 'manuels' }
      result['/admin/formation'] = { count: guides.count ?? 0, label: 'guides actifs' }
    }

    if (slug === 'conformite') {
      const [ncs, equipements] = await Promise.all([
        sb.from('non_conformites').select('id', { count: 'exact', head: true }).eq('statut', 'ouverte'),
        sb.from('equipements').select('id', { count: 'exact', head: true }),
      ])
      const nbNC = ncs.count ?? 0
      result['/admin/hygiene']     = { count: nbNC, urgent: nbNC > 0, label: nbNC > 0 ? 'NC ouvertes' : 'sain' }
      result['/admin/maintenance'] = { count: equipements.count ?? 0, label: 'équipements' }
    }

    if (slug === 'pilotage') {
      const { count: alertes } = await sb.from('agent_findings').select('id', { count: 'exact', head: true })
        .eq('resolu', false).eq('urgence', 'rouge')
      result['/admin/pilotage'] = { count: alertes ?? 0, urgent: (alertes ?? 0) > 0, label: alertes ? 'alertes' : 'tout ok' }
    }

    if (slug === 'finances') {
      // CA du mois courant (commandes encaissées)
      const monthStart = new Date()
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const monthStartISO = monthStart.toISOString()
      const [ca, releves] = await Promise.all([
        sb.from('commandes').select('montant_total_ttc').eq('statut', 'encaisse')
          .gte('created_at', monthStartISO),
        sb.from('releves_energie').select('id', { count: 'exact', head: true })
          .gte('date_releve', monthStart.toISOString().slice(0, 10)),
      ])
      const caTotal = (ca.data ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
      result['/admin/finances'] = { count: Math.round(caTotal), label: 'CA mois (€)' }
      result['/admin/energie']  = { count: releves.count ?? 0, label: 'relevés mois' }
    }

    if (slug === 'systeme') {
      const { count: profils } = await sb.from('profils').select('id', { count: 'exact', head: true })
      result['/admin/securite'] = { count: profils ?? 0, label: 'profils' }
    }
  } catch (_e) {
    // Fail-safe : pas de compteurs en cas d'erreur DB, on rend la page sans badges.
  }

  return result
}

const TONES: Record<Category['tone'], {
  gradient: string
  ring: string
  pitch: string
  /** Card boutons : fond pastel + bordure + emoji gradient */
  cardBg: string
  cardBorder: string
  cardHover: string
  cardEmojiGradient: string
  cardLabel: string
}> = {
  emerald: {
    gradient: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-500/30', pitch: 'text-emerald-700',
    cardBg: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    cardBorder: 'border-emerald-200',
    cardHover: 'hover:border-emerald-400 hover:shadow-emerald-500/20',
    cardEmojiGradient: 'from-emerald-500 to-teal-600',
    cardLabel: 'text-emerald-900',
  },
  amber: {
    gradient: 'from-amber-500 to-orange-600', ring: 'ring-amber-500/30', pitch: 'text-amber-700',
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
    cardBorder: 'border-amber-200',
    cardHover: 'hover:border-amber-400 hover:shadow-amber-500/20',
    cardEmojiGradient: 'from-amber-500 to-orange-600',
    cardLabel: 'text-amber-900',
  },
  violet: {
    gradient: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/30', pitch: 'text-violet-700',
    cardBg: 'bg-gradient-to-br from-violet-50 to-purple-50',
    cardBorder: 'border-violet-200',
    cardHover: 'hover:border-violet-400 hover:shadow-violet-500/20',
    cardEmojiGradient: 'from-violet-500 to-purple-600',
    cardLabel: 'text-violet-900',
  },
  blue: {
    gradient: 'from-blue-500 to-sky-600', ring: 'ring-blue-500/30', pitch: 'text-blue-700',
    cardBg: 'bg-gradient-to-br from-blue-50 to-sky-50',
    cardBorder: 'border-blue-200',
    cardHover: 'hover:border-blue-400 hover:shadow-blue-500/20',
    cardEmojiGradient: 'from-blue-500 to-sky-600',
    cardLabel: 'text-blue-900',
  },
  red: {
    gradient: 'from-red-500 to-rose-600', ring: 'ring-red-500/30', pitch: 'text-red-700',
    cardBg: 'bg-gradient-to-br from-red-50 to-rose-50',
    cardBorder: 'border-red-200',
    cardHover: 'hover:border-red-400 hover:shadow-red-500/20',
    cardEmojiGradient: 'from-red-500 to-rose-600',
    cardLabel: 'text-red-900',
  },
  rose: {
    gradient: 'from-rose-500 to-pink-600', ring: 'ring-rose-500/30', pitch: 'text-rose-700',
    cardBg: 'bg-gradient-to-br from-rose-50 to-pink-50',
    cardBorder: 'border-rose-200',
    cardHover: 'hover:border-rose-400 hover:shadow-rose-500/20',
    cardEmojiGradient: 'from-rose-500 to-pink-600',
    cardLabel: 'text-rose-900',
  },
  zinc: {
    gradient: 'from-zinc-700 to-zinc-900', ring: 'ring-zinc-500/30', pitch: 'text-zinc-700',
    cardBg: 'bg-gradient-to-br from-zinc-50 to-zinc-100',
    cardBorder: 'border-zinc-300',
    cardHover: 'hover:border-zinc-500 hover:shadow-zinc-500/20',
    cardEmojiGradient: 'from-zinc-700 to-zinc-900',
    cardLabel: 'text-zinc-900',
  },
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const cat = CATEGORIES.find(c => c.slug === params.slug)
  return { title: cat ? `${cat.label} — Catégorie` : 'Catégorie' }
}

export default async function CategoriePage({ params }: { params: { slug: string } }) {
  const cat = CATEGORIES.find(c => c.slug === params.slug)
  if (!cat) notFound()

  const profil = await getProfile()
  const isManager = profil?.role === 'manager'
  const peutVoir = (href: string) =>
    isManager || canAccess(profil?.poste, href, profil?.custom_permissions ?? null)

  // On filtre les sous-modules selon les permissions du profil
  const itemsVisibles = cat.items.filter(it => peutVoir(it.href))
  const tone = TONES[cat.tone]

  // Compteurs live par sous-module (selon la catégorie)
  const compteurs = await fetchCompteurs(params.slug)

  // Autres catégories pour la nav rapide en bas
  const autresCats = CATEGORIES.filter(c => c.slug !== cat.slug).slice(0, 8)

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Subtle dot pattern background (cohérent avec /admin/cat) */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
        {/* ─── HERO BANNER catégorie — full immersion photo ─────────── */}
        <header className="relative overflow-hidden rounded-3xl bg-zinc-900 shadow-2xl ring-1 ring-zinc-200 min-h-[200px] sm:min-h-[280px]">
          {/* Image fond + animation ken-burns lente */}
          {cat.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cat.imageUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover scale-105"
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${tone.gradient}`} aria-hidden />
          )}
          {/* Overlay multi-couches premium */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/30" aria-hidden />

          {/* Contenu du header — placé en bas pour effet "movie poster" */}
          <div className="relative z-10 h-full min-h-[200px] sm:min-h-[280px] flex flex-col justify-end p-5 sm:p-8 text-white">
            <div className="flex items-end gap-3 sm:gap-4">
              <span className={`inline-flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br ${tone.gradient} text-white text-3xl sm:text-5xl shadow-2xl ring-4 ring-white/30 shrink-0`}>
                {cat.emoji}
              </span>
              <div className="min-w-0 pb-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full bg-white/80" />
                  Catégorie · {itemsVisibles.length} module{itemsVisibles.length > 1 ? 's' : ''}
                </p>
                <h1 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] leading-[0.95] mt-1 drop-shadow-lg">
                  {cat.label}
                </h1>
                <p className="text-xs sm:text-sm text-white/90 mt-2 max-w-2xl leading-relaxed">{cat.pitch}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Grille de BOUTONS tuile tactiles — emoji gros + label + description */}
        {itemsVisibles.length === 0 ? (
          <section className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center">
            <p className="text-4xl mb-2">🔒</p>
            <p className="text-sm text-zinc-500 italic">
              Aucun module accessible pour ton poste dans cette catégorie.
            </p>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400">
                  Modules · {itemsVisibles.length}
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Clique sur un module pour l'ouvrir</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {itemsVisibles.map((it, idx) => {
              const compteur = compteurs[it.href]
              const hasImage = !!it.imageUrl
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  style={{ ['--stagger' as any]: `${idx * 40}ms` }}
                  className={`stagger-fadeup group relative flex flex-col overflow-hidden rounded-3xl ring-1 ring-zinc-200 hover:ring-2 hover:ring-zinc-900/20 active:scale-[0.98] transition-all duration-300 min-h-[200px] sm:min-h-[240px] ${
                    hasImage ? 'bg-zinc-900' : `${tone.cardBg}`
                  } hover:shadow-2xl`}
                >
                  {/* Image de fond (photo Unsplash) avec ken-burns lent au hover */}
                  {hasImage && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.imageUrl}
                        alt=""
                        aria-hidden
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
                      />
                      {/* Overlay multi-couche pour profondeur */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/0" aria-hidden />
                      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/30" aria-hidden />
                    </>
                  )}

                  {/* Badge compteur en haut à droite */}
                  {compteur && (
                    <span
                      className={`absolute top-3 right-3 inline-flex items-center gap-0.5 h-7 px-2.5 rounded-full text-[11px] font-black tabular-nums shadow-xl ring-1 z-10 ${
                        compteur.urgent
                          ? 'bg-red-600 text-white shadow-red-500/40 animate-pulse ring-red-400/50'
                          : 'bg-white/95 backdrop-blur text-zinc-900 ring-black/5'
                      }`}
                    >
                      {compteur.urgent && <span className="text-[9px]">🔴</span>}
                      {compteur.count.toLocaleString('fr-FR')}
                    </span>
                  )}

                  {/* Pastille emoji en haut à gauche (accent gradient) */}
                  <span className={`absolute top-3 left-3 inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br ${tone.cardEmojiGradient} text-white text-2xl shadow-2xl z-10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 ring-2 ring-white/40`}>
                    {it.emoji}
                  </span>

                  {/* Texte en bas (sur l'overlay si image, sinon centré) */}
                  {hasImage ? (
                    <div className="relative z-10 mt-auto p-3.5 sm:p-4 text-white space-y-1">
                      {compteur?.label && (
                        <p className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] ${compteur.urgent ? 'text-red-300' : 'text-white/75'}`}>
                          {compteur.label}
                        </p>
                      )}
                      <h3 className="text-base sm:text-lg font-black tracking-[-0.02em] leading-tight drop-shadow-lg">
                        {it.label}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-white/85 line-clamp-2 leading-snug pt-0.5">
                        {it.description}
                      </p>
                    </div>
                  ) : (
                    <div className="relative z-10 flex flex-col items-center text-center p-4 sm:p-5 pt-16 space-y-1">
                      <h3 className={`text-base sm:text-lg font-black tracking-[-0.02em] leading-tight ${tone.cardLabel}`}>
                        {it.label}
                      </h3>
                      {compteur?.label && (
                        <p className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] ${compteur.urgent ? 'text-red-700' : 'text-zinc-500'}`}>
                          {compteur.label}
                        </p>
                      )}
                      <p className="text-[11px] sm:text-xs text-zinc-600 line-clamp-2 leading-snug pt-0.5">
                        {it.description}
                      </p>
                    </div>
                  )}
                </Link>
              )
            })}
            </div>
          </section>
        )}

        {/* Lien rapide vers autres catégories (chips compactes) */}
        <section className="pt-4 border-t border-zinc-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Autres catégories</p>
          <div className="flex flex-wrap gap-2">
            {autresCats.map(c => {
              const t = TONES[c.tone]
              return (
                <Link
                  key={c.slug}
                  href={`/admin/cat/${c.slug}`}
                  className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border-2 border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 active:scale-95 transition`}
                >
                  <span className="text-base">{c.emoji}</span>
                  <span>{c.label}</span>
                </Link>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
