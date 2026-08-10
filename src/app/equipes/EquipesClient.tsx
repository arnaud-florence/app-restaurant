'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { playDing } from '@/lib/service'
import { askConfirm } from '@/lib/confirm'
import TopActionBar from '@/components/TopActionBar'
import {
  type Canal,
  type Employe, type Message, type InfoAffichage, type CompteRendu, type Materiel,
  type Priorite, PRIORITE_INFO, type TypeMateriel, type EtatMateriel,
  TYPE_MATERIEL_LABEL, ETAT_MATERIEL_LABEL,
} from './types'
import {
  envoyerMessage, marquerMessagesLus, reagirMessage,
  creerInfoAffichage, supprimerInfo,
  creerCompteRendu, supprimerCompteRendu,
  creerMateriel, attribuerMateriel, restituerMateriel, changerEtatMateriel,
} from './actions'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'

type Tab = 'messages' | 'affichage' | 'cr' | 'materiel'

export default function EquipesClient({
  employes, initialMessages, initialInfos, initialCRs, initialMateriels, navProfil = null,
  connectedEmployeId = null, storiesSlot = null,
}: {
  employes: Employe[]
  initialMessages: Message[]
  initialInfos: InfoAffichage[]
  initialCRs: CompteRendu[]
  initialMateriels: Materiel[]
  navProfil?: OpsBottomNavProfil
  /** Nav « stories » (rendue côté serveur) — présente même dans le chat plein écran. */
  storiesSlot?: React.ReactNode
  /** Employé connecté (si session) → pré-sélectionne « Je suis » sans demander. */
  connectedEmployeId?: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('messages')
  const [moiId, setMoiId] = useState<string>('')
  const [messages, setMessages] = useState(initialMessages)
  const audioReadyRef = useRef(false)
  const lastSeenIdsRef = useRef(new Set(initialMessages.map(m => m.id)))
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')

  // Plan B clavier mobile : on suit la ZONE VISIBLE (visualViewport) pour que le
  // chat occupe pile l'espace au-dessus du clavier — pas de zoom, pas de scroll
  // de page, le composer reste verrouillé en bas.
  const [vp, setVp] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const update = () => setVp({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])

  // "Je suis..." : priorité à l'employé connecté (zéro friction), sinon localStorage.
  useEffect(() => {
    // 1) Si une session est ouverte et liée à un employé → on le sélectionne d'office.
    if (connectedEmployeId && employes.some(e => e.id === connectedEmployeId)) {
      setMoiId(connectedEmployeId)
      try { localStorage.setItem('equipes_moi_id', connectedEmployeId) } catch { /* ignore */ }
      return
    }
    // 2) Sinon (kiosk) → dernier choix mémorisé.
    try {
      const v = localStorage.getItem('equipes_moi_id')
      if (v && employes.some(e => e.id === v)) setMoiId(v)
    } catch { /* ignore */ }
  }, [employes, connectedEmployeId])
  function changerMoi(id: string) {
    setMoiId(id)
    try { localStorage.setItem('equipes_moi_id', id) } catch { /* ignore */ }
  }

  // Sync depuis props (router.refresh)
  useEffect(() => { setMessages(initialMessages) }, [initialMessages])

  // Realtime sur messages
  useEffect(() => {
    const sb = createClient()
    const channel = sb
      .channel('equipes-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'affichage_infos' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comptes_rendus' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materiels' }, () => router.refresh())
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [router])

  // Détection nouveaux messages → ding
  useEffect(() => {
    const ids = new Set(messages.map(m => m.id))
    let nb = 0
    for (const id of ids) if (!lastSeenIdsRef.current.has(id)) nb++
    if (nb > 0 && audioReadyRef.current) playDing()
    lastSeenIdsRef.current = ids
  }, [messages])

  // Compteur non-lus pour l'utilisateur courant
  const nbNonLus = useMemo(() => {
    if (!moiId) return 0
    return messages.filter(m => m.expediteur_id !== moiId && !m.lu_par.includes(moiId)).length
  }, [messages, moiId])

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2000) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  function activerSon() {
    audioReadyRef.current = true
    playDing()
  }

  return (
    <div
      className="fixed inset-x-0 flex flex-col overflow-hidden bg-zinc-50 text-zinc-900"
      style={{ top: vp?.top ?? 0, height: vp ? `${vp.height}px` : '100dvh' }}
    >
      <TopActionBar theme="light" profil={navProfil} />
      {/* Nav « stories » — présente même dans le chat (un clic vers chaque
          catégorie). Topmost en mobile : c'est elle qui gère l'encoche iOS. */}
      <div className="shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {storiesSlot}
      </div>
      {/* En-tête COMPACT façon conversation Messenger (1 ligne fine + onglets fins). */}
      <header className="shrink-0 bg-white border-b border-zinc-200">
        <div className="flex items-center gap-2 px-2.5 h-12">
          <Link href="/admin/cat" aria-label="Retour à l'accueil"
            className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-zinc-100 text-zinc-700 text-xl">←</Link>
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm shadow shrink-0" aria-hidden>👥</span>
          <h1 className="font-black text-zinc-900 text-base leading-none flex-1 truncate">Équipes</h1>
          {connectedEmployeId ? (() => {
            const moi = employes.find(e => e.id === connectedEmployeId)
            const ini = ((moi?.prenom ?? '?').trim()[0] ?? '?').toUpperCase()
            return (
              <span className="shrink-0 inline-flex items-center gap-1.5 max-w-[46%]" title={moi ? `${moi.prenom} ${moi.nom}` : ''}>
                <span className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white inline-flex items-center justify-center text-xs font-black shrink-0">{ini}</span>
                <span className="text-xs font-bold text-zinc-700 truncate">{moi?.prenom}</span>
              </span>
            )
          })() : (
            <select
              value={moiId}
              onChange={e => changerMoi(e.target.value)}
              className="max-w-[44%] h-9 px-2 rounded-full border border-zinc-300 bg-white text-xs font-semibold text-zinc-700"
              title="Identifie-toi pour envoyer et marquer les lectures"
            >
              <option value="">👤 Je suis…</option>
              {employes.map(e => (
                <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
              ))}
            </select>
          )}
          {!audioReadyRef.current && (
            <button onClick={activerSon} title="Activer le son"
              className="shrink-0 h-9 w-9 rounded-full hover:bg-zinc-100 text-base">🔔</button>
          )}
        </div>
        {/* Onglets compacts, scrollables */}
        <div className="flex gap-1 px-2 pb-1.5 overflow-x-auto">
          <TabBtn active={tab === 'messages'} onClick={() => setTab('messages')}>
            💬 Messages
            {nbNonLus > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold">{nbNonLus}</span>
            )}
          </TabBtn>
          <TabBtn active={tab === 'affichage'} onClick={() => setTab('affichage')}>📢 Affichage</TabBtn>
          <TabBtn active={tab === 'cr'} onClick={() => setTab('cr')}>📝 CR</TabBtn>
          <TabBtn active={tab === 'materiel'} onClick={() => setTab('materiel')}>📦 Matériel</TabBtn>
        </div>
      </header>

      {/* Contenu : remplit tout l'espace restant. Le chat est plein écran façon
          Messenger (liste qui scrolle + composer ancré) ; les autres onglets
          scrollent normalement à l'intérieur de la zone. */}
      <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto">
        {tab === 'messages' ? (
          <MessagesTab moiId={moiId} employes={employes} messages={messages} onError={flashKo} onOk={flashOk} />
        ) : (
          <div className="h-full overflow-y-auto p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
            {tab === 'affichage' && (
              <AffichageTab moiId={moiId} infos={initialInfos} onError={flashKo} onOk={flashOk} />
            )}
            {tab === 'cr' && (
              <CRTab moiId={moiId} employes={employes} crs={initialCRs} onError={flashKo} onOk={flashOk} />
            )}
            {tab === 'materiel' && (
              <MaterielTab employes={employes} mats={initialMateriels} onError={flashKo} onOk={flashOk} />
            )}
          </div>
        )}
      </div>

      {/* Toasts */}
      {erreur && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 cursor-pointer" onClick={() => setErreur('')}>
          ⚠️ {erreur}
        </div>
      )}
      {success && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">
          ✓ {success}
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 h-10 rounded-full text-sm font-bold whitespace-nowrap transition-colors',
        active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
      )}
    >
      {children}
    </button>
  )
}

