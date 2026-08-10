'use client'

// Tableau des interrupteurs par activité (migration 0110).
//
// C'est ici que se joue la réouverture du restaurant fin octobre 2026 :
// un bouton « Ouvrir le restaurant » bascule les 7 modules d'un coup.
// Aucun code à modifier, aucun redéploiement — le site public suit dans
// la minute (TTL de 60 s sur /api/public/activation).

import { useState, useTransition } from 'react'
import type { ModuleActivation, ConfigLivraisonFournil } from '@/lib/activation/config'
import { updateModule, basculerActivite, updateLivraisonFournil } from './actions'

const GROUPES: { cle: 'fournil' | 'restaurant' | 'commun'; titre: string; emoji: string; pitch: string }[] = [
  { cle: 'fournil',    emoji: '🥖', titre: 'Fournil',    pitch: 'Ouvert. C\'est la seule activité visible du public aujourd\'hui.' },
  { cle: 'restaurant', emoji: '🍽', titre: 'Restaurant', pitch: 'Fermé jusqu\'à fin octobre 2026. Rien n\'est supprimé : tout se rallume ici.' },
  { cle: 'commun',     emoji: '⭐', titre: 'Transverse', pitch: 'Indépendant des deux activités.' },
]

export default function ActivationClient({
  modules,
  livraison,
}: {
  modules: ModuleActivation[]
  livraison: ConfigLivraisonFournil
}) {
  const [msg, setMsg] = useState<string | null>(null)

  function flash(texte: string) {
    setMsg(texte)
    setTimeout(() => setMsg(null), 3500)
  }

  if (modules.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ La table <code className="font-mono">activites_modules</code> est introuvable.
          Exécute la migration <b>0110_activation_par_activite.sql</b> dans Supabase → SQL Editor,
          puis recharge cette page. En attendant, l&apos;application fonctionne en repli
          <b> « Fournil seul »</b>.
        </div>
      </div>
    )
  }

  const nbAllumes = modules.filter(m => m.actif).length

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">🎛 Activités &amp; ouverture</h1>
        <p className="text-sm text-zinc-500 mt-1">
          L&apos;interrupteur général de CASATASIA. Un module éteint disparaît du site public
          <b> et</b> de l&apos;outil (navigation, écrans, agents) — sans rien supprimer.
          <b> {nbAllumes}</b> module{nbAllumes > 1 ? 's' : ''} allumé{nbAllumes > 1 ? 's' : ''} sur {modules.length}.
        </p>
      </header>

      {msg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {msg}
        </div>
      )}

      {GROUPES.map(g => {
        const items = modules.filter(m => m.activite === g.cle)
        if (items.length === 0) return null
        return (
          <section key={g.cle} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-zinc-900">{g.emoji} {g.titre}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{g.pitch}</p>
              </div>
              {g.cle !== 'commun' && (
                <BoutonActivite
                  activite={g.cle}
                  tousAllumes={items.every(m => m.actif)}
                  onDone={flash}
                />
              )}
            </div>
            <div className="divide-y divide-zinc-100">
              {items.map(m => <LigneModule key={m.cle} module={m} onDone={flash} />)}
            </div>
          </section>
        )
      })}

      <LivraisonFournil initial={livraison} onDone={flash} />
    </div>
  )
}

function BoutonActivite({
  activite, tousAllumes, onDone,
}: {
  activite: 'restaurant' | 'fournil'
  tousAllumes: boolean
  onDone: (m: string) => void
}) {
  const [pending, start] = useTransition()
  const label = tousAllumes ? 'Tout fermer' : `Ouvrir ${activite === 'restaurant' ? 'le restaurant' : 'le fournil'}`

  function go() {
    const question = tousAllumes
      ? `Fermer TOUS les modules « ${activite} » ? Ils disparaîtront du site et de l'outil.`
      : `Ouvrir TOUS les modules « ${activite} » ? Ils redeviendront visibles du public.`
    if (!window.confirm(question)) return
    start(async () => {
      const r = await basculerActivite({ activite, actif: !tousAllumes })
      onDone(r.ok
        ? `✓ ${r.nb} module(s) « ${activite} » ${tousAllumes ? 'fermés' : 'ouverts'}. Le site suit dans la minute.`
        : `Erreur : ${r.error}`)
    })
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending}
      className={`min-h-[48px] px-4 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 ${
        tousAllumes
          ? 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
          : 'bg-emerald-600 text-white hover:bg-emerald-500'
      }`}
    >
      {pending ? '…' : label}
    </button>
  )
}

