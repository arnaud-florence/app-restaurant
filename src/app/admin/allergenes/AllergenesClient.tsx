'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  type Allergene, ALLERGENES_EU, ALLERGENE_INFO,
  type TypeProcedureUrgence, TYPE_PROC_URGENCE_INFO, type ProcedureUrgence,
} from '@/lib/allergenes'
import {
  setAllergenesComplementaires,
  creerProcedureUrgence, updateProcedureUrgence, supprimerProcedureUrgence,
} from './actions'
import type { RecetteAllergenes } from './page'

type Tab = 'catalogue' | 'procedures' | 'qr'

export default function AllergenesClient({
  recettes, procedures,
}: {
  recettes: RecetteAllergenes[]
  procedures: ProcedureUrgence[]
}) {
  const [tab, setTab] = useState<Tab>('catalogue')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2000) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const nbRecettesAvecAllergenes = recettes.filter(r => r.allergenes_finaux.length > 0).length
  const nbProc = procedures.length

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">← Accueil</Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Sécurité client</p>
              <h1 className="text-2xl font-bold">⚠️ Allergènes</h1>
            </div>
          </div>
          <div className="flex gap-2 text-sm text-zinc-600">
            <span><b className="text-zinc-900">{nbRecettesAvecAllergenes}</b>/{recettes.length} plats avec allergènes</span>
            <span>·</span>
            <span><b className="text-zinc-900">{nbProc}</b> procédure{nbProc > 1 ? 's' : ''} d&apos;urgence</span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'catalogue'}  onClick={() => setTab('catalogue')}>🍽️ Catalogue plats × allergènes</TabBtn>
          <TabBtn active={tab === 'procedures'} onClick={() => setTab('procedures')}>🚨 Procédures d&apos;urgence ({nbProc})</TabBtn>
          <TabBtn active={tab === 'qr'}         onClick={() => setTab('qr')}>📱 QR salle</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {tab === 'catalogue'  && <CatalogueTab recettes={recettes} onError={flashKo} onOk={flashOk} />}
        {tab === 'procedures' && <ProceduresTab procedures={procedures} onError={flashKo} onOk={flashOk} />}
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
function CatalogueTab({
  recettes, onError, onOk,
}: {
  recettes: RecetteAllergenes[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [search, setSearch] = useState('')
  const [filtre, setFiltre] = useState<Allergene | ''>('')
  const [editing, setEditing] = useState<RecetteAllergenes | null>(null)

  const categories = useMemo(() => {
    const m = new Map<string, RecetteAllergenes[]>()
    for (const r of recettes) {
      if (search.trim() && !r.nom.toLowerCase().includes(search.toLowerCase())) continue
      if (filtre && !r.allergenes_finaux.includes(filtre)) continue
      if (!m.has(r.categorie)) m.set(r.categorie, [])
      m.get(r.categorie)!.push(r)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [recettes, search, filtre])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un plat…"
          className="h-10 px-3 rounded-md border border-zinc-300 text-sm w-64"
        />
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setFiltre('')}
            className={cn('px-3 h-9 rounded-full text-xs font-bold border',
              filtre === '' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300')}>
            Tous
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
                    {r.allergenes_finaux.length === 0 ? (
                      <span className="text-[11px] text-emerald-700">✓ Aucun allergène détecté</span>
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
                  {r.ingredients_avec_allergenes.filter(i => i.allergenes.length > 0).length > 0 && (
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Ingrédients avec allergènes : {r.ingredients_avec_allergenes.filter(i => i.allergenes.length > 0).map(i => i.nom).join(', ')}
                    </p>
                  )}
                </div>
                <button onClick={() => setEditing(r)}
                  className="shrink-0 text-xs h-8 px-3 rounded-md border border-zinc-300 hover:bg-zinc-50 font-bold">
                  Override
                </button>
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
    <Modal title={`Override allergènes — ${recette.nom}`} onClose={onClose} disabled={isPending}>
      <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">
        Coche tous les allergènes présents dans ce plat. Les allergènes <b>auto-détectés</b> via les ingrédients
        sont préchochés. Les allergènes que tu ajoutes manuellement (trace, contamination croisée) seront marqués
        d&apos;une étoile <b>*</b> dans la liste.
      </p>

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

      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Sauvegarder" />
    </Modal>
  )
}

// ─── TAB 2 — Procédures d'urgence ──────────────────────────────────
function ProceduresTab({
  procedures, onError, onOk,
}: {
  procedures: ProcedureUrgence[]
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
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle procédure</button>
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
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditing(p)}
                        className="text-xs h-8 px-3 rounded border border-current font-bold">Modifier</button>
                      <button onClick={async () => {
                        if (!confirm(`Désactiver "${p.titre}" ?`)) return
                        try { await supprimerProcedureUrgence(p.id); onOk('Désactivée'); router.refresh() }
                        catch (e) { onError(e) }
                      }}
                        className="text-xs h-8 px-3 rounded text-current/70 hover:text-red-700">× Désactiver</button>
                    </div>
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