// ─── Tab Messages ───────────────────────────────────────────────────
function MessagesTab({
  moiId, employes, messages, onError, onOk,
}: {
  moiId: string
  employes: Employe[]
  messages: Message[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  // Plus de canaux : un seul fil commun (canal 'tous').
  const canal: Canal = 'tous'
  const [contenu, setContenu] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastTap = useRef<{ id: string; t: number } | null>(null)

  // Réaction emoji (façon Messenger / Insta : double-tap = ❤️)
  function reagir(id: string, emoji = '❤️') {
    if (!moiId) { onError(new Error('Identifie-toi avant de réagir (sélecteur en haut)')); return }
    startTransition(async () => {
      try { await reagirMessage({ message_id: id, employe_id: moiId, emoji }) }
      catch (e) { onError(e) }
    })
  }
  function onBubbleTap(id: string) {
    const now = Date.now()
    if (lastTap.current && lastTap.current.id === id && now - lastTap.current.t < 320) {
      lastTap.current = null
      reagir(id, '❤️')
    } else {
      lastTap.current = { id, t: now }
    }
  }

  // Fil unique : tous les messages (tous canaux confondus) dans une seule conversation.
  const filtered = useMemo(() => messages, [messages])
  // Les messages arrivent déjà en ordre chronologique (page.tsx reverse) :
  // plus ancien en haut, plus récent en bas, façon Messenger.
  const ordered = filtered

  // Auto-scroll en bas + marque les lus pour l'utilisateur courant
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [filtered])

  useEffect(() => {
    if (!moiId) return
    const idsAMarquer = filtered
      .filter(m => m.expediteur_id !== moiId && !m.lu_par.includes(moiId))
      .map(m => m.id)
    if (idsAMarquer.length === 0) return
    startTransition(async () => {
      try { await marquerMessagesLus({ message_ids: idsAMarquer, employe_id: moiId }) }
      catch { /* silencieux : pas critique */ }
    })
  }, [filtered, moiId])

  function envoyer() {
    if (!moiId) { onError(new Error('Identifie-toi avant d\'envoyer (sélecteur en haut)')); return }
    if (!contenu.trim()) return
    startTransition(async () => {
      try {
        await envoyerMessage({ canal, expediteur_id: moiId, contenu: contenu.trim() })
        setContenu('')
        onOk('Message envoyé')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  const empNomById = useMemo(
    () => new Map(employes.map(e => [e.id, `${e.prenom} ${e.nom}`.trim()])),
    [employes]
  )

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Liste messages — un seul fil, scrolle SEULE, remplit tout l'espace */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {ordered.length === 0 ? (
            <p className="text-center py-12 text-zinc-400 text-sm">Aucun message pour le moment. Lance la conversation 👋</p>
          ) : (
            ordered.map(m => {
              const isMoi = m.expediteur_id === moiId
              const date = format(parseISO(m.created_at), 'HH:mm', { locale: fr })
              const datePleine = format(parseISO(m.created_at), 'd MMM HH:mm', { locale: fr })
              return (
                <div key={m.id} className={cn('flex items-end gap-2', isMoi ? 'justify-end' : 'justify-start')}>
                  {!isMoi && (
                    <span className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[11px] font-black shadow-sm" aria-hidden>
                      {((empNomById.get(m.expediteur_id ?? '') ?? '?').trim()[0] ?? '?').toUpperCase()}
                    </span>
                  )}
                  <div className={cn('max-w-[78%]', isMoi && 'flex flex-col items-end')}>
                    <div
                      onClick={() => onBubbleTap(m.id)}
                      title="Double-tap pour réagir ❤️"
                      className={cn(
                        'rounded-2xl px-3 py-2 text-sm cursor-pointer select-none active:scale-[0.99] transition',
                        isMoi ? 'bg-zinc-900 text-white rounded-br-sm' : 'bg-zinc-100 text-zinc-900 rounded-bl-sm'
                      )}>
                      {!isMoi && (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
                          {empNomById.get(m.expediteur_id ?? '') ?? '— Anonyme —'}
                        </p>
                      )}
                      <p className="whitespace-pre-line break-words">{m.contenu}</p>
                      <p className={cn('text-[10px] mt-1', isMoi ? 'text-zinc-300 text-right' : 'text-zinc-500')} title={datePleine}>{date}</p>
                    </div>
                    {/* Réactions emoji (chips agrégées) */}
                    {(() => {
                      const reacts = m.reactions ?? {}
                      const vals = Object.values(reacts)
                      if (vals.length === 0) return null
                      const byEmoji: Record<string, number> = {}
                      for (const e of vals) byEmoji[e] = (byEmoji[e] ?? 0) + 1
                      const mien = moiId ? reacts[moiId] : undefined
                      return (
                        <div className={cn('flex gap-1 mt-1 flex-wrap', isMoi ? 'justify-end' : 'justify-start')}>
                          {Object.entries(byEmoji).map(([emoji, n]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => reagir(m.id, emoji)}
                              className={cn(
                                'inline-flex items-center gap-0.5 rounded-full px-1.5 h-6 text-xs border active:scale-95 transition',
                                mien === emoji ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50',
                              )}
                            >
                              <span>{emoji}</span>{n > 1 && <span className="font-bold tabular-nums">{n}</span>}
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                    {/* Accusé de lecture façon Messenger sous mes messages */}
                    {isMoi && (
                      <p className="text-[10px] text-zinc-400 mt-0.5 pr-1">
                        {(m.lu_par ?? []).filter(id => id && id !== m.expediteur_id).length > 0 ? '✓✓ Vu' : '✓ Envoyé'}
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Composer — ANCRÉ en bas (au-dessus de la barre d'onglets), reste
            visible quand le clavier s'ouvre (hauteur fixe 100dvh + flex). */}
        <div
          className="shrink-0 border-t border-zinc-200 bg-white p-2 flex gap-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
        >
          <input
            type="text"
            value={contenu}
            onChange={e => setContenu(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer() } }}
            onFocus={() => { setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 120) }}
            placeholder={moiId ? 'Écris un message…' : 'Identifie-toi pour écrire'}
            disabled={!moiId || isPending}
            // text-base = 16px : empêche le zoom automatique d'iOS au focus.
            className="flex-1 h-12 px-4 rounded-full border border-zinc-300 bg-zinc-50 text-base outline-none focus:border-zinc-900 focus:bg-white disabled:bg-zinc-100"
          />
          <button
            onClick={envoyer}
            disabled={!moiId || !contenu.trim() || isPending}
            className="min-h-[48px] min-w-[48px] px-4 rounded-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 text-white font-bold text-sm active:scale-95 transition"
          >
            {isPending ? '…' : '➤'}
          </button>
        </div>
    </div>
  )
}

// ─── Tab Affichage ──────────────────────────────────────────────────
function AffichageTab({
  moiId, infos, onError, onOk,
}: {
  moiId: string
  infos: InfoAffichage[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">
          {infos.length} info{infos.length > 1 ? 's' : ''} active{infos.length > 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="min-h-[40px] px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm"
        >+ Nouvelle info</button>
      </div>

      {infos.length === 0 ? (
        <div className="text-center py-16 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400">
          <p className="text-5xl mb-2">📢</p>
          <p>Aucune info en cours. Crée la première !</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {infos.map(i => {
            const sty = PRIORITE_INFO[i.priorite]
            return (
              <article key={i.id} className={cn('rounded-lg border-2 p-3', sty.cls)}>
                <header className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">{sty.emoji} {sty.label}</span>
                    <h3 className="font-bold text-base leading-tight">{i.titre}</h3>
                  </div>
                  <button
                    onClick={async () => {
                      if (!(await askConfirm(`Supprimer "${i.titre}" ?`))) return
                      try { await supprimerInfo(i.id); onOk('Info supprimée'); router.refresh() }
                      catch (e) { onError(e) }
                    }}
                    className="text-xs text-zinc-500 hover:text-red-600 px-2 h-8 rounded"
                    title="Supprimer"
                  >×</button>
                </header>
                <p className="text-sm whitespace-pre-line">{i.contenu}</p>
                <footer className="text-[10px] text-zinc-600 mt-2 flex justify-between">
                  <span>du {fmtDate(i.valable_du)}{i.valable_jusqu ? ` au ${fmtDate(i.valable_jusqu)}` : ''}</span>
                  {i.cree_par_nom && <span>par {i.cree_par_nom}</span>}
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {showForm && (
        <NouvelleInfoModal moiId={moiId} onClose={() => setShowForm(false)} onError={onError} onSuccess={() => { setShowForm(false); onOk('Info créée'); router.refresh() }} />
      )}
    </div>
  )
}

function NouvelleInfoModal({
  moiId, onClose, onError, onSuccess,
}: {
  moiId: string
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [priorite, setPriorite] = useState<Priorite>('info')
  const today = new Date().toISOString().slice(0, 10)
  const [du, setDu] = useState(today)
  const [jusqu, setJusqu] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!titre.trim() || !contenu.trim()) { onError(new Error('Titre et contenu obligatoires')); return }
    startTransition(async () => {
      try {
        await creerInfoAffichage({
          titre: titre.trim(), contenu: contenu.trim(), priorite,
          valable_du: du, valable_jusqu: jusqu || null, ordre: 0,
          cree_par: moiId || null,
        })
        onSuccess()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nouvelle info</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full hover:bg-zinc-100">×</button>
        </div>
        <Field label="Titre">
          <input type="text" value={titre} onChange={e => setTitre(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" />
        </Field>
        <Field label="Contenu">
          <textarea value={contenu} onChange={e => setContenu(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" />
        </Field>
        <Field label="Priorité">
          <div className="flex gap-1.5">
            {(['info','warn','urgent'] as Priorite[]).map(p => {
              const sty = PRIORITE_INFO[p]
              return (
                <button key={p} onClick={() => setPriorite(p)} className={cn(
                  'flex-1 h-10 rounded-md border-2 text-sm font-bold transition-colors',
                  priorite === p ? sty.cls + ' border-current' : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
                )}>{sty.emoji} {sty.label}</button>
              )
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Valable du"><input type="date" value={du} onChange={e => setDu(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          <Field label="Jusqu'au (optionnel)"><input type="date" value={jusqu} onChange={e => setJusqu(e.target.value)} min={du} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold">Annuler</button>
          <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? 'Création…' : '+ Créer'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Comptes-rendus ─────────────────────────────────────────────
function CRTab({
  moiId, employes, crs, onError, onOk,
}: {
  moiId: string
  employes: Employe[]
  crs: CompteRendu[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">{crs.length} compte{crs.length > 1 ? 's' : ''}-rendu{crs.length > 1 ? 's' : ''} archivé{crs.length > 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau compte-rendu</button>
      </div>

      {crs.length === 0 ? (
        <div className="text-center py-16 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400">
          <p className="text-5xl mb-2">📝</p>
          <p>Aucun compte-rendu. Note ta première réunion !</p>
        </div>
      ) : (
        <div className="space-y-2">
          {crs.map(c => {
            const isOpen = openId === c.id
            return (
              <article key={c.id} className="rounded-lg border border-zinc-200 bg-white">
                <button
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-50"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base truncate">{c.titre}</h3>
                    <p className="text-xs text-zinc-500">
                      {fmtDate(c.date_reunion)} · {c.participants_noms.length} participant{c.participants_noms.length > 1 ? 's' : ''}
                      {c.redacteur_nom && ` · rédigé par ${c.redacteur_nom}`}
                    </p>
                  </div>
                  <span className="text-zinc-400">{isOpen ? '▼' : '▶'}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-100 p-4 space-y-3">
                    {c.participants_noms.length > 0 && (
                      <p className="text-xs">
                        <span className="font-bold text-zinc-500 uppercase tracking-wider">Présents · </span>
                        {c.participants_noms.join(', ')}
                      </p>
                    )}
                    <div className="text-sm whitespace-pre-line bg-zinc-50 border border-zinc-200 rounded-md p-3">
                      {c.contenu}
                    </div>
                    <button
                      onClick={async () => {
                        if (!(await askConfirm(`Supprimer "${c.titre}" ?`))) return
                        try { await supprimerCompteRendu(c.id); onOk('Compte-rendu supprimé'); setOpenId(null); router.refresh() }
                        catch (e) { onError(e) }
                      }}
                      className="text-xs text-red-600 hover:text-red-700"
                    >× Supprimer</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {showForm && (
        <NouveauCRModal
          moiId={moiId}
          employes={employes}
          onClose={() => setShowForm(false)}
          onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Compte-rendu créé'); router.refresh() }}
        />
      )}
    </div>
  )
}

function NouveauCRModal({
  moiId, employes, onClose, onError, onSuccess,
}: {
  moiId: string
  employes: Employe[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [titre, setTitre] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [contenu, setContenu] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  function toggle(id: string) {
    setParticipants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function valider() {
    if (!titre.trim() || !contenu.trim()) { onError(new Error('Titre et contenu obligatoires')); return }
    startTransition(async () => {
      try {
        await creerCompteRendu({
          titre: titre.trim(), date_reunion: date, contenu: contenu.trim(),
          participants, redacteur_id: moiId || null,
        })
        onSuccess()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nouveau compte-rendu</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full hover:bg-zinc-100">×</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
          <Field label="Titre"><input type="text" value={titre} onChange={e => setTitre(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        </div>
        <Field label={`Participants (${participants.length})`}>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-zinc-200 rounded-md p-2">
            {employes.map(e => {
              const sel = participants.includes(e.id)
              return (
                <button key={e.id} onClick={() => toggle(e.id)} className={cn(
                  'px-2 h-8 rounded-full text-xs font-bold border transition-colors',
                  sel ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                )}>
                  {sel && '✓ '}{e.prenom} {e.nom.charAt(0)}.
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Contenu (notes, décisions, actions…)">
          <textarea value={contenu} onChange={e => setContenu(e.target.value)} rows={10} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none font-mono text-sm" />
        </Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
          <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? 'Création…' : '+ Archiver'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Matériel ───────────────────────────────────────────────────
function MaterielTab({
  employes, mats, onError, onOk,
}: {
  employes: Employe[]
  mats: Materiel[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [filtre, setFiltre] = useState<'tous' | 'attribue' | 'libre'>('tous')
  const [showForm, setShowForm] = useState(false)
  const [attribModal, setAttribModal] = useState<Materiel | null>(null)
  const router = useRouter()

  const filtered = useMemo(() => {
    if (filtre === 'attribue') return mats.filter(m => m.attribue_a)
    if (filtre === 'libre')    return mats.filter(m => !m.attribue_a)
    return mats
  }, [mats, filtre])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <FiltreBtn active={filtre === 'tous'}     onClick={() => setFiltre('tous')}>Tous ({mats.length})</FiltreBtn>
          <FiltreBtn active={filtre === 'attribue'} onClick={() => setFiltre('attribue')}>Attribués ({mats.filter(m => m.attribue_a).length})</FiltreBtn>
          <FiltreBtn active={filtre === 'libre'}    onClick={() => setFiltre('libre')}>Libres ({mats.filter(m => !m.attribue_a).length})</FiltreBtn>
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau matériel</button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400">
          <p className="text-5xl mb-2">📦</p>
          <p>Aucun matériel à afficher.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(m => {
            const tInfo = TYPE_MATERIEL_LABEL[m.type]
            const eInfo = ETAT_MATERIEL_LABEL[m.etat]
            return (
              <article key={m.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                <header className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{tInfo.emoji} {tInfo.label}</p>
                    <h3 className="font-bold text-base leading-tight">{m.nom}</h3>
                    {m.numero_serie && <p className="text-[11px] text-zinc-500 font-mono">N° {m.numero_serie}</p>}
                  </div>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', eInfo.cls)}>
                    {eInfo.label}
                  </span>
                </header>
                {m.notes && <p className="text-xs text-zinc-600 mt-1 italic">{m.notes}</p>}
                <div className="mt-3 pt-3 border-t border-zinc-100">
                  {m.attribue_a ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <p className="text-zinc-500">Attribué à</p>
                        <p className="font-bold">{m.attribue_a_nom}</p>
                        {m.date_attribution && <p className="text-[10px] text-zinc-500">depuis le {fmtDate(m.date_attribution)}</p>}
                      </div>
                      <button
                        onClick={async () => {
                          if (!(await askConfirm(`Restituer "${m.nom}" ?`))) return
                          try { await restituerMateriel(m.id); onOk('Restitué'); router.refresh() }
                          catch (e) { onError(e) }
                        }}
                        className="text-xs px-2 h-8 rounded border border-zinc-300 hover:bg-zinc-50 font-bold"
                      >↩ Restituer</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAttribModal(m)}
                      className="w-full min-h-[40px] rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-sm font-bold"
                    >+ Attribuer</button>
                  )}
                  <select
                    value={m.etat}
                    onChange={async e => {
                      const newEtat = e.target.value as EtatMateriel
                      try { await changerEtatMateriel({ materiel_id: m.id, etat: newEtat }); onOk('État mis à jour'); router.refresh() }
                      catch (err) { onError(err) }
                    }}
                    className="w-full mt-2 h-9 px-2 text-xs rounded border border-zinc-200 bg-zinc-50"
                  >
                    {(['neuf','bon','use','abime','perdu'] as EtatMateriel[]).map(et => (
                      <option key={et} value={et}>État : {ETAT_MATERIEL_LABEL[et].label}</option>
                    ))}
                  </select>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showForm && (
        <NouveauMaterielModal
          onClose={() => setShowForm(false)}
          onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Matériel ajouté'); router.refresh() }}
        />
      )}
      {attribModal && (
        <AttribuerModal
          materiel={attribModal}
          employes={employes}
          onClose={() => setAttribModal(null)}
          onError={onError}
          onSuccess={() => { setAttribModal(null); onOk('Matériel attribué'); router.refresh() }}
        />
      )}
    </div>
  )
}

function FiltreBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      'px-3 h-9 rounded-full text-xs font-bold border transition-colors',
      active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
    )}>{children}</button>
  )
}

function NouveauMaterielModal({
  onClose, onError, onSuccess,
}: {
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeMateriel>('uniforme')
  const [serie, setSerie] = useState('')
  const [etat, setEtat] = useState<EtatMateriel>('neuf')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!nom.trim()) { onError(new Error('Nom obligatoire')); return }
    startTransition(async () => {
      try {
        await creerMateriel({
          nom: nom.trim(), type,
          numero_serie: serie.trim() || null,
          etat, notes: notes.trim() || null,
        })
        onSuccess()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nouveau matériel</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full hover:bg-zinc-100">×</button>
        </div>
        <Field label="Nom"><input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Veste de cuisine M, Clé caisse, Badge T1…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <select value={type} onChange={e => setType(e.target.value as TypeMateriel)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
              {(Object.keys(TYPE_MATERIEL_LABEL) as TypeMateriel[]).map(t => (
                <option key={t} value={t}>{TYPE_MATERIEL_LABEL[t].emoji} {TYPE_MATERIEL_LABEL[t].label}</option>
              ))}
            </select>
          </Field>
          <Field label="État">
            <select value={etat} onChange={e => setEtat(e.target.value as EtatMateriel)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
              {(Object.keys(ETAT_MATERIEL_LABEL) as EtatMateriel[]).map(et => (
                <option key={et} value={et}>{ETAT_MATERIEL_LABEL[et].label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="N° de série (optionnel)"><input type="text" value={serie} onChange={e => setSerie(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono" /></Field>
        <Field label="Notes (optionnel)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
          <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : '+ Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}

function AttribuerModal({
  materiel, employes, onClose, onError, onSuccess,
}: {
  materiel: Materiel
  employes: Employe[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [employeId, setEmployeId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!employeId) { onError(new Error('Sélectionne un employé')); return }
    startTransition(async () => {
      try {
        await attribuerMateriel({ materiel_id: materiel.id, employe_id: employeId, date_attribution: date })
        onSuccess()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold">Attribuer ce matériel</h2>
          <p className="text-sm text-zinc-600 mt-0.5">{TYPE_MATERIEL_LABEL[materiel.type].emoji} {materiel.nom}</p>
        </div>
        <Field label="Employé">
          <select value={employeId} onChange={e => setEmployeId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Choisir —</option>
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom} ({e.poste})</option>)}
          </select>
        </Field>
        <Field label="Date d'attribution">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" />
        </Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
          <button onClick={valider} disabled={isPending || !employeId} className="flex-[2] min-h-[48px] rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : '✓ Attribuer'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function fmtDate(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy', { locale: fr })
}
