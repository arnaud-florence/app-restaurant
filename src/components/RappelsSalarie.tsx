// « Arnaud t'aide aujourd'hui » — carte de rappels perso du salarié.
// Server component, affichage seul. Voix d'Arnaud : collègue qui aide, pas chef.

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { type RappelsSalarie } from '@/lib/co-gerant/types'

export default function RappelsSalarieCard({ data, prenom }: { data: RappelsSalarie; prenom: string | null }) {
  const r = data.rappels
  return (
    <section className="rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white p-4 sm:p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="inline-flex items-center justify-center h-10 w-10 rounded-2xl bg-white/10 text-xl shrink-0">🧑‍💼</span>
        <div className="min-w-0">
          <h2 className="font-black leading-tight">Arnaud t'aide aujourd'hui</h2>
          <p className="text-xs text-white/60">
            {prenom ? `Salut ${prenom} — ` : ''}
            {r.length ? `${r.length} chose${r.length > 1 ? 's' : ''} à ne pas oublier` : 'tout est carré'}
          </p>
        </div>
      </div>

      {r.length === 0 ? (
        <p className="text-sm text-white/80">✅ Rien en attente de ton côté. Bon service 👊</p>
      ) : (
        <div className="space-y-2">
          {r.map(x => {
            const dot = x.urgence === 'rouge' ? 'bg-red-400' : x.urgence === 'orange' ? 'bg-amber-400' : 'bg-sky-400'
            return (
              <div key={x.id} className="flex items-start gap-2.5 rounded-2xl bg-white/5 p-3">
                <span className="text-lg leading-none shrink-0">{x.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug flex items-center gap-1.5">
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} aria-hidden />
                    {x.titre}
                  </p>
                  {x.detail && <p className="text-xs text-white/60 leading-snug mt-0.5">{x.detail}</p>}
                </div>
                {x.cta_url && (
                  <Link href={x.cta_url} className="shrink-0 h-8 px-3 inline-flex items-center rounded-full bg-white text-zinc-900 text-xs font-bold active:scale-95 transition">
                    {x.cta_label || 'Voir'}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
