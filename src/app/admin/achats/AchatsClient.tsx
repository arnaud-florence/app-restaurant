'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  filtrer, etatRemise, LIBELLE_REMISE, FILTRES_VIDES, promotions, familles,
  offresTriees,
  filtrerAchetes, bilanAchats, achetesParFournisseur, acheteIncomplet,
  prixReprenable, parRayon, rayonDe, RAYONS, RAYON_AUTRES, FILTRES_ACHETE_VIDES,
  type ArticleAchat, type Filtres, type EtatRemise, type Fraicheur,
  type OffreFournisseur, type EtatPlateforme, type Manque,
  type ArticleAchete, type FiltresAchete, type OffreConcurrente,
} from '@/lib/catalogue-achats'
import { fmtPrix } from '@/lib/foodCost'
import { demanderRemises, type ResultatDemande } from './actions'
import { modifierArticleAchat } from './modifier-actions'

type Fournisseur = { id: string; nom: string; email: string | null; actif: boolean }
type Onglet = 'promos' | 'achetes' | 'catalogue' | 'etat'

/** ⚠️ 3 300 lignes ne se rendent pas d'un bloc : sur la tablette du comptoir,
 *  chaque frappe coûterait plusieurs secondes. Une page à la fois, et le
 *  compteur dit toujours combien il y en a en tout. */
const PAR_PAGE = 60

