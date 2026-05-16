'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { fmtPrix } from '@/lib/service'
import {
  ouvrirSessionCaisse,
  fermerSessionCaisse,
  type ResumeSession,
} from '../actions'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'
import TachesSequentielles from '@/components/TachesSequentielles'

const METHODES_LABEL: Record<string, { label: string; emoji: string }> = {
  especes:      { label: 'Espèces',      emoji: '💵' },
  carte:        { label: 'Carte',        emoji: '💳' },
  ticket_resto: { label: 'Ticket resto', emoji: '🎫' },
  virement:     { label: 'Virement',     emoji: '🏦' },
  autre:        { label: 'Autre',        emoji: '•'  },
}

type Employe = { id: string; prenom: string; nom: string; poste: string }

type SessionFermee = {
  id: string
  date_session: string
  ouverte_at: string
  fermee_at: string
  fond_initial: number
  fond_final: number | null
  ca_attendu: number | null
  ca_compte: number | null
  ecart: number | null
}

export default function CaisseClient({
  initialResume, sessionsFermees, employes, navProfil, widgetEmployeId = null, widgetInitialDone = [],
}: {
  initialResume: ResumeSession | null
  sessionsFermees: SessionFermee[]
  employes: Employe[]
  navProfil?: OpsBottomNavProfil
  widgetEmployeId?: string | null
  widgetInitialDone?: string[]
}) {
  const router = useRouter()
  const [resume, setResume] = useState(initialResume)
  const [showCloture, setShowCloture] = useState(false)
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { setResume(initialResume) }, [initialResume])

  // Realtime sur paiements_caisse / sessions_caisse
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('caisse-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paiements_caisse' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions_caisse' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2400) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  return (
    <div className="min-h-screen flex flex-col pb-mobile-nav bg-[#0D0D0D]">
      <OpsBottomNav profil={navProfil} />
      {/* ═══ HEADER POS UNIFIÉ ═══ */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="md:hidden p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-lg shadow-md shrink-0">💰</span>
            <span className={cn(
              'flex-1 inline-flex items-center gap-1 px-2 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              resume ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30' : 'bg-zinc-800 text-zinc-400 ring-zinc-700',
            )}>
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn('absolute inline-flex h-full w-full rounded-full', resume ? 'bg-emerald-400 opacity-75 animate-ping' : 'bg-zinc-500')}></span>
                <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', resume ? 'bg-emerald-500' : 'bg-zinc-500')}></span>
              </span>
              {resume ? 'Session ouverte' : 'Fermée'}
            </span>
            {resume && (
              <span className="inline-flex items-center gap-1 px-2 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-xs font-black tabular-nums shrink-0">
                {fmtPrix(Number(resume.session.ca_attendu ?? 0))}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/serveur" className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-black border border-zinc-700">← Salle</Link>
            {resume && (
              <button onClick={() => setShowCloture(true)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-red-600 text-white text-xs font-black shadow-lg shadow-red-500/30">
                🔒 Clôturer
              </button>
            )}
          </div>
        </div>
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xl shadow-md">💰</span>
            <div className="hidden lg:block">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 leading-none">Service · Z-report</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">Caisse</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black whitespace-nowrap',
              resume ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30' : 'bg-zinc-800 text-zinc-400 ring-zinc-700')}>
              <span className="relative flex h-2 w-2">
                <span className={cn('absolute inline-flex h-full w-full rounded-full', resume ? 'bg-emerald-400 opacity-75 animate-ping' : 'bg-zinc-500')}></span>
                <span className={cn('relative inline-flex rounded-full h-2 w-2', resume ? 'bg-emerald-500' : 'bg-zinc-500')}></span>
              </span>
              {resume ? 'Session ouverte' : 'Fermée'}
            </span>
            {resume && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-xs font-black tabular-nums whitespace-nowrap">
                  CA <span className="text-emerald-600">{fmtPrix(Number(resume.session.ca_attendu ?? 0))}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-800 text-zinc-200 ring-1 ring-zinc-700 text-xs font-black tabular-nums whitespace-nowrap">
                  💵 Fond <span className="text-emerald-300">{fmtPrix(Number(resume.session.fond_initial ?? 0))}</span>
                </span>
              </>
            )}
          </div>
          <div className="flex-1 min-w-2" />
          <Link href="/serveur" className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black border border-zinc-700 transition-colors shrink-0">← Salle</Link>
          {resume && (
            <button onClick={() => setShowCloture(true)} className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black shadow-lg shadow-red-500/30 transition-all active:scale-95 whitespace-nowrap shrink-0">
              🔒 Clôturer session
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        <TachesSequentielles poste="caisse" employeId={widgetEmployeId} initialDone={widgetInitialDone} theme="dark" />
        {!resume ? (
          <OuvertureForm
            employes={employes}
            onError={flashKo}
            onSuccess={() => { flashOk('Caisse ouverte'); router.refresh() }}
          />
        ) : (
          <SessionVivante
            resume={resume}
            onClickCloture={() => setShowCloture(true)}
          />
        )}

        {sessionsFermees.length > 0 && (
          <Historique sessions={sessionsFermees} />
        )}
      </main>

      {erreur && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 max-w-[90vw] text-center cursor-pointer" onClick={() => setErreur('')}>
          ⚠️ {erreur}
        </div>
      )}
      {success && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">
          ✓ {success}
        </div>
      )}

      {showCloture && resume && (
        <ClotureModal
          resume={resume}
          employes={employes}
          onClose={() => setShowCloture(false)}
          onError={flashKo}
          onSuccess={(sessId) => {
            setShowCloture(false)
            flashOk('Caisse clôturée')
            router.push(`/caisse/${sessId}/print`)
          }}
        />
      )}
    </div>
  )
}

// ─── Formulaire ouverture (cas où aucune session) ────────────────────
function OuvertureForm({ employes, onError, onSuccess }: {
  employes: Employe[]
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [fond, setFond] = useState(200)
  const [par, setPar] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    startTransition(async () => {
      try {
        await ouvrirSessionCaisse({
          fond_initial: fond,
          ouverte_par: par || null,
          notes: notes || null,
        })
        onSuccess()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="max-w-lg mx-auto rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Aucune session ouverte</p>
        <h2 className="text-2xl font-bold">Ouvrir la caisse</h2>
        <p className="text-sm text-zinc-400 mt-1">Saisis le fond initial pour démarrer le service.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Fond initial (€)</label>
          <input
            type="number" step="1" min={0}
            value={fond}
            onChange={e => setFond(parseFloat(e.target.value) || 0)}
            className="w-full h-12 px-3 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 font-bold text-2xl tabular-nums text-right outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Ouverte par</label>
          <select
            value={par}
            onChange={e => setPar(e.target.value)}
            className="w-full h-12 px-3 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="">— Aucun —</option>
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Notes (optionnel)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 text-sm outline-none focus:border-emerald-500 resize-none"
          />
        </div>
      </div>

      <button
        onClick={valider}
        disabled={isPending}
        className="w-full min-h-[56px] rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider transition-colors"
      >
        {isPending ? 'Ouverture…' : `🔓 Ouvrir avec ${fmtPrix(fond)}`}
      </button>
    </div>
  )
}

// ─── Session vivante : dashboard live ────────────────────────────────
function SessionVivante({ resume, onClickCloture }: {
  resume: ResumeSession
  onClickCloture: () => void
}) {
  const s = resume.session
  const ouvLocal = new Date(s.ouverte_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const dateLocal = new Date(s.date_session).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Bandeau session — gradient premium + dashboard intégré */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-950/60 via-zinc-900 to-zinc-950 border border-emerald-800/40 shadow-2xl shadow-emerald-900/20 backdrop-blur overflow-hidden">
        <div className="px-4 lg:px-5 py-3 lg:py-4 flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/30">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Session ouverte</p>
            <h2 className="text-lg lg:text-2xl font-black text-white tracking-tight capitalize leading-tight">{dateLocal}</h2>
            <p className="text-[11px] lg:text-xs text-zinc-500 mt-0.5 truncate">
              <span aria-hidden>🕒</span> {ouvLocal}{s.ouverte_par_nom ? ` · ${s.ouverte_par_nom}` : ''} · Fond {fmtPrix(s.fond_initial)}
            </p>
          </div>
          <button
            onClick={onClickCloture}
            className="min-h-[48px] lg:min-h-[56px] px-4 lg:px-6 rounded-xl bg-gradient-to-br from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-bold uppercase tracking-wider text-xs lg:text-sm shadow-lg shadow-rose-900/40 transition-all active:scale-95"
          >
            🔒 Clôturer
          </button>
        </div>

        {/* Stats grid — 4 cards mobile, 4 cards desktop (avec accent premium) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3 p-3 lg:p-4">
          <BigStat label="CA TTC"          value={fmtPrix(resume.ca_total_ttc)}              accent="emerald" />
          <BigStat label="Encaissées"      value={String(resume.nb_commandes_encaissees)}     accent="zinc" />
          <BigStat label="Pourboires"      value={fmtPrix(resume.pourboires_total)}          accent="amber" />
          <BigStat label="Caisse attendue" value={fmtPrix(resume.caisse_attendue)}           accent="blue" />
        </div>
      </div>

      {/* Encaissements par méthode */}
      <section className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <header className="px-5 py-3 border-b border-zinc-800">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Encaissements par méthode</p>
        </header>
        {resume.paiements_par_methode.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500 italic">Aucun encaissement pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-zinc-500 bg-zinc-950">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Méthode</th>
                <th className="text-right px-3 py-2 font-medium">Nb</th>
                <th className="text-right px-3 py-2 font-medium">Montant</th>
                <th className="text-right px-5 py-2 font-medium">Tips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {resume.paiements_par_methode.map(p => {
                const m = METHODES_LABEL[p.methode] ?? { label: p.methode, emoji: '•' }
                return (
                  <tr key={p.methode}>
                    <td className="px-5 py-2.5 font-semibold">{m.emoji} {m.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{p.nb}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold">{fmtPrix(p.montant)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-emerald-400">{p.pourboire > 0 ? fmtPrix(p.pourboire) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Tips par serveur */}
      {resume.tips_par_serveur.length > 0 && (
        <section className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <header className="px-5 py-3 border-b border-zinc-800">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Pourboires par serveur</p>
          </header>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-zinc-500 bg-zinc-950">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Serveur</th>
                <th className="text-right px-3 py-2 font-medium">Encaissements</th>
                <th className="text-right px-5 py-2 font-medium">Tips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {resume.tips_par_serveur.map(t => (
                <tr key={t.serveur_id ?? '__none__'}>
                  <td className="px-5 py-2.5 font-semibold">{t.serveur_nom}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{t.nb}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-bold text-emerald-400">{fmtPrix(t.pourboire)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Caisse théorique */}
      <section className="rounded-xl bg-zinc-900 border border-zinc-800 px-5 py-4 space-y-2 text-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Caisse théorique (espèces)</p>
        <Line label="Fond initial" value={fmtPrix(s.fond_initial)} />
        <Line label="+ Espèces encaissées" value={fmtPrix(resume.paiements_par_methode.find(p => p.methode === 'especes')?.montant ?? 0)} accent="emerald" />
        <div className="border-t border-zinc-800 pt-2 mt-2">
          <Line label="= Caisse attendue à la clôture" value={fmtPrix(resume.caisse_attendue)} bold />
        </div>
      </section>
    </div>
  )
}

// ─── Modal clôture ───────────────────────────────────────────────────
function ClotureModal({ resume, employes, onClose, onError, onSuccess }: {
  resume: ResumeSession
  employes: Employe[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: (sessId: string) => void
}) {
  const s = resume.session
  const [caCompte, setCaCompte] = useState(resume.caisse_attendue)
  const [fondFinal, setFondFinal] = useState(s.fond_initial)
  const [par, setPar] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const ecart = Math.round((caCompte - resume.caisse_attendue) * 100) / 100

  function valider() {
    startTransition(async () => {
      try {
        await fermerSessionCaisse({
          session_id: s.id,
          fond_final: fondFinal,
          ca_compte: caCompte,
          fermee_par: par || null,
          notes: notes || null,
        })
        onSuccess(s.id)
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !isPending && onClose()}>
      <div
        className="bg-zinc-900 text-zinc-100 w-full sm:max-w-xl max-h-[95vh] sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Clôture</p>
            <h2 className="text-2xl font-bold">Fermeture de caisse</h2>
            <p className="text-sm text-zinc-400 mt-0.5">CA TTC encaissé : <b className="text-zinc-100">{fmtPrix(resume.ca_total_ttc)}</b></p>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-md bg-zinc-950 border border-zinc-800 p-3 text-sm space-y-1">
            <Line label="Fond initial" value={fmtPrix(s.fond_initial)} />
            <Line label="+ Espèces encaissées" value={fmtPrix(resume.paiements_par_methode.find(p => p.methode === 'especes')?.montant ?? 0)} accent="emerald" />
            <Line label="= Attendu en caisse" value={fmtPrix(resume.caisse_attendue)} bold />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Espèces comptées en caisse (€)</label>
            <input
              type="number" step="0.01" min={0}
              value={caCompte}
              onChange={e => setCaCompte(parseFloat(e.target.value) || 0)}
              className="w-full h-14 px-3 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 font-bold text-2xl tabular-nums text-right outline-none focus:border-emerald-500"
            />
          </div>

          {/* Écart */}
          <div className={cn(
            'rounded-md border p-3 text-sm flex justify-between items-center',
            Math.abs(ecart) < 0.01 ? 'bg-emerald-900/20 border-emerald-800 text-emerald-300'
              : ecart > 0 ? 'bg-amber-900/20 border-amber-800 text-amber-300'
              : 'bg-red-900/20 border-red-800 text-red-300'
          )}>
            <span className="text-xs uppercase tracking-wider font-bold">Écart</span>
            <span className="text-xl font-bold tabular-nums">
              {ecart > 0 ? '+' : ''}{fmtPrix(ecart)}
            </span>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Fond conservé pour demain (€)</label>
            <input
              type="number" step="1" min={0}
              value={fondFinal}
              onChange={e => setFondFinal(parseFloat(e.target.value) || 0)}
              className="w-full h-12 px-3 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 font-bold text-lg tabular-nums text-right outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">Fond laissé pour la prochaine session. Le reste est sorti du tiroir.</p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Clôturée par</label>
            <select
              value={par}
              onChange={e => setPar(e.target.value)}
              className="w-full h-12 px-3 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="">— Aucun —</option>
              {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1">Notes / commentaire (optionnel)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex: écart dû à un rendu de monnaie sur T12…"
              className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-700 text-zinc-100 text-sm outline-none focus:border-emerald-500 resize-none"
            />
          </div>
        </div>

        <div className="border-t border-zinc-800 p-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="min-h-[56px] flex-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold uppercase tracking-wider"
          >
            Annuler
          </button>
          <button
            onClick={valider}
            disabled={isPending}
            className="min-h-[56px] flex-[2] rounded-md bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold uppercase tracking-wider transition-colors"
          >
            {isPending ? 'Clôture…' : '🔒 Clôturer & imprimer Z'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Historique ──────────────────────────────────────────────────────
function Historique({ sessions }: { sessions: SessionFermee[] }) {
  return (
    <section className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <header className="px-5 py-3 border-b border-zinc-800">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Sessions précédentes</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-zinc-500 bg-zinc-950">
            <tr>
              <th className="text-left px-5 py-2 font-medium">Date</th>
              <th className="text-right px-3 py-2 font-medium">Fond initial</th>
              <th className="text-right px-3 py-2 font-medium">Fond final</th>
              <th className="text-right px-3 py-2 font-medium">Écart</th>
              <th className="text-right px-5 py-2 font-medium">Z</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sessions.map(s => {
              const d = new Date(s.date_session).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
              return (
                <tr key={s.id}>
                  <td className="px-5 py-2.5 font-semibold capitalize">{d}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{fmtPrix(s.fond_initial)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{s.fond_final !== null ? fmtPrix(s.fond_final) : '—'}</td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums font-bold',
                    s.ecart === null ? 'text-zinc-500'
                      : Math.abs(s.ecart) < 0.01 ? 'text-emerald-400'
                      : s.ecart > 0 ? 'text-amber-400' : 'text-red-400')}>
                    {s.ecart === null ? '—' : (s.ecart > 0 ? '+' : '') + fmtPrix(s.ecart)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Link href={`/caisse/${s.id}/print`} className="text-emerald-400 hover:text-emerald-300 underline text-xs">
                      Imprimer Z →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Petits composants ───────────────────────────────────────────────
function BigStat({ label, value, accent }: { label: string; value: string; accent: 'emerald' | 'amber' | 'blue' | 'zinc' }) {
  const STYLES = {
    emerald: { card: 'bg-gradient-to-br from-emerald-500/20 to-emerald-700/5 border-emerald-500/30 shadow-emerald-900/20', text: 'text-emerald-200', label: 'text-emerald-400/80' },
    amber:   { card: 'bg-gradient-to-br from-amber-500/20 to-amber-700/5 border-amber-500/30 shadow-amber-900/20',         text: 'text-amber-200',   label: 'text-amber-400/80' },
    blue:    { card: 'bg-gradient-to-br from-blue-500/20 to-blue-700/5 border-blue-500/30 shadow-blue-900/20',             text: 'text-blue-200',    label: 'text-blue-400/80' },
    zinc:    { card: 'bg-zinc-900 border-zinc-800',                                                                         text: 'text-white',       label: 'text-zinc-500' },
  }
  const s = STYLES[accent]
  return (
    <div className={cn('rounded-xl border shadow-lg px-3 lg:px-4 py-2 lg:py-3 backdrop-blur', s.card)}>
      <p className={cn('text-[9px] lg:text-[10px] uppercase tracking-widest font-bold', s.label)}>{label}</p>
      <p className={cn('text-xl sm:text-2xl lg:text-3xl font-black tabular-nums mt-0.5 leading-tight', s.text)}>{value}</p>
    </div>
  )
}

function Line({ label, value, accent, bold }: { label: string; value: string; accent?: 'emerald'; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={cn('text-zinc-400', bold && 'text-zinc-200')}>{label}</span>
      <span className={cn(
        'tabular-nums',
        bold && 'font-bold text-base',
        accent === 'emerald' && 'text-emerald-400'
      )}>
        {value}
      </span>
    </div>
  )
}
