'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { fmtPrix } from '@/lib/stock'
import {
  listeAchat, coutMarginal, portionsSemaine,
  type PlatArdoise, type Matiere,
} from '@/lib/ardoise'
import { poserArdoise, poserPlatDuJour } from './actions'
import type { PlatCandidat, MatiereVue, OccurrenceVue, Volume } from './types'

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const jourISO = (lundi: string, n: number) => {
  const d = new Date(`${lundi}T12:00:00Z`); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const joli = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

export default function ArdoiseClient({
  debut, fin, candidats, matieres, occurrences, platDuJourId, volume,
}: {
  debut: string; fin: string
  candidats: PlatCandidat[]
  matieres: MatiereVue[]
  occurrences: OccurrenceVue[]
  platDuJourId: string | null
  volume: Volume
}) {
  const router = useRouter()
  const [enCours, start] = useTransition()
  const [msg, setMsg] = useState<{ ton: 'ok' | 'ko'; texte: string } | null>(null)

  // ── ce qui est déjà posé pour la SEMAINE (pas les plats du jour) ──
  const dejaSemaine = useMemo(
    () => new Set(occurrences.filter(o => o.date_debut === debut && o.date_fin === fin).map(o => o.recette_id)),
    [occurrences, debut, fin],
  )
  const [choisis, setChoisis] = useState<Set<string>>(dejaSemaine)
  const modifie = useMemo(
    () => choisis.size !== dejaSemaine.size || [...choisis].some(id => !dejaSemaine.has(id)),
    [choisis, dejaSemaine],
  )

  const refMatieres = useMemo(() => {
    const m = new Map<string, Matiere>()
    for (const x of matieres) m.set(x.id, {
      id: x.id, nom: x.nom, unite: x.unite,
      prix_achat_ht: x.prix_achat_ht, dlc_jours: x.dlc_jours,
    })
    return m
  }, [matieres])

  const ardoise: PlatArdoise[] = useMemo(
    () => candidats.filter(c => choisis.has(c.id))
      .map(c => ({ id: c.id, nom: c.nom, carte: c.carte, composition: c.composition })),
    [candidats, choisis],
  )
  const lignes = useMemo(() => listeAchat(ardoise, volume, refMatieres), [ardoise, volume, refMatieres])
  const portions = useMemo(() => portionsSemaine(volume), [volume])

  // ⚠️ UN TOTAL DIT CE QU'IL IGNORE : 56 prix sur 62 sont des estimations, et
  // certaines matières n'ont aucun prix. Un total présenté comme ferme alors
  // qu'il saute des lignes devient une contestation de facture (0160).
  const bilan = useMemo(() => {
    const sansPrix = lignes.filter(l => l.coutHT == null).length
    const estimees = lignes.filter(l => matieres.find(m => m.id === l.ingredient_id)?.prix_estime).length
    return {
      refs: lignes.length,
      achat: lignes.reduce((s, l) => s + (l.coutHT ?? 0), 0),
      casse: lignes.reduce((s, l) => s + (l.perteHT ?? 0), 0),
      // ⚠️ Ce qu'on JETTE vraiment : le reliquat des matières dont on SAIT
      // qu'elles ne passent pas la semaine. Les `null` n'y entrent pas —
      // additionner une DLC inconnue dans « ce qu'on jette » serait inventer.
      perissable: lignes.filter(l => l.perissable === true)
        .reduce((s, l) => s + (l.perteHT ?? 0), 0),
      dlcInconnue: lignes.filter(l => l.perissable === null && (l.perteHT ?? 0) > 0).length,
      sansPrix, estimees,
    }
  }, [lignes, matieres])

  const parCarte = (c: 'PIZZA' | 'CUISINE') => candidats.filter(x => x.carte === c)
  const nbChoisis = (c: 'PIZZA' | 'CUISINE') => parCarte(c).filter(x => choisis.has(x.id)).length

  function basculer(id: string) {
    setChoisis(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toutCocher(c: 'PIZZA' | 'CUISINE', on: boolean) {
    setChoisis(s => {
      const n = new Set(s)
      for (const x of parCarte(c)) on ? n.add(x.id) : n.delete(x.id)
      return n
    })
  }
  function enregistrer() {
    start(async () => {
      const r = await poserArdoise({ debut, fin, recetteIds: [...choisis] })
      setMsg(r.ok
        ? { ton: 'ok', texte: `Ardoise posée — ${r.poses} ajouté(s), ${r.retires} retiré(s).` }
        : { ton: 'ko', texte: r.erreur })
      if (r.ok) router.refresh()
    })
  }

  const semainePrec = jourISO(debut, -7), semaineSuiv = jourISO(debut, 7)

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-3">
      <AdminPageHeader
        emoji="🗓️"
        title="Ardoise de la semaine"
        subtitle={`Du ${joli(debut)} au ${joli(fin)} — c’est elle qui décide ce qu’on achète.`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => router.push(`/admin/ardoise?semaine=${semainePrec}`)}>←</Button>
            <Button variant="outline" size="sm" onClick={() => router.push(`/admin/ardoise?semaine=${semaineSuiv}`)}>→</Button>
            <Button size="sm" onClick={enregistrer} disabled={!modifie || enCours}>
              {enCours ? 'Enregistrement…' : modifie ? 'Enregistrer l’ardoise' : 'À jour'}
            </Button>
          </>
        }
      />

      {msg && (
        <div className={cn('rounded-md border px-4 py-2.5 text-sm',
          msg.ton === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                           : 'border-red-300 bg-red-50 text-red-900')}>
          {msg.texte}
        </div>
      )}

      {/* ── LE BILAN, EN DIRECT ─────────────────────────────────────
          Il se recalcule à chaque case cochée : c'est tout l'intérêt de
          l'écran. Composer une ardoise sans voir ce qu'elle coûte, c'est
          le découvrir à la poubelle du dimanche. */}
      <section className="rounded-xl border bg-background overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0">
          <Chiffre libelle="Portions / semaine" valeur={String(portions.CUISINE + portions.PIZZA)}
                   note={`${portions.CUISINE} brasserie · ${portions.PIZZA} pizzeria`} />
          <Chiffre libelle="Références à acheter" valeur={String(bilan.refs)}
                   note={bilan.sansPrix > 0 ? `dont ${bilan.sansPrix} sans prix connu` : undefined} />
          <Chiffre libelle="Commande / semaine" valeur={fmtPrix(bilan.achat)}
                   note={bilan.estimees > 0 ? `dont ${bilan.estimees} réf. à prix estimé` : undefined} />
          {/* ⚠️⚠️ « CASSE » ÉTAIT FAUX, et le mot comptait. Ce chiffre est le
              RELIQUAT de fin de semaine : sur l'ardoise du 12 octobre, les
              épices à tajine (16,56 €), la crème de balsamique (11,06 €) et
              le pesto (11,52 €) s'y trouvaient — et se gardent des mois.
              C'est du stock pour la semaine suivante, pas une perte.
              ⚠️ Seul le reliquat d'un PÉRISSABLE se jette, et on ne sait pas
              lesquels le sont : `dlc_moyenne_jours` est renseignée sur 4
              ingrédients sur 117. On affiche donc ce qu'on sait, et on dit
              ce qu'on ignore. */}
          <Chiffre libelle="Reliquat de fin de semaine" valeur={fmtPrix(bilan.casse)}
                   ton={bilan.achat > 0 && bilan.perissable / bilan.achat > 0.08 ? 'alerte' : 'normal'}
                   note={bilan.dlcInconnue > 0
                     ? `dont ${fmtPrix(bilan.perissable)} périssable · ${bilan.dlcInconnue} réf. sans DLC connue`
                     : `dont ${fmtPrix(bilan.perissable)} périssable`} />
        </div>
        {/* ⚠️ La casse est le SEUL chiffre que l'ardoise fait vraiment bouger.
            La commande, elle, ne bouge presque pas : 230 couverts mangent 230
            plats quelle que soit la longueur de la carte. Le dire ici évite
            de chercher une économie là où il n'y en a pas. */}
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground bg-muted/30">
          La commande ne baisse pas en raccourcissant l’ardoise — {portions.CUISINE + portions.PIZZA} couverts
          mangent {portions.CUISINE + portions.PIZZA} plats dans tous les cas. Ce qui baisse, c’est la <b>casse</b> :
          moins de références ouvertes en même temps, donc plus de rotation sur chacune.
        </p>
      </section>

      {choisis.size === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Aucune ardoise posée pour cette semaine.</b> Tant qu’elle est vide, le réassort
          commande pour la carte <b>entière</b> — le scénario le plus coûteux en casse.
        </div>
      )}

      <Carte titre="Pizzas" sousTitre="elles restent à la carte en permanence"
             candidats={parCarte('PIZZA')} choisis={choisis} ardoise={ardoise}
             volume={volume} matieres={refMatieres} onBasculer={basculer}
             n={nbChoisis('PIZZA')} onTout={on => toutCocher('PIZZA', on)} />

      <Carte titre="Brasserie" sousTitre="l’optimum mesuré est de 4 à 6 plats qui partagent leurs ingrédients"
             candidats={parCarte('CUISINE')} choisis={choisis} ardoise={ardoise}
             volume={volume} matieres={refMatieres} onBasculer={basculer}
             n={nbChoisis('CUISINE')} onTout={on => toutCocher('CUISINE', on)} />

      <PlatsDuJour debut={debut} occurrences={occurrences} matieres={matieres}
                   platDuJourId={platDuJourId} onFait={() => router.refresh()} />
    </div>
  )
}

