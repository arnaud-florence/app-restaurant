'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { PillTab, PillCount } from '@/components/ui/PillTab'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import {
  type Employe, type Document, type Formation, type Shift, type Pointage, type Conge,
  type TypeDocument, type TypeFormation,
  POSTE_LABEL, CONTRAT_LABEL, TYPE_DOC_LABEL, TYPE_FORMATION_LABEL,
  TYPE_CONGE_LABEL, STATUT_CONGE_LABEL,
  fmtPrix, fmtHeures, fmtDate, heuresEntre, ratioMasseSalariale, statutMasseSalariale, heuresSup,
} from '@/lib/rh'
import {
  creerEmploye, updateEmploye, archiverEmploye, inviterEmploye,
  creerDocument, supprimerDocument,
  creerFormation, supprimerFormation,
  creerShift, supprimerShift,
  pointerArrivee, pointerDepart,
  demanderConge, validerConge, refuserConge, ajusterSoldeConges,
  setEmployePermissions, getEmployePermissions, setAutonomie, setPinEmploye,
} from './actions'
import { canAccess, isReadOnly } from '@/lib/permissions'
import { askConfirm } from '@/lib/confirm'
import type { DataRH } from './page'

type Tab = 'equipe' | 'planning' | 'conges' | 'paie' | 'registre'