export default function AchatsClient({
  articles, offres, fournisseurs, etat, manques, matieresSuivies, matieresCouvertes, achetes,
}: {
  articles: ArticleAchat[]; offres: OffreFournisseur[]; fournisseurs: Fournisseur[]
  etat: EtatPlateforme; manques: Manque[]
  matieresSuivies: number; matieresCouvertes: number
  achetes: ArticleAchete[]
}) {
  const promos = useMemo(() => promotions(articles), [articles])
  const [onglet, setOnglet] = useState<Onglet>(promos.length ? 'promos' : 'catalogue')
  const [f, setF] = useState<Filtres>(FILTRES_VIDES)
  const [limite, setLimite] = useState(PAR_PAGE)
  const [choisis, setChoisis] = useState<Set<string>>(new Set())
  const [ouvert, setOuvert] = useState<string | null>(null)   // clé de comparaison dépliée
  const [res, setRes] = useState<ResultatDemande | null>(null)
  const [envoiEnCours, demarrer] = useTransition()

  const maj = (p: Partial<Filtres>) => { setF(x => ({ ...x, ...p })); setLimite(PAR_PAGE) }

  const trouves = useMemo(() => filtrer(articles, f), [articles, f])
  const visibles = trouves.slice(0, limite)
  const lesFamilles = useMemo(() => familles(articles), [articles])

  // Toutes les lignes d'une clé, pour la comparaison dépliée.
  const parCle = useMemo(() => {
    const m = new Map<string, ArticleAchat[]>()
    for (const a of articles) {
      if (!a.cle) continue
      if (!m.has(a.cle)) m.set(a.cle, [])
      m.get(a.cle)!.push(a)
    }
    for (const [, v] of m) v.sort((x, y) => (x.ref?.prix ?? Infinity) - (y.ref?.prix ?? Infinity))
    return m
  }, [articles])

  const parFournisseur = useMemo(() => new Map(fournisseurs.map(x => [x.id, x])), [fournisseurs])
  const selection = useMemo(() => articles.filter(a => choisis.has(a.id)), [articles, choisis])
  const fourSelection = useMemo(() => {
    const s = new Set(selection.map(a => a.fournisseur_id))
    return s.size === 1 ? parFournisseur.get([...s][0]) ?? null : null
  }, [selection, parFournisseur])

  const basculer = (id: string) => setChoisis(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const envoyer = () => {
    if (!fourSelection) return
    demarrer(async () => {
      setRes(await demanderRemises({ fournisseur_id: fourSelection.id, ids: selection.map(a => a.id) }))
    })
  }

  const compteurs = useMemo(() => ({
    total: articles.length,
    negocie: articles.filter(a => etatRemise(a) === 'negocie').length,
    inconnu: articles.filter(a => etatRemise(a) === 'inconnu').length,
    sansPrix: articles.filter(a => a.prix_ht === null).length,
    classes: articles.filter(a => a.famille).length,
  }), [articles])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Plateforme d&apos;achat</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {compteurs.total.toLocaleString('fr-FR')} références, tous fournisseurs ·{' '}
          <strong>{compteurs.negocie}</strong> à tarif négocié ·{' '}
          <strong>{promos.length}</strong> en promotion
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        <Onglets actif={onglet === 'promos'} onClick={() => setOnglet('promos')}>
          🔥 Promos du moment <Compteur n={promos.length} />
        </Onglets>
        <Onglets actif={onglet === 'achetes'} onClick={() => setOnglet('achetes')}>
          🧺 Ce que nous achetons <Compteur n={achetes.length} />
        </Onglets>
        <Onglets actif={onglet === 'catalogue'} onClick={() => setOnglet('catalogue')}>
          📚 Catalogue <Compteur n={articles.length} />
        </Onglets>
        <Onglets actif={onglet === 'etat'} onClick={() => setOnglet('etat')}>
          🧭 Ce qui est en place
        </Onglets>
      </div>

      {onglet === 'achetes'
        ? <Achetes articles={achetes} fournisseurs={fournisseurs} />
        : onglet === 'etat'
        ? <Etat etat={etat} manques={manques} suivies={matieresSuivies} couvertes={matieresCouvertes} />
        : onglet === 'promos'
        ? <Promos promos={promos} offres={offres} parCle={parCle} ouvert={ouvert} setOuvert={setOuvert} />
        : (
          <>
            {/* ─── Recherche et filtres ───────────────────────── */}
            <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
              <input
                type="search" value={f.requete}
                onChange={e => maj({ requete: e.target.value })}
                placeholder="Rechercher un produit, une référence…"
                className="h-12 w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-900"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <select value={f.famille === undefined ? '' : f.famille === null ? '·' : f.famille}
                  onChange={e => maj({ famille: e.target.value === '' ? undefined : e.target.value === '·' ? null : e.target.value })}
                  className="h-9 rounded-lg border border-zinc-300 px-2">
                  <option value="">Toutes les catégories</option>
                  {lesFamilles.filter(x => x.nom).map(x =>
                    <option key={x.nom} value={x.nom!}>{x.nom} ({x.n})</option>)}
                  {lesFamilles.some(x => x.nom === null) &&
                    <option value="·">Non classés ({lesFamilles.find(x => x.nom === null)!.n})</option>}
                </select>

                <select value={f.fournisseur_id ?? ''}
                  onChange={e => maj({ fournisseur_id: e.target.value || null })}
                  className="h-9 rounded-lg border border-zinc-300 px-2">
                  <option value="">Tous les fournisseurs</option>
                  {fournisseurs.filter(x => x.actif).map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select>

                <select value={f.remise ?? ''}
                  onChange={e => maj({ remise: (e.target.value || null) as EtatRemise | null })}
                  className="h-9 rounded-lg border border-zinc-300 px-2">
                  <option value="">Remise : tout</option>
                  <option value="negocie">Remisé (confirmé)</option>
                  <option value="inconnu">Remise inconnue</option>
                </select>

                <Bascule actif={f.achetes} onClick={() => maj({ achetes: !f.achetes })}>On l&apos;achète</Bascule>
                <Bascule actif={f.promos} onClick={() => maj({ promos: !f.promos })}>En promo</Bascule>
                <Bascule actif={f.sansPrix} onClick={() => maj({ sansPrix: !f.sansPrix })}>
                  Prix sur demande ({compteurs.sansPrix})
                </Bascule>
                <span className="ml-auto tabular-nums text-zinc-500">
                  {trouves.length.toLocaleString('fr-FR')} résultat{trouves.length > 1 ? 's' : ''}
                </span>
              </div>
              {compteurs.classes < articles.length && (
                <p className="mt-1 text-[11px] text-amber-700">
                  ⚠️ {(articles.length - compteurs.classes).toLocaleString('fr-FR')} références n&apos;ont pas encore
                  de catégorie — les rayons du portail Gineys restent à relever.
                </p>
              )}
            </div>

            <Selection
              selection={selection} fourSelection={fourSelection} envoiEnCours={envoiEnCours}
              res={res} onEnvoyer={envoyer} onVider={() => { setChoisis(new Set()); setRes(null) }}
            />

            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-[12px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2">Article</th>
                    <th className="px-3 py-2">Remise</th>
                    <th className="px-3 py-2 text-right">Prix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {visibles.map(a => (
                    <Ligne key={a.id} a={a} choisi={choisis.has(a.id)} onCocher={() => basculer(a.id)}
                      parCle={parCle} ouvert={ouvert} setOuvert={setOuvert} />
                  ))}
                  {visibles.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                      Aucune référence ne correspond.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {limite < trouves.length && (
              <button onClick={() => setLimite(l => l + PAR_PAGE * 4)}
                className="mt-3 h-12 w-full rounded-lg border border-zinc-300 text-sm">
                Afficher plus ({(trouves.length - limite).toLocaleString('fr-FR')} restantes)
              </button>
            )}
          </>
        )}
    </div>
  )
}

// ─── Les promos ────────────────────────────────────────────────────

const ETAT_FRAICHEUR: Record<Fraicheur, { texte: string; classe: string }> = {
  fraiche: { texte: 'relevé récent', classe: 'bg-emerald-50 text-emerald-700' },
  tiede:   { texte: 'à vérifier',    classe: 'bg-amber-50 text-amber-700' },
  perimee: { texte: 'relevé ancien', classe: 'bg-red-50 text-red-700' },
}

function Promos({
  promos, offres, parCle, ouvert, setOuvert,
}: {
  promos: ReturnType<typeof promotions>
  offres: OffreFournisseur[]
  parCle: Map<string, ArticleAchat[]>
  ouvert: string | null
  setOuvert: (c: string | null) => void
}) {
  const lesOffres = useMemo(() => offresTriees(offres), [offres])
  if (!promos.length && !lesOffres.length) {
    return <p className="py-12 text-center text-sm text-zinc-500">
      Aucune promotion relevée. Elles arrivent au prochain relevé du portail fournisseur.
    </p>
  }
  const interessantes = promos.filter(p => p.interessante)
  const autres = promos.filter(p => !p.interessante)
  const plusVieux = promos.length ? Math.max(...promos.map(p => p.age)) : 0

  return (
    <div>
      <Offres offres={lesOffres} />

      {/* ⚠️ Une promo ne dit pas sa date de péremption. Affichée trois mois
          plus tard, elle fait commander au tarif plein en croyant profiter
          d'une affaire. On ne les masque pas — on dit leur âge. */}
      {promos.length > 0 && <div className={`mb-4 rounded-xl border p-3 text-sm ${
        plusVieux > 30 ? 'border-red-300 bg-red-50 text-red-800' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
        <strong>Ces remises datent du dernier relevé</strong>, il y a {plusVieux} jour{plusVieux > 1 ? 's' : ''}.
        {plusVieux > 30
          ? ' Une promotion ne dure pas un mois : à revérifier chez le fournisseur avant de commander.'
          : ' Les fournisseurs n’ont pas d’API — elles se rafraîchissent au relevé suivant.'}
      </div>}

      {interessantes.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Sur ce que nous achetons ({interessantes.length})
          </h2>
          <div className="mb-6 grid gap-2 sm:grid-cols-2">
            {interessantes.map(p => <CartePromo key={p.id} p={p} parCle={parCle} ouvert={ouvert} setOuvert={setOuvert} />)}
          </div>
        </>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Le reste du catalogue ({autres.length})
      </h2>
      <p className="mb-2 text-[12px] text-zinc-500">
        Une remise sur un article qu&apos;on n&apos;achète pas n&apos;est pas une affaire, c&apos;est une tentation.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {autres.slice(0, 40).map(p => <CartePromo key={p.id} p={p} parCle={parCle} ouvert={ouvert} setOuvert={setOuvert} />)}
      </div>
    </div>
  )
}

/**
 * Les offres CONDITIONNELLES d'un fournisseur — « 2 achetés, 1 offert ».
 *
 * ⚠️ Elles ne se convertissent pas en pourcentage : sous le seuil,
 * l'avantage n'existe pas. On affiche donc la CONDITION telle qu'elle est
 * écrite chez le fournisseur.
 *
 * ⚠️ Une offre TERMINÉE reste affichée, barrée. La faire disparaître
 * laisserait croire qu'on n'a rien relevé, alors qu'on a relevé une offre
 * qui a pris fin — et c'est une information utile : elle reviendra peut-être.
 */
function Offres({ offres }: { offres: ReturnType<typeof offresTriees> }) {
  if (!offres.length) return null
  const releve = offres[0].releve_le
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Offres des fournisseurs ({offres.length})
      </h2>
      <p className="mb-2 text-[12px] text-zinc-500">
        Conditionnelles : l&apos;avantage dépend d&apos;une quantité achetée.
        Relevé du {releve.split('-').reverse().join('/')}.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {offres.map(o => (
          <div key={o.id}
            className={`rounded-xl border p-3 ${o.finie ? 'border-zinc-200 bg-zinc-50' : 'border-emerald-300 bg-emerald-50'}`}>
            <p className={`text-sm font-medium ${o.finie ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
              {o.libelle}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
              <span className="text-zinc-500">{o.fournisseur_nom}</span>
              {o.restants === null
                ? <span className="text-zinc-400">sans date de fin</span>
                : o.finie
                  ? <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-600">terminée le {o.date_fin!.split('-').reverse().join('/')}</span>
                  : <span className={`rounded px-1.5 py-0.5 font-medium ${o.restants <= 3 ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                      {o.restants === 0 ? 'dernier jour' : `encore ${o.restants} jour${o.restants > 1 ? 's' : ''}`}
                    </span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CartePromo({
  p, parCle, ouvert, setOuvert,
}: {
  p: ReturnType<typeof promotions>[number]
  parCle: Map<string, ArticleAchat[]>
  ouvert: string | null
  setOuvert: (c: string | null) => void
}) {
  const fr = ETAT_FRAICHEUR[p.etat]
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">{p.designation}</p>
        <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[12px] font-bold text-white">
          −{p.remise_pct!.toFixed(1).replace('.', ',')} %
        </span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">
        {p.fournisseur_nom} · réf. {p.reference}
        {p.achete && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700">on l&apos;achète</span>}
      </p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-base font-semibold tabular-nums">
          {p.prix_ht == null ? <span className="text-amber-700">sur demande</span> : <>{fmtPrix(p.prix_ht)}<span className="text-xs text-zinc-400">/{p.unite}</span></>}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${fr.classe}`}>{fr.texte} · {p.age} j</span>
      </div>
      {p.cle && (
        <button onClick={() => setOuvert(ouvert === p.cle ? null : p.cle)}
          className="mt-2 text-[12px] font-medium underline underline-offset-2">
          {ouvert === p.cle ? 'Masquer' : 'Comparer les fournisseurs'}
        </button>
      )}
      {ouvert === p.cle && p.cle && <Comparaison lignes={parCle.get(p.cle) ?? []} />}
    </div>
  )
}

// ─── Une ligne du catalogue, dépliable ─────────────────────────────

function Ligne({
  a, choisi, onCocher, parCle, ouvert, setOuvert,
}: {
  a: ArticleAchat; choisi: boolean; onCocher: () => void
  parCle: Map<string, ArticleAchat[]>
  ouvert: string | null; setOuvert: (c: string | null) => void
}) {
  const e = etatRemise(a)
  const deplie = a.cle != null && ouvert === a.cle
  const nb = a.cle ? (parCle.get(a.cle)?.length ?? 0) : 0
  return (
    <>
      <tr className={choisi ? 'bg-zinc-50' : ''}>
        <td className="px-3 py-2 align-top">
          <input type="checkbox" checked={choisi} onChange={onCocher} className="h-5 w-5"
            aria-label={`Sélectionner ${a.designation}`} />
        </td>
        <td className="px-3 py-2">
          <p className="font-medium text-zinc-900">
            {a.designation}
            {a.meilleur && <span className="ml-2 rounded bg-emerald-600 px-1.5 text-[11px] font-bold text-white">le moins cher</span>}
          </p>
          <p className="text-[11px] text-zinc-400">
            {a.fournisseur_nom}
            {a.famille && <> · {a.famille}</>}
            {a.reference && <> · réf. {a.reference}</>}
            {' · '}{a.date_tarif}
            {a.achete && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700">on l&apos;achète</span>}
            {a.remise_demandee_le && <span className="ml-1 rounded bg-blue-50 px-1 text-blue-700">conditions demandées</span>}
          </p>
          {nb > 1 && (
            <button onClick={() => setOuvert(deplie ? null : a.cle)}
              className="mt-1 text-[12px] font-medium text-zinc-700 underline underline-offset-2">
              {deplie ? 'Masquer' : `Comparer — ${nb} offres`}
            </button>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <Pastille etat={e} />
          {a.remise_pct != null && (
            <span className="ml-1 rounded bg-red-50 px-1 text-[11px] font-medium text-red-700">
              promo −{a.remise_pct.toFixed(1).replace('.', ',')} %
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right align-top tabular-nums">
          {a.prix_ht == null
            ? <span className="text-amber-700">sur demande</span>
            : <>{fmtPrix(a.prix_ht)}<span className="text-zinc-400">/{a.unite}</span></>}
          {a.ref && <p className="text-[11px] text-zinc-400">{fmtPrix(a.ref.prix)}/{a.ref.unite}</p>}
        </td>
      </tr>
      {deplie && (
        <tr><td colSpan={4} className="bg-zinc-50 px-3 pb-3"><Comparaison lignes={parCle.get(a.cle!) ?? []} /></td></tr>
      )}
    </>
  )
}

/**
 * Les offres d'un même produit, du moins cher au plus cher.
 *
 * ⚠️ LA COULEUR NE SE POSE QUE SUR CE QUI EST COMPARABLE. Une ligne dont le
 * prix n'a pas pu être ramené à l'unité de référence reste GRISE et le dit :
 * la colorer en rouge laisserait croire qu'elle est chère, alors qu'on ne
 * sait simplement pas la comparer — une poche de 600 g face à une d'un kilo.
 */
function Comparaison({ lignes }: { lignes: ArticleAchat[] }) {
  const chiffrees = lignes.filter(l => l.ref)
  const bas = chiffrees.length ? Math.min(...chiffrees.map(l => l.ref!.prix)) : null
  const haut = chiffrees.length ? Math.max(...chiffrees.map(l => l.ref!.prix)) : null
  return (
    <div className="mt-2 space-y-1">
      {lignes.map(l => {
        const incomparable = !l.ref
        const estBas = !incomparable && l.ref!.prix === bas
        const estHaut = !incomparable && l.ref!.prix === haut && haut !== bas
        const couleur = incomparable ? 'border-zinc-200 bg-white text-zinc-500'
          : estBas ? 'border-emerald-300 bg-emerald-50'
          : estHaut ? 'border-red-200 bg-red-50'
          : 'border-zinc-200 bg-white'
        const ecart = !incomparable && bas && l.ref!.prix > bas
          ? `+${(((l.ref!.prix - bas) / bas) * 100).toFixed(0)} %` : null
        return (
          <div key={l.id} className={`flex flex-wrap items-baseline gap-x-2 rounded-lg border px-2 py-1.5 text-[13px] ${couleur}`}>
            <span className="font-medium">{l.fournisseur_nom}</span>
            <span className="text-zinc-500">{l.designation}</span>
            <span className="ml-auto tabular-nums">
              {l.prix_ht == null ? 'sur demande' : <>{fmtPrix(l.prix_ht)}/{l.unite}</>}
            </span>
            <span className="w-28 text-right font-semibold tabular-nums">
              {l.ref ? <>{fmtPrix(l.ref.prix)}/{l.ref.unite}</> : <span className="italic">non comparable</span>}
            </span>
            <span className="w-16 text-right text-[12px]">
              {estBas ? <span className="font-bold text-emerald-700">le moins cher</span> : ecart}
            </span>
            <span className="w-24 text-right text-[11px] text-zinc-400">
              {l.nature === 'facture' ? 'prix payé' : l.nature === 'portail' ? 'tarif portail' : 'devis'}
            </span>
          </div>
        )
      })}
      {/* ⚠️ Un écart en pourcentage ne décide de rien : il se multiplie par
          les quantités réelles avant de changer de fournisseur. */}
      <p className="pt-1 text-[11px] text-zinc-500">
        Un devis est une proposition, un prix payé une preuve. Et un écart ne décide de rien
        tant qu&apos;il n&apos;est pas multiplié par les quantités que vous achetez vraiment.
      </p>
    </div>
  )
}

// ─── Sélection et demande ──────────────────────────────────────────

function Selection({
  selection, fourSelection, envoiEnCours, res, onEnvoyer, onVider,
}: {
  selection: ArticleAchat[]
  fourSelection: Fournisseur | null
  envoiEnCours: boolean
  res: ResultatDemande | null
  onEnvoyer: () => void
  onVider: () => void
}) {
  if (!selection.length) return null
  return (
    <div className="mb-4 rounded-xl border border-zinc-900 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <strong className="text-sm">{selection.length} référence(s) sélectionnée(s)</strong>
        {fourSelection
          ? <span className="text-sm text-zinc-600">
              chez {fourSelection.nom}
              {fourSelection.email ? <> · {fourSelection.email}</>
                : <span className="text-amber-700"> · pas d&apos;adresse enregistrée</span>}
            </span>
          : <span className="text-sm text-amber-700">
              Plusieurs fournisseurs sélectionnés — une demande part chez un seul.
            </span>}
        <button onClick={onEnvoyer} disabled={!fourSelection || envoiEnCours}
          className="ml-auto h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40">
          {envoiEnCours ? 'Envoi…' : 'Demander les conditions'}
        </button>
        <button onClick={onVider} className="h-10 rounded-lg border border-zinc-300 px-3 text-sm">Vider</button>
      </div>
      {res && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
          <p className={`text-sm ${res.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{res.message}</p>
          {res.brouillon && (
            <>
              <p className="mt-2 text-[12px] text-zinc-500">Objet : {res.brouillon.objet}</p>
              <textarea readOnly value={res.brouillon.texte} rows={12}
                className="mt-1 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono text-[12px]" />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Bricoles ──────────────────────────────────────────────────────

function Onglets({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`h-11 rounded-lg border px-4 text-sm font-medium ${
        actif ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white'}`}>
      {children}
    </button>
  )
}

function Compteur({ n }: { n: number }) {
  return <span className="ml-1 rounded-full bg-black/10 px-1.5 text-[11px] tabular-nums">{n.toLocaleString('fr-FR')}</span>
}

function Bascule({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`h-9 rounded-lg border px-3 ${actif ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300'}`}>
      {children}
    </button>
  )
}

const COULEUR: Record<EtatRemise, string> = {
  negocie: 'bg-emerald-50 text-emerald-700',
  public: 'bg-zinc-100 text-zinc-600',
  inconnu: 'bg-amber-50 text-amber-700',
}

function Pastille({ etat }: { etat: EtatRemise }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COULEUR[etat]}`}>{LIBELLE_REMISE[etat]}</span>
}

/* ═══ CE QUI EST EN PLACE ═══════════════════════════════════════════════
 *
 * ⚠️ Cet écran doit dire ce qui MANQUE aussi clairement que ce qu'il a.
 * Un tableau de bord qui n'affiche que ses réussites fait croire le
 * chantier fini — et ici « fini » voudrait dire arbitrer ses fournisseurs
 * sur une poignée de comparaisons en la croyant exhaustive.
 */
function Etat({
  etat, manques, suivies, couvertes,
}: { etat: EtatPlateforme; manques: Manque[]; suivies: number; couvertes: number }) {
  const pct = suivies > 0 ? Math.round((couvertes / suivies) * 100) : 0
  return (
    <div className="space-y-6 pb-16">
      {/* Ce que la plateforme contient */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Carte n={etat.lignes.toLocaleString('fr-FR')} libelle="références" />
        <Carte n={etat.fournisseurs} libelle="fournisseurs" />
        <Carte n={etat.avecPrix.toLocaleString('fr-FR')} libelle="avec un prix"
          sous={etat.sansPrix ? `${etat.sansPrix} sur demande` : undefined} />
        <Carte n={etat.promos} libelle="offres en cours" />
      </section>

      {/* La mesure qui compte vraiment */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          Ce qu’on peut vraiment comparer
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Un catalogue de {etat.lignes.toLocaleString('fr-FR')} références ne sert à rien
          s’il ne croise pas ce qu’on achète. Le chiffre utile n’est pas la taille du
          catalogue, c’est le nombre de <strong>face-à-face</strong> réels.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Carte n={etat.faceAFace} libelle="face-à-face" accent="text-emerald-700"
            sous="≥ 2 fournisseurs, unités concordantes" />
          <Carte n={etat.nonComparables} libelle="unités discordantes" accent="text-amber-700"
            sous="à trancher à la main" />
          <Carte n={etat.seul} libelle="un seul fournisseur" accent="text-zinc-400"
            sous="ce n’est pas une comparaison" />
          <Carte n={`${couvertes} / ${suivies}`} libelle="matières couvertes"
            accent={pct >= 70 ? 'text-emerald-700' : 'text-amber-700'} sous={`${pct} % du stock suivi`} />
        </div>
      </section>

      {/* Ce qu'on sait de nos remises */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
          Ce qu’on sait de nos remises
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Carte n={etat.remises.negocie.toLocaleString('fr-FR')} libelle="tarif négocié"
            accent="text-emerald-700" sous="vérifié" />
          <Carte n={etat.remises.public.toLocaleString('fr-FR')} libelle="tarif public"
            accent="text-zinc-600" sous="mesuré contre le catalogue" />
          <Carte n={etat.remises.inconnu.toLocaleString('fr-FR')} libelle="inconnu"
            accent="text-amber-700" sous="personne n’a vérifié" />
        </div>
        {/* ⚠️ La nuance est tout le sujet : « inconnu » n'est PAS « pas de
            remise ». C'est ce qui déclenche la demande au fournisseur. */}
        <p className="mt-3 text-xs text-amber-800">
          ⚠️ « Inconnu » ne veut pas dire « pas de remise » : personne n’a vérifié.
          C’est exactement ce qu’il faut demander — {etat.demandees} demande(s) partie(s) à ce jour.
        </p>
      </section>

      {/* Par fournisseur */}
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-bold uppercase tracking-wider text-zinc-500">
          Par fournisseur
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Fournisseur</th>
                <th className="px-3 py-2 text-right font-medium">Réfs</th>
                <th className="px-3 py-2 text-left font-medium">D’où viennent les prix</th>
                <th className="px-3 py-2 text-left font-medium">Dernier tarif</th>
                <th className="px-4 py-2 text-left font-medium">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {etat.parFournisseur.map(f => (
                <tr key={f.nom}>
                  <td className="px-4 py-2 font-medium text-zinc-900">{f.nom}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {f.lignes.toLocaleString('fr-FR')}
                    {f.avecPrix < f.lignes && (
                      <span className="ml-1 text-xs text-amber-700">({f.lignes - f.avecPrix} s/dem.)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {f.natures.map(n => <Nature key={n.nature} nature={n.nature} n={n.n} />)}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{f.dernierTarif ?? '—'}</td>
                  <td className="px-4 py-2">
                    {/* ⚠️ Sans adresse, aucun bon ni aucune demande ne part. */}
                    {f.email
                      ? <span className="text-zinc-600">{f.email}</span>
                      : <span className="font-medium text-red-700">✗ pas d’adresse</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ce qui manque */}
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-amber-900">
          Ce qui manque encore
        </h2>
        <ul className="mt-3 space-y-2">
          {manques.map((m, i) => (
            <li key={i} className="text-sm text-amber-900">
              {m.combien != null && (
                <strong className="tabular-nums">{m.combien.toLocaleString('fr-FR')} </strong>
              )}
              {m.quoi} — <span className="text-amber-800">{m.consequence}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Carte({ n, libelle, sous, accent }: {
  n: number | string; libelle: string; sous?: string; accent?: string
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className={`text-2xl font-black tabular-nums ${accent ?? 'text-zinc-900'}`}>{n}</p>
      <p className="text-xs font-medium text-zinc-600">{libelle}</p>
      {sous && <p className="mt-0.5 text-[11px] leading-tight text-zinc-400">{sous}</p>}
    </div>
  )
}

/* ⚠️ La NATURE d'un prix change ce qu'on a le droit d'en conclure : une
 * facture est une preuve de paiement, un devis une proposition qui peut
 * être un tarif d'appel, un tarif de portail ou de catalogue un prix
 * affiché. Arbitrer un fournisseur sur l'un en croyant lire l'autre se
 * paie pendant des mois (0152). */
const NATURES: Record<string, { texte: string; classe: string }> = {
  facture:   { texte: 'payé',      classe: 'bg-emerald-100 text-emerald-800' },
  devis:     { texte: 'devis',     classe: 'bg-blue-100 text-blue-800' },
  portail:   { texte: 'portail',   classe: 'bg-violet-100 text-violet-800' },
  catalogue: { texte: 'catalogue', classe: 'bg-zinc-100 text-zinc-700' },
}

function Nature({ nature, n }: { nature: string; n: number }) {
  const v = NATURES[nature] ?? { texte: nature, classe: 'bg-zinc-100 text-zinc-700' }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${v.classe}`}>
      {v.texte} {n.toLocaleString('fr-FR')}
    </span>
  )
}

/* ═══ NOTRE CATALOGUE D'ACHAT ════════════════════════════════════════════
 *
 * Les 193 références qu'on achète VRAIMENT — à ne pas confondre avec les
 * 3 392 que les fournisseurs proposent. L'information existait, éparpillée
 * entre quatre écrans : introuvable d'un coup d'œil, donc jamais consultée
 * avant de passer commande.
 */
function Achetes({ articles, fournisseurs: tousF }: {
  articles: ArticleAchete[]; fournisseurs: Fournisseur[]
}) {
  const [edite, setEdite] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [f, setF] = useState<FiltresAchete>(FILTRES_ACHETE_VIDES)
  const [parFourn, setParFourn] = useState(false)
  const [replies, setReplies] = useState<Set<string>>(new Set())

  const trouves = useMemo(() => filtrerAchetes(articles, f), [articles, f])
  const b = useMemo(() => bilanAchats(articles), [articles])
  const rayons = useMemo(() => parRayon(trouves), [trouves])
  const groupesF = useMemo(() => achetesParFournisseur(trouves), [trouves])
  const fournisseurs = useMemo(
    () => [...new Set(articles.map(a => a.fournisseur).filter(Boolean))].sort() as string[],
    [articles])

  // Compteur par rayon sur TOUT le catalogue : une pastille qui bougerait
  // avec la recherche ne dirait plus combien le rayon contient.
  const parRayonTotal = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of articles) {
      const k = rayonDe(a.categorie).cle
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [articles])

  const basculer = (cle: string) => setReplies(s => {
    const n = new Set(s); n.has(cle) ? n.delete(cle) : n.add(cle); return n
  })

  return (
    <div className="space-y-4 pb-16">
      {/* ─── Le bandeau : cinq nombres, pas un de plus ─────────────── */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <Chiffre n={b.references} mot="références" />
        <Chiffre n={b.releves} mot="prix relevés" teinte="text-emerald-700" />
        {/* ⚠️ Un prix estimé n'est jamais fondu dans « avec un prix » : il
            a servi à bâtir la carte, il n'a jamais été facturé (0165). */}
        <Chiffre n={b.estimes} mot="estimés" teinte="text-amber-700" />
        <Chiffre n={b.avecReference} mot="avec réf." />
        <Chiffre n={b.incomplets} mot="incomplètes"
          teinte={b.incomplets ? 'text-red-700' : 'text-zinc-400'} />
      </section>

      {/* ─── Les rayons, en pastilles ──────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        <Filtre actif={f.rayon === undefined} onClick={() => setF(x => ({ ...x, rayon: undefined }))}>
          Tous <span className="tabular-nums opacity-60">{articles.length}</span>
        </Filtre>
        {[...RAYONS, RAYON_AUTRES].filter(r => parRayonTotal.get(r.cle)).map(r => (
          <Filtre key={r.cle} actif={f.rayon === r.cle}
            onClick={() => setF(x => ({ ...x, rayon: x.rayon === r.cle ? undefined : r.cle }))}>
            <span>{r.emoji}</span> {r.nom}{' '}
            <span className="tabular-nums opacity-60">{parRayonTotal.get(r.cle)}</span>
          </Filtre>
        ))}
      </div>

      {/* ─── Recherche et affinages ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={f.requete}
          onChange={e => setF(x => ({ ...x, requete: e.target.value }))}
          placeholder="Rechercher un produit, une référence…"
          className="h-11 min-w-[220px] flex-1 rounded-lg border border-zinc-300 px-3 outline-none focus:border-zinc-900" />
        <select
          value={f.fournisseur === undefined ? '' : f.fournisseur === null ? '·' : f.fournisseur}
          onChange={e => setF(x => ({
            ...x,
            fournisseur: e.target.value === '' ? undefined : e.target.value === '·' ? null : e.target.value,
          }))}
          className="h-11 rounded-lg border border-zinc-300 px-2 text-sm">
          <option value="">Tous les fournisseurs</option>
          {fournisseurs.map(n => <option key={n} value={n}>{n}</option>)}
          <option value="·">— sans fournisseur</option>
        </select>
        <Filtre actif={f.estimeSeul} onClick={() => setF(x => ({ ...x, estimeSeul: !x.estimeSeul }))}>
          Prix estimés
        </Filtre>
        <Filtre actif={f.incompletSeul} onClick={() => setF(x => ({ ...x, incompletSeul: !x.incompletSeul }))}>
          Incomplètes
        </Filtre>
        <Filtre actif={parFourn} onClick={() => setParFourn(!parFourn)}>
          Par fournisseur
        </Filtre>
      </div>

      {erreur && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{erreur}</p>}

      <p className="text-sm text-zinc-500">
        {trouves.length.toLocaleString('fr-FR')} référence(s) sur {articles.length}
      </p>

      {(parFourn
        ? groupesF.map(g => ({
            cle: g.fournisseur ?? '—',
            titre: g.fournisseur ?? '⚠️ Sans fournisseur connu',
            emoji: '🚚', teinte: 'bg-zinc-400',
            articles: g.articles, estimes: g.estimes,
            incomplets: g.articles.filter(acheteIncomplet).length,
          }))
        : rayons.map(r => ({
            cle: r.rayon.cle, titre: r.rayon.nom, emoji: r.rayon.emoji, teinte: r.rayon.teinte,
            articles: r.articles, estimes: r.estimes, incomplets: r.incomplets,
          }))
      ).map(g => {
        const replie = replies.has(g.cle)
        return (
          <section key={g.cle} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <button onClick={() => basculer(g.cle)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50">
              <span className={`h-8 w-1.5 shrink-0 rounded-full ${g.teinte}`} />
              <span className="text-lg">{g.emoji}</span>
              <span className="font-bold text-zinc-900">{g.titre}</span>
              <span className="text-sm text-zinc-500">{g.articles.length}</span>
              {g.estimes > 0 && <Puce teinte="bg-amber-100 text-amber-800">{g.estimes} estimé(s)</Puce>}
              {g.incomplets > 0 && <Puce teinte="bg-red-100 text-red-800">{g.incomplets} incomplète(s)</Puce>}
              <span className="ml-auto text-zinc-400">{replie ? '▸' : '▾'}</span>
            </button>
            {!replie && (
              <ul className="divide-y divide-zinc-100 border-t border-zinc-200">
                {g.articles.map(a => (
                  edite === a.cle
                    ? <li key={a.cle} className="bg-zinc-50 px-4 py-3">
                        <EditionAchat a={a} fournisseurs={tousF}
                          fermer={() => setEdite(null)} dire={setErreur} />
                      </li>
                    : <LigneAchat key={a.cle} a={a} parFourn={parFourn}
                        modifier={() => { setErreur(null); setEdite(a.cle) }} />
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {rayons.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">Aucune référence ne correspond.</p>
      )}
    </div>
  )
}

/* Une ligne : le nom d'abord, le prix à droite, le reste en petit. */
function LigneAchat({ a, parFourn, modifier }: {
  a: ArticleAchete; parFourn: boolean; modifier: () => void
}) {
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${
      acheteIncomplet(a) ? 'bg-red-50/50' : ''}`}>
      <div className="min-w-[180px] flex-1">
        {/* ⚠️ Le nom de VITRINE en titre quand il existe, le libellé d'achat
            en dessous : c'est le second qu'on cite au fournisseur, mais
            c'est le premier qu'on reconnaît. Quand plusieurs produits
            partagent le libellé, `nom_vente` est nul et le libellé
            redevient le titre — il fait alors foi. */}
        <p className="font-medium leading-tight text-zinc-900">{a.nom_vente ?? a.nom}</p>
        {a.nom_vente && (
          <p className="truncate text-[11px] leading-tight text-zinc-500">{a.nom}</p>
        )}
        <p className="text-[11px] leading-tight text-zinc-400">
          {/* En vue « par fournisseur » son nom est déjà dans l'en-tête :
              le répéter sur chaque ligne encombre pour rien. */}
          {!parFourn && a.fournisseur && <>{a.fournisseur} · </>}
          {!parFourn && !a.fournisseur && <span className="text-red-600">sans fournisseur · </span>}
          {a.reference ? `réf. ${a.reference}` : 'réf. à relever'}
          {a.dernier_achat && <> · acheté le {a.dernier_achat}</>}
        </p>
      </div>

      {a.ailleurs && (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
          −{Math.round(a.ailleurs.ecartPct)} % {a.ailleurs.fournisseur}
        </span>
      )}

      <div className="w-32 text-right">
        {a.prix == null
          ? <span className="text-sm font-bold text-red-700">prix inconnu</span>
          : <>
              <span className={`text-base font-bold tabular-nums ${a.estime ? 'text-amber-800' : 'text-zinc-900'}`}>
                {fmtPrix(a.prix)}
              </span>
              <span className="block text-[11px] leading-tight text-zinc-400">
                /{a.unite ?? 'unité'}{a.estime && <span className="text-amber-700"> · estimé</span>}
              </span>
            </>}
      </div>

      <button onClick={modifier}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:border-zinc-900">
        Modifier
      </button>
    </li>
  )
}

function Chiffre({ n, mot, teinte }: { n: number; mot: string; teinte?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-xl font-black tabular-nums ${teinte ?? 'text-zinc-900'}`}>
        {n.toLocaleString('fr-FR')}
      </span>
      <span className="text-xs text-zinc-500">{mot}</span>
    </span>
  )
}

/** Un filtre qui se voit : pastille pleine quand il est actif. */
function Filtre({ actif, onClick, children }: {
  actif: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${
        actif ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white hover:border-zinc-500'}`}>
      {children}
    </button>
  )
}

function Puce({ teinte, children }: { teinte: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${teinte}`}>{children}</span>
}

/* ─── Modifier une ligne du catalogue d'achat ─────────────────────────────
 *
 * Le geste le plus courant : « on prend ça ailleurs maintenant ». Il se
 * faisait jusqu'ici dans trois écrans différents — ou pas du tout.
 */
function EditionAchat({ a, fournisseurs, fermer, dire }: {
  a: ArticleAchete
  fournisseurs: Fournisseur[]
  fermer: () => void
  dire: (m: string | null) => void
}) {
  const [fid, setFid] = useState<string>(
    fournisseurs.find(f => f.nom === a.fournisseur)?.id ?? '')
  const [ref, setRef] = useState(a.reference ?? '')
  const [prix, setPrix] = useState(a.prix == null ? '' : String(a.prix))
  const [releve, setReleve] = useState(!a.estime && a.prix != null)
  const [enCours, demarrer] = useTransition()

  function enregistrer() {
    dire(null)
    const n = prix.trim() === '' ? null : Number(prix.replace(',', '.'))
    if (n != null && !Number.isFinite(n)) { dire('Prix illisible.'); return }
    demarrer(async () => {
      const r = await modifierArticleAchat({
        cle: a.cle,
        fournisseur_id: fid || null,
        reference: ref.trim() || null,
        prix: n,
        prix_releve: releve,
      })
      if (!r.ok) { dire(r.message); return }
      fermer()
    })
  }

  return (
    <div>
      <p className="mb-2 font-bold text-zinc-900">{a.nom_vente ?? a.nom}</p>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={fid} onChange={e => setFid(e.target.value)}
            className="h-10 rounded border border-zinc-300 px-2 text-sm">
            <option value="">— sans fournisseur</option>
            {fournisseurs.filter(f => f.actif).map(f => (
              <option key={f.id} value={f.id}>{f.nom}</option>
            ))}
          </select>
          <input value={ref} onChange={e => setRef(e.target.value)}
            placeholder="Code article" className="h-10 w-36 rounded border border-zinc-300 px-2 text-sm" />
          <div className="flex items-center gap-1">
            <input value={prix} onChange={e => setPrix(e.target.value)} inputMode="decimal"
              placeholder="Prix" className="h-10 w-28 rounded border border-zinc-300 px-2 text-right text-sm tabular-nums" />
            <span className="text-xs text-zinc-500">€ / {a.unite ?? 'unité'}</span>
          </div>
          {/* ⚠️ C'est l'humain qui dit si le prix est relevé : un prix tapé
              peut venir d'une facture sous les yeux comme d'une estimation.
              Le déduire serait inventer (0165). */}
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={releve} onChange={e => setReleve(e.target.checked)}
              className="h-4 w-4 accent-emerald-700" />
            <span>prix relevé sur une facture</span>
          </label>
          <button onClick={enregistrer} disabled={enCours}
            className="ml-auto h-10 rounded bg-zinc-900 px-4 text-sm font-bold text-white disabled:opacity-40">
            {enCours ? '…' : 'Enregistrer'}
          </button>
          <button onClick={fermer} className="h-10 rounded border border-zinc-300 px-3 text-sm">
            Annuler
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          ⚠️ Le prix saisi est celui de l&apos;unité <strong>achetée</strong> ({a.unite ?? 'unité'}),
          pas de l&apos;unité vendue. Un coût atteignant 95 % du prix de vente est refusé —
          c&apos;est presque toujours le prix du colis saisi à la place de celui de la pièce.
        </p>

        {/* ─── Les offres moins chères, prêtes à être reprises ──────────
            ⚠️ Détecter un meilleur prix sans permettre de basculer oblige
            à ressaisir ailleurs — donc personne ne le fait, et l'écart
            reste. On les montre TOUTES : le deuxième livre peut-être le
            lendemain, ou sans minimum de commande. */}
        {a.offres.length > 0 && (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-violet-900">
              {a.offres.length} offre(s) moins chère(s)
            </p>
            <ul className="mt-2 space-y-1.5">
              {a.offres.map(o => (
                <li key={o.fournisseur_id + o.designation} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold tabular-nums text-violet-800">−{Math.round(o.ecartPct)} %</span>
                  <span className="font-medium text-zinc-900">{o.fournisseur}</span>
                  <span className="tabular-nums text-zinc-700">
                    {fmtPrix(o.prix_ref)}/{o.unite_ref}
                  </span>
                  {/* ⚠️ La NATURE change ce qu'on a le droit d'en conclure :
                      un devis est une proposition, une facture une preuve. */}
                  <NatureOffre nature={o.nature} />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{o.designation}</span>
                  <button
                    onClick={() => {
                      setFid(o.fournisseur_id)
                      // ⚠️⚠️ LA RÉFÉRENCE DE L'ANCIEN FOURNISSEUR NE SURVIT
                      // PAS AU CHANGEMENT. Un code Gineys cité à Félix
                      // Potin fait chiffrer autre chose, et l'écart se
                      // découvre à la livraison — une référence fausse est
                      // pire qu'une référence absente (0142).
                      setRef(o.reference ?? '')
                      // ⚠️ LE PRIX SUIT LE FOURNISSEUR. Garder l'ancien
                      // après avoir basculé affirmerait qu'on paie encore
                      // un tarif qui ne s'applique plus — c'est plus faux
                      // que de reprendre le nouveau. Ce qui protège, c'est
                      // le DRAPEAU : un prix qui ne vient pas d'une
                      // facture arrive marqué « estimé » (0165).
                      const p = prixReprenable(o, a.unite)
                      if (p != null) {
                        setPrix(String(p))
                        setReleve(o.nature === 'facture')
                        dire(o.nature === 'facture' ? null
                          : `${o.fournisseur} repris à ${fmtPrix(o.prix_ref)}/${o.unite_ref}. `
                            + `⚠️ Ce prix vient d'un ${o.nature} : il reste marqué ESTIMÉ `
                            + `jusqu'à leur première facture.`)
                      } else {
                        // ⚠️ L'unité ne concorde pas : un sachet de neuf
                        // pains recopié sur une ligne à la pièce
                        // multiplierait le coût par neuf.
                        dire(`${o.fournisseur} et sa référence sont repris. ⚠️ Le PRIX ne l'est pas : `
                          + `l'offre est en ${o.unite_ref}, notre ligne en ${a.unite ?? 'unité inconnue'} `
                          + `— à saisir à la main.`)
                      }
                    }}
                    className="rounded border border-violet-400 bg-white px-2 py-1 text-xs font-bold text-violet-800 hover:bg-violet-100">
                    Prendre celui-ci
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-violet-900">
              ⚠️ Un prix repris d&apos;un <strong>devis</strong> reste marqué « estimé » jusqu&apos;à
              la première facture : il dit ce qu&apos;on va payer, pas ce qu&apos;on a payé. Un écart
              en pourcentage ne décide de rien tant qu&apos;il n&apos;est pas multiplié par les
              quantités réelles. Vérifiez le minimum de commande et le délai avant de basculer.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const NATURE_OFFRE: Record<string, { texte: string; classe: string }> = {
  facture:   { texte: 'prix payé', classe: 'bg-emerald-100 text-emerald-800' },
  devis:     { texte: 'devis',     classe: 'bg-blue-100 text-blue-800' },
  portail:   { texte: 'portail',   classe: 'bg-violet-100 text-violet-800' },
  catalogue: { texte: 'catalogue', classe: 'bg-zinc-100 text-zinc-700' },
}

function NatureOffre({ nature }: { nature: string }) {
  const v = NATURE_OFFRE[nature] ?? { texte: nature, classe: 'bg-zinc-100 text-zinc-700' }
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${v.classe}`}>{v.texte}</span>
}
