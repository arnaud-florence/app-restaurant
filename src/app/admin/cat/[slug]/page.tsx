// /admin/cat/[slug] — Page de catégorie : affiche tous les sous-modules
// d'une catégorie sous forme de cartes tactiles avec emoji + label + description.
// Niveau 2 de la navigation hiérarchique (le niveau 1 = chips catégorie dans la TopActionBar).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CATEGORIES, type Category } from '@/lib/navigation'
import { getProfile } from '@/lib/auth'
import { canAccess } from '@/lib/permissions'
import { ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

const TONES: Record<Category['tone'], { gradient: string; ring: string; chip: string; pitch: string }> = {
  emerald: { gradient: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-500/30', chip: 'bg-emerald-100 text-emerald-900', pitch: 'text-emerald-700' },
  amber:   { gradient: 'from-amber-500 to-orange-600',  ring: 'ring-amber-500/30',   chip: 'bg-amber-100 text-amber-900',    pitch: 'text-amber-700' },
  violet:  { gradient: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/30',  chip: 'bg-violet-100 text-violet-900',  pitch: 'text-violet-700' },
  blue:    { gradient: 'from-blue-500 to-sky-600',      ring: 'ring-blue-500/30',    chip: 'bg-blue-100 text-blue-900',      pitch: 'text-blue-700' },
  red:     { gradient: 'from-red-500 to-rose-600',      ring: 'ring-red-500/30',     chip: 'bg-red-100 text-red-900',        pitch: 'text-red-700' },
  rose:    { gradient: 'from-rose-500 to-pink-600',     ring: 'ring-rose-500/30',    chip: 'bg-rose-100 text-rose-900',      pitch: 'text-rose-700' },
  zinc:    { gradient: 'from-zinc-700 to-zinc-900',     ring: 'ring-zinc-500/30',    chip: 'bg-zinc-200 text-zinc-900',      pitch: 'text-zinc-700' },
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

  // Autres catégories pour la nav rapide en bas
  const autresCats = CATEGORIES.filter(c => c.slug !== cat.slug).slice(0, 8)

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4">
        {/* Header catégorie premium */}
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${tone.gradient} text-white text-3xl shadow-lg ${tone.ring} ring-4 shrink-0`}>
              {cat.emoji}
            </span>
            <div className="min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${tone.pitch}`}>Catégorie · {itemsVisibles.length} module{itemsVisibles.length > 1 ? 's' : ''}</p>
              <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">{cat.label}</h1>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1.5">{cat.pitch}</p>
            </div>
          </div>
        </header>

        {/* Grille des sous-modules — cards tactiles */}
        {itemsVisibles.length === 0 ? (
          <section className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center">
            <p className="text-4xl mb-2">🔒</p>
            <p className="text-sm text-zinc-500 italic">
              Aucun module accessible pour ton poste dans cette catégorie.
            </p>
          </section>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {itemsVisibles.map(it => (
              <Link
                key={it.href}
                href={it.href}
                className="group flex items-start gap-3 p-4 rounded-2xl border-2 border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg active:scale-[0.98] transition-all min-h-[88px]"
              >
                <span className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${tone.gradient} text-white text-2xl shadow-md shrink-0`}>
                  {it.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-zinc-900 tracking-tight leading-tight">{it.label}</h3>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{it.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition shrink-0 mt-1" />
              </Link>
            ))}
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
