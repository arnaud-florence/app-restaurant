// Module fidélité — page publique client.
// Accessible par QR code (à imprimer sur ticket / carte fidélité).
// Affiche : niveau, points, prochain palier, historique 10 derniers mouvements.
// Pas d'auth : on assume que possession de l'URL = autorisation (comme un lien magique).

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { NIVEAU_INFO, type NiveauFidelite, calculerNiveau } from '@/lib/clients'
import { TYPE_MOUVEMENT_INFO, type TypeMouvementPoints } from '@/lib/fidelite-types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star, TrendingUp, History, Award, Gift, Lock } from 'lucide-react'
import FooterLegal from '@/components/FooterLegal'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mon espace fidélité' }

export default async function ClientFidelitePage({ params }: { params: { id: string } }) {
  const sb = await createClient()
  const { data: client } = await sb.from('clients')
    .select('id, prenom, nom, points_fidelite, nb_visites, total_depense, derniere_visite, niveau_fidelite, code_parrainage')
    .eq('id', params.id).maybeSingle()
  if (!client) notFound()

  const { data: mouvements } = await sb.from('mouvements_points')
    .select('id, type, points, motif, created_at')
    .eq('client_id', params.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const niveauActuel = (client.niveau_fidelite as NiveauFidelite) ?? calculerNiveau(Number(client.nb_visites ?? 0))
  const infoActuel = NIVEAU_INFO[niveauActuel] ?? NIVEAU_INFO.standard

  // Prochain palier
  const ordre: NiveauFidelite[] = ['standard', 'bronze', 'argent', 'or', 'platine']
  const idx = ordre.indexOf(niveauActuel)
  const prochain = idx >= 0 && idx < ordre.length - 1 ? ordre[idx + 1] : null
  const infoProchain = prochain ? NIVEAU_INFO[prochain] : null
  const visitesPourProchain = infoProchain
    ? Math.max(0, infoProchain.min_visites - Number(client.nb_visites ?? 0))
    : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-emerald-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-2xl mx-auto p-4 flex items-center gap-3">
          <Star className="h-6 w-6 text-amber-500" />
          <div>
            <h1 className="text-lg font-bold">Mon espace fidélité</h1>
            <p className="text-xs text-zinc-500">{client.prenom ? client.prenom + ' ' : ''}{client.nom}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Carte niveau + points */}
        <Card className={`p-6 ${infoActuel.cls} border-2`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-70">Mon niveau</p>
              <p className="text-3xl font-bold">{infoActuel.emoji} {infoActuel.label}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider opacity-70">Mes points</p>
              <p className="text-3xl font-bold tabular-nums">{Number(client.points_fidelite ?? 0)}</p>
            </div>
          </div>
        </Card>

        {/* Progression vers prochain palier */}
        {infoProchain && (
          <Card className="p-4 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <h2 className="font-semibold">Prochain palier</h2>
            </div>
            <p className="text-sm">
              Plus que <span className="font-bold text-emerald-700">{visitesPourProchain} visite{visitesPourProchain > 1 ? 's' : ''}</span>
              {' '}pour passer <Badge variant="outline" className={infoProchain.cls}>{infoProchain.emoji} {infoProchain.label}</Badge>
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {Number(client.nb_visites ?? 0)} / {infoProchain.min_visites} visites
            </p>
          </Card>
        )}

        {!prochain && (
          <Card className="p-4 bg-violet-50 border-violet-200">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-violet-600" />
              <p className="font-semibold text-violet-900">Niveau maximum atteint — merci de votre fidélité !</p>
            </div>
          </Card>
        )}

        {/* Récompenses débloquées (niveau actuel) */}
        <Card className="p-4 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold">Mes avantages actuels</h2>
            <Badge variant="outline" className={infoActuel.cls + ' text-[10px]'}>
              Niveau {infoActuel.label}
            </Badge>
          </div>
          <ul className="space-y-1.5">
            {infoActuel.recompenses.map((r, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Récompenses à débloquer (paliers suivants) */}
        {idx < ordre.length - 1 && (
          <Card className="p-4 bg-zinc-50 border-zinc-200">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="h-4 w-4 text-zinc-500" />
              <h2 className="font-semibold text-zinc-700">À débloquer</h2>
            </div>
            <div className="space-y-3">
              {ordre.slice(idx + 1).map(palierKey => {
                const info = NIVEAU_INFO[palierKey]
                const visites_restantes = Math.max(0, info.min_visites - Number(client.nb_visites ?? 0))
                return (
                  <div key={palierKey} className="border border-zinc-200 rounded-md p-3 bg-white">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <Badge variant="outline" className={info.cls}>
                        {info.emoji} {info.label}
                      </Badge>
                      <span className="text-[11px] text-zinc-500">
                        à {visites_restantes} visite{visites_restantes > 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {info.recompenses.map((r, i) => (
                        <li key={i} className="text-xs flex items-start gap-2 text-zinc-600">
                          <span className="text-zinc-400">○</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Statistiques */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 bg-white text-center">
            <p className="text-xs text-zinc-500">Visites</p>
            <p className="text-2xl font-bold">{Number(client.nb_visites ?? 0)}</p>
          </Card>
          <Card className="p-4 bg-white text-center">
            <p className="text-xs text-zinc-500">Total dépensé</p>
            <p className="text-2xl font-bold">{Number(client.total_depense ?? 0).toFixed(0)} €</p>
          </Card>
        </div>

        {/* Historique mouvements */}
        <Card className="p-4 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-zinc-600" />
            <h2 className="font-semibold">Historique points</h2>
          </div>
          {(!mouvements || mouvements.length === 0) ? (
            <p className="text-sm text-zinc-500 italic">Aucun mouvement enregistré pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {mouvements.map(m => {
                const info = TYPE_MOUVEMENT_INFO[(m.type as TypeMouvementPoints)] ?? TYPE_MOUVEMENT_INFO.ajustement
                const pts = Number(m.points)
                const date = new Date(m.created_at as string).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                return (
                  <li key={m.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{m.motif ?? info.label}</p>
                      <p className="text-xs text-zinc-500">{date}</p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${pts > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {pts > 0 ? '+' : ''}{pts}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Code parrainage */}
        {client.code_parrainage && (
          <Card className="p-4 bg-amber-50 border-amber-200">
            <p className="text-xs uppercase tracking-wider text-amber-700">Mon code parrainage</p>
            <p className="text-2xl font-bold tabular-nums tracking-wider text-amber-900 mt-1">{client.code_parrainage}</p>
            <p className="text-xs text-amber-700 mt-1">Donnez ce code à vos proches lors de leur 1ère visite.</p>
          </Card>
        )}

      </main>

      <FooterLegal />
    </div>
  )
}
