'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { JOURS, ROLE_LABELS, type SetupData } from '../types'

const JOUR_LABELS: Record<typeof JOURS[number], string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

export default function Step7Recap({
  data, onGoto,
}: {
  data: SetupData
  onGoto: (i: number) => void
}) {
  const e = data.etablissement
  return (
    <div className="space-y-4">
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader>
          <CardTitle>✅ Récapitulatif</CardTitle>
          <CardDescription>
            Vérifie chaque section avant de tout valider. Tu peux modifier en cliquant sur &laquo;&nbsp;Modifier&nbsp;&raquo;.
          </CardDescription>
        </CardHeader>
      </Card>

      <Section title="🏛️ Établissement" onEdit={() => onGoto(0)}>
        {e.nom ? (
          <div className="space-y-1 text-sm">
            <p className="font-bold text-base">{e.nom}</p>
            {e.adresse && <p className="text-muted-foreground">{e.adresse}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {e.telephone && <span>📞 {e.telephone}</span>}
              {e.email && <span>✉️ {e.email}</span>}
              {e.site_web && <span>🔗 {e.site_web}</span>}
            </div>
            {(e.siret || e.tva_intra) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                {e.siret && <span>SIRET : {e.siret}</span>}
                {e.tva_intra && <span>TVA : {e.tva_intra}</span>}
              </div>
            )}
            {e.logo_url && (
              <p className="text-xs text-muted-foreground pt-1 truncate">🖼 {e.logo_url}</p>
            )}
          </div>
        ) : (
          <Empty msg="Nom de l'établissement manquant." />
        )}
      </Section>

      <Section title="🕒 Horaires" onEdit={() => onGoto(1)}>
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
          {JOURS.map(j => {
            const h = data.horaires[j]
            return (
              <div key={j} className={`text-xs rounded-md border p-2 text-center ${h.ouvert ? 'bg-background' : 'bg-muted text-muted-foreground'}`}>
                <p className="font-bold">{JOUR_LABELS[j]}</p>
                <p>{h.ouvert ? `${h.ouverture}–${h.fermeture}` : 'Fermé'}</p>
              </div>
            )
          })}
        </div>
        {data.exceptions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Exceptions ({data.exceptions.length})
            </p>
            <ul className="space-y-1 text-xs">
              {data.exceptions.map(x => (
                <li key={x.id} className="bg-muted/50 rounded px-2 py-1">
                  {x.date_debut === x.date_fin ? x.date_debut : `${x.date_debut} → ${x.date_fin}`}
                  {x.motif && <span className="text-muted-foreground"> · {x.motif}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="🪑 Zones & tables" onEdit={() => onGoto(2)}>
        {data.tables.length === 0 ? (
          <Empty msg="Aucune table — ton plan de salle est vide." />
        ) : (
          <div className="space-y-3">
            {data.zones.map(z => {
              const tbl = data.tables.filter(t => t.zone === z)
              if (tbl.length === 0) return null
              return (
                <div key={z}>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {z} <span className="font-normal">({tbl.length})</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tbl.map(t => (
                      <Badge key={t.id} variant="outline" className="text-xs">
                        {t.numero} · {t.capacite}p
                      </Badge>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="🧾 TVA" onEdit={() => onGoto(3)}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <KPI label="Sur place" value={`${data.tva.sur_place}%`} />
          <KPI label="Emporter"  value={`${data.tva.emporter}%`} />
          <KPI label="Alcool"    value={`${data.tva.alcool}%`} />
        </div>
      </Section>

      <Section title="🛵 Livraison" onEdit={() => onGoto(4)}>
        {!data.livraison.active ? (
          <Empty msg="Livraison désactivée." />
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span><b>Rayon :</b> {data.livraison.rayon_km} km</span>
              <span><b>Min. commande :</b> {data.livraison.minimum} €</span>
              <span><b>Délai :</b> {data.livraison.delai_min} min</span>
            </div>
            {data.livraison.zones.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Zones tarifaires
                </p>
                <ul className="text-xs space-y-0.5">
                  {data.livraison.zones.map(z => (
                    <li key={z.id} className="flex justify-between bg-muted/50 rounded px-2 py-1">
                      <span>≤ {z.rayon_max_km} km</span>
                      <span className="font-bold">{z.frais} €</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="👥 Employés" onEdit={() => onGoto(5)}>
        {data.employes.length === 0 ? (
          <Empty msg="Aucun employé." />
        ) : (
          <ul className="space-y-1.5">
            {data.employes.map(e => (
              <li key={e.id} className="flex items-center justify-between gap-2 bg-muted/40 rounded px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">
                  {ROLE_LABELS[e.poste].icon} <b>{e.prenom} {e.nom}</b>
                  {e.email && <span className="text-muted-foreground text-xs ml-2">{e.email}</span>}
                </span>
                <Badge variant="secondary" className="text-xs whitespace-nowrap">{ROLE_LABELS[e.poste].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Card className="border-emerald-300 bg-emerald-50">
        <CardContent className="p-4 text-sm space-y-1">
          <p className="font-bold text-emerald-900">Quand tu cliques sur &laquo;&nbsp;Tout valider&nbsp;&raquo; :</p>
          <ul className="text-emerald-800 list-disc ml-5 space-y-0.5 text-xs">
            <li>Toutes les sections sont (re-)sauvegardées dans Supabase</li>
            <li>Le drapeau <code className="bg-emerald-100 px-1 rounded">setup_completed</code> passe à <code className="bg-emerald-100 px-1 rounded">true</code></li>
            <li>L&apos;application sait que la configuration initiale est faite</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={onEdit}>Modifier</Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-muted-foreground italic">{msg}</p>
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold text-xl">{value}</p>
    </div>
  )
}