function Chiffre({ libelle, valeur, note, ton = 'normal' }: {
  libelle: string; valeur: string; note?: string; ton?: 'normal' | 'alerte'
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{libelle}</p>
      <p className={cn('text-2xl font-black tabular-nums mt-0.5', ton === 'alerte' && 'text-amber-700')}>{valeur}</p>
      {note && <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>}
    </div>
  )
}

function Carte({
  titre, sousTitre, candidats, choisis, ardoise, volume, matieres, onBasculer, n, onTout,
}: {
  titre: string; sousTitre: string
  candidats: PlatCandidat[]; choisis: Set<string>
  ardoise: PlatArdoise[]; volume: Volume; matieres: Map<string, Matiere>
  onBasculer: (id: string) => void
  n: number; onTout: (on: boolean) => void
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5">
          <div>
            <h2 className="font-bold text-sm">{titre} <span className="tabular-nums text-muted-foreground">· {n}/{candidats.length}</span></h2>
            <p className="text-[11px] text-muted-foreground">{sousTitre}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={() => onTout(true)}>Tout</Button>
            <Button variant="ghost" size="sm" onClick={() => onTout(false)}>Aucun</Button>
          </div>
        </div>
        <ul className="divide-y">
          {candidats.map(c => {
            const actif = choisis.has(c.id)
            // ⚠️ LE COÛT MARGINAL se calcule sur l'ardoise SANS ce plat, pour
            // qu'il réponde toujours à la même question — « qu'est-ce que ça
            // coûte de l'ajouter ? » — qu'il soit coché ou non. Calculé sur
            // l'ardoise courante, un plat déjà coché afficherait zéro.
            const base = ardoise.filter(x => x.id !== c.id)
            const cm = coutMarginal(base, { id: c.id, nom: c.nom, carte: c.carte, composition: c.composition }, volume, matieres)
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onBasculer(c.id)}
                        className={cn('w-full min-h-[48px] flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/40 transition-colors',
                          actif && 'bg-emerald-50/60')}>
                  <span className={cn('size-5 shrink-0 rounded border-2 grid place-items-center text-[11px] font-black',
                    actif ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300')}>
                    {actif && '✓'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{c.nom}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {c.categorie}{c.prixTTC != null && ` · ${fmtPrix(c.prixTTC)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] tabular-nums">
                    <span className={cn('block font-semibold', cm.referencesNouvelles > 2 ? 'text-amber-700' : 'text-muted-foreground')}>
                      {cm.referencesNouvelles === 0 ? 'aucune réf. en plus' : `+${cm.referencesNouvelles} réf.`}
                    </span>
                    {/* ⚠️ `null` quand une matière du groupe n'a pas de prix :
                        annoncer un delta qui saute des lignes serait faux. */}
                    <span className="block text-muted-foreground">
                      {cm.deltaPerteHT == null ? 'casse non chiffrable'
                        : cm.deltaPerteHT > 0 ? `+${fmtPrix(cm.deltaPerteHT)} de casse`
                        : `${fmtPrix(cm.deltaPerteHT)} de casse`}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function PlatsDuJour({ debut, occurrences, matieres, platDuJourId, onFait }: {
  debut: string
  occurrences: OccurrenceVue[]
  matieres: MatiereVue[]
  platDuJourId: string | null
  onFait: () => void
}) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  if (!platDuJourId) {
    return (
      <Card><CardContent className="p-4 text-sm text-muted-foreground">
        Le produit <b>« Plat du jour »</b> n’existe pas encore — sans lui, la caisse
        ne pourrait pas l’encaisser. <code>node scripts/produit-plat-du-jour.mjs --ecrire</code>
      </CardContent></Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b px-4 py-2.5">
          <h2 className="font-bold text-sm">Plat du jour</h2>
          {/* ⚠️ Il n'est PAS de la carte : il n'a donc aucune fiche, et sa
              composition s'attache au JOUR. Sans elle, les 140 couverts du
              midi se commandent à l'aveugle. */}
          <p className="text-[11px] text-muted-foreground">
            Hors carte — sa composition se saisit jour par jour, sinon le midi se commande à l’aveugle.
          </p>
        </div>
        <ul className="divide-y">
          {JOURS.map((j, n) => {
            const date = jourISO(debut, n)
            const occ = occurrences.find(o => o.date_debut === date && o.date_fin === date)
            return (
              <li key={date} className="px-4 py-2">
                <div className="flex items-center gap-3 min-h-[48px]">
                  <span className="w-24 shrink-0 text-xs font-semibold capitalize">{j}</span>
                  <span className="min-w-0 flex-1 text-sm truncate">
                    {occ?.titre ?? <span className="text-muted-foreground">— non décidé</span>}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {occ ? `${occ.composition.length} ingrédient${occ.composition.length > 1 ? 's' : ''}` : ''}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setOuvert(ouvert === date ? null : date)}>
                    {ouvert === date ? 'Fermer' : occ ? 'Modifier' : 'Définir'}
                  </Button>
                </div>
                {ouvert === date && (
                  <EditeurJour date={date} occ={occ} matieres={matieres} platDuJourId={platDuJourId}
                               onFini={() => { setOuvert(null); onFait() }} />
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function EditeurJour({ date, occ, matieres, platDuJourId, onFini }: {
  date: string
  occ?: OccurrenceVue
  matieres: MatiereVue[]
  platDuJourId: string
  onFini: () => void
}) {
  const [titre, setTitre] = useState(occ?.titre ?? '')
  const [lignes, setLignes] = useState(occ?.composition ?? [])
  const [q, setQ] = useState('')
  const [enCours, start] = useTransition()
  const [err, setErr] = useState('')

  const trouves = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    return matieres.filter(m => m.nom.toLowerCase().includes(s))
      .filter(m => !lignes.some(l => l.ingredient_id === m.id)).slice(0, 8)
  }, [q, matieres, lignes])

  function enregistrer() {
    setErr('')
    start(async () => {
      const r = await poserPlatDuJour({ date, platDuJourId, titre: titre.trim(), composition: lignes })
      if (r.ok) onFini(); else setErr(r.erreur)
    })
  }

  return (
    <div className="mt-2 rounded-lg border bg-muted/20 p-3 space-y-3">
      <Input value={titre} onChange={e => setTitre(e.target.value)}
             placeholder="Nom du plat — « Blanquette de veau »" className="h-11" />
      {/* ⚠️ Un titre vide EFFACE le plat du jour de cette date : c'est le
          geste naturel pour « finalement, rien lundi », et sans lui on
          commanderait pour un plat qu'on ne sert pas. */}
      <p className="text-[11px] text-muted-foreground">
        Laisser le nom vide retire le plat du jour de cette date.
      </p>

      <ul className="space-y-1.5">
        {lignes.map((l, i) => {
          const m = matieres.find(x => x.id === l.ingredient_id)
          return (
            <li key={l.ingredient_id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm truncate">{m?.nom ?? '—'}</span>
              <Input type="number" step="0.001" min="0" value={l.quantite}
                     onChange={e => setLignes(ls => ls.map((x, n) => n === i
                       ? { ...x, quantite: Number(e.target.value) } : x))}
                     className="h-10 w-24 text-right tabular-nums" />
              <span className="w-20 text-xs text-muted-foreground">{l.unite}</span>
              <Button variant="ghost" size="sm" className="text-destructive"
                      onClick={() => setLignes(ls => ls.filter((_, n) => n !== i))}>✕</Button>
            </li>
          )
        })}
        {lignes.length === 0 && (
          <li className="text-[11px] text-muted-foreground">
            Aucun ingrédient — ce plat ne déclenchera aucune commande.
          </li>
        )}
      </ul>

      <div className="relative">
        <Input value={q} onChange={e => setQ(e.target.value)}
               placeholder="Ajouter un ingrédient…" className="h-10" />
        {trouves.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg">
            {trouves.map(m => (
              <li key={m.id}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => { setLignes(ls => [...ls, { ingredient_id: m.id, quantite: 0.1, unite: m.unite }]); setQ('') }}>
                  {m.nom} <span className="text-muted-foreground">· {m.unite}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={enregistrer} disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}
