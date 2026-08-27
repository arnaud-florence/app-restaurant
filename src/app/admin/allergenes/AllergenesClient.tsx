'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import {
  type Allergene, ALLERGENES_EU, ALLERGENE_INFO,
  type TypeProcedureUrgence, TYPE_PROC_URGENCE_INFO, type ProcedureUrgence,
} from '@/lib/allergenes'
import {
  setAllergenesComplementaires, validerAllergenesEnLot,
  creerProcedureUrgence, updateProcedureUrgence, supprimerProcedureUrgence,
} from './actions'
import { askConfirm } from '@/lib/confirm'
import type { RecetteAllergenes } from './page'

type Tab = 'rapide' | 'catalogue' | 'procedures' | 'qr'

export default function AllergenesClient({
  recettes, procedures, readOnly = false,
}: {
  recettes: RecetteAllergenes[]
  procedures: ProcedureUrgence[]
  readOnly?: boolean
}) {
  const [tab, setTab] = useState<Tab>('rapide')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2000) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const nbRecettesAvecAllergenes = recettes.filter(r => r.allergenes_finaux.length > 0).length
  const nbProc = procedures.length

  return (
    <div className="min-h-screen bg-zinc-50">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <AdminPageHeader
          accent="orange"
          subtitle="Cuisine & stock"
          title="Allergènes"
          description="14 allergènes EU, QR code en salle, alerte cuisine, procédures d'urgence."
          actions={
            <div className="flex flex-wrap gap-2 text-sm text-zinc-600">
              <span><b className="text-zinc-900">{nbRecettesAvecAllergenes}</b>/{recettes.length} plats</span>
              <span className="text-zinc-300">·</span>
              <span><b className="text-zinc-900">{nbProc}</b> procédure{nbProc > 1 ? 's' : ''}</span>
            </div>
          }
        >
          <div className="flex gap-1 overflow-x-auto">
            <TabBtn active={tab === 'rapide'}     onClick={() => setTab('rapide')}>⚡ Saisie par famille</TabBtn>
            <TabBtn active={tab === 'catalogue'}  onClick={() => setTab('catalogue')}>🍽️ Catalogue plats × allergènes</TabBtn>
            <TabBtn active={tab === 'procedures'} onClick={() => setTab('procedures')}>🚨 Procédures d&apos;urgence ({nbProc})</TabBtn>
            <TabBtn active={tab === 'qr'}         onClick={() => setTab('qr')}>📱 QR salle</TabBtn>
          </div>
        </AdminPageHeader>

        {tab === 'rapide'     && <SaisieRapideTab recettes={recettes} readOnly={readOnly} onError={flashKo} onOk={flashOk} />}
        {tab === 'catalogue'  && <CatalogueTab recettes={recettes} readOnly={readOnly} onError={flashKo} onOk={flashOk} />}
        {tab === 'procedures' && <ProceduresTab procedures={procedures} readOnly={readOnly} onError={flashKo} onOk={flashOk} />}
        {tab === 'qr'         && <QRTab />}
      </main>

      {erreur && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 cursor-pointer" onClick={() => setErreur('')}>⚠️ {erreur}</div>
      )}
      {success && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">✓ {success}</div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      'inline-flex items-center px-3 h-10 rounded-full text-sm font-bold whitespace-nowrap transition-colors',
      active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
    )}>{children}</button>
  )
}

// ─── TAB 1 — Catalogue plats × allergènes ──────────────────────────
// Suggestions par famille de produit. VOLONTAIREMENT MINIMALES : on ne
// propose que ce qui est certain par nature (de la farine dans un pain), et
// jamais ce qui dépend de la recette du fournisseur (lait, œufs, sésame).
//
// Une suggestion trop généreuse serait acceptée en bloc par habitude, et une
// déclaration d'allergènes fausse est plus dangereuse qu'une déclaration
// absente. Le reste vient des fiches techniques Gineys et Promocash.
const SUGGESTIONS: Array<{ motif: RegExp; allergenes: Allergene[]; pourquoi: string }> = [
  { motif: /pain|baguette|viennoiser|croissant|p[âa]tisser|sandwich|panini|panuozzi|pizza|focaccia|brioche|tarte|chausson/i,
    allergenes: ['gluten'], pourquoi: 'produit à base de farine de blé' },
]

