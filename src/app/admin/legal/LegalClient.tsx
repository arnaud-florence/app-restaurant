'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { askConfirm } from '@/lib/confirm'
import { PillTab, PillCount } from '@/components/ui/PillTab'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import {
  type Obligation, type Accident, type Affichage,
  type CategorieObligation, type Gravite, type StatutObligation,
  CATEGORIE_OBLIGATION_INFO, STATUT_OBLIG_LABEL, GRAVITE_INFO,
  STATUT_ECHEANCE_STYLE, statutEcheance, joursRestants, fmtDate,
} from '@/lib/legal'
import {
  creerObligation, updateObligation, supprimerObligation,
  creerAccident, supprimerAccident,
  verifierAffichage, creerAffichageLibre, supprimerAffichage,
} from './actions'
import type { DataLegal } from './page'

type Tab = 'obligations' | 'affichages' | 'accidents' | 'documents' | 'registre'

export default function LegalClient({ data }: { data: DataLegal }) {
  const [tab, setTab] = useState<Tab>('obligations')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const oblAlertes = data.obligations.filter(o => {
    const s = statutEcheance(o.date_echeance)
    return s === 'expire' || s === 'critique' || s === 'proche'
  }).length
  const affMissing = data.affichages.filter(a => a.obligatoire && !a.present).length
  const accidentsAnnee = data.accidents.filter(a => a.date_accident.slice(0, 4) === String(new Date().getFullYear())).length

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
          accent="zinc"
          subtitle="Conformité"
          title="Légal"
          description="Licences, affichages obligatoires, assurances, accidents, registre sécurité."
          actions={
            <div className="hidden sm:flex flex-wrap gap-2 text-sm">
              <KPI label="Échéances ≤1M" value={oblAlertes} accent={oblAlertes > 0 ? 'rouge' : 'zinc'} />
              <KPI label="Affichages" value={affMissing} accent={affMissing > 0 ? 'rouge' : 'vert'} />
              <KPI label="Accidents" value={accidentsAnnee} accent={accidentsAnnee > 0 ? 'orange' : 'vert'} />
            </div>
          }
        >
          <div className="flex gap-1.5 overflow-x-auto">
            <PillTab active={tab === 'obligations'} onClick={() => setTab('obligations')}>
              📋 Obligations <PillCount n={data.obligations.length} active={tab === 'obligations'} />
            </PillTab>
            <PillTab active={tab === 'affichages'} onClick={() => setTab('affichages')}>
              📌 Affichages {affMissing > 0 && <PillCount n={affMissing} active={tab === 'affichages'} />}
            </PillTab>
            <PillTab active={tab === 'accidents'} onClick={() => setTab('accidents')}>
              🩹 Accidents <PillCount n={data.accidents.length} active={tab === 'accidents'} />
            </PillTab>
            <PillTab active={tab === 'documents'} onClick={() => setTab('documents')}>
              📁 Documents <PillCount n={data.documents.length} active={tab === 'documents'} />
            </PillTab>
            <PillTab active={tab === 'registre'} onClick={() => setTab('registre')}>📜 Registre sécurité</PillTab>
          </div>
        </AdminPageHeader>

        {tab === 'obligations' && <ObligationsTab obligations={data.obligations} onError={flashKo} onOk={flashOk} />}
        {tab === 'affichages'  && <AffichagesTab affichages={data.affichages} onError={flashKo} onOk={flashOk} />}
        {tab === 'accidents'   && <AccidentsTab accidents={data.accidents} employes={data.employes} onError={flashKo} onOk={flashOk} />}
        {tab === 'documents'   && <DocumentsTab documents={data.documents} onError={flashKo} onOk={flashOk} />}
        {tab === 'registre'    && <RegistreTab data={data} />}
      </main>

      {erreur && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 cursor-pointer" onClick={() => setErreur('')}>⚠️ {erreur}</div>}
      {success && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">✓ {success}</div>}
    </div>
  )
}

function KPI({ label, value, accent = 'zinc' }: { label: string; value: number; accent?: 'zinc' | 'rouge' | 'orange' | 'vert' }) {
  const cls = {
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    rouge: 'bg-red-50 text-red-900 border-red-200',
    orange: 'bg-amber-50 text-amber-900 border-amber-200',
    vert: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center min-w-[80px]', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Obligations ───────────────────────────────────────────
function ObligationsTab({ obligations, onError, onOk }: { obligations: Obligation[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState<Obligation | true | null>(null)
  const [filtre, setFiltre] = useState<'toutes' | 'a_venir' | 'expirees' | 'fait'>('a_venir')
  const router = useRouter()

  const filtered = useMemo(() => {
    const bloquantDabord = (a: Obligation, b: Obligation) => {
      const pa = a.bloquant && a.statut !== 'fait' ? 0 : 1
      const pb = b.bloquant && b.statut !== 'fait' ? 0 : 1
      return pa - pb
    }
    return obligations.filter(o => {
      if (filtre === 'a_venir') return o.statut !== 'fait' && (!o.date_echeance || statutEcheance(o.date_echeance) !== 'expire')
      if (filtre === 'expirees') return o.statut !== 'fait' && o.date_echeance && statutEcheance(o.date_echeance) === 'expire'
      if (filtre === 'fait') return o.statut === 'fait'
      return true
    }).sort(bloquantDabord)
  }, [obligations, filtre])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <FiltreBtn active={filtre === 'a_venir'}  onClick={() => setFiltre('a_venir')}>À venir</FiltreBtn>
          <FiltreBtn active={filtre === 'expirees'} onClick={() => setFiltre('expirees')}>Expirées</FiltreBtn>
          <FiltreBtn active={filtre === 'fait'}     onClick={() => setFiltre('fait')}>Faites</FiltreBtn>
          <FiltreBtn active={filtre === 'toutes'}   onClick={() => setFiltre('toutes')}>Toutes ({obligations.length})</FiltreBtn>
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle obligation</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune obligation dans ce filtre.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {filtered.map(o => {
              const cat = (CATEGORIE_OBLIGATION_INFO[o.categorie as CategorieObligation]) ?? CATEGORIE_OBLIGATION_INFO.autre
              const sObl = STATUT_OBLIG_LABEL[o.statut]
              const sEch = statutEcheance(o.date_echeance)
              const styEch = STATUT_ECHEANCE_STYLE[sEch]
              const j = joursRestants(o.date_echeance)
              return (
                <li key={o.id} className={cn('px-4 py-3',
                  // Une bloquante non satisfaite se voit AVANT tout le reste,
                  // qu'elle ait une date ou non : sans date, c'est qu'elle
                  // n'est même pas engagée (0147).
                  o.bloquant && o.statut !== 'fait' && 'bg-red-50 border-l-4 border-l-red-600',
                  sEch === 'expire' && 'bg-red-50', sEch === 'critique' && 'bg-red-50', sEch === 'proche' && 'bg-amber-50')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', cat.cls)}>{cat.emoji} {cat.label}</span>
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', sObl.cls)}>{sObl.label}</span>
                        {o.date_echeance && (
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', styEch.cls)}>{styEch.label}</span>
                        )}
                        {o.bloquant && o.statut !== 'fait' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-600 text-white border-red-700">
                            ⛔ BLOQUE L&apos;OUVERTURE
                          </span>
                        )}
                        {o.bloquant && o.statut !== 'fait' && !o.date_echeance && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-white text-red-800 border-red-300">
                            aucune date — pas engagée
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-sm mt-1">{o.titre}</h3>
                      {o.description && <p className="text-xs text-zinc-600 mt-0.5">{o.description}</p>}
                      <p className="text-[11px] text-zinc-500 mt-1">
                        {o.date_echeance && <>📅 {fmtDate(o.date_echeance)}{j !== null && (j < 0 ? ` (il y a ${-j} j)` : ` (dans ${j} j)`)} · </>}
                        {o.frequence && <>🔄 {o.frequence} · </>}
                        {o.prestataire && <>👤 {o.prestataire}</>}
                      </p>
                      {o.notes && <p className="text-[11px] text-zinc-700 mt-1 whitespace-pre-line">{o.notes}</p>}
                      {o.document_url && <a href={o.document_url} target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:underline">📎 Document</a>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => setShowForm(o)} className="text-xs h-7 px-2 rounded border border-zinc-300 hover:bg-zinc-50 font-bold">✏️</button>
                      <button onClick={async () => {
                        if (!(await askConfirm(`Supprimer "${o.titre}" ?`))) return
                        try { await supprimerObligation(o.id); onOk('Supprimée'); router.refresh() } catch (e) { onError(e) }
                      }} className="text-xs h-7 px-2 text-zinc-400 hover:text-red-600">×</button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <ObligationModal obligation={showForm === true ? null : showForm}
          onClose={() => setShowForm(null)} onError={onError}
          onSuccess={(msg) => { setShowForm(null); onOk(msg) }} />
      )}
    </div>
  )
}

function ObligationModal({ obligation, onClose, onError, onSuccess }: { obligation: Obligation | null; onClose: () => void; onError: (e: unknown) => void; onSuccess: (msg: string) => void }) {
  const isEdit = !!obligation
  const [titre, setTitre] = useState(obligation?.titre ?? '')
  const [categorie, setCategorie] = useState<string>(obligation?.categorie ?? 'licence_iv')
  const [description, setDescription] = useState(obligation?.description ?? '')
  const [echeance, setEcheance] = useState(obligation?.date_echeance ?? '')
  const [frequence, setFrequence] = useState(obligation?.frequence ?? 'annuel')
  const [statut, setStatut] = useState<StatutObligation>(obligation?.statut ?? 'a_faire')
  const [prestataire, setPrestataire] = useState(obligation?.prestataire ?? '')
  const [docUrl, setDocUrl] = useState(obligation?.document_url ?? '')
  const [notes, setNotes] = useState(obligation?.notes ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!titre.trim()) { onError(new Error('Titre obligatoire')); return }
    startTransition(async () => {
      try {
        const payload = {
          titre: titre.trim(), categorie,
          description: description.trim() || null,
          date_echeance: echeance || null,
          frequence: frequence.trim() || null,
          statut,
          prestataire: prestataire.trim() || null,
          document_url: docUrl.trim() || null,
          notes: notes.trim() || null,
        }
        if (isEdit && obligation) await updateObligation({ ...payload, id: obligation.id })
        else await creerObligation(payload)
        onSuccess(isEdit ? 'Mise à jour' : 'Créée')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={isEdit ? `Modifier — ${obligation!.titre}` : 'Nouvelle obligation'} onClose={onClose} disabled={isPending}>
      <Field label="Titre"><input value={titre} onChange={e => setTitre(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Catégorie">
          <select value={categorie} onChange={e => setCategorie(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(CATEGORIE_OBLIGATION_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select value={statut} onChange={e => setStatut(e.target.value as StatutObligation)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(STATUT_OBLIG_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date d'échéance"><input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Fréquence (annuel, 5 ans, 10 ans...)"><input value={frequence} onChange={e => setFrequence(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Prestataire (optionnel)"><input value={prestataire} onChange={e => setPrestataire(e.target.value)} placeholder="MAIF, Mairie, CFE..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Description (optionnel)"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="URL document (optionnel)"><input value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://…" className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
      <Field label="Notes (optionnel)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel={isEdit ? '✓ Mettre à jour' : '+ Créer'} />
    </Modal>
  )
}

// ─── TAB 2 — Affichages ────────────────────────────────────────────
function AffichagesTab({ affichages, onError, onOk }: { affichages: Affichage[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Affichage | null>(null)
  const router = useRouter()

  const obligs = affichages.filter(a => a.obligatoire)
  const libres = affichages.filter(a => !a.obligatoire)
  const present = affichages.filter(a => a.present).length

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 flex justify-between items-center text-sm">
        <span><b>{present}</b> / {affichages.length} affichages confirmés en place</span>
        <button onClick={() => setShowForm(true)} className="min-h-[36px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Affichage personnalisé</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <header className="px-4 py-2 border-b border-zinc-200 bg-amber-50">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📌 Affichages obligatoires (réglementaires)</h2>
        </header>
        <ul className="divide-y divide-zinc-100">
          {obligs.map(a => (
            <AffichageRow key={a.id} a={a} onEdit={setEditing} onError={onError} onOk={onOk} router={router} />
          ))}
        </ul>
      </section>

      {libres.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <header className="px-4 py-2 border-b border-zinc-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📌 Affichages personnalisés</h2>
          </header>
          <ul className="divide-y divide-zinc-100">
            {libres.map(a => (
              <AffichageRow key={a.id} a={a} onEdit={setEditing} onError={onError} onOk={onOk} router={router} />
            ))}
          </ul>
        </section>
      )}

      {showForm && (
        <AffichageLibreModal onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Affichage ajouté') }} />
      )}
      {editing && (
        <AffichageEditModal a={editing} onClose={() => setEditing(null)} onError={onError}
          onSuccess={() => { setEditing(null); onOk('Affichage mis à jour') }} />
      )}
    </div>
  )
}

function AffichageRow({ a, onEdit, onError, onOk, router }: { a: Affichage; onEdit: (a: Affichage) => void; onError: (e: unknown) => void; onOk: (m: string) => void; router: ReturnType<typeof useRouter> }) {
  return (
    <li className={cn('px-4 py-3 flex items-start gap-3', a.present ? 'bg-emerald-50/40' : 'bg-red-50/30')}>
      <span className={cn('text-2xl', a.present ? 'text-emerald-600' : 'text-red-500')}>{a.present ? '✓' : '✗'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">{a.titre}</p>
        {a.description && <p className="text-xs text-zinc-600 mt-0.5">{a.description}</p>}
        {a.reference_legale && <p className="text-[10px] text-zinc-500 mt-0.5 italic">{a.reference_legale}</p>}
        {a.date_verification && <p className="text-[11px] text-emerald-700 mt-1">✓ Vérifié le {fmtDate(a.date_verification)}</p>}
        {a.photo_url && <a href={a.photo_url} target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:underline">📷 Photo</a>}
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => onEdit(a)} className="text-xs h-8 px-2 rounded border border-zinc-300 hover:bg-zinc-50 font-bold">✏️</button>
        {!a.obligatoire && (
          <button onClick={async () => {
            if (!(await askConfirm(`Supprimer "${a.titre}" ?`))) return
            try { await supprimerAffichage(a.id); onOk('Supprimé'); router.refresh() } catch (e) { onError(e) }
          }} className="text-xs h-7 px-2 text-zinc-400 hover:text-red-600">×</button>
        )}
      </div>
    </li>
  )
}

function AffichageEditModal({ a, onClose, onError, onSuccess }: { a: Affichage; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [present, setPresent] = useState(a.present)
  const [date, setDate] = useState(a.date_verification ?? new Date().toISOString().slice(0, 10))
  const [photoUrl, setPhotoUrl] = useState(a.photo_url ?? '')
  const [notes, setNotes] = useState(a.notes ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    startTransition(async () => {
      try {
        await verifierAffichage({ id: a.id, present, date_verification: present ? date : null, photo_url: photoUrl.trim() || null, notes: notes.trim() || null })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={`Vérifier — ${a.titre}`} onClose={onClose} disabled={isPending}>
      {a.description && <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">{a.description}</p>}
      {a.reference_legale && <p className="text-xs text-zinc-500 italic">{a.reference_legale}</p>}
      <div className="flex gap-2">
        <button onClick={() => setPresent(true)} className={cn('flex-1 min-h-[60px] rounded-md border-2 font-bold', present ? 'bg-emerald-100 border-emerald-500 text-emerald-900' : 'bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50')}>✓ En place</button>
        <button onClick={() => setPresent(false)} className={cn('flex-1 min-h-[60px] rounded-md border-2 font-bold', !present ? 'bg-red-100 border-red-500 text-red-900' : 'bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50')}>✗ Manquant</button>
      </div>
      {present && (
        <>
          <Field label="Date vérification"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          <Field label="URL photo (optionnel)"><input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://…" className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
        </>
      )}
      <Field label="Notes (optionnel)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Enregistrer" />
    </Modal>
  )
}

function AffichageLibreModal({ onClose, onError, onSuccess }: { onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [ref, setRef] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!titre.trim()) { onError(new Error('Titre obligatoire')); return }
    startTransition(async () => {
      try {
        await creerAffichageLibre({ titre: titre.trim(), description: description.trim() || null, reference_legale: ref.trim() || null, obligatoire: false, ordre: 99 })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvel affichage personnalisé" onClose={onClose} disabled={isPending}>
      <Field label="Titre"><input value={titre} onChange={e => setTitre(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="Référence légale (optionnel)"><input value={ref} onChange={e => setRef(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-xs" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Ajouter" />
    </Modal>
  )
}

// ─── TAB 3 — Accidents ─────────────────────────────────────────────
function AccidentsTab({ accidents, employes, onError, onOk }: { accidents: Accident[]; employes: { id: string; prenom: string; nom: string; poste: string }[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <b>📋 Obligation légale :</b> tout accident du travail (même bénin) doit être déclaré à la CPAM dans les 48h.
        Le registre des accidents doit être conservé 5 ans et présenté à toute demande de l&apos;inspection du travail.
      </div>
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvel accident</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {accidents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun accident enregistré. ✓</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {accidents.map(a => {
              const grav = GRAVITE_INFO[a.gravite]
              return (
                <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', grav.cls)}>{grav.label}</span>
                      <span className="text-sm font-bold">{a.employe_nom ?? '— Inconnu —'}</span>
                      <span className="text-[11px] text-zinc-500">{fmtDate(a.date_accident)}{a.heure_accident && ` à ${a.heure_accident.slice(0, 5)}`}</span>
                      {a.declaration_cpam ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-900 border-emerald-300">📨 CPAM déclarée</span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-100 text-red-900 border-red-300">⚠ CPAM non déclarée</span>
                      )}
                    </div>
                    <p className="text-sm mt-1">{a.description}</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {a.lieu && <>📍 {a.lieu} · </>}
                      {a.jours_arret > 0 && <>{a.jours_arret} j d&apos;arrêt · </>}
                      {a.temoin && <>👁 témoin : {a.temoin}</>}
                    </p>
                    {a.suites && <p className="text-xs italic text-zinc-600 mt-1">Suites : {a.suites}</p>}
                  </div>
                  <button onClick={async () => {
                    if (!(await askConfirm('Supprimer cet accident ? (Action irréversible)'))) return
                    try { await supprimerAccident(a.id); onOk('Supprimé'); router.refresh() } catch (e) { onError(e) }
                  }} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <AccidentModal employes={employes} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Accident enregistré') }} />
      )}
    </div>
  )
}

function AccidentModal({ employes, onClose, onError, onSuccess }: { employes: { id: string; prenom: string; nom: string }[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [empId, setEmpId] = useState(employes[0]?.id ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [heure, setHeure] = useState('')
  const [lieu, setLieu] = useState('')
  const [description, setDescription] = useState('')
  const [gravite, setGravite] = useState<Gravite>('legere')
  const [arret, setArret] = useState(0)
  const [cpam, setCpam] = useState(false)
  const [cpamDate, setCpamDate] = useState('')
  const [cpamUrl, setCpamUrl] = useState('')
  const [temoin, setTemoin] = useState('')
  const [suites, setSuites] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!description.trim()) { onError(new Error('Description obligatoire')); return }
    startTransition(async () => {
      try {
        await creerAccident({
          employe_id: empId || null,
          date_accident: date,
          heure_accident: heure || null,
          lieu: lieu.trim() || null,
          description: description.trim(),
          gravite, jours_arret: arret,
          declaration_cpam: cpam,
          declaration_cpam_date: cpamDate || null,
          declaration_cpam_url: cpamUrl.trim() || null,
          temoin: temoin.trim() || null,
          suites: suites.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvel accident du travail" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Employé concerné">
          <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Externe / inconnu —</option>
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </Field>
        <Field label="Gravité">
          <select value={gravite} onChange={e => setGravite(e.target.value as Gravite)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(GRAVITE_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Heure"><input type="time" value={heure} onChange={e => setHeure(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
        <Field label="Jours d'arrêt"><input type="number" min={0} value={arret} onChange={e => setArret(parseInt(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <Field label="Lieu de l'accident"><input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="Cuisine, plonge, escalier..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Description circonstanciée"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="Témoin (optionnel)"><input value={temoin} onChange={e => setTemoin(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <div className="border-t border-zinc-200 pt-3">
        <label className="flex items-center gap-2 mb-2 text-sm">
          <input type="checkbox" checked={cpam} onChange={e => setCpam(e.target.checked)} />
          <span>📨 Déclaré à la CPAM</span>
        </label>
        {cpam && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date déclaration"><input type="date" value={cpamDate} onChange={e => setCpamDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
            <Field label="URL document CPAM"><input value={cpamUrl} onChange={e => setCpamUrl(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
          </div>
        )}
      </div>
      <Field label="Suites données (optionnel)"><textarea value={suites} onChange={e => setSuites(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Enregistrer" />
    </Modal>
  )
}

// ─── TAB 4 — Registre sécurité ─────────────────────────────────────
function RegistreTab({ data }: { data: DataLegal }) {
  const annee = new Date().getFullYear()
  const accidentsAnnee = data.accidents.filter(a => a.date_accident.slice(0, 4) === String(annee))
  const obligsActives = data.obligations.filter(o => o.statut !== 'fait')
  const affMissing = data.affichages.filter(a => a.obligatoire && !a.present)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">Registre de sécurité légal — agrège accidents, obligations et affichages.</p>
        <Link href="/admin/legal/registre-securite/print" target="_blank" rel="noopener"
          className="min-h-[40px] px-3 inline-flex items-center rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">🖨 Vue imprimable</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BigStat label={`Accidents ${annee}`} value={accidentsAnnee.length} accent={accidentsAnnee.length > 0 ? 'rouge' : 'vert'} />
        <BigStat label="Obligations actives" value={obligsActives.length} />
        <BigStat label="Affichages à apposer" value={affMissing.length} accent={affMissing.length > 0 ? 'rouge' : 'vert'} />
      </div>

      {affMissing.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h3 className="font-bold text-red-900 mb-2">⚠ Affichages obligatoires manquants</h3>
          <ul className="text-sm space-y-0.5">
            {affMissing.map(a => <li key={a.id}>· {a.titre} <span className="text-[10px] text-red-700">({a.reference_legale})</span></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

function BigStat({ label, value, accent = 'zinc' }: { label: string; value: number; accent?: 'zinc' | 'rouge' | 'vert' }) {
  const cls = { zinc: 'bg-white border-zinc-200', rouge: 'bg-red-50 border-red-200', vert: 'bg-emerald-50 border-emerald-200' }[accent]
  return (
    <div className={cn('rounded-lg border p-4', cls)}>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-3xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  )
}

// ─── Helpers UI ─────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function FiltreBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      'px-3 h-9 rounded-full text-xs font-bold border whitespace-nowrap',
      active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
    )}>{children}</button>
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
      <button onClick={onValider} disabled={pending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{pending ? '…' : validLabel}</button>
    </div>
  )
}


// ─── TAB Documents — coffre des justificatifs de conformité ─────────
// Permis d'exploitation, attestations HACCP, rapports de contrôle,
// assurances… Catégorie en texte LIBRE (même philosophie que la
// traçabilité) ; upload en photo ou PDF via /api/conformite/documents.

function DocumentsTab({
  documents, onError, onOk,
}: {
  documents: import('./page').DocumentConformite[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [titre, setTitre] = useState('')
  const [categorie, setCategorie] = useState('')
  const [dateDocument, setDateDocument] = useState('')
  const [dateExpiration, setDateExpiration] = useState('')
  const [notes, setNotes] = useState('')
  const [fichier, setFichier] = useState<File | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const router = useRouter()

  const fmtTaille = (o: number | null) =>
    o == null ? '' : o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(o / 1024)} Ko`

  const etatExpiration = (d: string | null): 'expire' | 'proche' | null => {
    if (!d) return null
    const jours = Math.floor((new Date(d).getTime() - Date.now()) / 86400000)
    return jours < 0 ? 'expire' : jours <= 30 ? 'proche' : null
  }

  async function envoyer() {
    if (!titre.trim()) { onError(new Error('Titre obligatoire')); return }
    if (!fichier) { onError(new Error('Choisis un fichier (PDF ou photo)')); return }
    setEnvoi(true)
    try {
      const fd = new FormData()
      fd.set('fichier', fichier)
      fd.set('titre', titre.trim())
      fd.set('categorie', categorie.trim())
      fd.set('date_document', dateDocument)
      fd.set('date_expiration', dateExpiration)
      fd.set('notes', notes.trim())
      const r = await fetch('/api/conformite/documents', { method: 'POST', body: fd })
      const json = await r.json()
      if (!r.ok || !json.ok) throw new Error(json.error ?? `HTTP ${r.status}`)
      setShowForm(false)
      setTitre(''); setCategorie(''); setDateDocument(''); setDateExpiration(''); setNotes(''); setFichier(null)
      onOk('Document enregistré')
      router.refresh()
    } catch (e) { onError(e) } finally { setEnvoi(false) }
  }

  async function supprimer(d: import('./page').DocumentConformite) {
    if (!(await askConfirm({
      title: 'Supprimer ce document',
      message: `Supprimer définitivement « ${d.titre} » ? Le fichier sera effacé du stockage.`,
      confirmLabel: 'Supprimer', danger: true,
    }))) return
    try {
      const r = await fetch(`/api/conformite/documents?id=${d.id}`, { method: 'DELETE' })
      const json = await r.json()
      if (!r.ok || !json.ok) throw new Error(json.error ?? `HTTP ${r.status}`)
      onOk('Document supprimé')
      router.refresh()
    } catch (e) { onError(e) }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Documents de conformité</h2>
          <p className="text-xs text-zinc-500">Permis d&apos;exploitation, attestations HACCP, contrôles, assurances…</p>
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm shrink-0">
          + Ajouter
        </button>
      </header>

      <div className="divide-y divide-zinc-100">
        {documents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">
            Aucun document. Ajoute ici tes justificatifs officiels — ils seront toujours sous la main lors d&apos;un contrôle.
          </p>
        ) : documents.map(d => {
          const exp = etatExpiration(d.date_expiration)
          return (
            <article key={d.id} className={cn('px-4 py-3 flex items-start gap-3',
              exp === 'expire' && 'bg-red-50', exp === 'proche' && 'bg-amber-50')}>
              <span className="text-2xl shrink-0">{(d.fichier_nom ?? '').toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={d.fichier_url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                    {d.titre}
                  </a>
                  {d.categorie && <span className="text-[10px] font-bold uppercase tracking-wider bg-zinc-100 rounded px-1.5 py-0.5 text-zinc-600">{d.categorie}</span>}
                  {exp === 'expire' && <span className="text-[10px] font-bold text-red-700">⚠ EXPIRÉ</span>}
                  {exp === 'proche' && <span className="text-[10px] font-bold text-amber-700">⏳ expire bientôt</span>}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {[
                    d.date_document && `document du ${new Date(d.date_document).toLocaleDateString('fr-FR')}`,
                    d.date_expiration && `valide jusqu'au ${new Date(d.date_expiration).toLocaleDateString('fr-FR')}`,
                    fmtTaille(d.taille_octets),
                  ].filter(Boolean).join(' · ') || '—'}
                </p>
                {d.notes && <p className="text-xs text-zinc-600 mt-1">{d.notes}</p>}
              </div>
              <button onClick={() => supprimer(d)} aria-label={`Supprimer ${d.titre}`}
                className="min-h-[36px] w-9 rounded border border-zinc-200 text-zinc-400 hover:text-red-600 hover:border-red-300 shrink-0">🗑</button>
            </article>
          )
        })}
      </div>

      {showForm && (
        <Modal title="Ajouter un document" onClose={() => setShowForm(false)} disabled={envoi}>
          <Field label="Titre *">
            <input value={titre} onChange={e => setTitre(e.target.value)}
              placeholder="Ex : Permis d'exploitation 2026"
              className="w-full h-12 px-3 rounded-md border border-zinc-300" />
          </Field>
          <Field label="Catégorie (libre)">
            <input value={categorie} onChange={e => setCategorie(e.target.value)}
              placeholder="Ex : permis, HACCP, contrôle, assurance…" list="categories-conformite"
              className="w-full h-12 px-3 rounded-md border border-zinc-300" />
            <datalist id="categories-conformite">
              <option value="Permis d'exploitation" /><option value="Formation HACCP" />
              <option value="Contrôle officiel" /><option value="Assurance" />
              <option value="Licence" /><option value="Bail" />
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date du document">
              <input type="date" value={dateDocument} onChange={e => setDateDocument(e.target.value)}
                className="w-full h-12 px-3 rounded-md border border-zinc-300" />
            </Field>
            <Field label="Expire le (optionnel)">
              <input type="date" value={dateExpiration} onChange={e => setDateExpiration(e.target.value)}
                className="w-full h-12 px-3 rounded-md border border-zinc-300" />
            </Field>
          </div>
          <Field label="Fichier * (PDF ou photo, 15 Mo max)">
            <input type="file" accept="application/pdf,image/*"
              onChange={e => setFichier(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:mr-3 file:min-h-[40px] file:px-3 file:rounded-md file:border-0 file:bg-zinc-900 file:text-white file:font-bold" />
            {fichier && <p className="text-xs text-zinc-500 mt-1">{fichier.name} · {fmtTaille(fichier.size)}</p>}
          </Field>
          <Field label="Notes (optionnel)">
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full h-12 px-3 rounded-md border border-zinc-300" />
          </Field>
          <ModalActions onClose={() => setShowForm(false)} onValider={envoyer} pending={envoi} validLabel="⬆️ Enregistrer" />
        </Modal>
      )}
    </section>
  )
}
