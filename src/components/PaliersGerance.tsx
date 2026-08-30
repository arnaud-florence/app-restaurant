// La route vers la gérance, affichée sur /mon-espace.
//
// Sans cet encart, la progression n'existe nulle part : la personne formée ne
// sait pas ce qu'il lui reste, et le gérant n'a aucun critère pour décider
// qu'elle est prête. Chacun le sait « à peu près », c'est-à-dire pas du tout.
//
// Composant serveur : il lit les progressions et n'a besoin d'aucun état.

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { etatPaliers, palierCourant } from '@/lib/paliers-gerance'

export default function PaliersGerance({
  guidesReussis, certifications,
}: {
  guidesReussis: string[]
  certifications: Array<{ poste: string; obtenue_le: string }>
}) {
  const etats = etatPaliers(guidesReussis, certifications)
  const courant = palierCourant(etats)

  return (
    <section className="px-4 sm:px-6">
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-baseline gap-2 flex-wrap">
          <h2 className="font-bold text-sm">🧭 Ta route vers la gérance</h2>
          <span className="text-xs text-zinc-500">
            {courant === 0 ? 'palier 1 en cours' : `palier ${courant} atteint`}
          </span>
        </div>

        <ol className="divide-y divide-zinc-100">
          {etats.map(({ palier, acquis, total, atteint, certifieLe }) => {
            // Le palier « en cours » est le premier non atteint : c'est le
            // seul sur lequel il y a quelque chose à faire aujourd'hui.
            const enCours = !atteint && palier.rang === courant + 1
            return (
              <li key={palier.cle} className={cn('px-4 py-3', enCours && 'bg-emerald-50/60')}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={cn('h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0',
                    atteint ? 'bg-emerald-600 text-white'
                      : enCours ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-500')}>
                    {atteint ? '✓' : palier.rang}
                  </span>
                  <h3 className="font-bold text-sm">{palier.titre}</h3>
                  <span className="text-[11px] text-zinc-500">{palier.duree}</span>
                  {total > 0 && (
                    <span className="ml-auto text-[11px] tabular-nums text-zinc-500">
                      {acquis}/{total} guide{total > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <p className="text-sm text-zinc-700 mt-1">{palier.sait}</p>

                <p className="text-[11px] text-zinc-500 mt-1.5">
                  <strong>Ouvre en écriture :</strong> {palier.ouvre.join(' · ')}
                </p>

                {/* Le « pourquoi » n'est montré que là où on est : ailleurs il
                    encombre, ici il répond à la question qu'on se pose. */}
                {enCours && (
                  <p className="text-[11px] text-zinc-600 mt-1.5 leading-relaxed">
                    {palier.pourquoi}
                  </p>
                )}

                {certifieLe && (
                  <p className="text-[11px] text-emerald-800 mt-1.5">
                    Certifié le {new Date(certifieLe).toLocaleDateString('fr-FR')}
                  </p>
                )}

                {enCours && total === 0 && (
                  <p className="text-[11px] text-amber-800 mt-1.5">
                    Ce palier ne se valide pas par un quiz : il se constate, et s&apos;accorde.
                  </p>
                )}
              </li>
            )
          })}
        </ol>

        <div className="px-4 py-2.5 border-t border-zinc-100 bg-zinc-50">
          <Link href="/formation" className="text-xs font-bold text-zinc-700 hover:text-zinc-900">
            Ouvrir mes guides →
          </Link>
        </div>
      </div>
    </section>
  )
}