function LigneModule({ module: m, onDone }: { module: ModuleActivation; onDone: (msg: string) => void }) {
  const [actif, setActif] = useState(m.actif)
  const [teaser, setTeaser] = useState(m.teaser)
  const [pending, start] = useTransition()

  function patch(next: { actif?: boolean; teaser?: boolean }) {
    const nActif  = next.actif  ?? actif
    const nTeaser = next.teaser ?? teaser
    setActif(nActif); setTeaser(nTeaser)
    start(async () => {
      const r = await updateModule({ cle: m.cle, actif: nActif, teaser: nTeaser })
      if (r.ok) {
        onDone(`✓ ${m.libelle} — ${nActif ? 'allumé' : 'éteint'}.`)
      } else {
        setActif(m.actif); setTeaser(m.teaser)   // rollback optimiste
        onDone(`Erreur : ${r.error}`)
      }
    })
  }

  return (
    <div className={`px-4 py-3 flex flex-wrap items-center gap-3 ${pending ? 'opacity-60' : ''}`}>
      <span className="text-xl w-7 text-center shrink-0">{m.emoji}</span>

      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-bold text-zinc-900">{m.libelle}</p>
        {m.description && <p className="text-xs text-zinc-500 mt-0.5">{m.description}</p>}
        {!actif && m.date_ouverture_prevue && (
          <p className="text-xs text-zinc-400 mt-0.5">
            Ouverture prévue : {new Date(m.date_ouverture_prevue).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      {!actif && (
        <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={teaser}
            disabled={pending}
            onChange={e => patch({ teaser: e.target.checked })}
            className="h-4 w-4"
          />
          Teaser sur le site
        </label>
      )}

      <Interrupteur actif={actif} pending={pending} onChange={v => patch({ actif: v })} />
    </div>
  )
}

function Interrupteur({
  actif, pending, onChange,
}: {
  actif: boolean; pending: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      disabled={pending}
      onClick={() => onChange(!actif)}
      className={`relative shrink-0 h-8 w-14 rounded-full transition-colors disabled:opacity-50 ${
        actif ? 'bg-emerald-500' : 'bg-zinc-300'
      }`}
    >
      <span className="sr-only">{actif ? 'Éteindre' : 'Allumer'}</span>
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          actif ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function LivraisonFournil({
  initial, onDone,
}: {
  initial: ConfigLivraisonFournil
  onDone: (m: string) => void
}) {
  const [communes, setCommunes] = useState(initial.communes.join(', '))
  const [heureLimite, setHeureLimite] = useState(initial.heureLimite)
  const [heureTournee, setHeureTournee] = useState(initial.heureTournee)
  const [minimumTtc, setMinimumTtc] = useState(String(initial.minimumTtc))
  const [fraisTtc, setFraisTtc] = useState(String(initial.fraisTtc))
  const [pending, start] = useTransition()

  function submit() {
    start(async () => {
      const r = await updateLivraisonFournil({
        communes, heureLimite, heureTournee,
        minimumTtc: Number(minimumTtc) || 0,
        fraisTtc: Number(fraisTtc) || 0,
      })
      onDone(r.ok ? '✓ Livraison Fournil enregistrée.' : `Erreur : ${r.error}`)
    })
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-100">
        <h2 className="font-bold text-zinc-900">🛵 Livraison Fournil</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Une tournée par jour. Une commande passée <b>avant l&apos;heure limite</b> part le matin même ;
          après, elle bascule sur la tournée du lendemain.
        </p>
      </div>

      <div className="p-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-500 mb-1">
            Communes livrées <span className="text-zinc-400">(séparées par des virgules)</span>
          </label>
          <input
            value={communes}
            onChange={e => setCommunes(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none"
          />
          <p className="text-xs text-zinc-400 mt-1">
            Le site propose ces communes en liste fermée — un client hors zone ne peut pas commander.
          </p>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Heure limite de commande</label>
          <input
            type="time"
            value={heureLimite}
            onChange={e => setHeureLimite(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none tabular-nums"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Départ de la tournée</label>
          <input
            type="time"
            value={heureTournee}
            onChange={e => setHeureTournee(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none tabular-nums"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Minimum de commande (€ TTC)</label>
          <input
            type="number" min={0} step="0.5" inputMode="decimal"
            value={minimumTtc}
            onChange={e => setMinimumTtc(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none tabular-nums text-right"
          />
          <p className="text-xs text-zinc-400 mt-1">0 = pas de minimum.</p>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Frais de livraison (€ TTC)</label>
          <input
            type="number" min={0} step="0.5" inputMode="decimal"
            value={fraisTtc}
            onChange={e => setFraisTtc(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none tabular-nums text-right"
          />
          <p className="text-xs text-zinc-400 mt-1">0 = livraison offerte.</p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="min-h-[48px] px-5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </section>
  )
}
