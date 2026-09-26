'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  filtrer, etatRemise, LIBELLE_REMISE, FILTRES_VIDES,
  type ArticleAchat, type Filtres, type EtatRemise,
} from '@/lib/catalogue-achats'
import { fmtPrix } from '@/lib/foodCost'
import { demanderRemises, type ResultatDemande } from './actions'

type Fournisseur = { id: string; nom: string; email: string | null; actif: boolean }

/** ⚠️ 3 300 lignes ne se rendent pas d'un bloc : le navigateur d'une tablette
 *  du comptoir y passerait plusieurs secondes à chaque frappe. On affiche une
 *  page à la fois, et le compteur dit toujours combien il y en a en tout. */
const PAR_PAGE = 60

export default function AchatsClient({
  articles, fournisseurs,
}: { articles: ArticleAchat[]; fournisseurs: Fournisseur[] }) {
  const [f, setF] = useState<Filtres>(FILTRES_VIDES)
  const [limite, setLimite] = useState(PAR_PAGE)
  const [choisis, setChoisis] = useState<Set<string>>(new Set())
  const [res, setRes] = useState<ResultatDemande | null>(null)
  const [envoiEnCours, demarrer] = useTransition()

  const maj = (p: Partial<Filtres>) => { setF(x => ({ ...x, ...p })); setLimite(PAR_PAGE) }

  const trouves = useMemo(() => filtrer(articles, f), [articles, f])
  const visibles = trouves.slice(0, limite)

  const parFournisseur = useMemo(() => new Map(fournisseurs.map(x => [x.id, x])), [fournisseurs])
  const selection = useMemo(
    () => articles.filter(a => choisis.has(a.id)),
    [articles, choisis])
  // Une demande part chez UN fournisseur : on ne mélange pas deux destinataires.
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
      setRes(await demanderRemises({
        fournisseur_id: fourSelection.id,
        ids: selection.map(a => a.id),
      }))
    })
  }

  const compteurs = useMemo(() => ({
    total: articles.length,
    negocie: articles.filter(a => etatRemise(a) === 'negocie').length,
    inconnu: articles.filter(a => etatRemise(a) === 'inconnu').length,
    promos: articles.filter(a => a.remise_pct).length,
    sansPrix: articles.filter(a => a.prix_ht === null).length,
  }), [articles])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Plateforme d&apos;achat</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {compteurs.total.toLocaleString('fr-FR')} références, tous fournisseurs.
          {' '}<strong>{compteurs.negocie}</strong> à tarif négocié confirmé,
          {' '}<strong>{compteurs.inconnu.toLocaleString('fr-FR')}</strong> dont la remise n&apos;a jamais été vérifiée,
          {' '}<strong>{compteurs.promos}</strong> en promotion.
        </p>
        <p className="mt-1 text-[12px] text-amber-700">
          « Remise inconnue » ne veut pas dire « pas de remise » : personne n&apos;a vérifié.
          C&apos;est exactement ce qu&apos;il faut demander au fournisseur.
        </p>
      </header>

      {/* ─── Recherche et filtres ─────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
        <input
          type="search"
          value={f.requete}
          onChange={e => maj({ requete: e.target.value })}
          placeholder="Rechercher un produit, une référence…"
          className="h-12 w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-900"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select
            value={f.fournisseur_id ?? ''}
            onChange={e => maj({ fournisseur_id: e.target.value || null })}
            className="h-9 rounded-lg border border-zinc-300 px-2"
          >
            <option value="">Tous les fournisseurs</option>
            {fournisseurs.filter(x => x.actif).map(x =>
              <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>

          <select
            value={f.remise ?? ''}
            onChange={e => maj({ remise: (e.target.value || null) as EtatRemise | null })}
            className="h-9 rounded-lg border border-zinc-300 px-2"
          >
            <option value="">Remise : tout</option>
            <option value="negocie">Remisé (confirmé)</option>
            <option value="inconnu">Remise inconnue</option>
            <option value="public">Tarif public (confirmé)</option>
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
      </div>

      {/* ─── La sélection et la demande ───────────────────────── */}
      {selection.length > 0 && (
        <div className="mb-4 rounded-xl border border-zinc-900 bg-zinc-50 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-sm">{selection.length} référence(s) sélectionnée(s)</strong>
            {fourSelection
              ? <span className="text-sm text-zinc-600">
                  chez {fourSelection.nom}
                  {fourSelection.email
                    ? <> · {fourSelection.email}</>
                    : <span className="text-amber-700"> · pas d&apos;adresse enregistrée</span>}
                </span>
              : <span className="text-sm text-amber-700">
                  Plusieurs fournisseurs sélectionnés — une demande part chez un seul.
                </span>}
            <button
              onClick={envoyer}
              disabled={!fourSelection || envoiEnCours}
              className="ml-auto h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              {envoiEnCours ? 'Envoi…' : 'Demander les conditions'}
            </button>
            <button
              onClick={() => { setChoisis(new Set()); setRes(null) }}
              className="h-10 rounded-lg border border-zinc-300 px-3 text-sm"
            >Vider</button>
          </div>

          {res && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
              <p className={`text-sm ${res.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{res.message}</p>
              {res.brouillon && (
                <>
                  <p className="mt-2 text-[12px] text-zinc-500">
                    Objet : {res.brouillon.objet}
                  </p>
                  <textarea
                    readOnly
                    value={res.brouillon.texte}
                    rows={12}
                    className="mt-1 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono text-[12px]"
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Le catalogue ─────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
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
            {visibles.map(a => {
              const e = etatRemise(a)
              return (
                <tr key={a.id} className={choisis.has(a.id) ? 'bg-zinc-50' : ''}>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={choisis.has(a.id)}
                      onChange={() => basculer(a.id)}
                      className="h-5 w-5"
                      aria-label={`Sélectionner ${a.designation}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-zinc-900">{a.designation}</p>
                    <p className="text-[11px] text-zinc-400">
                      {a.fournisseur_nom}
                      {a.reference && <> · réf. {a.reference}</>}
                      {' · '}{a.date_tarif}
                      {a.achete && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700">on l&apos;achète</span>}
                      {a.remise_demandee_le && <span className="ml-1 rounded bg-blue-50 px-1 text-blue-700">conditions demandées</span>}
                    </p>
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
                  </td>
                </tr>
              )
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                Aucune référence ne correspond.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {limite < trouves.length && (
        <button
          onClick={() => setLimite(l => l + PAR_PAGE * 4)}
          className="mt-3 h-12 w-full rounded-lg border border-zinc-300 text-sm"
        >
          Afficher plus ({(trouves.length - limite).toLocaleString('fr-FR')} restantes)
        </button>
      )}
    </div>
  )
}

function Bascule({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-9 rounded-lg border px-3 ${actif ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300'}`}
    >{children}</button>
  )
}

const COULEUR: Record<EtatRemise, string> = {
  negocie: 'bg-emerald-50 text-emerald-700',
  public: 'bg-zinc-100 text-zinc-600',
  inconnu: 'bg-amber-50 text-amber-700',
}

function Pastille({ etat }: { etat: EtatRemise }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COULEUR[etat]}`}>
      {LIBELLE_REMISE[etat]}
    </span>
  )
}
