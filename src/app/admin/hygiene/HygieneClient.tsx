'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { PillTab, PillCount } from '@/components/ui/PillTab'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import {
  type PlanHaccp, type Lot, type NonConformite, type Intervention3D,
  type PlanNettoyage, type ReleveTemperature, type ProcedureHygiene, type ChecklistHygiene,
  type Employe, type IngredientShort, type FournisseurShort,
  type TypeDanger, type StatutLot, type TypeNC, type Gravite,
  type TypeTraitement, type Frequence, type TypeEquipement, type Moment, type MomentProcedure,
  TYPE_DANGER_LABEL, STATUT_LOT_LABEL, alerteDLC,
  TYPE_NC_LABEL, GRAVITE_LABEL, STATUT_NC_LABEL,
  TYPE_TRAITEMENT_LABEL, FREQUENCE_LABEL,
  TYPE_EQUIPEMENT_LABEL, MOMENT_LABEL, MOMENT_PROC_LABEL,
} from './types'
import {
  creerReleveTemperature, validerCheckHygiene, creerProcedure,
  creerPlanHaccp, supprimerPlanHaccp,
  creerLot, changerStatutLot,
  creerNonConformite, resoudreNonConformite,
  creerIntervention3D,
  creerPlanNettoyage, marquerExecuteNettoyage, supprimerPlanNettoyage,
} from './actions'

type Tab = 'quotidien' | 'haccp' | 'lots' | 'registres'

import TachesDuJourWidget from '@/components/TachesDuJourWidget'
import type { PosteWidget } from '@/lib/taches-du-jour'