export default function RhClient({ data }: { data: DataRH }) {
  const [tab, setTab] = useState<Tab>('equipe')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const ratio = ratioMasseSalariale(data.masseSalarialeMois, data.caTTCMois)
  const statutMS = statutMasseSalariale(ratio)
  const congesEnAttente = data.conges.filter(c => c.statut === 'demande').length

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
          accent="violet"
          subtitle="Équipe & formation"
          title="Ressources humaines"
          description="Fiches, planning, pointage, paie, pourboires, congés, registre légal."
          actions={
            <div className="hidden sm:flex flex-wrap gap-2 text-sm">
              <KPI label="Équipe" value={data.employes.filter(e => e.actif).length} />
              <KPI label="MS / CA" value={`${ratio.toFixed(1)}%`} accent={statutMS} />
              <KPI label="Congés" value={congesEnAttente} accent={congesEnAttente > 0 ? 'orange' : 'zinc'} />
            </div>
          }
        >
          <div className="flex gap-1.5 overflow-x-auto">
            <PillTab active={tab === 'equipe'} onClick={() => setTab('equipe')}>
              👥 Équipe <PillCount n={data.employes.filter(e => e.actif).length} active={tab === 'equipe'} />
            </PillTab>
            <PillTab active={tab === 'planning'} onClick={() => setTab('planning')}>📅 Planning & pointage</PillTab>
            <PillTab active={tab === 'conges'} onClick={() => setTab('conges')}>
              🏖️ Congés {congesEnAttente > 0 && <PillCount n={congesEnAttente} active={tab === 'conges'} />}
            </PillTab>
            <PillTab active={tab === 'paie'} onClick={() => setTab('paie')}>💰 Masse salariale & tips</PillTab>
            <PillTab active={tab === 'registre'} onClick={() => setTab('registre')}>📜 Registre</PillTab>
          </div>
        </AdminPageHeader>

        {tab === 'equipe'   && <EquipeTab data={data} onError={flashKo} onOk={flashOk} />}
        {tab === 'planning' && <PlanningTab data={data} onError={flashKo} onOk={flashOk} />}
        {tab === 'conges'   && <CongesTab data={data} onError={flashKo} onOk={flashOk} />}
        {tab === 'paie'     && <PaieTab data={data} ratio={ratio} statutMS={statutMS} />}
        {tab === 'registre' && <RegistreTab data={data} />}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: number | string; accent?: 'zinc' | 'orange' | 'rouge' | 'vert' }) {
  const cls = {
    zinc:   'bg-zinc-50 text-zinc-700 border-zinc-200',
    orange: 'bg-amber-50 text-amber-900 border-amber-200',
    rouge:  'bg-red-50 text-red-900 border-red-200',
    vert:   'bg-emerald-50 text-emerald-900 border-emerald-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center min-w-[80px]', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Équipe ────────────────────────────────────────────────
function EquipeTab({ data, onError, onOk }: { data: DataRH; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState<Employe | true | null>(null)  // true = new, Employe = edit
  const [openEmpId, setOpenEmpId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactifs, setShowInactifs] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.employes.filter(e => {
      if (!showInactifs && !e.actif) return false
      if (q && !`${e.prenom} ${e.nom}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [data.employes, search, showInactifs])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="h-10 px-3 rounded-md border border-zinc-300 text-sm w-64" />
          <label className="text-xs flex items-center gap-1.5">
            <input type="checkbox" checked={showInactifs} onChange={e => setShowInactifs(e.target.checked)} />
            Voir archivés
          </label>
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[44px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvel employé</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.length === 0 ? (
          <p className="col-span-full text-center py-8 text-zinc-400">Aucun employé.</p>
        ) : filtered.map(e => {
          const docs = data.documents.filter(d => d.employe_id === e.id)
          const forms = data.formations.filter(f => f.employe_id === e.id)
          const formExpiring = forms.filter(f => f.date_expiration && new Date(f.date_expiration) < new Date(Date.now() + 30 * 86400000))
          const isOpen = openEmpId === e.id
          const posteInfo = POSTE_LABEL[e.poste as keyof typeof POSTE_LABEL] ?? POSTE_LABEL.autre
          const contratInfo = CONTRAT_LABEL[e.type_contrat as keyof typeof CONTRAT_LABEL] ?? CONTRAT_LABEL.autre
          return (
            <article key={e.id} className={cn('rounded-lg border bg-white overflow-hidden', !e.actif && 'opacity-60')}>
              <header className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm truncate">{e.prenom} {e.nom}</h3>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', posteInfo.cls)}>{posteInfo.emoji} {posteInfo.label}</span>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', contratInfo.cls)}>{contratInfo.label}</span>
                    {!e.actif && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">Archivé</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {e.actif && e.email && (
                    <InviterButton
                      employe_id={e.id}
                      email={e.email}
                      prenom={e.prenom}
                      onError={onError}
                      onSuccess={onOk}
                    />
                  )}
                  {e.actif && (
                    <Link
                      href={`/admin/rh/contrat/${e.id}?type=${e.type_contrat ?? 'CDI'}`}
                      className="text-sm min-h-[44px] min-w-[44px] px-2 inline-flex items-center justify-center rounded border border-zinc-300 hover:bg-zinc-50 font-bold"
                      title="Générer contrat de travail"
                    >📄</Link>
                  )}
                  <button onClick={() => setShowForm(e)} className="text-sm min-h-[44px] min-w-[44px] px-2 inline-flex items-center justify-center rounded border border-zinc-300 hover:bg-zinc-50 font-bold" title="Modifier">✏️</button>
                </div>
              </header>
              <div className="px-3 py-2 text-xs text-zinc-600 space-y-0.5">
                {e.email && <p>📧 {e.email}</p>}
                {e.telephone && <p>📞 {e.telephone}</p>}
                <p className="tabular-nums">💶 {fmtPrix(e.salaire_horaire)}/h · {e.heures_contrat}h/sem</p>
                {e.date_embauche && <p>📅 Embauché le {fmtDate(e.date_embauche)}</p>}
                <p>🏖️ Solde congés : <b className="text-zinc-900 tabular-nums">{e.solde_conges_jours.toFixed(1)} j</b></p>
                {formExpiring.length > 0 && (
                  <p className="text-amber-700 font-bold">⚠ {formExpiring.length} formation{formExpiring.length > 1 ? 's' : ''} expire bientôt</p>
                )}
              </div>
              <button onClick={() => setOpenEmpId(isOpen ? null : e.id)}
                className="w-full min-h-[44px] px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 border-t border-zinc-100">
                {isOpen ? '▲ Fermer' : `▼ Documents (${docs.length}) · Formations (${forms.length})`}
              </button>
              {isOpen && (
                <DocsFormationsPanel employe={e} documents={docs} formations={forms} onError={onError} onOk={onOk} />
              )}
            </article>
          )
        })}
      </div>

      {showForm && (
        <EmployeModal employe={showForm === true ? null : showForm}
          onClose={() => setShowForm(null)} onError={onError}
          onSuccess={(msg) => { setShowForm(null); onOk(msg) }} />
      )}
    </div>
  )
}

function DocsFormationsPanel({
  employe, documents, formations, onError, onOk,
}: {
  employe: Employe
  documents: Document[]
  formations: Formation[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showDocForm, setShowDocForm] = useState(false)
  const [showFormForm, setShowFormForm] = useState(false)
  const router = useRouter()

  return (
    <div className="border-t border-zinc-100 bg-zinc-50 p-3 space-y-3">
      {/* Documents */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">📄 Documents ({documents.length})</h4>
          <button onClick={() => setShowDocForm(true)} className="text-xs min-h-[44px] px-3 rounded border border-zinc-300 hover:bg-white font-bold">+ Ajouter</button>
        </div>
        {documents.length === 0 ? (
          <p className="text-[11px] text-zinc-400 italic">Aucun document.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map(d => {
              const info = TYPE_DOC_LABEL[d.type]
              const expired = d.date_expiration && new Date(d.date_expiration) < new Date()
              return (
                <li key={d.id} className={cn('flex items-center justify-between gap-2 bg-white rounded border px-2 py-1.5 text-xs', expired && 'border-red-300 bg-red-50')}>
                  <div className="min-w-0 flex-1">
                    <p><span className="opacity-60">{info.emoji}</span> <a href={d.url} target="_blank" rel="noopener" className="font-semibold text-blue-600 hover:underline">{d.nom}</a></p>
                    {d.date_expiration && (
                      <p className={cn('text-[10px]', expired ? 'text-red-700 font-bold' : 'text-zinc-500')}>
                        {expired ? '⚠ Expiré' : 'Expire'} le {fmtDate(d.date_expiration)}
                      </p>
                    )}
                  </div>
                  <button onClick={async () => {
                    if (!(await askConfirm({ title: 'Supprimer le document', message: `Supprimer "${d.nom}" ?`, confirmLabel: 'Supprimer', danger: true }))) return
                    try { await supprimerDocument(d.id); onOk('Supprimé'); router.refresh() } catch (e) { onError(e) }
                  }} className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-zinc-400 hover:text-red-600 text-sm">×</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Formations */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">🎓 Formations ({formations.length})</h4>
          <button onClick={() => setShowFormForm(true)} className="text-xs min-h-[44px] px-3 rounded border border-zinc-300 hover:bg-white font-bold">+ Ajouter</button>
        </div>
        {formations.length === 0 ? (
          <p className="text-[11px] text-zinc-400 italic">Aucune formation enregistrée.</p>
        ) : (
          <ul className="space-y-1">
            {formations.map(f => {
              const info = TYPE_FORMATION_LABEL[f.formation]
              const expiringBientot = f.date_expiration && new Date(f.date_expiration) < new Date(Date.now() + 30 * 86400000)
              return (
                <li key={f.id} className={cn('flex items-center justify-between gap-2 bg-white rounded border px-2 py-1.5 text-xs', expiringBientot && 'border-amber-300 bg-amber-50')}>
                  <div className="min-w-0 flex-1">
                    <p><span>{info.emoji}</span> <b>{f.titre}</b> {info.obligatoire && <span className="text-[9px] bg-red-600 text-white px-1 rounded">OBLIGATOIRE</span>}</p>
                    <p className="text-[10px] text-zinc-500">
                      {f.organisme && <>{f.organisme} · </>}obtenue {fmtDate(f.date_obtention)}
                      {f.date_expiration && <> · expire {fmtDate(f.date_expiration)}</>}
                    </p>
                  </div>
                  <button onClick={async () => {
                    if (!(await askConfirm({ title: 'Supprimer la formation', message: `Supprimer "${f.titre}" ?`, confirmLabel: 'Supprimer', danger: true }))) return
                    try { await supprimerFormation(f.id); onOk('Supprimée'); router.refresh() } catch (e) { onError(e) }
                  }} className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-zinc-400 hover:text-red-600 text-sm">×</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showDocForm && (
        <DocumentModal employe_id={employe.id} onClose={() => setShowDocForm(false)} onError={onError}
          onSuccess={() => { setShowDocForm(false); onOk('Document ajouté') }} />
      )}
      {showFormForm && (
        <FormationModal employe_id={employe.id} onClose={() => setShowFormForm(false)} onError={onError}
          onSuccess={() => { setShowFormForm(false); onOk('Formation ajoutée') }} />
      )}
    </div>
  )
}

// ─── TAB 2 — Planning & pointage ───────────────────────────────────
function PlanningTab({ data, onError, onOk }: { data: DataRH; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showShift, setShowShift] = useState<{ employe_id: string; date: string } | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const t = new Date().toISOString().slice(0, 10)
    return data.joursSemaine.some(j => j.iso === t) ? t : (data.joursSemaine[0]?.iso ?? t)
  })

  const employesActifs = data.employes.filter(e => e.actif)

  const totalHeures = data.shiftsSemaine.reduce((s, sh) => s + sh.heures, 0)
  const totalCout = data.shiftsSemaine.reduce((s, sh) => s + sh.cout, 0)

  return (
    <div className="space-y-4">
      {/* Grille planning semaine — desktop/tablette uniquement */}
      <section className="hidden md:block rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <header className="px-4 py-2 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📅 Planning de la semaine</h2>
          <div className="text-xs text-zinc-600 tabular-nums">
            <b>{fmtHeures(totalHeures)}</b> · <b>{fmtPrix(totalCout)}</b>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="text-left px-2 py-1.5 font-bold sticky left-0 bg-zinc-50">Employé</th>
                {data.joursSemaine.map(j => (
                  <th key={j.iso} className="text-left px-2 py-1.5 font-bold capitalize">{j.label}</th>
                ))}
                <th className="text-right px-2 py-1.5 font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {employesActifs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-zinc-400">Aucun employé actif.</td></tr>
              ) : employesActifs.map(e => {
                const shifts = data.shiftsSemaine.filter(s => s.employe_id === e.id)
                const totalEmp = shifts.reduce((s, sh) => s + sh.heures, 0)
                const sup = heuresSup(totalEmp, e.heures_contrat)
                return (
                  <tr key={e.id}>
                    <td className="px-2 py-1.5 font-bold sticky left-0 bg-white">
                      {e.prenom} {e.nom.charAt(0)}.<br />
                      <span className="text-[10px] text-zinc-500 font-normal tabular-nums">{e.heures_contrat}h/sem · {fmtPrix(e.salaire_horaire)}/h</span>
                    </td>
                    {data.joursSemaine.map(j => {
                      const dayShifts = shifts.filter(s => s.date_travail === j.iso)
                      return (
                        <td key={j.iso} className="px-1 py-1 align-top">
                          <div className="space-y-1">
                            {dayShifts.map(s => (
                              <ShiftCard key={s.id} shift={s} onError={onError} onOk={onOk} />
                            ))}
                            <button
                              onClick={() => setShowShift({ employe_id: e.id, date: j.iso })}
                              className="w-full h-6 rounded border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-700 text-[10px]">
                              + shift
                            </button>
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <b>{fmtHeures(totalEmp)}</b>
                      {sup > 0 && <p className="text-[10px] text-amber-700 font-bold">+{fmtHeures(sup)} sup.</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mobile : vue par jour (la grille hebdo est illisible au doigt) */}
      <section className="md:hidden rounded-lg border border-zinc-200 bg-white p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📅 Planning — par jour</h2>
          <span className="text-xs text-zinc-600 tabular-nums"><b>{fmtHeures(totalHeures)}</b> · <b>{fmtPrix(totalCout)}</b></span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {data.joursSemaine.map(j => (
            <button
              key={j.iso}
              onClick={() => setSelectedDay(j.iso)}
              className={cn('shrink-0 min-h-[44px] px-3 rounded-full text-xs font-bold border capitalize',
                selectedDay === j.iso ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300')}
            >
              {j.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {employesActifs.length === 0 ? (
            <p className="text-center py-6 text-zinc-400 text-sm">Aucun employé actif.</p>
          ) : employesActifs.map(e => {
            const dayShifts = data.shiftsSemaine.filter(s => s.employe_id === e.id && s.date_travail === selectedDay)
            return (
              <div key={e.id} className="rounded-lg border border-zinc-200 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm">{e.prenom} {e.nom.charAt(0)}.</span>
                  <span className="text-[11px] text-zinc-500 tabular-nums">{e.heures_contrat}h/sem · {fmtPrix(e.salaire_horaire)}/h</span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {dayShifts.map(s => <ShiftCard key={s.id} shift={s} onError={onError} onOk={onOk} />)}
                  <button
                    onClick={() => setShowShift({ employe_id: e.id, date: selectedDay })}
                    className="w-full min-h-[44px] rounded-md border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-500 hover:text-zinc-700 text-xs font-bold"
                  >
                    + Ajouter un shift
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Pointage */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">⏰ Pointage du jour</h2>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3">
          {employesActifs.map(e => {
            const pt = data.pointagesJour.find(p => p.employe_id === e.id)
            return (
              <PointageCard key={e.id} employe={e} pointage={pt ?? null} onError={onError} onOk={onOk} />
            )
          })}
        </div>
      </section>

      {showShift && (
        <ShiftModal employes={employesActifs} init={showShift} onClose={() => setShowShift(null)} onError={onError}
          onSuccess={() => { setShowShift(null); onOk('Shift créé') }} />
      )}
    </div>
  )
}

function ShiftCard({ shift, onError, onOk }: { shift: Shift; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const router = useRouter()
  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-1.5 text-[11px] flex items-center justify-between gap-1">
      <div className="min-w-0">
        <p className="font-bold tabular-nums">{shift.heure_debut.slice(0, 5)}–{shift.heure_fin.slice(0, 5)}</p>
        {shift.poste_jour && <p className="opacity-70 truncate">{shift.poste_jour}</p>}
      </div>
      <button aria-label="Supprimer le shift" onClick={async () => {
        if (!(await askConfirm({ title: 'Supprimer le shift', message: 'Supprimer ce shift ?', confirmLabel: 'Supprimer', danger: true }))) return
        try { await supprimerShift(shift.id); onOk('Supprimé'); router.refresh() } catch (e) { onError(e) }
      }} className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-zinc-400 hover:text-red-600 hover:bg-red-50">×</button>
    </div>
  )
}

function PointageCard({ employe, pointage, onError, onOk }: { employe: Employe; pointage: Pointage | null; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isArrived = !!pointage?.heure_arrivee && !pointage?.heure_depart
  const isFinished = !!pointage?.heure_depart

  return (
    <div className={cn(
      'rounded border-2 p-2 text-xs',
      isArrived ? 'border-emerald-300 bg-emerald-50' : isFinished ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-200 bg-white'
    )}>
      <p className="font-bold text-sm">{employe.prenom} {employe.nom.charAt(0)}.</p>
      {pointage?.heure_arrivee && <p className="text-[10px] text-zinc-600">↗ {pointage.heure_arrivee.slice(0, 5)}</p>}
      {pointage?.heure_depart && <p className="text-[10px] text-zinc-600">↙ {pointage.heure_depart.slice(0, 5)} · {pointage.heures_travaillees?.toFixed(1)}h</p>}
      <button onClick={() => {
        startTransition(async () => {
          try {
            if (isFinished) return
            if (isArrived) { const r = await pointerDepart(employe.id); onOk(`Départ ${r.heure_depart.slice(0, 5)} · ${r.heures_travaillees}h`) }
            else { const r = await pointerArrivee(employe.id); onOk(`Arrivée ${r.heure_arrivee.slice(0, 5)}`) }
            router.refresh()
          } catch (e) { onError(e) }
        })
      }}
        disabled={isPending || isFinished}
        className={cn(
          'mt-1.5 w-full min-h-[44px] rounded text-sm font-bold',
          isFinished ? 'bg-zinc-200 text-zinc-500'
            : isArrived ? 'bg-amber-500 hover:bg-amber-400 text-white'
            : 'bg-emerald-500 hover:bg-emerald-400 text-white'
        )}>
        {isFinished ? '✓ Terminé' : isArrived ? '↙ Pointer départ' : '↗ Pointer arrivée'}
      </button>
    </div>
  )
}

// ─── TAB 3 — Congés ────────────────────────────────────────────────
function CongesTab({ data, onError, onOk }: { data: DataRH; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [filtre, setFiltre] = useState<'tous' | 'demande' | 'valide' | 'refuse'>('demande')
  const [editSolde, setEditSolde] = useState<Employe | null>(null)
  const router = useRouter()

  const filtered = filtre === 'tous' ? data.conges : data.conges.filter(c => c.statut === filtre)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* Demandes */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🏖️ Demandes ({filtered.length})</h2>
          <div className="flex flex-wrap gap-1.5">
            {(['demande','valide','refuse','tous'] as const).map(f => (
              <button key={f} onClick={() => setFiltre(f)} className={cn(
                'px-3 min-h-[44px] rounded text-xs font-bold border',
                filtre === f ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300'
              )}>{f === 'demande' ? 'En attente' : f === 'valide' ? 'Validés' : f === 'refuse' ? 'Refusés' : 'Tous'}</button>
            ))}
            <button onClick={() => setShowForm(true)} className="ml-2 min-h-[44px] px-3 rounded bg-zinc-900 text-white text-sm font-bold">+ Demande</button>
          </div>
        </header>
        <div className="divide-y divide-zinc-100">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune demande.</p>
          ) : filtered.map(c => {
            const tInfo = TYPE_CONGE_LABEL[c.type]
            const sInfo = STATUT_CONGE_LABEL[c.statut]
            return (
              <article key={c.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{c.employe_nom}</p>
                  <p className="text-xs text-zinc-600">
                    {tInfo.emoji} {tInfo.label} · du <b>{fmtDate(c.date_debut)}</b> au <b>{fmtDate(c.date_fin)}</b>
                    <span className="ml-2 tabular-nums">({c.jours} j)</span>
                  </p>
                  {c.notes && <p className="text-[11px] italic text-zinc-500 mt-0.5">« {c.notes} »</p>}
                </div>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                {c.statut === 'demande' && (
                  <div className="flex gap-1">
                    <button onClick={async () => { try { await validerConge(c.id); onOk('Validé'); router.refresh() } catch (e) { onError(e) } }}
                      className="text-sm min-h-[44px] min-w-[44px] px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">✓</button>
                    <button onClick={async () => { try { await refuserConge(c.id); onOk('Refusé'); router.refresh() } catch (e) { onError(e) } }}
                      className="text-sm min-h-[44px] min-w-[44px] px-3 rounded bg-red-500 hover:bg-red-400 text-white font-bold">✕</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {/* Soldes */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">💼 Soldes congés</h2>
        </header>
        <ul className="divide-y divide-zinc-100">
          {data.employes.filter(e => e.actif).map(e => (
            <li key={e.id} className="px-4 py-2 flex items-center justify-between text-sm">
              <span>{e.prenom} {e.nom.charAt(0)}.</span>
              <button onClick={() => setEditSolde(e)}
                className="font-bold tabular-nums text-emerald-700 hover:underline">
                {e.solde_conges_jours.toFixed(1)} j
              </button>
            </li>
          ))}
        </ul>
      </section>

      {showForm && (
        <CongeModal employes={data.employes.filter(e => e.actif)} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Demande créée') }} />
      )}
      {editSolde && (
        <SoldeModal employe={editSolde} onClose={() => setEditSolde(null)} onError={onError}
          onSuccess={() => { setEditSolde(null); onOk('Solde mis à jour') }} />
      )}
    </div>
  )
}

// ─── TAB 4 — Paie & pourboires ─────────────────────────────────────
function PaieTab({ data, ratio, statutMS }: { data: DataRH; ratio: number; statutMS: 'vert' | 'orange' | 'rouge' }) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BigStat label="Masse salariale du mois" value={fmtPrix(data.masseSalarialeMois)} />
        <BigStat label="CA TTC du mois" value={fmtPrix(data.caTTCMois)} />
        <BigStat label="Ratio MS / CA" value={`${ratio.toFixed(1)} %`} accent={statutMS === 'rouge' ? 'red' : statutMS === 'orange' ? 'amber' : 'emerald'}
          subtitle={statutMS === 'rouge' ? '🚨 Au-delà de 35% — réduire les heures' : statutMS === 'orange' ? '⚠ Proche du seuil 35%' : '✓ Sain'} />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">💰 Productivité & pourboires par serveur (mois courant)</h2>
        </header>
        {data.productivite.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun encaissement enregistré ce mois.</p>
        ) : (
          <>
          {/* Mobile : 1 card par serveur */}
          <ul className="md:hidden divide-y divide-zinc-100">
            {data.productivite.map(p => (
              <li key={p.serveur_id ?? '__none__'} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">{p.serveur_nom}</span>
                  <span className="tabular-nums font-bold">{fmtPrix(p.ca_genere)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 tabular-nums">
                  <span>{p.heures_pointees > 0 ? fmtHeures(p.heures_pointees) : '—'} pointées</span>
                  <span>· {p.ca_par_heure > 0 ? fmtPrix(p.ca_par_heure) + '/h' : '—'}</span>
                  {p.pourboires > 0 && <span className="text-emerald-700 font-bold">· 💶 {fmtPrix(p.pourboires)}</span>}
                </div>
              </li>
            ))}
            <li className="p-3 bg-zinc-50 flex items-center justify-between font-bold border-t-2 border-zinc-900">
              <span>TOTAL</span>
              <span className="tabular-nums">{fmtPrix(data.productivite.reduce((s, p) => s + p.ca_genere, 0))} · 💶 {fmtPrix(data.pourboiresMois)}</span>
            </li>
          </ul>

          {/* Desktop/tablette : table complète */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Serveur</th>
                <th className="text-right px-3 py-1.5">CA généré</th>
                <th className="text-right px-3 py-1.5">Heures pointées</th>
                <th className="text-right px-3 py-1.5">CA / heure</th>
                <th className="text-right px-3 py-1.5">Pourboires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.productivite.map(p => (
                <tr key={p.serveur_id ?? '__none__'}>
                  <td className="px-3 py-2 font-semibold">{p.serveur_nom}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtPrix(p.ca_genere)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{p.heures_pointees > 0 ? fmtHeures(p.heures_pointees) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.ca_par_heure > 0 ? fmtPrix(p.ca_par_heure) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-bold">{p.pourboires > 0 ? fmtPrix(p.pourboires) : '—'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-900 font-bold bg-zinc-50">
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPrix(data.productivite.reduce((s, p) => s + p.ca_genere, 0))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtHeures(data.productivite.reduce((s, p) => s + p.heures_pointees, 0))}</td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtPrix(data.pourboiresMois)}</td>
              </tr>
            </tbody>
          </table>
          </div>
          </>
        )}
      </section>
    </div>
  )
}

function BigStat({ label, value, subtitle, accent = 'zinc' }: { label: string; value: string; subtitle?: string; accent?: 'zinc' | 'red' | 'amber' | 'emerald' }) {
  const cls = {
    zinc:    'bg-white border-zinc-200',
    red:     'bg-red-50 border-red-200',
    amber:   'bg-amber-50 border-amber-200',
    emerald: 'bg-emerald-50 border-emerald-200',
  }[accent]
  return (
    <div className={cn('rounded-lg border p-4', cls)}>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-3xl font-bold tabular-nums mt-1">{value}</p>
      {subtitle && <p className="text-[11px] mt-1">{subtitle}</p>}
    </div>
  )
}

// ─── TAB 5 — Registre légal ────────────────────────────────────────
function RegistreTab({ data }: { data: DataRH }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">Registre du personnel obligatoire (Art. L1221-13 du Code du travail).</p>
        <Link href="/admin/rh/registre/print" target="_blank" rel="noopener"
          className="min-h-[44px] px-3 inline-flex items-center rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">🖨 Vue imprimable</Link>
      </div>
      {/* Mobile : 1 carte par employé (la table 7 colonnes déborde) */}
      <ul className="md:hidden rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        {data.employes.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-zinc-400">Aucun employé.</li>
        ) : data.employes.map(e => (
          <li key={e.id} className={cn('py-3 px-3 flex items-start justify-between gap-3', !e.actif && 'opacity-60')}>
            <div className="min-w-0">
              <p className="font-semibold text-zinc-900 truncate">{e.nom.toUpperCase()} {e.prenom}</p>
              <p className="text-xs text-zinc-500">{e.poste} · {e.type_contrat}</p>
              <p className="text-xs text-zinc-500 tabular-nums mt-0.5">
                Embauche {e.date_embauche ? fmtDate(e.date_embauche) : '—'}
                {e.date_sortie && <> · Sortie {fmtDate(e.date_sortie)}</>}
              </p>
            </div>
            <div className="text-right shrink-0 tabular-nums">
              <p className="font-bold text-zinc-900">{e.heures_contrat}h/sem</p>
              <p className="text-xs text-zinc-500">{fmtPrix(e.salaire_horaire)}/h</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-3 py-1.5">Nom Prénom</th>
              <th className="text-left px-3 py-1.5">Poste</th>
              <th className="text-left px-3 py-1.5">Contrat</th>
              <th className="text-left px-3 py-1.5">Embauche</th>
              <th className="text-left px-3 py-1.5">Sortie</th>
              <th className="text-right px-3 py-1.5">H/sem</th>
              <th className="text-right px-3 py-1.5">€/h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.employes.map(e => (
              <tr key={e.id} className={cn(!e.actif && 'opacity-60')}>
                <td className="px-3 py-2 font-semibold">{e.nom.toUpperCase()} {e.prenom}</td>
                <td className="px-3 py-2 text-zinc-600">{e.poste}</td>
                <td className="px-3 py-2 text-zinc-600">{e.type_contrat}</td>
                <td className="px-3 py-2 tabular-nums">{e.date_embauche ? fmtDate(e.date_embauche) : '—'}</td>
                <td className="px-3 py-2 tabular-nums">{e.date_sortie ? fmtDate(e.date_sortie) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.heures_contrat}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPrix(e.salaire_horaire)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Modaux ────────────────────────────────────────────────────────
function EmployeModal({ employe, onClose, onError, onSuccess }: { employe: Employe | null; onClose: () => void; onError: (e: unknown) => void; onSuccess: (msg: string) => void }) {
  const [prenom, setPrenom] = useState(employe?.prenom ?? '')
  const [nom, setNom] = useState(employe?.nom ?? '')
  const [poste, setPoste] = useState(employe?.poste ?? 'salle')
  const [contrat, setContrat] = useState(employe?.type_contrat ?? 'CDI')
  const [email, setEmail] = useState(employe?.email ?? '')
  const [telephone, setTelephone] = useState(employe?.telephone ?? '')
  const [salaire, setSalaire] = useState(employe?.salaire_horaire ?? 12)
  const [heures, setHeures] = useState(employe?.heures_contrat ?? 35)
  const [embauche, setEmbauche] = useState(employe?.date_embauche ?? new Date().toISOString().slice(0, 10))
  const [solde, setSolde] = useState(employe?.solde_conges_jours ?? 25)
  const [notes, setNotes] = useState(employe?.notes_internes ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const isEdit = !!employe

  function valider() {
    if (!prenom.trim() || !nom.trim()) { onError(new Error('Prénom et nom obligatoires')); return }
    startTransition(async () => {
      try {
        const payload = {
          prenom: prenom.trim(), nom: nom.trim(), poste, type_contrat: contrat,
          email: email.trim() || null, telephone: telephone.trim() || null,
          salaire_horaire: salaire, heures_contrat: heures,
          date_embauche: embauche || null, date_sortie: employe?.date_sortie ?? null,
          solde_conges_jours: solde, notes_internes: notes.trim() || null,
        }
        if (isEdit && employe) await updateEmploye({ ...payload, id: employe.id })
        else await creerEmploye(payload)
        onSuccess(isEdit ? 'Employé mis à jour' : 'Employé créé')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={isEdit ? `Modifier — ${employe!.prenom} ${employe!.nom}` : 'Nouvel employé'} onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prénom"><input value={prenom} onChange={e => setPrenom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Nom"><input value={nom} onChange={e => setNom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Poste">
          <select value={poste} onChange={e => setPoste(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(POSTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Contrat">
          <select value={contrat} onChange={e => setContrat(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(CONTRAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Téléphone"><input value={telephone} onChange={e => setTelephone(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Salaire €/h"><input type="number" step="0.01" value={salaire} onChange={e => setSalaire(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Heures/sem"><input type="number" value={heures} onChange={e => setHeures(parseInt(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Solde congés"><input type="number" step="0.5" value={solde} onChange={e => setSolde(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <Field label="Date embauche"><input type="date" value={embauche} onChange={e => setEmbauche(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Notes internes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>

      {/* Permissions personnalisées (visibles uniquement en édition d'un
          employé existant — les overrides sont stockées sur le profil
          Supabase Auth lié, pas sur l'employé). */}
      {isEdit && employe && (
        <PermissionsPanel employe_id={employe.id} poste={poste} onError={onError} onOk={onSuccess} />
      )}

      {isEdit && employe && (
        <>
          <AutonomiePanel employe={employe} onError={onError} onOk={onSuccess} />
          <PinPanel employe={employe} onError={onError} onOk={onSuccess} />
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
        {isEdit && employe?.actif && (
          <button onClick={async () => {
            const today = new Date().toISOString().slice(0, 10)
            if (!(await askConfirm({ title: 'Archiver l\'employé', message: `Archiver ${employe.prenom} ${employe.nom} avec sortie au ${today} ?`, confirmLabel: 'Archiver', danger: true }))) return
            try { await archiverEmploye(employe.id, today); onSuccess('Archivé'); router.refresh() }
            catch (e) { onError(e) }
          }} className="min-h-[48px] px-4 rounded-md bg-amber-500 hover:bg-amber-400 text-white font-bold">📦 Archiver</button>
        )}
        <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : (isEdit ? '✓ Mettre à jour' : '+ Créer')}</button>
      </div>
    </Modal>
  )
}

// ─── Permissions personnalisées par employé ───────────────────────────
//
// Dans l'édition d'un employé, ce panneau permet au gérant de surcharger
// la matrice du poste : pour chaque module, choisir Hériter / Autorisé /
// Lecture seule / Refusé. Les overrides sont stockés sur la table profils.
//
// Si aucun profil n'est encore lié à l'employé (employé n'a pas encore
// activé son compte avec son email), les overrides ne sont pas écrits :
// un message l'indique. À la 1ère connexion, getProfile() liera le profil
// par email match et le gérant pourra alors définir les overrides.

const ROUTES_PERMISSIONS: Array<{ groupe: string; items: Array<{ href: string; label: string }> }> = [
  { groupe: 'Pilotage', items: [
    { href: '/admin/pilotage',     label: 'Tableau de bord' },
    { href: '/admin/assistant',    label: 'Assistant IA' },
    { href: '/admin/journal',      label: 'Journal de bord' },
    { href: '/admin/previsionnel', label: 'Prévisionnel' },
  ]},
  { groupe: 'Cuisine', items: [
    { href: '/admin/recettes',     label: 'Recettes' },
    { href: '/admin/ingredients',  label: 'Ingrédients' },
    { href: '/admin/stock',        label: 'Stock' },
    { href: '/admin/fournisseurs', label: 'Fournisseurs' },
    { href: '/admin/allergenes',   label: 'Allergènes' },
    { href: '/admin/boissons',     label: 'Boissons' },
  ]},
  { groupe: 'Service', items: [
    { href: '/admin/affichage',    label: 'Affichage TV' },
    { href: '/admin/reservations', label: 'Réservations' },
    { href: '/admin/groupes',      label: 'Groupes' },
    { href: '/admin/clients',      label: 'Clients/CRM' },
  ]},
  { groupe: 'Équipe', items: [
    { href: '/admin/rh',           label: 'RH' },
    { href: '/admin/formation',    label: 'Formation' },
  ]},
  { groupe: 'Conformité', items: [
    { href: '/admin/hygiene',      label: 'Hygiène' },
    { href: '/admin/legal',        label: 'Légal' },
    { href: '/admin/maintenance',  label: 'Maintenance' },
    { href: '/admin/dechets',      label: 'Déchets' },
  ]},
  { groupe: 'Finances', items: [
    { href: '/admin/finances',     label: 'Finances' },
    { href: '/admin/energie',      label: 'Énergie' },
  ]},
  { groupe: 'Système', items: [
    { href: '/admin/setup',        label: 'Configuration' },
    { href: '/admin/securite',     label: 'Sécurité' },
  ]},
]

type RouteState = 'inherit' | 'allowed' | 'readonly' | 'denied'

// Interrupteurs d'autonomie par employé. Par défaut tout est désactivé ;
// le gérant ouvre au cas par cas. Pilote la validation des bons de commande,
// la réception sans validation, la modif des recettes et la visibilité des prix.
function AutonomiePanel({
  employe, onError, onOk,
}: {
  employe: Employe
  onError: (e: unknown) => void
  onOk: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const flags = [
    { key: 'autonomie_reception',      label: 'Réceptionner les livraisons sans validation', emoji: '📦' },
    { key: 'autonomie_commande',       label: 'Passer des commandes fournisseurs sans validation', emoji: '🛒' },
    { key: 'autonomie_modif_recettes', label: 'Modifier les quantités de recettes', emoji: '📖' },
    { key: 'autonomie_voir_prix',      label: "Voir les prix d'achat des ingrédients", emoji: '💶' },
  ] as const

  function toggle(key: string, value: boolean) {
    startTransition(async () => {
      try { await setAutonomie({ employe_id: employe.id, [key]: value }); onOk('Autonomie mise à jour') }
      catch (e) { onError(e) }
    })
  }

  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <summary className="font-bold text-sm cursor-pointer select-none">🔓 Autonomie (avancé)</summary>
      <p className="text-xs text-zinc-500 mt-1 mb-2">Tout est désactivé par défaut. Active uniquement ce que tu autorises pour cet employé.</p>
      <div className="space-y-2.5">
        {flags.map(f => {
          const checked = Boolean((employe as unknown as Record<string, unknown>)[f.key])
          return (
            <label key={f.key} className="flex items-center justify-between gap-3 text-sm cursor-pointer">
              <span className="text-zinc-700">{f.emoji} {f.label}</span>
              <input
                type="checkbox"
                defaultChecked={checked}
                disabled={pending}
                onChange={e => toggle(f.key, e.target.checked)}
                className="h-5 w-5 accent-emerald-600 shrink-0"
              />
            </label>
          )
        })}
      </div>
    </details>
  )
}

// ─── Code PIN opérateur (pour « prendre le poste » sur tablette partagée) ──
function PinPanel({
  employe, onError, onOk,
}: {
  employe: Employe
  onError: (e: unknown) => void
  onOk: (msg: string) => void
}) {
  const [pin, setPin] = useState('')
  const [pending, startTransition] = useTransition()
  const aDejaPin = Boolean((employe as unknown as Record<string, unknown>).pin_hash)

  function save() {
    if (!/^\d{4,6}$/.test(pin)) { onError(new Error('PIN : 4 à 6 chiffres')); return }
    startTransition(async () => {
      try { await setPinEmploye({ employe_id: employe.id, pin }); setPin(''); onOk('Code PIN défini') }
      catch (e) { onError(e) }
    })
  }

  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
      <summary className="font-bold text-sm cursor-pointer select-none">🔢 Code PIN opérateur {aDejaPin && <span className="text-[11px] font-normal text-emerald-700">· défini ✓</span>}</summary>
      <p className="text-xs text-zinc-500 mt-1 mb-2">Code à 4–6 chiffres que l&apos;employé tape pour « prendre le poste » sur une tablette partagée. Ses actions sont alors tracées à son nom.</p>
      <div className="flex gap-2">
        <input
          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder={aDejaPin ? 'Nouveau code…' : '4 à 6 chiffres'}
          className="flex-1 h-11 px-3 rounded-md border border-zinc-300 text-lg tracking-widest tabular-nums"
        />
        <button onClick={save} disabled={pending || pin.length < 4}
          className="min-h-[44px] px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold text-sm">
          {aDejaPin ? 'Changer' : 'Définir'}
        </button>
      </div>
    </details>
  )
}

function PermissionsPanel({
  employe_id, poste, onError, onOk,
}: {
  employe_id: string
  poste: string
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [hasProfil, setHasProfil] = useState<boolean | null>(null)
  const [overrides, setOverrides] = useState<Record<RouteState, string[]>>({
    allowed: [], readonly: [], denied: [], inherit: [],
  })
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    getEmployePermissions(employe_id)
      .then(p => {
        setHasProfil(p.hasProfil)
        // 'allowed' = allowed ou writable (les deux donnent l'accès en écriture)
        const allowedSet = new Set([...p.allowed, ...p.writable])
        setOverrides({
          allowed:  Array.from(allowedSet).filter(r => !p.readonly.includes(r) && !p.denied.includes(r)),
          readonly: p.readonly.filter(r => !p.denied.includes(r)),
          denied:   p.denied,
          inherit:  [],
        })
      })
      .catch(onError)
  }, [open, employe_id, onError])

  function getStateOf(route: string): RouteState {
    if (overrides.denied.includes(route))   return 'denied'
    if (overrides.readonly.includes(route)) return 'readonly'
    if (overrides.allowed.includes(route))  return 'allowed'
    return 'inherit'
  }

  function setStateOf(route: string, state: RouteState) {
    setOverrides(prev => {
      const strip = (arr: string[]) => arr.filter(r => r !== route)
      const next = {
        allowed:  strip(prev.allowed),
        readonly: strip(prev.readonly),
        denied:   strip(prev.denied),
        inherit:  prev.inherit,
      }
      if (state === 'allowed')  next.allowed.push(route)
      if (state === 'readonly') next.readonly.push(route)
      if (state === 'denied')   next.denied.push(route)
      return next
    })
  }

  function save() {
    startTransition(async () => {
      try {
        // Pour chaque route en 'allowed', on stocke dans allowed ET writable
        // (allowed lève un denied potentiel de la matrice ; writable lève
        // un readonly potentiel). Pour 'readonly', on stocke aussi dans
        // allowed pour donner l'accès en plus du lecture seule.
        const allowed:  string[] = [...overrides.allowed, ...overrides.readonly]
        const writable: string[] = [...overrides.allowed]
        const readonly: string[] = [...overrides.readonly]
        const denied:   string[] = [...overrides.denied]
        await setEmployePermissions({ employe_id, allowed, denied, readonly, writable })
        onOk('Permissions personnalisées enregistrées')
      } catch (e) { onError(e) }
    })
  }

  async function reset() {
    if (!(await askConfirm({ title: 'Réinitialiser les overrides', message: 'Réinitialiser tous les overrides (employé reprend les droits de son poste) ?', confirmLabel: 'Réinitialiser', danger: true }))) return
    setOverrides({ allowed: [], readonly: [], denied: [], inherit: [] })
  }

  return (
    <div className="border-t border-zinc-200 pt-3 mt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm font-bold text-zinc-700 hover:text-zinc-900"
      >
        <span>🔐 Accès personnalisés (avancé)</span>
        <span className="text-xs">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {hasProfil === false && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
              ⚠ Cet employé ne s'est pas encore connecté avec son email <strong>{/*...*/}</strong>.
              Les overrides seront appliqués automatiquement à sa 1ère connexion.
            </div>
          )}
          <p className="text-xs text-zinc-600">
            Par défaut, l'employé hérite des accès de son poste <strong>{poste}</strong>. Modifie ici
            module par module pour personnaliser.
          </p>

          <div className="max-h-64 overflow-y-auto border rounded-md">
            {ROUTES_PERMISSIONS.map(g => (
              <div key={g.groupe} className="border-b last:border-0">
                <div className="px-2 py-1 bg-zinc-50 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{g.groupe}</div>
                {g.items.map(it => {
                  const state = getStateOf(it.href)
                  const matrixAccess  = canAccess(poste, it.href, null)
                  const matrixReadonly = isReadOnly(poste, it.href, null)
                  const inheritLabel = !matrixAccess
                    ? '✗ Refusé (matrice)'
                    : matrixReadonly
                      ? '👁 Lecture seule (matrice)'
                      : '✓ Autorisé (matrice)'
                  return (
                    <div key={it.href} className="flex items-center gap-2 px-2 py-1.5 text-xs border-t first:border-0 hover:bg-zinc-50">
                      <span className="flex-1 font-medium truncate">{it.label}</span>
                      <span className="text-[10px] text-zinc-500 hidden sm:inline">{inheritLabel}</span>
                      <select
                        value={state}
                        onChange={e => setStateOf(it.href, e.target.value as RouteState)}
                        className="text-xs min-h-[44px] px-2 rounded border border-zinc-300 bg-white"
                      >
                        <option value="inherit">Hériter</option>
                        <option value="allowed">Autorisé</option>
                        <option value="readonly">Lecture seule</option>
                        <option value="denied">Refusé</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={pending} className="text-sm min-h-[44px] px-3 rounded border border-zinc-300 hover:bg-zinc-50">
              Réinitialiser
            </button>
            <button type="button" onClick={save} disabled={pending} className="flex-1 text-sm min-h-[44px] px-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:bg-zinc-300">
              {pending ? '…' : '💾 Enregistrer overrides'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DocumentModal({ employe_id, onClose, onError, onSuccess }: { employe_id: string; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [type, setType] = useState<TypeDocument>('contrat')
  const [nomDoc, setNom] = useState('')
  const [url, setUrl] = useState('')
  const [emission, setEmission] = useState('')
  const [expiration, setExpiration] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!nomDoc.trim() || !url.trim()) { onError(new Error('Nom et URL obligatoires')); return }
    startTransition(async () => {
      try {
        await creerDocument({
          employe_id, type, nom: nomDoc.trim(), url: url.trim(),
          date_emission: emission || null, date_expiration: expiration || null,
          notes: null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouveau document" onClose={onClose} disabled={isPending}>
      <Field label="Type">
        <select value={type} onChange={e => setType(e.target.value as TypeDocument)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          {Object.entries(TYPE_DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </Field>
      <Field label="Nom du document"><input value={nomDoc} onChange={e => setNom(e.target.value)} placeholder="Ex: Contrat CDI 2024" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="URL (Drive, Dropbox…)"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className="w-full h-12 px-3 rounded-md border border-zinc-300 text-xs font-mono" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date émission"><input type="date" value={emission} onChange={e => setEmission(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Date expiration"><input type="date" value={expiration} onChange={e => setExpiration(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Ajouter" />
    </Modal>
  )
}

function FormationModal({ employe_id, onClose, onError, onSuccess }: { employe_id: string; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [formation, setFormation] = useState<TypeFormation>('haccp')
  const [titre, setTitre] = useState('')
  const [organisme, setOrganisme] = useState('')
  const [obtention, setObtention] = useState(new Date().toISOString().slice(0, 10))
  const [expiration, setExpiration] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!titre.trim()) { onError(new Error('Titre obligatoire')); return }
    startTransition(async () => {
      try {
        await creerFormation({
          employe_id, formation, titre: titre.trim(),
          organisme: organisme.trim() || null,
          date_obtention: obtention,
          date_expiration: expiration || null,
          document_url: docUrl.trim() || null,
          notes: null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle formation" onClose={onClose} disabled={isPending}>
      <Field label="Formation">
        <select value={formation} onChange={e => setFormation(e.target.value as TypeFormation)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          {Object.entries(TYPE_FORMATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}{v.obligatoire ? ' (obligatoire)' : ''}</option>)}
        </select>
      </Field>
      <Field label="Titre / intitulé exact"><input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex: Formation HACCP — restauration commerciale 14h" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Organisme (optionnel)"><input value={organisme} onChange={e => setOrganisme(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date obtention"><input type="date" value={obtention} onChange={e => setObtention(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Date expiration (si renouvelable)"><input type="date" value={expiration} onChange={e => setExpiration(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="URL attestation (optionnel)"><input value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://…" className="w-full h-12 px-3 rounded-md border border-zinc-300 text-xs font-mono" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Ajouter" />
    </Modal>
  )
}

function ShiftModal({ employes, init, onClose, onError, onSuccess }: { employes: Employe[]; init: { employe_id: string; date: string }; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [empId, setEmpId] = useState(init.employe_id)
  const [date, setDate] = useState(init.date)
  const [debut, setDebut] = useState('11:30')
  const [fin, setFin] = useState('14:30')
  const [poste, setPoste] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const heures = heuresEntre(debut, fin)
  const emp = employes.find(e => e.id === empId)
  const cout = emp ? heures * emp.salaire_horaire : 0

  function valider() {
    startTransition(async () => {
      try {
        await creerShift({ employe_id: empId, date_travail: date, heure_debut: debut, heure_fin: fin, poste_jour: poste.trim() || null, notes: null })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouveau shift" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Employé">
          <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Début"><input type="time" value={debut} onChange={e => setDebut(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
        <Field label="Fin"><input type="time" value={fin} onChange={e => setFin(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
      </div>
      <Field label="Poste du jour (optionnel)"><input value={poste} onChange={e => setPoste(e.target.value)} placeholder="cuisine, salle, manager…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <p className="text-sm text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">
        Durée : <b className="tabular-nums">{fmtHeures(heures)}</b> · Coût : <b className="tabular-nums">{fmtPrix(cout)}</b>
      </p>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Créer le shift" />
    </Modal>
  )
}

function CongeModal({ employes, onClose, onError, onSuccess }: { employes: Employe[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [empId, setEmpId] = useState(employes[0]?.id ?? '')
  const [debut, setDebut] = useState(new Date().toISOString().slice(0, 10))
  const [fin, setFin] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<Conge['type']>('conge')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!empId) { onError(new Error('Employé obligatoire')); return }
    if (new Date(fin) < new Date(debut)) { onError(new Error('Date fin avant début')); return }
    startTransition(async () => {
      try {
        await demanderConge({ employe_id: empId, date_debut: debut, date_fin: fin, type, notes: notes.trim() || null })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle demande de congé" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Employé">
          <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom} ({e.solde_conges_jours.toFixed(1)} j)</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as Conge['type'])} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(TYPE_CONGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Du"><input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Au"><input type="date" value={fin} onChange={e => setFin(e.target.value)} min={debut} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Notes (optionnel)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Demander" />
    </Modal>
  )
}

function SoldeModal({ employe, onClose, onError, onSuccess }: { employe: Employe; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [solde, setSolde] = useState(employe.solde_conges_jours)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    startTransition(async () => {
      try { await ajusterSoldeConges(employe.id, solde); onSuccess(); router.refresh() }
      catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={`Solde congés — ${employe.prenom} ${employe.nom}`} onClose={onClose} disabled={isPending}>
      <Field label="Solde de congés (jours)">
        <input type="number" step="0.5" min={0} value={solde} onChange={e => setSolde(parseFloat(e.target.value) || 0)}
          className="w-full h-14 px-3 rounded-md border border-zinc-300 text-2xl font-bold tabular-nums text-right" />
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Ajuster" />
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

// ─── Bouton Inviter par email Magic Link ──────────────────────
function InviterButton({
  employe_id, email, prenom, onError, onSuccess,
}: {
  employe_id: string
  email: string
  prenom: string
  onError: (e: unknown) => void
  onSuccess: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  async function inviter() {
    if (!(await askConfirm({ title: 'Envoyer l\'invitation', message: `Envoyer un email d'invitation à ${prenom} (${email}) ?\n\nL'employé recevra un lien pour se connecter directement à l'application.`, confirmLabel: 'Envoyer', danger: false }))) return
    startTransition(async () => {
      try {
        const r = await inviterEmploye({ employe_id })
        onSuccess(r.action === 'invited' ? `📧 Invitation envoyée à ${r.email}` : `🔄 Magic link réenvoyé à ${r.email}`)
      } catch (e) {
        onError(e)
      }
    })
  }
  return (
    <button
      onClick={inviter}
      disabled={pending}
      className="text-sm min-h-[44px] min-w-[44px] px-2 inline-flex items-center justify-center rounded border border-emerald-300 hover:bg-emerald-50 text-emerald-700 font-bold disabled:opacity-50"
      title={`Inviter ${prenom} par email`}
    >
      {pending ? '…' : '📧'}
    </button>
  )
}