function suggestionsPour(r: { nom: string; categorie: string }): { allergenes: Allergene[]; pourquoi: string } | null {
  const cible = `${r.categorie} ${r.nom}`
  for (const s of SUGGESTIONS) if (s.motif.test(cible)) return { allergenes: s.allergenes, pourquoi: s.pourquoi }
  return null
}

// ─── TAB 0 — Saisie par famille ────────────────────────────────────
//
// 85 produits ouverts un par un dans une fenêtre modale, personne ne le fera
// un mercredi entre deux fournées. Or une baguette, un pain de campagne et
// une ficelle portent exactement les mêmes allergènes : la vraie unité de
// saisie est la FAMILLE.
//
// Le geste : choisir une famille, cocher ce qu'elle contient, décocher les
// exceptions produit par produit, valider. Une famille en deux minutes.
function SaisieRapideTab({
  recettes, readOnly = false, onError, onOk,
}: {
  recettes: RecetteAllergenes[]
  readOnly?: boolean
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const router = useRouter()
  const [famille, setFamille] = useState<string | null>(null)
  const [coches, setCoches] = useState<Allergene[]>([])
  const [exclus, setExclus] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const familles = useMemo(() => {
    const m = new Map<string, { total: number; aValider: number }>()
    for (const r of recettes) {
      const e = m.get(r.categorie) ?? { total: 0, aValider: 0 }
      e.total++
      if (!r.valide_le) e.aValider++
      m.set(r.categorie, e)
    }
    // Les familles qui restent à faire d'abord : c'est là qu'on travaille.
    return [...m.entries()].sort((a, b) => b[1].aValider - a[1].aValider || a[0].localeCompare(b[0], 'fr'))
  }, [recettes])

  const produits = useMemo(
    () => recettes.filter(r => r.categorie === famille),
    [recettes, famille],
  )

  function ouvrir(cat: string) {
    setFamille(cat)
    setExclus(new Set())
    // On repart de ce qui est déjà déclaré sur la famille, quand c'est
    // unanime : ré-ouvrir une famille validée ne doit pas tout effacer.
    const dansTous = ALLERGENES_EU.filter(a => {
      const liste = recettes.filter(r => r.categorie === cat)
      return liste.length > 0 && liste.every(r => r.allergenes_finaux.includes(a))
    })
    setCoches(dansTous)
  }

  function valider() {
    const cibles = produits.filter(p => !exclus.has(p.id)).map(p => p.id)
    if (cibles.length === 0) { onError(new Error('Aucun produit sélectionné.')); return }
    startTransition(async () => {
      try {
        const r = await validerAllergenesEnLot({ recette_ids: cibles, allergenes: coches })
        onOk(`${r.valides} produit(s) validé(s)`)
        setFamille(null)
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  if (!famille) {
    const restant = recettes.filter(r => !r.valide_le).length
    return (
      <div className="space-y-3">
        <div className={cn('rounded-lg p-3 border-2',
          restant === 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300')}>
          <p className={cn('font-bold text-sm', restant === 0 ? 'text-emerald-900' : 'text-amber-900')}>
            {restant === 0
              ? '✓ Tous les produits ont une information allergène vérifiée'
              : `${restant} produit(s) à vérifier sur ${recettes.length}`}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Choisissez une famille : les produits qui la composent portent presque
            toujours les mêmes allergènes. Cochez une fois, décochez les
            exceptions, validez. Une famille prend deux minutes.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {familles.map(([cat, n]) => (
            <button key={cat} onClick={() => ouvrir(cat)} disabled={readOnly}
              className={cn('text-left p-3 rounded-lg border-2 transition-colors disabled:opacity-50',
                n.aValider > 0
                  ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                  : 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50')}>
              <span className="font-bold text-sm block">{cat}</span>
              <span className="text-xs text-zinc-600">
                {n.aValider > 0
                  ? `${n.aValider} à vérifier sur ${n.total}`
                  : `${n.total} produit(s) · vérifiés ✓`}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const suggestion = suggestionsPour({ nom: '', categorie: famille })
  const restants = suggestion?.allergenes.filter(a => !coches.includes(a)) ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setFamille(null)}
          className="text-sm h-9 px-3 rounded-md border border-zinc-300 hover:bg-zinc-50 font-bold">
          ← Familles
        </button>
        <h2 className="font-black text-lg">{famille}</h2>
        <span className="text-sm text-zinc-500">{produits.length} produit(s)</span>
      </div>

      {restants.length > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 flex items-start gap-2">
          <p className="flex-1 text-sm text-blue-900">
            <b>Suggestion</b> — {suggestion?.pourquoi}, donc probablement{' '}
            {restants.map(a => ALLERGENE_INFO[a].label.toLowerCase()).join(', ')}.
            <span className="block text-xs text-blue-700 mt-0.5">
              À confirmer sur la fiche technique du fournisseur.
            </span>
          </p>
          <button onClick={() => setCoches(p => [...new Set([...p, ...restants])])}
            className="shrink-0 text-xs h-9 px-3 rounded-md bg-blue-600 text-white font-bold">
            Appliquer
          </button>
        </div>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 mb-1.5">
          Allergènes présents dans cette famille
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {ALLERGENES_EU.map(a => {
            const info = ALLERGENE_INFO[a]
            const sel = coches.includes(a)
            return (
              <button key={a}
                onClick={() => setCoches(p => sel ? p.filter(x => x !== a) : [...p, a])}
                className={cn('flex items-center gap-2 px-3 h-12 rounded-md border-2 text-sm font-bold',
                  sel ? info.cls + ' border-current' : 'bg-white text-zinc-400 border-zinc-200 hover:bg-zinc-50')}>
                <span className="text-lg">{info.emoji}</span>
                <span className="flex-1 text-left truncate">{info.label}</span>
                {sel && <span className="text-xs">✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 mb-1.5">
          Produits concernés — décochez les exceptions
        </p>
        <ul className="rounded-lg border border-zinc-200 divide-y divide-zinc-100 bg-white">
          {produits.map(p => {
            const exclu = exclus.has(p.id)
            return (
              <li key={p.id}>
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-50">
                  <input type="checkbox" checked={!exclu} className="h-5 w-5"
                    onChange={() => setExclus(prev => {
                      const n = new Set(prev)
                      if (exclu) n.delete(p.id); else n.add(p.id)
                      return n
                    })} />
                  <span className={cn('text-sm flex-1', exclu && 'line-through text-zinc-400')}>{p.nom}</span>
                  {p.valide_le && (
                    <span className="text-[10px] text-emerald-700 shrink-0">déjà vérifié</span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-zinc-200 py-3 flex items-center gap-3">
        <button onClick={valider} disabled={isPending || readOnly}
          className="h-12 px-5 rounded-md bg-zinc-900 text-white font-bold disabled:opacity-50">
          {isPending
            ? 'Enregistrement…'
            : `✓ Valider ${produits.length - exclus.size} produit(s)`}
        </button>
        <p className="text-xs text-zinc-500">
          {coches.length === 0
            ? 'Aucun allergène coché : ces produits seront déclarés sans aucun des 14 allergènes.'
            : `${coches.length} allergène(s) appliqué(s) à la sélection.`}
        </p>
      </div>
    </div>
  )
}

function CatalogueTab({
  recettes, readOnly = false, onError, onOk,
}: {
  recettes: RecetteAllergenes[]
  readOnly?: boolean
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [search, setSearch] = useState('')
  const [filtre, setFiltre] = useState<Allergene | ''>('')
  const [seulementAValider, setSeulementAValider] = useState(false)
  const [editing, setEditing] = useState<RecetteAllergenes | null>(null)

  const categories = useMemo(() => {
    const m = new Map<string, RecetteAllergenes[]>()
    for (const r of recettes) {
      if (search.trim() && !r.nom.toLowerCase().includes(search.toLowerCase())) continue
      if (filtre && !r.allergenes_finaux.includes(filtre)) continue
      if (seulementAValider && r.valide_le) continue
      if (!m.has(r.categorie)) m.set(r.categorie, [])
      m.get(r.categorie)!.push(r)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [recettes, search, filtre, seulementAValider])

  const aValider = recettes.filter(r => !r.valide_le)

  return (
    <div className="space-y-3">
      {aValider.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
          <p className="font-bold text-amber-900 text-sm">
            {aValider.length} produit{aValider.length > 1 ? 's' : ''} sans information allergène vérifiée
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Tant qu&apos;un produit n&apos;est pas validé, la page publique du QR code
            affiche « information non disponible » plutôt qu&apos;une liste vide —
            elle ne peut pas laisser croire à un client allergique qu&apos;un
            croissant ne contient pas de gluten. Ouvrez chaque produit, cochez
            ce qu&apos;il contient, enregistrez : c&apos;est l&apos;enregistrement qui vaut
            validation.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un plat…"
          className="h-10 px-3 rounded-md border border-zinc-300 text-sm w-64"
        />
        <div className="flex flex-wrap gap-1">
          <button onClick={() => { setFiltre(''); setSeulementAValider(false) }}
            className={cn('px-3 h-9 rounded-full text-xs font-bold border',
              filtre === '' && !seulementAValider ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300')}>
            Tous
          </button>
          <button onClick={() => { setSeulementAValider(v => !v); setFiltre('') }}
            className={cn('px-3 h-9 rounded-full text-xs font-bold border',
              seulementAValider ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300')}>
            À valider ({aValider.length})
          </button>
          {ALLERGENES_EU.map(a => {
            const info = ALLERGENE_INFO[a]
            const sel = filtre === a
            return (
              <button key={a} onClick={() => setFiltre(sel ? '' : a)}
                className={cn('px-2 h-9 rounded-full text-xs font-bold border',
                  sel ? info.cls + ' border-current' : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50')}
                title={info.label}>
                {info.emoji}
              </button>
            )
          })}
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-16 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400">
          <p>Aucun plat ne correspond aux filtres.</p>
        </div>
      ) : categories.map(([cat, plats]) => (
        <section key={cat} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <header className="px-4 py-2 bg-zinc-50 border-b border-zinc-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">{cat} · {plats.length}</h2>
          </header>
          <div className="divide-y divide-zinc-100">
            {plats.map(r => (
              <article key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm">{r.nom}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {!r.valide_le ? (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">
                        ⚠ Non vérifié
                      </span>
                    ) : r.allergenes_finaux.length === 0 ? (
                      <span className="text-[11px] text-emerald-700">✓ Aucun des 14 allergènes</span>
                    ) : r.allergenes_finaux.map(a => {
                      const info = ALLERGENE_INFO[a]
                      const isComplement = r.allergenes_complementaires.includes(a)
                      return (
                        <span key={a}
                          className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls,
                            isComplement && 'border-dashed')}
                          title={isComplement ? `${info.label} — override manuel (trace, contamination)` : `${info.label} — détecté via ingrédient`}>
                          {info.emoji} {info.label}{isComplement && '*'}
                        </span>
                      )
                    })}
                  </div>
                  {r.valide_le && (
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Vérifié le {new Date(r.valide_le).toLocaleDateString('fr-FR')}
                      {r.valide_par && <> par {r.valide_par}</>}
                    </p>
                  )}
                  {r.ingredients_avec_allergenes.filter(i => i.allergenes.length > 0).length > 0 && (
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Ingrédients avec allergènes : {r.ingredients_avec_allergenes.filter(i => i.allergenes.length > 0).map(i => i.nom).join(', ')}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <button onClick={() => setEditing(r)}
                    className={cn('shrink-0 text-xs h-9 px-3 rounded-md border font-bold',
                      r.valide_le
                        ? 'border-zinc-300 hover:bg-zinc-50'
                        : 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200')}>
                    {r.valide_le ? 'Modifier' : 'Renseigner'}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <OverrideModal recette={editing}
          onClose={() => setEditing(null)} onError={onError}
          onSuccess={() => { setEditing(null); onOk('Allergènes mis à jour') }} />
      )}
    </div>
  )
}

function OverrideModal({
  recette, onClose, onError, onSuccess,
}: {
  recette: RecetteAllergenes
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [selected, setSelected] = useState<Allergene[]>([
    ...recette.allergenes_complementaires,
    ...recette.allergenes_calcules,  // initialement on coche aussi les calculés pour visu
  ])
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const suggestion = useMemo(() => {
    const s = suggestionsPour(recette)
    if (!s) return null
    // Inutile de proposer ce qui est déjà coché.
    const restants = s.allergenes.filter(a => !selected.includes(a))
    return restants.length > 0 ? { ...s, allergenes: restants } : null
  }, [recette, selected])

  function toggle(a: Allergene) {
    setSelected(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])
  }

  function valider() {
    // On stocke seulement les allergènes ajoutés manuellement (pas ceux des ingrédients)
    const complementaires = selected.filter(a => !recette.allergenes_calcules.includes(a))
    startTransition(async () => {
      try {
        await setAllergenesComplementaires({
          recette_id: recette.id,
          allergenes_complementaires: complementaires,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={`Allergènes — ${recette.nom}`} onClose={onClose} disabled={isPending}>
      <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">
        Cochez tous les allergènes présents dans ce produit, puis enregistrez.
        <b> L&apos;enregistrement vaut vérification</b> : c&apos;est lui qui autorise la
        page publique à afficher une information plutôt qu&apos;un avertissement.
        Un produit sans aucun des 14 allergènes se valide en enregistrant sans
        rien cocher.
      </p>

      {suggestion && (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 flex items-start gap-2">
          <div className="flex-1 text-sm text-blue-900">
            <b>Suggestion</b> — {suggestion.pourquoi}, donc probablement{' '}
            {suggestion.allergenes.map(a => ALLERGENE_INFO[a].label.toLowerCase()).join(', ')}.
            <span className="block text-xs text-blue-700 mt-0.5">
              À confirmer sur la fiche technique du fournisseur. Rien n&apos;est
              enregistré tant que vous n&apos;avez pas validé.
            </span>
          </div>
          <button
            onClick={() => setSelected(prev => [...new Set([...prev, ...suggestion.allergenes])])}
            className="shrink-0 text-xs h-9 px-3 rounded-md bg-blue-600 text-white font-bold">
            Appliquer
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {ALLERGENES_EU.map(a => {
          const info = ALLERGENE_INFO[a]
          const sel = selected.includes(a)
          const auto = recette.allergenes_calcules.includes(a)
          return (
            <button key={a} onClick={() => toggle(a)}
              className={cn(
                'flex items-center gap-2 px-3 h-12 rounded-md border-2 text-sm font-bold transition-colors',
                sel ? info.cls + ' border-current' : 'bg-white text-zinc-400 border-zinc-200 hover:bg-zinc-50',
                auto && sel && 'ring-2 ring-current ring-offset-1'
              )}>
              <span className="text-lg">{info.emoji}</span>
              <span className="text-left flex-1 truncate">
                {info.label}
                {auto && <span className="block text-[9px] font-normal opacity-70">auto</span>}
              </span>
              {sel && <span className="text-xs">✓</span>}
            </button>
          )
        })}
      </div>

      <ModalActions onClose={onClose} onValider={valider} pending={isPending}
        validLabel={recette.valide_le ? '✓ Enregistrer' : '✓ Enregistrer et valider'} />
    </Modal>
  )
}

// ─── TAB 2 — Procédures d'urgence ──────────────────────────────────
function ProceduresTab({
  procedures, readOnly = false, onError, onOk,
}: {
  procedures: ProcedureUrgence[]
  readOnly?: boolean
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ProcedureUrgence | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">{procedures.length} procédure{procedures.length > 1 ? 's' : ''} active{procedures.length > 1 ? 's' : ''}</p>
        {!readOnly && (
          <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle procédure</button>
        )}
      </div>

      {procedures.length === 0 ? (
        <div className="text-center py-16 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400">
          <p className="text-5xl mb-2">🚨</p>
          <p>Aucune procédure d&apos;urgence. Crée la première (réaction allergique en priorité).</p>
        </div>
      ) : (
        <div className="space-y-2">
          {procedures.map(p => {
            const info = TYPE_PROC_URGENCE_INFO[p.type]
            const isOpen = openId === p.id
            return (
              <article key={p.id} className={cn('rounded-lg border-2 bg-white', info.cls)}>
                <button onClick={() => setOpenId(isOpen ? null : p.id)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{info.emoji}</span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{info.label}</p>
                      <h3 className="font-bold text-base">{p.titre}</h3>
                      <p className="text-[11px] opacity-70">{p.etapes.length} étape{p.etapes.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <span>{isOpen ? '▼' : '▶'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    <ol className="list-decimal list-inside space-y-1.5 text-sm">
                      {p.etapes.map((e, i) => <li key={i}>{e}</li>)}
                    </ol>
                    {p.contacts && (
                      <div className="text-xs bg-white/60 border rounded p-2">
                        <b>Contacts d&apos;urgence :</b> {p.contacts}
                      </div>
                    )}
                    {!readOnly && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setEditing(p)}
                          className="text-xs h-8 px-3 rounded border border-current font-bold">Modifier</button>
                        <button onClick={async () => {
                          if (!(await askConfirm(`Désactiver "${p.titre}" ?`))) return
                          try { await supprimerProcedureUrgence(p.id); onOk('Désactivée'); router.refresh() }
                          catch (e) { onError(e) }
                        }}
                          className="text-xs h-8 px-3 rounded text-current/70 hover:text-red-700">× Désactiver</button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {showForm && (
        <ProcedureModal onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Procédure créée') }} />
      )}
      {editing && (
        <ProcedureModal procedure={editing} onClose={() => setEditing(null)} onError={onError}
          onSuccess={() => { setEditing(null); onOk('Procédure modifiée') }} />
      )}
    </div>
  )
}

function ProcedureModal({
  procedure, onClose, onError, onSuccess,
}: {
  procedure?: ProcedureUrgence
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [titre, setTitre] = useState(procedure?.titre ?? '')
  const [type, setType] = useState<TypeProcedureUrgence>(procedure?.type ?? 'allergie')
  const [etapes, setEtapes] = useState<string[]>(procedure?.etapes ?? [''])
  const [contacts, setContacts] = useState(procedure?.contacts ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const isEdit = !!procedure

  function setEtape(i: number, v: string) {
    setEtapes(etapes.map((e, idx) => idx === i ? v : e))
  }
  function ajouterEtape() { setEtapes([...etapes, '']) }
  function supprimerEtape(i: number) {
    if (etapes.length === 1) return
    setEtapes(etapes.filter((_, idx) => idx !== i))
  }

  function valider() {
    const cleanEtapes = etapes.map(e => e.trim()).filter(Boolean)
    if (!titre.trim()) { onError(new Error('Titre obligatoire')); return }
    if (cleanEtapes.length === 0) { onError(new Error('Au moins une étape')); return }
    startTransition(async () => {
      try {
        if (isEdit && procedure) {
          await updateProcedureUrgence({ id: procedure.id, titre: titre.trim(), type, etapes: cleanEtapes, contacts: contacts.trim() || null, ordre: procedure.ordre })
        } else {
          await creerProcedureUrgence({ titre: titre.trim(), type, etapes: cleanEtapes, contacts: contacts.trim() || null, ordre: 0 })
        }
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={isEdit ? 'Modifier procédure' : 'Nouvelle procédure d\'urgence'} onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypeProcedureUrgence)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(TYPE_PROC_URGENCE_INFO) as TypeProcedureUrgence[]).map(t => (
              <option key={t} value={t}>{TYPE_PROC_URGENCE_INFO[t].emoji} {TYPE_PROC_URGENCE_INFO[t].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Titre"><input value={titre} onChange={e => setTitre(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>

      <Field label={`Étapes (${etapes.filter(e => e.trim()).length})`}>
        <div className="space-y-1.5">
          {etapes.map((e, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-6 text-center font-bold text-zinc-500">{i + 1}.</span>
              <input value={e} onChange={ev => setEtape(i, ev.target.value)} placeholder={i === 0 ? 'Identifier l\'allergène en cause' : 'Étape suivante…'}
                className="flex-1 h-10 px-2 rounded border border-zinc-300 text-sm" />
              <button onClick={() => supprimerEtape(i)} disabled={etapes.length === 1}
                className="h-10 w-10 rounded text-zinc-400 hover:text-red-600 disabled:opacity-30">×</button>
            </div>
          ))}
          <button onClick={ajouterEtape} className="w-full h-10 rounded border-2 border-dashed border-zinc-300 hover:border-zinc-400 text-sm font-bold text-zinc-500">
            + Ajouter une étape
          </button>
        </div>
      </Field>

      <Field label="Contacts d'urgence (optionnel)">
        <textarea value={contacts} onChange={e => setContacts(e.target.value)} rows={2}
          placeholder="SAMU 15 · Pompiers 18 · Dr. Martin 06.XX.XX.XX.XX"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" />
      </Field>

      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel={isEdit ? '✓ Mettre à jour' : '+ Créer'} />
    </Modal>
  )
}

// ─── TAB 3 — QR salle ───────────────────────────────────────────────
function QRTab() {
  const [qrUrl, setQrUrl] = useState<string>('')
  const [pageUrl, setPageUrl] = useState<string>('')

  useEffect(() => {
    const url = `${window.location.origin}/menu-allergenes`
    setPageUrl(url)
    // Lazy import qrcode (lib client-side)
    import('qrcode').then(QR => {
      QR.toDataURL(url, { width: 400, margin: 2 }).then(setQrUrl).catch(() => {})
    })
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">QR code à imprimer pour la salle</p>
        {qrUrl ? (
          <>
            <img src={qrUrl} alt="QR code menu allergènes" className="mx-auto" style={{ width: 280, height: 280 }} />
            <p className="text-xs text-zinc-500 mt-2 break-all">{pageUrl}</p>
            <div className="flex gap-2 mt-3 justify-center">
              <a href={qrUrl} download="qr-allergenes.png" className="text-xs h-9 px-3 inline-flex items-center rounded-md border border-zinc-300 hover:bg-zinc-50 font-bold">⬇ Télécharger PNG</a>
              <a href="/menu-allergenes" target="_blank" rel="noopener" className="text-xs h-9 px-3 inline-flex items-center rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold">↗ Ouvrir la page</a>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400 py-12">Génération du QR…</p>
        )}
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 space-y-2">
        <h3 className="font-bold text-base">Comment l&apos;utiliser</h3>
        <ol className="list-decimal list-inside space-y-1.5 text-zinc-600">
          <li>Télécharge le QR ci-contre.</li>
          <li>Imprime-le sur des chevalets de table ou colle-le sur les menus.</li>
          <li>Le client scanne → arrive sur <b>{pageUrl || '/menu-allergenes'}</b>.</li>
          <li>Il filtre les plats par allergène et voit la liste sécurisée.</li>
        </ol>
        <p className="text-xs italic text-zinc-500 mt-3">
          La page se met à jour en direct dès que tu modifies un override d&apos;allergène ou ajoutes/désactives un plat.
          Aucune authentification requise pour le client.
        </p>
      </section>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Modal({ title, onClose, disabled, children }: { title: string; onClose: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !disabled && onClose()}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full hover:bg-zinc-100">×</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({ onClose, onValider, pending, validLabel }: { onClose: () => void; onValider: () => void; pending: boolean; validLabel: string }) {
  return (
    <div className="flex gap-2 pt-3 border-t border-zinc-200 -mx-5 px-5 -mb-5 pb-5 sticky bottom-0 bg-white">
      <button onClick={onClose} disabled={pending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
      <button onClick={onValider} disabled={pending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">
        {pending ? '…' : validLabel}
      </button>
    </div>
  )
}
