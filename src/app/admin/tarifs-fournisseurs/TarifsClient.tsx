'use client'

import { useMemo, useState, useTransition } from 'react'
import { fmtPrix, fmtPct } from '@/lib/foodCost'
import { prixReference, prixColis, fmtRef, type LigneTarif, type Groupe } from '@/lib/tarifs-fournisseurs'
import { rapprocherTarif, preciserContenance } from './actions'

type Matiere = { id: string; nom: string; unite: string; prix: number; fournisseur: string | null }
type FaceAFace = {
  ligne: LigneTarif
  nous: Matiere
  ref: ReturnType<typeof prixReference>
  notre: ReturnType<typeof prixReference>
  memeUnite: boolean
  ecart: number | null
}
type ARapprocher = LigneTarif & { suggestions: { id: string; nom: string; unite: string; prix: number; note: number }[] }

export default function TarifsClient({
  lignes, groupes, faceAFace, aRapprocher, matieres, fournisseurs, sansReference,
}: {
  lignes: LigneTarif[]
  groupes: Groupe[]
  faceAFace: FaceAFace[]
  aRapprocher: ARapprocher[]
  matieres: Matiere[]
  fournisseurs: { id: string; nom: string }[]
  sansReference: number
}) {
  const [onglet, setOnglet] = useState<'face' | 'rapprocher' | 'catalogue' | 'groupes'>('face')
  const [q, setQ] = useState('')
  const [pending, start] = useTransition()

  const moinsCher = faceAFace.filter(f => f.memeUnite && (f.ecart ?? 0) < 0)
  const economie = moinsCher.reduce((s, f) => s + ((f.notre?.prix ?? 0) - (f.ref?.prix ?? 0)), 0)

  const catalogue = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? lignes.filter(l => l.designation.toLowerCase().includes(t) || (l.reference ?? '').includes(t)) : lignes
  }, [lignes, q])

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-black text-zinc-900">Tarifs fournisseurs</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600">
        Ce que les fournisseurs <strong>proposent</strong>, face à ce qu’on <strong>paie</strong>.
        Les prix sont ramenés à l’unité — kilo, litre ou pièce — parce qu’un bidon de 5 L
        et un litre ne se comparent pas au prix du colis.
      </p>
      <p className="mt-2 max-w-3xl text-xs text-amber-700">
        ⚠️ Un devis n’est pas une facture : rien ici ne modifie un prix d’achat.
        Le prix payé vient des factures scannées, et lui seul entre dans le food cost.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Tarifs au catalogue', String(lignes.length)],
          ['Rapprochés de nos matières', String(faceAFace.length)],
          ['Moins chers qu’aujourd’hui', String(moinsCher.length)],
          ['Contenance à préciser', String(sansReference)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{k}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{v}</p>
          </div>
        ))}
      </div>

      <nav className="mt-6 flex flex-wrap gap-2">
        {([
          ['face', `Face à nos prix (${faceAFace.length})`],
          ['rapprocher', `À rapprocher (${aRapprocher.length})`],
          ['groupes', `Entre fournisseurs (${groupes.length})`],
          ['catalogue', `Catalogue (${lignes.length})`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={`min-h-[40px] rounded-lg px-3 text-sm font-semibold ${
              onglet === k ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
            {label}
          </button>
        ))}
      </nav>

      {/* ─── Face à nos prix ─────────────────────────────────── */}
      {onglet === 'face' && (
        <section className="mt-5">
          {faceAFace.length === 0 ? (
            <Vide texte="Aucun tarif n’est encore rapproché d’une de nos matières. C’est l’onglet « À rapprocher » qui pose ce lien — et c’est un geste humain, parce qu’un libellé qui ressemble ne prouve pas que c’est le même produit." />
          ) : (
            <>
              {moinsCher.length > 0 && (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <strong>{moinsCher.length}</strong> matière(s) moins chères chez ce fournisseur, soit{' '}
                  <strong>{fmtPrix(economie)}</strong> d’écart cumulé par unité. À multiplier par les
                  quantités réelles avant de conclure — un écart de 2 € sur un produit acheté deux fois
                  par an ne vaut pas un changement de fournisseur.
                </p>
              )}
              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Notre matière</th>
                      <th className="px-3 py-2 text-right">On paie</th>
                      <th className="px-3 py-2">Le tarif proposé</th>
                      <th className="px-3 py-2 text-right">Proposé</th>
                      <th className="px-3 py-2 text-right">Écart</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {faceAFace.map(f => (
                      <tr key={f.ligne.id} className={f.memeUnite && (f.ecart ?? 0) < 0 ? 'bg-emerald-50/50' : ''}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-zinc-900">{f.nous.nom}</p>
                          <p className="text-[11px] text-zinc-500">{f.nous.fournisseur ?? 'fournisseur non précisé'}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {f.notre ? fmtRef(f.notre) : <span className="text-zinc-400">—</span>}
                          <span className="block text-[11px] text-zinc-400">{fmtPrix(f.nous.prix)}/{f.nous.unite}</span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-zinc-800">{f.ligne.designation}</p>
                          <p className="text-[11px] text-zinc-500">{f.ligne.fournisseur_nom} · {f.ligne.date_tarif}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {f.ref ? fmtRef(f.ref) : <span className="text-zinc-400">contenance inconnue</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!f.memeUnite ? (
                            <span className="text-[11px] text-amber-700">unités différentes&nbsp;— non comparable</span>
                          ) : f.ecart === null ? '—' : (
                            <span className={`font-bold tabular-nums ${f.ecart < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {f.ecart > 0 ? '+' : ''}{fmtPct(f.ecart)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ─── À rapprocher ────────────────────────────────────── */}
      {onglet === 'rapprocher' && (
        <section className="mt-5 space-y-2">
          <p className="text-sm text-zinc-600">
            Une suggestion n’est jamais pré-cochée : « JAMBON CUIT SUP AC 8K » (pièce entière
            à trancher) et « Jambon blanc tranché » partagent presque tous leurs mots sans être
            le même produit.
          </p>
          {aRapprocher.filter(l => l.suggestions.length > 0).slice(0, 60).map(l => (
            <LigneARapprocher key={l.id} ligne={l} matieres={matieres} pending={pending} start={start} />
          ))}
          {aRapprocher.every(l => l.suggestions.length === 0) && (
            <Vide texte="Aucune piste automatique. Le rapprochement se fait alors depuis l’onglet Catalogue." />
          )}
        </section>
      )}

      {/* ─── Entre fournisseurs ──────────────────────────────── */}
      {onglet === 'groupes' && (
        <section className="mt-5 space-y-3">
          {groupes.length === 0 ? (
            <Vide texte="Un seul catalogue est chargé pour l’instant. Cet onglet se remplit dès qu’un deuxième fournisseur propose les mêmes références — c’est la clé de comparaison posée à la main qui les relie." />
          ) : groupes.map(g => (
            <div key={g.cle} className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-zinc-900">{g.cle}</p>
                {g.comparable && g.ecartPct !== null
                  ? <p className="text-sm font-bold text-emerald-600">{fmtPct(g.ecartPct)} d’écart</p>
                  : <p className="text-xs text-amber-700">non comparable — unités ou contenances différentes</p>}
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {g.lignes.map(l => (
                  <li key={l.id} className={`flex justify-between gap-3 rounded px-2 py-1 ${l.id === g.meilleur ? 'bg-emerald-50 font-semibold' : ''}`}>
                    <span>{l.id === g.meilleur ? '✓ ' : ''}{l.fournisseur_nom} — {l.designation}</span>
                    <span className="tabular-nums">{l.ref ? fmtRef(l.ref) : 'contenance inconnue'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* ─── Catalogue ───────────────────────────────────────── */}
      {onglet === 'catalogue' && (
        <section className="mt-5">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une désignation ou une référence…"
            className="mb-3 h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm" />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Réf.</th>
                  <th className="px-3 py-2">Désignation</th>
                  <th className="px-3 py-2 text-right">Prix unité</th>
                  <th className="px-3 py-2 text-right">Ramené à</th>
                  <th className="px-3 py-2 text-right">Colis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {catalogue.slice(0, 250).map(l => {
                  const r = prixReference(l), c = prixColis(l)
                  return (
                    <tr key={l.id}>
                      <td className="px-3 py-2 font-mono text-[11px] text-zinc-500">{l.reference || '—'}</td>
                      <td className="px-3 py-2">
                        <p className="text-zinc-800">{l.designation}</p>
                        <p className="text-[11px] text-zinc-400">{l.fournisseur_nom} · {l.famille}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPrix(l.prix_ht)}<span className="text-zinc-400">/{l.unite}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r ? <span className={r.derive ? 'text-zinc-600' : ''}>{fmtRef(r)}</span>
                           : <Contenance ligne={l} />}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                        {c !== null ? `${fmtPrix(c)} (${l.colis_quantite} ${l.unite})` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {catalogue.length > 250 && <p className="mt-2 text-xs text-zinc-500">250 premières lignes affichées — affinez la recherche.</p>}
        </section>
      )}
    </main>
  )
}

function Vide({ texte }: { texte: string }) {
  return <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-600">{texte}</p>
}

/**
 * Les lignes que l'extracteur refuse de trancher.
 *
 * « RACLETTE TR 22G 400G » porte le poids de la tranche ET celui de la
 * barquette : deviner donnerait un prix au kilo faux d'un facteur vingt,
 * affiché exactement comme les autres. Quelqu'un lit l'étiquette une fois,
 * et la ligne devient comparable pour de bon.
 */
function Contenance({ ligne }: { ligne: LigneTarif }) {
  const [ouvert, setOuvert] = useState(false)
  const [valeur, setValeur] = useState('')
  const [unite, setUnite] = useState<'kg' | 'L' | 'piece'>('kg')
  const [pending, start] = useTransition()
  const [fait, setFait] = useState(false)

  if (fait) return <span className="text-[11px] text-emerald-600">enregistré — rechargez</span>
  if (!ouvert) return (
    <button onClick={() => setOuvert(true)} className="text-[11px] text-amber-700 underline">
      contenance à préciser
    </button>
  )
  return (
    <span className="inline-flex items-center gap-1">
      <input value={valeur} onChange={e => setValeur(e.target.value)} placeholder="0,400"
        className="h-8 w-16 rounded border border-zinc-300 px-1 text-right text-xs" />
      <select value={unite} onChange={e => setUnite(e.target.value as 'kg' | 'L' | 'piece')}
        className="h-8 rounded border border-zinc-300 text-xs">
        <option value="kg">kg</option><option value="L">L</option><option value="piece">pièce</option>
      </select>
      <button disabled={pending} className="h-8 rounded bg-zinc-900 px-2 text-xs font-semibold text-white disabled:opacity-50"
        onClick={() => start(() => {
          const v = Number(valeur.replace(',', '.'))
          if (!v || v <= 0) return
          preciserContenance({ ligneId: ligne.id, valeur: v, unite }).then(r => { if (r.ok) setFait(true) })
        })}>OK</button>
    </span>
  )
}

function LigneARapprocher({ ligne, matieres, pending, start }: {
  ligne: ARapprocher; matieres: Matiere[]; pending: boolean
  start: (fn: () => void) => void
}) {
  const [fait, setFait] = useState(false)
  const r = prixReference(ligne)
  if (fait) return null

  const poser = (m: { id: string; nom: string }) => start(() => {
    rapprocherTarif({ ligneId: ligne.id, cle: m.nom, ingredientId: m.id }).then(res => {
      if (res.ok) setFait(true)
    })
  })

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-zinc-900">{ligne.designation}</p>
        <p className="text-sm tabular-nums text-zinc-600">
          {fmtPrix(ligne.prix_ht)}/{ligne.unite}
          {r && <span className="ml-2 text-zinc-400">→ {fmtRef(r)}</span>}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {ligne.suggestions.map(s => (
          <button key={s.id} disabled={pending} onClick={() => poser(s)}
            className="min-h-[40px] rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm hover:bg-emerald-50 hover:border-emerald-400 disabled:opacity-50">
            {s.nom} <span className="text-zinc-400">· {fmtPrix(s.prix)}/{s.unite}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