export default function HygieneClient(props: {
  employes: Employe[]
  ingredients: IngredientShort[]
  fournisseurs: FournisseurShort[]
  procedures: ProcedureHygiene[]
  checklistsToday: ChecklistHygiene[]
  releves: ReleveTemperature[]
  haccp: PlanHaccp[]
  lots: Lot[]
  ncs: NonConformite[]
  interventions: Intervention3D[]
  plansNettoyage: PlanNettoyage[]
  widgetPoste?: PosteWidget | null
}) {
  const [tab, setTab] = useState<Tab>('quotidien')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  // KPIs header
  const ncOuvertes = props.ncs.filter(n => n.statut !== 'resolue').length
  const lotsExpires = props.lots.filter(l => l.statut === 'en_stock' && alerteDLC(l.dlc) === 'critique').length
  const lotsProche = props.lots.filter(l => l.statut === 'en_stock' && alerteDLC(l.dlc) === 'proche').length
  const today = new Date().toISOString().slice(0, 10)
  const checklistsTodayCount = props.checklistsToday.length
  const proceduresJourCount = props.procedures.filter(p =>
    p.moment === 'ouverture' || p.moment === 'service' || p.moment === 'fermeture'
  ).length

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
          accent="red"
          subtitle="Conformité"
          title="Hygiène & HACCP"
          description="CCP, températures, lots et DLC, checklists, non-conformités."
          actions={
            <div className="flex flex-wrap gap-2 text-sm">
              <KpiBadge label="NC ouvertes" value={ncOuvertes} accent={ncOuvertes > 0 ? 'red' : 'zinc'} />
              <KpiBadge label="Lots expirés" value={lotsExpires} accent={lotsExpires > 0 ? 'red' : 'zinc'} />
              <KpiBadge label="DLC < 3j" value={lotsProche} accent={lotsProche > 0 ? 'amber' : 'zinc'} />
              <KpiBadge label="Checklists" value={`${checklistsTodayCount}/${proceduresJourCount}`} accent="zinc" />
            </div>
          }
        >
          <div className="flex gap-1.5 overflow-x-auto">
            <PillTab active={tab === 'quotidien'} onClick={() => setTab('quotidien')}>📅 Quotidien</PillTab>
            <PillTab active={tab === 'haccp'} onClick={() => setTab('haccp')}>🛡️ HACCP & nettoyage</PillTab>
            <PillTab active={tab === 'lots'} onClick={() => setTab('lots')}>
              🏷️ Traçabilité <PillCount n={props.lots.length} active={tab === 'lots'} />
            </PillTab>
            <PillTab active={tab === 'registres'} onClick={() => setTab('registres')}>
              📋 Registres <PillCount n={ncOuvertes + props.interventions.length} active={tab === 'registres'} />
            </PillTab>
          </div>
        </AdminPageHeader>

        {props.widgetPoste && <TachesDuJourWidget poste={props.widgetPoste} defaultOpen />}
        {tab === 'quotidien' && (
          <QuotidienTab
            employes={props.employes}
            procedures={props.procedures}
            checklistsToday={props.checklistsToday}
            releves={props.releves}
            today={today}
            onError={flashKo} onOk={flashOk}
          />
        )}
        {tab === 'haccp' && (
          <HaccpTab
            haccp={props.haccp}
            plansNettoyage={props.plansNettoyage}
            onError={flashKo} onOk={flashOk}
          />
        )}
        {tab === 'lots' && (
          <LotsTab
            lots={props.lots}
            ingredients={props.ingredients}
            fournisseurs={props.fournisseurs}
            onError={flashKo} onOk={flashOk}
          />
        )}
        {tab === 'registres' && (
          <RegistresTab
            ncs={props.ncs}
            interventions={props.interventions}
            employes={props.employes}
            onError={flashKo} onOk={flashOk}
          />
        )}
      </main>

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

function KpiBadge({ label, value, accent }: { label: string; value: number | string; accent: 'red' | 'amber' | 'zinc' }) {
  const cls = {
    red: 'bg-red-50 text-red-900 border-red-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center min-w-[80px]', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Quotidien ──────────────────────────────────────────────
function QuotidienTab({
  employes, procedures, checklistsToday, releves, today, onError, onOk,
}: {
  employes: Employe[]
  procedures: ProcedureHygiene[]
  checklistsToday: ChecklistHygiene[]
  releves: ReleveTemperature[]
  today: string
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showRelevForm, setShowRelevForm] = useState(false)
  const [showChecklistForm, setShowChecklistForm] = useState<ProcedureHygiene | null>(null)
  const [showProcForm, setShowProcForm] = useState(false)

  const checkedIds = new Set(checklistsToday.map(c => c.procedure_id))

  // Releves récents groupés par moment du jour
  const relevesToday = releves.filter(r => r.created_at.slice(0, 10) === today)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Colonne A : Températures */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Aujourd&apos;hui</p>
            <h2 className="text-lg font-bold">🌡️ Relevés température · {relevesToday.length}</h2>
          </div>
          <button onClick={() => setShowRelevForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau relevé</button>
        </header>
        <div className="divide-y divide-zinc-100 max-h-[60vh] overflow-y-auto">
          {relevesToday.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun relevé aujourd&apos;hui.</p>
          ) : relevesToday.map(r => {
            const sty = r.conforme === false ? 'bg-red-50' : r.conforme === true ? '' : 'bg-zinc-50'
            const eqInfo = r.type_equipement ? TYPE_EQUIPEMENT_LABEL[r.type_equipement] : null
            const moInfo = r.moment ? MOMENT_LABEL[r.moment] : null
            return (
              <div key={r.id} className={cn('px-4 py-2.5 flex items-center justify-between gap-3', sty)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold">{eqInfo?.emoji} {r.equipement}</span>
                    {moInfo && <span className="text-[10px] text-zinc-500">{moInfo.emoji} {moInfo.label}</span>}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {format(parseISO(r.created_at), 'HH:mm', { locale: fr })}
                    {r.employe_nom && ` · ${r.employe_nom}`}
                    {r.notes && ` · ${r.notes}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    'text-2xl font-bold tabular-nums',
                    r.conforme === false ? 'text-red-700' : r.conforme === true ? 'text-emerald-700' : 'text-zinc-700'
                  )}>
                    {r.temperature.toFixed(1)}°
                  </p>
                  {r.temperature_min_ok !== null && r.temperature_max_ok !== null && (
                    <p className="text-[9px] text-zinc-400">attendu {r.temperature_min_ok}…{r.temperature_max_ok}°</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Colonne B : Checklists du jour */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Aujourd&apos;hui</p>
            <h2 className="text-lg font-bold">✅ Checklists · {checklistsToday.length} validées</h2>
          </div>
          <button onClick={() => setShowProcForm(true)} className="min-h-[40px] px-3 rounded-md border border-zinc-300 bg-white text-sm font-bold hover:bg-zinc-50">+ Nouvelle procédure</button>
        </header>
        <div className="divide-y divide-zinc-100 max-h-[60vh] overflow-y-auto">
          {procedures.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune procédure définie. Créé en une avec « + Nouvelle procédure ».</p>
          ) : procedures.map(p => {
            const fait = checkedIds.has(p.id)
            const sty = MOMENT_PROC_LABEL[p.moment]
            const checks = checklistsToday.filter(c => c.procedure_id === p.id)
            return (
              <div key={p.id} className={cn('px-4 py-3', fait ? 'bg-emerald-50' : '')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', sty.cls)}>
                        {sty.emoji} {sty.label}
                      </span>
                      {p.poste_concerne && <span className="text-[10px] text-zinc-500">→ {p.poste_concerne}</span>}
                    </div>
                    <h3 className={cn('font-semibold text-sm mt-0.5', fait && 'line-through text-zinc-500')}>
                      {p.titre}
                    </h3>
                    {p.description && <p className="text-[11px] text-zinc-500 mt-0.5">{p.description}</p>}
                    {checks.length > 0 && (
                      <div className="mt-1 text-[10px] text-emerald-700">
                        {checks.map((c, i) => (
                          <span key={c.id}>
                            ✓ {c.signature_text} ({c.heure_realisation?.slice(0, 5)})
                            {i < checks.length - 1 ? ' · ' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowChecklistForm(p)}
                    className="shrink-0 min-h-[40px] px-3 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs"
                  >✓ Valider</button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {showRelevForm && (
        <RelevModal employes={employes} onClose={() => setShowRelevForm(false)} onError={onError}
          onSuccess={(msg) => { setShowRelevForm(false); onOk(msg) }} />
      )}
      {showChecklistForm && (
        <ChecklistModal employes={employes} procedure={showChecklistForm}
          onClose={() => setShowChecklistForm(null)} onError={onError}
          onSuccess={() => { setShowChecklistForm(null); onOk('Checklist validée') }} />
      )}
      {showProcForm && (
        <ProcedureModal onClose={() => setShowProcForm(false)} onError={onError}
          onSuccess={() => { setShowProcForm(false); onOk('Procédure créée') }} />
      )}
    </div>
  )
}

function RelevModal({
  employes, onClose, onError, onSuccess,
}: {
  employes: Employe[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: (msg: string) => void
}) {
  const [equipement, setEquipement] = useState('')
  const [type, setType] = useState<TypeEquipement | ''>('')
  const [temperature, setTemperature] = useState<number | ''>('')
  const [moment, setMoment] = useState<Moment>('matin')
  const [employeId, setEmployeId] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!equipement.trim()) { onError(new Error('Équipement obligatoire')); return }
    if (temperature === '') { onError(new Error('Température obligatoire')); return }
    startTransition(async () => {
      try {
        const r = await creerReleveTemperature({
          equipement: equipement.trim(),
          type_equipement: type || null,
          temperature: Number(temperature),
          moment, employe_id: employeId || null,
          notes: notes.trim() || null,
        })
        const msg = r.conforme === false
          ? `⚠ Hors plage — non-conformité créée (${r.nc_id?.slice(0, 8)})`
          : 'Relevé enregistré'
        onSuccess(msg)
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouveau relevé température" onClose={onClose} disabled={isPending}>
      <Field label="Équipement">
        <input value={equipement} onChange={e => setEquipement(e.target.value)}
          placeholder="Ex: Frigo cuisine 1, Congélateur principal…"
          className="w-full h-12 px-3 rounded-md border border-zinc-300" />
      </Field>
      <Field label="Type (active le calcul auto-conforme)">
        <select value={type} onChange={e => setType(e.target.value as TypeEquipement | '')}
          className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Pas de type / autre —</option>
          {(Object.keys(TYPE_EQUIPEMENT_LABEL) as TypeEquipement[]).map(t => {
            const i = TYPE_EQUIPEMENT_LABEL[t]
            return <option key={t} value={t}>{i.emoji} {i.label} ({i.tempMin}…{i.tempMax}°C)</option>
          })}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Température °C">
          <input type="number" step="0.1" value={temperature}
            onChange={e => setTemperature(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full h-14 px-3 rounded-md border border-zinc-300 text-2xl font-bold tabular-nums text-right" />
        </Field>
        <Field label="Moment">
          <select value={moment} onChange={e => setMoment(e.target.value as Moment)}
            className="w-full h-14 px-3 rounded-md border border-zinc-300 text-base font-bold">
            {(Object.keys(MOMENT_LABEL) as Moment[]).map(m => <option key={m} value={m}>{MOMENT_LABEL[m].emoji} {MOMENT_LABEL[m].label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Relevé par (optionnel)">
        <select value={employeId} onChange={e => setEmployeId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Anonyme —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </Field>
      <Field label="Notes (optionnel)">
        <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" />
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Enregistrer" />
    </Modal>
  )
}

function ChecklistModal({
  procedure, employes, onClose, onError, onSuccess,
}: {
  procedure: ProcedureHygiene
  employes: Employe[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [employeId, setEmployeId] = useState('')
  const [signature, setSignature] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    const sig = signature.trim() || (employes.find(e => e.id === employeId) ? `${employes.find(e => e.id === employeId)!.prenom} ${employes.find(e => e.id === employeId)!.nom}` : '')
    if (!sig) { onError(new Error('Signature obligatoire — saisis ton nom OU sélectionne un employé')); return }
    startTransition(async () => {
      try {
        await validerCheckHygiene({
          procedure_id: procedure.id,
          employe_id: employeId || null,
          signature_text: sig,
          commentaire: commentaire.trim() || null,
          valide: true,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={`Valider : ${procedure.titre}`} onClose={onClose} disabled={isPending}>
      {procedure.description && <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">{procedure.description}</p>}
      <Field label="Employé (optionnel)">
        <select value={employeId} onChange={e => setEmployeId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Anonyme —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </Field>
      <Field label="Signature (nom + nom de famille)">
        <input value={signature} onChange={e => setSignature(e.target.value)}
          placeholder="Si vide, prend le nom de l'employé sélectionné"
          className="w-full h-12 px-3 rounded-md border border-zinc-300 italic" />
      </Field>
      <Field label="Commentaire (optionnel)">
        <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" />
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Signer" />
    </Modal>
  )
}

function ProcedureModal({
  onClose, onError, onSuccess,
}: {
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [titre, setTitre] = useState('')
  const [moment, setMoment] = useState<MomentProcedure>('ouverture')
  const [poste, setPoste] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!titre.trim()) { onError(new Error('Titre obligatoire')); return }
    startTransition(async () => {
      try {
        await creerProcedure({ titre: titre.trim(), moment, poste_concerne: poste.trim() || null, description: description.trim() || null, ordre: 0 })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle procédure" onClose={onClose} disabled={isPending}>
      <Field label="Titre">
        <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex: Désinfecter les surfaces"
          className="w-full h-12 px-3 rounded-md border border-zinc-300" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Moment">
          <select value={moment} onChange={e => setMoment(e.target.value as MomentProcedure)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(MOMENT_PROC_LABEL) as MomentProcedure[]).map(m => <option key={m} value={m}>{MOMENT_PROC_LABEL[m].emoji} {MOMENT_PROC_LABEL[m].label}</option>)}
          </select>
        </Field>
        <Field label="Poste (optionnel)">
          <input value={poste} onChange={e => setPoste(e.target.value)} placeholder="cuisine, salle…"
            className="w-full h-12 px-3 rounded-md border border-zinc-300" />
        </Field>
      </div>
      <Field label="Description (optionnel)">
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" />
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Créer" />
    </Modal>
  )
}

// ─── TAB 2 — HACCP & nettoyage ──────────────────────────────────────
function HaccpTab({
  haccp, plansNettoyage, onError, onOk,
}: {
  haccp: PlanHaccp[]
  plansNettoyage: PlanNettoyage[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showHaccpForm, setShowHaccpForm] = useState(false)
  const [showNettForm, setShowNettForm] = useState(false)
  const router = useRouter()

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* HACCP */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Plan</p>
            <h2 className="text-lg font-bold">🛡️ HACCP · {haccp.length} dangers analysés</h2>
          </div>
          <button onClick={() => setShowHaccpForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau danger</button>
        </header>
        <div className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
          {haccp.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun plan HACCP. Crée le premier.</p>
          ) : haccp.map(h => {
            const sty = TYPE_DANGER_LABEL[h.type_danger]
            return (
              <article key={h.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', sty.cls)}>
                        {sty.emoji} {sty.label}
                      </span>
                      {h.ccp_numero != null && <span className="text-[10px] font-bold text-amber-700">CCP #{h.ccp_numero}</span>}
                      {h.responsable_poste && <span className="text-[10px] text-zinc-500">→ {h.responsable_poste}</span>}
                    </div>
                    <h3 className="font-bold text-sm mt-0.5">{h.titre}</h3>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm(`Désactiver "${h.titre}" ?`)) return
                      try { await supprimerPlanHaccp(h.id); onOk('Désactivé'); router.refresh() }
                      catch (e) { onError(e) }
                    }}
                    className="text-zinc-400 hover:text-red-600 text-sm">×</button>
                </div>
                <p className="text-xs"><b>Danger :</b> {h.description_danger}</p>
                <p className="text-xs"><b>Prévention :</b> {h.mesure_preventive}</p>
                {h.limite_critique && <p className="text-xs"><b>Limite critique :</b> {h.limite_critique}</p>}
                {h.surveillance_methode && <p className="text-xs"><b>Surveillance :</b> {h.surveillance_methode}{h.surveillance_frequence && ` (${h.surveillance_frequence})`}</p>}
                <p className="text-xs"><b>Action corrective :</b> {h.action_corrective}</p>
              </article>
            )
          })}
        </div>
      </section>

      {/* Plan nettoyage */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Plan</p>
            <h2 className="text-lg font-bold">🧹 Nettoyage · {plansNettoyage.length} entrées</h2>
          </div>
          <button onClick={() => setShowNettForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle entrée</button>
        </header>
        <div className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
          {plansNettoyage.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun plan de nettoyage défini.</p>
          ) : plansNettoyage.map(p => {
            const fInfo = FREQUENCE_LABEL[p.frequence]
            return (
              <article key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{fInfo.emoji} {fInfo.label}</span>
                      <span className="text-[10px] text-zinc-500">→ {p.zone}</span>
                    </div>
                    <h3 className="font-bold text-sm mt-0.5">{p.equipement || p.zone}</h3>
                    {(p.produit_utilise || p.methode) && (
                      <p className="text-xs text-zinc-600">
                        {p.produit_utilise && <>🧴 {p.produit_utilise} · </>}
                        {p.methode && <>{p.methode}</>}
                      </p>
                    )}
                    {p.derniere_execution && (
                      <p className="text-[10px] text-emerald-700">✓ dernière exécution : {fmtDate(p.derniere_execution)}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={async () => {
                        try { const r = await marquerExecuteNettoyage(p.id); onOk(`Marqué fait le ${r.date}`); router.refresh() }
                        catch (e) { onError(e) }
                      }}
                      className="text-xs px-2 h-8 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">✓ Fait</button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Désactiver "${p.zone}" ?`)) return
                        try { await supprimerPlanNettoyage(p.id); onOk('Désactivé'); router.refresh() }
                        catch (e) { onError(e) }
                      }}
                      className="text-xs px-2 h-7 text-zinc-400 hover:text-red-600">×</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {showHaccpForm && (
        <HaccpModal onClose={() => setShowHaccpForm(false)} onError={onError}
          onSuccess={() => { setShowHaccpForm(false); onOk('Plan HACCP créé') }} />
      )}
      {showNettForm && (
        <NettoyageModal onClose={() => setShowNettForm(false)} onError={onError}
          onSuccess={() => { setShowNettForm(false); onOk('Plan nettoyage créé') }} />
      )}
    </div>
  )
}

function HaccpModal({ onClose, onError, onSuccess }: { onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [titre, setTitre] = useState('')
  const [type, setType] = useState<TypeDanger>('biologique')
  const [danger, setDanger] = useState('')
  const [ccp, setCcp] = useState('')
  const [prevention, setPrevention] = useState('')
  const [methode, setMethode] = useState('')
  const [frequence, setFrequence] = useState('')
  const [limite, setLimite] = useState('')
  const [action, setAction] = useState('')
  const [poste, setPoste] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!titre.trim() || !danger.trim() || !prevention.trim() || !action.trim()) {
      onError(new Error('Titre, danger, prévention et action obligatoires')); return
    }
    startTransition(async () => {
      try {
        await creerPlanHaccp({
          titre: titre.trim(), type_danger: type, description_danger: danger.trim(),
          ccp_numero: ccp ? parseInt(ccp, 10) : null,
          mesure_preventive: prevention.trim(),
          surveillance_methode: methode.trim() || null,
          surveillance_frequence: frequence.trim() || null,
          limite_critique: limite.trim() || null,
          action_corrective: action.trim(),
          responsable_poste: poste.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouveau plan HACCP" onClose={onClose} disabled={isPending}>
      <Field label="Titre"><input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex: Cuisson viande hachée" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Type danger">
          <select value={type} onChange={e => setType(e.target.value as TypeDanger)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(TYPE_DANGER_LABEL) as TypeDanger[]).map(t => <option key={t} value={t}>{TYPE_DANGER_LABEL[t].emoji} {TYPE_DANGER_LABEL[t].label}</option>)}
          </select>
        </Field>
        <Field label="N° CCP (optionnel)"><input type="number" value={ccp} onChange={e => setCcp(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
        <Field label="Poste (optionnel)"><input value={poste} onChange={e => setPoste(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Description du danger"><textarea value={danger} onChange={e => setDanger(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <Field label="Mesure préventive"><textarea value={prevention} onChange={e => setPrevention(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Surveillance — méthode"><input value={methode} onChange={e => setMethode(e.target.value)} placeholder="Sonde, vue…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Surveillance — fréquence"><input value={frequence} onChange={e => setFrequence(e.target.value)} placeholder="2x/jour, à chaque cuisson…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Limite critique"><input value={limite} onChange={e => setLimite(e.target.value)} placeholder="Ex: cœur ≥ 70°C pendant 30s" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Action corrective"><textarea value={action} onChange={e => setAction(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Créer" />
    </Modal>
  )
}

function NettoyageModal({ onClose, onError, onSuccess }: { onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [zone, setZone] = useState('')
  const [equipement, setEquipement] = useState('')
  const [frequence, setFrequence] = useState<Frequence>('quotidien')
  const [produit, setProduit] = useState('')
  const [methode, setMethode] = useState('')
  const [poste, setPoste] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!zone.trim()) { onError(new Error('Zone obligatoire')); return }
    startTransition(async () => {
      try {
        await creerPlanNettoyage({ zone: zone.trim(), equipement: equipement.trim() || null, frequence,
          produit_utilise: produit.trim() || null, methode: methode.trim() || null,
          responsable_poste: poste.trim() || null, ordre: 0 })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle entrée plan nettoyage" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Zone"><input value={zone} onChange={e => setZone(e.target.value)} placeholder="Cuisine — Plonge" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Équipement (optionnel)"><input value={equipement} onChange={e => setEquipement(e.target.value)} placeholder="Lave-vaisselle" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fréquence">
          <select value={frequence} onChange={e => setFrequence(e.target.value as Frequence)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(FREQUENCE_LABEL) as Frequence[]).map(f => <option key={f} value={f}>{FREQUENCE_LABEL[f].emoji} {FREQUENCE_LABEL[f].label}</option>)}
          </select>
        </Field>
        <Field label="Poste (optionnel)"><input value={poste} onChange={e => setPoste(e.target.value)} placeholder="cuisine, salle…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Produit utilisé (optionnel)"><input value={produit} onChange={e => setProduit(e.target.value)} placeholder="Détergent dégraissant alimentaire" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Méthode (optionnel)"><textarea value={methode} onChange={e => setMethode(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Créer" />
    </Modal>
  )
}

// ─── TAB 3 — Lots ───────────────────────────────────────────────────
function LotsTab({
  lots, ingredients, fournisseurs, onError, onOk,
}: {
  lots: Lot[]
  ingredients: IngredientShort[]
  fournisseurs: FournisseurShort[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [filtre, setFiltre] = useState<'tous' | 'en_stock' | 'critique' | 'proche'>('en_stock')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  const filtered = useMemo(() => {
    let arr = lots
    if (filtre === 'en_stock') arr = arr.filter(l => l.statut === 'en_stock')
    else if (filtre === 'critique') arr = arr.filter(l => l.statut === 'en_stock' && alerteDLC(l.dlc) === 'critique')
    else if (filtre === 'proche')   arr = arr.filter(l => l.statut === 'en_stock' && alerteDLC(l.dlc) === 'proche')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      arr = arr.filter(l =>
        l.lot_numero.toLowerCase().includes(q)
        || (l.ingredient_nom ?? '').toLowerCase().includes(q)
        || (l.fournisseur_nom ?? '').toLowerCase().includes(q)
      )
    }
    return arr
  }, [lots, filtre, search])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          <FiltreBtn active={filtre === 'tous'}     onClick={() => setFiltre('tous')}>Tous ({lots.length})</FiltreBtn>
          <FiltreBtn active={filtre === 'en_stock'} onClick={() => setFiltre('en_stock')}>En stock ({lots.filter(l => l.statut === 'en_stock').length})</FiltreBtn>
          <FiltreBtn active={filtre === 'proche'}   onClick={() => setFiltre('proche')}>DLC ≤ 3j ({lots.filter(l => l.statut === 'en_stock' && alerteDLC(l.dlc) === 'proche').length})</FiltreBtn>
          <FiltreBtn active={filtre === 'critique'} onClick={() => setFiltre('critique')}>Expirés ({lots.filter(l => l.statut === 'en_stock' && alerteDLC(l.dlc) === 'critique').length})</FiltreBtn>
        </div>
        <div className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="N° lot, ingrédient, fournisseur…"
            className="h-10 px-3 rounded-md border border-zinc-300 text-sm w-64" />
          <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau lot</button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun lot.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-zinc-500 bg-zinc-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Lot</th>
                <th className="text-left px-3 py-2 font-medium">Ingrédient</th>
                <th className="text-right px-3 py-2 font-medium">Qté</th>
                <th className="text-left px-3 py-2 font-medium">DLC</th>
                <th className="text-left px-3 py-2 font-medium">Fournisseur</th>
                <th className="text-left px-3 py-2 font-medium">Reçu le</th>
                <th className="text-left px-3 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(l => {
                const a = alerteDLC(l.dlc)
                const sty = STATUT_LOT_LABEL[l.statut]
                return (
                  <tr key={l.id} className={cn(
                    a === 'critique' && l.statut === 'en_stock' && 'bg-red-50',
                    a === 'proche' && l.statut === 'en_stock' && 'bg-amber-50',
                  )}>
                    <td className="px-3 py-2 font-mono text-xs">{l.lot_numero}</td>
                    <td className="px-3 py-2">{l.ingredient_nom ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.quantite}{l.unite ? ` ${l.unite}` : ''}</td>
                    <td className="px-3 py-2">
                      {l.dlc ? (
                        <span className={cn(
                          'tabular-nums',
                          a === 'critique' && l.statut === 'en_stock' && 'font-bold text-red-700',
                          a === 'proche' && l.statut === 'en_stock' && 'font-bold text-amber-700',
                        )}>{fmtDate(l.dlc)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{l.fournisseur_nom ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-500">{fmtDate(l.date_reception)}</td>
                    <td className="px-3 py-2">
                      <select
                        value={l.statut}
                        onChange={async e => {
                          const newStatut = e.target.value as StatutLot
                          try { await changerStatutLot({ lot_id: l.id, statut: newStatut, notes: null }); onOk(`Statut → ${STATUT_LOT_LABEL[newStatut].label}`); router.refresh() }
                          catch (err) { onError(err) }
                        }}
                        className={cn('h-8 px-2 rounded border text-xs font-bold', sty.cls)}
                      >
                        {(Object.keys(STATUT_LOT_LABEL) as StatutLot[]).map(s => <option key={s} value={s}>{STATUT_LOT_LABEL[s].label}</option>)}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <LotModal ingredients={ingredients} fournisseurs={fournisseurs}
          onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Lot créé') }} />
      )}
    </div>
  )
}

function LotModal({
  ingredients, fournisseurs, onClose, onError, onSuccess,
}: {
  ingredients: IngredientShort[]
  fournisseurs: FournisseurShort[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [ingredientId, setIngredientId] = useState('')
  const [lotNumero, setLotNumero] = useState('')
  const [dlc, setDlc] = useState('')
  const [fournisseurId, setFournisseurId] = useState('')
  const [quantite, setQuantite] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const ing = ingredients.find(i => i.id === ingredientId)

  function valider() {
    if (!lotNumero.trim()) { onError(new Error('N° de lot obligatoire')); return }
    const f = fournisseurs.find(x => x.id === fournisseurId)
    startTransition(async () => {
      try {
        await creerLot({
          ingredient_id: ingredientId || null,
          lot_numero: lotNumero.trim(),
          dlc: dlc || null,
          fournisseur_id: fournisseurId || null,
          fournisseur_nom: f?.nom ?? null,
          quantite: quantite === '' ? 0 : Number(quantite),
          unite: ing?.unite ?? null,
          bon_commande_id: null,
          date_reception: new Date().toISOString().slice(0, 10),
          notes: notes.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouveau lot (saisie manuelle)" onClose={onClose} disabled={isPending}>
      <Field label="Ingrédient">
        <select value={ingredientId} onChange={e => setIngredientId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Aucun (libre) —</option>
          {ingredients.map(i => <option key={i.id} value={i.id}>{i.nom} ({i.unite})</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="N° de lot"><input value={lotNumero} onChange={e => setLotNumero(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono" /></Field>
        <Field label="DLC"><input type="date" value={dlc} onChange={e => setDlc(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fournisseur">
          <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Aucun —</option>
            {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </Field>
        <Field label={`Quantité${ing?.unite ? ` (${ing.unite})` : ''}`}><input type="number" step="0.001" value={quantite} onChange={e => setQuantite(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <Field label="Notes (optionnel)"><input value={notes} onChange={e => setNotes(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Créer le lot" />
    </Modal>
  )
}

// ─── TAB 4 — Registres ──────────────────────────────────────────────
function RegistresTab({
  ncs, interventions, employes, onError, onOk,
}: {
  ncs: NonConformite[]
  interventions: Intervention3D[]
  employes: Employe[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [sub, setSub] = useState<'nc' | '3d'>('nc')
  const [showNCForm, setShowNCForm] = useState(false)
  const [resolveNC, setResolveNC] = useState<NonConformite | null>(null)
  const [show3DForm, setShow3DForm] = useState(false)

  const ncOuvertes = ncs.filter(n => n.statut !== 'resolue')
  const ncResolues = ncs.filter(n => n.statut === 'resolue')

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <FiltreBtn active={sub === 'nc'} onClick={() => setSub('nc')}>⚠ Non-conformités ({ncOuvertes.length} ouvertes)</FiltreBtn>
        <FiltreBtn active={sub === '3d'} onClick={() => setSub('3d')}>🐀 Antiparasitaire (3D) ({interventions.length})</FiltreBtn>
      </div>

      {sub === 'nc' && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="text-base font-bold">Registre non-conformités</h2>
            <button onClick={() => setShowNCForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle NC</button>
          </header>
          <div className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
            {[...ncOuvertes, ...ncResolues].length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune non-conformité enregistrée.</p>
            ) : [...ncOuvertes, ...ncResolues].map(n => {
              const tInfo = TYPE_NC_LABEL[n.type]
              const gInfo = GRAVITE_LABEL[n.gravite]
              const sInfo = STATUT_NC_LABEL[n.statut]
              return (
                <article key={n.id} className={cn('px-4 py-3', n.statut === 'resolue' ? 'opacity-60' : '')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{tInfo.emoji} {tInfo.label}</span>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', gInfo.cls)}>{gInfo.label}</span>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                        <span className="text-[10px] text-zinc-500">{fmtDate(n.date_constat)}</span>
                      </div>
                      <p className="text-sm mt-1">{n.description}</p>
                      {n.action_corrective && <p className="text-xs mt-1"><b>Action :</b> {n.action_corrective}</p>}
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {n.responsable_nom && <>Responsable : {n.responsable_nom} · </>}
                        {n.resolved_at && n.resolved_by_nom && <>Résolu par {n.resolved_by_nom} le {format(parseISO(n.resolved_at), 'd MMM HH:mm', { locale: fr })}</>}
                      </p>
                    </div>
                    {n.statut !== 'resolue' && (
                      <button onClick={() => setResolveNC(n)} className="shrink-0 min-h-[36px] px-3 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs">✓ Résoudre</button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {sub === '3d' && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <header className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h2 className="text-base font-bold">Registre interventions antiparasitaires</h2>
            <button onClick={() => setShow3DForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle intervention</button>
          </header>
          <div className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
            {interventions.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune intervention enregistrée.</p>
            ) : interventions.map(i => {
              const tInfo = TYPE_TRAITEMENT_LABEL[i.type_traitement]
              return (
                <article key={i.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', tInfo.cls)}>{tInfo.label}</span>
                        <span className="text-sm font-bold">{i.prestataire}</span>
                        <span className="text-[10px] text-zinc-500">{fmtDate(i.date_intervention)}</span>
                        {i.cout != null && <span className="text-[10px] text-zinc-500 tabular-nums">· {i.cout.toFixed(2)} €</span>}
                      </div>
                      {i.zones.length > 0 && <p className="text-xs text-zinc-600">Zones : {i.zones.join(', ')}</p>}
                      {i.produits_utilises && <p className="text-xs text-zinc-600">Produits : {i.produits_utilises}</p>}
                      {i.observations && <p className="text-xs text-zinc-700 italic">« {i.observations} »</p>}
                      {i.prochaine_intervention && <p className="text-[11px] text-amber-700 mt-1">📅 Prochain passage : {fmtDate(i.prochaine_intervention)}</p>}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {showNCForm && (
        <NCModal employes={employes} onClose={() => setShowNCForm(false)} onError={onError}
          onSuccess={() => { setShowNCForm(false); onOk('Non-conformité créée') }} />
      )}
      {resolveNC && (
        <ResolveNCModal nc={resolveNC} employes={employes}
          onClose={() => setResolveNC(null)} onError={onError}
          onSuccess={() => { setResolveNC(null); onOk('Résolue') }} />
      )}
      {show3DForm && (
        <Intervention3DModal onClose={() => setShow3DForm(false)} onError={onError}
          onSuccess={() => { setShow3DForm(false); onOk('Intervention créée') }} />
      )}
    </div>
  )
}

function NCModal({
  employes, onClose, onError, onSuccess,
}: {
  employes: Employe[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<TypeNC>('hygiene')
  const [gravite, setGravite] = useState<Gravite>('mineure')
  const [description, setDescription] = useState('')
  const [action, setAction] = useState('')
  const [respId, setRespId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!description.trim()) { onError(new Error('Description obligatoire')); return }
    startTransition(async () => {
      try {
        await creerNonConformite({
          date_constat: date, type, gravite, description: description.trim(),
          action_corrective: action.trim() || null,
          responsable_id: respId || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle non-conformité" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date constat"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypeNC)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(TYPE_NC_LABEL) as TypeNC[]).map(t => <option key={t} value={t}>{TYPE_NC_LABEL[t].emoji} {TYPE_NC_LABEL[t].label}</option>)}
          </select>
        </Field>
        <Field label="Gravité">
          <select value={gravite} onChange={e => setGravite(e.target.value as Gravite)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(GRAVITE_LABEL) as Gravite[]).map(g => <option key={g} value={g}>{GRAVITE_LABEL[g].label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <Field label="Action corrective immédiate (optionnel)"><textarea value={action} onChange={e => setAction(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <Field label="Responsable (optionnel)">
        <select value={respId} onChange={e => setRespId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Aucun —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Enregistrer NC" />
    </Modal>
  )
}

function ResolveNCModal({
  nc, employes, onClose, onError, onSuccess,
}: {
  nc: NonConformite
  employes: Employe[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [action, setAction] = useState(nc.action_corrective ?? '')
  const [resolverId, setResolverId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!action.trim()) { onError(new Error('Action corrective obligatoire')); return }
    startTransition(async () => {
      try {
        await resoudreNonConformite({ nc_id: nc.id, action_corrective: action.trim(), resolved_by: resolverId || null })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Résoudre la non-conformité" onClose={onClose} disabled={isPending}>
      <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">
        <b>Constat ({fmtDate(nc.date_constat)}) :</b> {nc.description}
      </p>
      <Field label="Action corrective effectuée"><textarea value={action} onChange={e => setAction(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <Field label="Résolue par">
        <select value={resolverId} onChange={e => setResolverId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Aucun —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Marquer résolue" />
    </Modal>
  )
}

function Intervention3DModal({
  onClose, onError, onSuccess,
}: {
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [prestataire, setPrestataire] = useState('')
  const [type, setType] = useState<TypeTraitement>('controle')
  const [zones, setZones] = useState('')
  const [produits, setProduits] = useState('')
  const [observations, setObservations] = useState('')
  const [prochaine, setProchaine] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [cout, setCout] = useState<number | ''>('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!prestataire.trim()) { onError(new Error('Prestataire obligatoire')); return }
    startTransition(async () => {
      try {
        await creerIntervention3D({
          date_intervention: date,
          prestataire: prestataire.trim(),
          type_traitement: type,
          zones: zones.split(',').map(s => s.trim()).filter(Boolean),
          produits_utilises: produits.trim() || null,
          observations: observations.trim() || null,
          prochaine_intervention: prochaine || null,
          document_url: docUrl.trim() || null,
          cout: cout === '' ? null : Number(cout),
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle intervention 3D" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypeTraitement)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(TYPE_TRAITEMENT_LABEL) as TypeTraitement[]).map(t => <option key={t} value={t}>{TYPE_TRAITEMENT_LABEL[t].label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Prestataire"><input value={prestataire} onChange={e => setPrestataire(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Zones (séparées par virgule)"><input value={zones} onChange={e => setZones(e.target.value)} placeholder="cuisine, plonge, réserve sèche" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Produits utilisés (optionnel)"><input value={produits} onChange={e => setProduits(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Observations"><textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none" /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Prochain passage"><input type="date" value={prochaine} onChange={e => setProchaine(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Coût (€)"><input type="number" step="0.01" value={cout} onChange={e => setCout(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="URL document"><input value={docUrl} onChange={e => setDocUrl(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-xs" /></Field>
      </div>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Enregistrer" />
    </Modal>
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

function FiltreBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      'px-3 h-9 rounded-full text-xs font-bold border transition-colors whitespace-nowrap',
      active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
    )}>{children}</button>
  )
}

function fmtDate(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy', { locale: fr })
}
