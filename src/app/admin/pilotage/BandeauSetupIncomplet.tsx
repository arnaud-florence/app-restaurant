// Bandeau qui s'affiche en haut de /admin/pilotage si le setup économique
// est incomplet : pas de point mort ce mois + pas de challenges actifs +
// pas de charges fixes saisies. Manager-only.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react'

export default async function BandeauSetupIncomplet() {
  const sb = await createClient()
  const moisCourant = new Date().toISOString().slice(0, 7) + '-01'

  const [pmRes, challengeRes, chargesRes, employesRes, recettesRes] = await Promise.all([
    sb.from('point_mort_mensuel').select('id').eq('mois', moisCourant).maybeSingle(),
    sb.from('challenges').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('charges_fixes_recurrentes').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('recettes').select('id', { count: 'exact', head: true }).eq('actif', true),
  ])

  const aPointMort   = !!pmRes.data
  const aChallenges  = (challengeRes.count ?? 0) > 0
  const aCharges     = (chargesRes.count ?? 0) > 0
  const nbEmployes   = employesRes.count ?? 0
  const nbRecettes   = recettesRes.count ?? 0

  const total = 5
  const fait  = [aCharges, aPointMort, aChallenges, nbEmployes >= 1, nbRecettes >= 1].filter(Boolean).length

  // Tout est OK → pas de bandeau
  if (fait === total) return null

  const etapes: Array<{ ok: boolean; label: string; href: string; cta: string }> = [
    { ok: aCharges,        label: 'Charges fixes mensuelles',    href: '/admin/economie',    cta: 'Saisir les charges' },
    { ok: aPointMort,      label: 'Point mort du mois',           href: '/admin/economie',    cta: 'Configurer le point mort' },
    { ok: nbRecettes >= 1, label: 'Catalogue de recettes',        href: '/admin/recettes',    cta: 'Ajouter ma 1ʳᵉ recette' },
    { ok: nbEmployes >= 1, label: 'Équipe',                       href: '/admin/rh',          cta: 'Ajouter mon 1ᵉʳ employé' },
    { ok: aChallenges,     label: 'Challenges activés',           href: '/admin/challenges',  cta: 'Créer le pack démarrage' },
  ]

  return (
    <Card className="p-5 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 border-amber-300">
      <div className="flex items-start gap-3 mb-4">
        <Sparkles className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            👋 Configuration en cours — {fait} / {total} étape{fait > 1 ? 's' : ''} validée{fait > 1 ? 's' : ''}
          </h2>
          <p className="text-sm text-amber-900/80 mt-0.5">
            Quelques étapes restent pour activer pleinement le pilotage et les challenges.
          </p>
          <div className="mt-2 h-2 bg-white/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${(fait / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <ul className="grid gap-2 md:grid-cols-2">
        {etapes.map(e => (
          <li key={e.label}>
            {e.ok ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-100/60 border border-emerald-300 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium text-emerald-900">{e.label}</span>
              </div>
            ) : (
              <Link
                href={e.href}
                className="flex items-center justify-between gap-2 rounded-md bg-white border border-amber-300 hover:bg-amber-100/40 px-3 py-2 transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-amber-400 shrink-0" />
                  <span className="text-sm font-medium text-zinc-800">{e.label}</span>
                </span>
                <span className="flex items-center gap-1 text-xs text-amber-700 font-bold group-hover:text-amber-900">
                  {e.cta}
                  <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-zinc-600 italic">
        💡 L&apos;app fonctionne déjà sans ces étapes, mais elles débloquent l&apos;auto-suggestion des cibles, le calcul du point mort et le système de primes équipe.
      </p>
    </Card>
  )
}
