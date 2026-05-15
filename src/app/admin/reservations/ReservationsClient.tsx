'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, addDays, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  type Chambre, type ResaChambre, type ResaTable, type Evenement,
  type StatutResa, type StatutResaTable, type StatutEvent, type TypeEvenement,
  STATUT_RESA_INFO, STATUT_RESA_TABLE_INFO, STATUT_EVENT_INFO, TYPE_EVENT_INFO,
  joursSemaineFrom, chambreOccupeeLeJour, nbNuits, totalSejour,
  fmtPrix, fmtDate,
} from '@/lib/reservations'
import {
  creerResaChambre, changerStatutResaChambre, ajusterAcompte, supprimerResaChambre,
  creerResaTable, changerStatutResaTable, supprimerResaTable,
  creerEvenement, updateEvenement, changerStatutEvenement, supprimerEvenement,
} from './actions'
import type { DataReservations } from './page'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'

type Tab = 'chambres' | 'tables' | 'evenements'

export default function ReservationsClient({ data, readOnly = false, showTachesDuJour = false }: { data: DataReservations; readOnly?: boolean; showTachesDuJour?: boolean }) {
  const [tab, setTab] = useState<Tab>('chambres')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const today = new Date().toISOString().slice(0, 10)
  const arriveesCe = data.resaChambres.filter(r => r.date_arrivee === today && r.statut === 'confirmee').length
  const tablesAujourdhui = data.resaTables.filter(r => r.date_resa === today && r.statut !== 'annulee').length
  const evenementsAVenir = data.evenements.filter(e => e.date_evenement >= today && e.statut !== 'annulee').length

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold whitespace-nowrap">← Accueil</Link>
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-xl shadow-lg shadow-blue-500/30 shrink-0">📅</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Hôtellerie & événementiel</p>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Réservations</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="Arrivées aujourd'hui" value={arriveesCe} accent={arriveesCe > 0 ? 'orange' : 'zinc'} />
            <KPI label="Tables réservées aujd" value={tablesAujourdhui} />
            <KPI label="Événements à venir" value={evenementsAVenir} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'chambres'}   onClick={() => setTab('chambres')}>🛏️ Chambres ({data.chambres.length})</TabBtn>
          <TabBtn active={tab === 'tables'}     onClick={() => setTab('tables')}>🪑 Tables/terrasse ({data.resaTables.length})</TabBtn>
          <TabBtn active={tab === 'evenements'} onClick={() => setTab('evenements')}>🎉 Événements ({data.evenements.length})</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {showTachesDuJour && <TachesDuJourWidget poste="receptionniste" defaultOpen />}
        {tab === 'chambres'   && <ChambresTab chambres={data.chambres} resas={data.resaChambres} readOnly={readOnly} onError={flashKo} onOk={flashOk} />}
        {tab === 'tables'     && <TablesTab resas={data.resaTables} tables={data.tables} readOnly={readOnly} onError={flashKo} onOk={flashOk} />}
        {tab === 'evenements' && <EvenementsTab evenements={data.evenements} readOnly={readOnly} onError={flashKo} onOk={flashOk} />}
      </main>

      {erreur && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 cursor-pointer" onClick={() => setErreur('')}>⚠️ {erreur}</div>}
      {success && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">✓ {success}</div>}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: number; accent?: 'zinc' | 'orange' | 'rouge' }) {
  const cls = {
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    orange: 'bg-amber-50 text-amber-900 border-amber-200',
    rouge: 'bg-red-50 text-red-900 border-red-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center min-w-[80px]', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Chambres ──────────────────────────────────────────────
function ChambresTab({ chambres, resas, readOnly = false, onError, onOk }: { chambres: Chambre[]; resas: ResaChambre[]; readOnly?: boolean; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [refDate, setRefDate] = useState(new Date())
  const [showResa, setShowResa] = useState<{ chambre_id: string; date: string } | null>(null)
  const [openResa, setOpenResa] = useState<ResaChambre | null>(null)
  const jours = useMemo(() => joursSemaineFrom(refDate, 14), [refDate])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setRefDate(addDays(refDate, -7))} className="h-10 px-3 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm">← Semaine précédente</button>
        <h2 className="text-sm font-bold text-zinc-700">Calendrier 14 jours</h2>
        <button onClick={() => setRefDate(addDays(refDate, 7))} className="h-10 px-3 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm">Semaine suivante →</button>
      </div>

      {chambres.length === 0 ? (
        <p className="text-center py-12 text-zinc-400">Aucune chambre. Créez-en depuis /admin/setup ou via SQL.</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left px-2 py-2 font-bold sticky left-0 bg-zinc-50 z-10 min-w-[140px]">Chambre</th>
                {jours.map(j => (
                  <th key={j.iso} className={cn('text-center px-1 py-1 font-bold min-w-[40px]', j.estAujourdhui && 'bg-blue-100')}>
                    <p className="text-[9px] uppercase opacity-70">{format(j.date, 'EEE', { locale: fr })}</p>
                    <p className="text-sm">{j.jour}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {chambres.map(c => (
                <tr key={c.id}>
                  <td className="px-2 py-2 sticky left-0 bg-white z-10">
                    <p className="font-bold text-sm">N°{c.numero} {c.nom}</p>
                    <p className="text-[10px] text-zinc-500">{c.capacite} pers · {fmtPrix(c.prix_nuit_ht)}/nuit</p>
                  </td>
                  {jours.map(j => {
                    const occup = chambreOccupeeLeJour(resas, c.id, j.iso)
                    return (
                      <td key={j.iso} className="p-0.5">
                        {occup ? (
                          <button onClick={() => setOpenResa(occup)}
                            className={cn('w-full h-10 rounded text-[10px] font-bold border', STATUT_RESA_INFO[occup.statut].cls, 'truncate px-1')}
                            title={`${occup.client_nom} · ${fmtDate(occup.date_arrivee)} → ${fmtDate(occup.date_depart)}`}>
                            {occup.client_nom.split(' ')[0].slice(0, 6)}
                          </button>
                        ) : readOnly ? (
                          <div className="w-full h-10" />
                        ) : (
                          <button onClick={() => setShowResa({ chambre_id: c.id, date: j.iso })}
                            className="w-full h-10 rounded border border-dashed border-zinc-200 hover:border-zinc-400 text-zinc-400 hover:text-zinc-700 text-xs">
                            +
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showResa && (
        <ResaChambreModal init={showResa} chambres={chambres} onClose={() => setShowResa(null)} onError={onError}
          onSuccess={() => { setShowResa(null); onOk('Réservation créée') }} />
      )}
      {openResa && (
        <DetailResaChambreModal resa={openResa} chambre={chambres.find(c => c.id === openResa.chambre_id) ?? null}
          onClose={() => setOpenResa(null)} onError={onError} onOk={onOk} />
      )}
    </div>
  )
}

function ResaChambreModal({ init, chambres, onClose, onError, onSuccess }: {
  init: { chambre_id: string; date: string }
  chambres: Chambre[]
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [chambreId, setChambreId] = useState(init.chambre_id)
  const [arrivee, setArrivee] = useState(init.date)
  const [depart, setDepart] = useState(format(addDays(parseISO(init.date), 1), 'yyyy-MM-dd'))
  const [nbPers, setNbPers] = useState(2)
  const [clientNom, setClientNom] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientTel, setClientTel] = useState('')
  const [acompte, setAcompte] = useState(0)
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const chambre = chambres.find(c => c.id === chambreId)
  const total = chambre ? totalSejour(chambre, arrivee, depart) : 0
  const nb_n = nbNuits(arrivee, depart)

  function valider() {
    if (!clientNom.trim()) { onError(new Error('Nom client obligatoire')); return }
    startTransition(async () => {
      try {
        await creerResaChambre({
          chambre_id: chambreId,
          client_nom: clientNom.trim(),
          client_email: clientEmail.trim() || null,
          client_telephone: clientTel.trim() || null,
          date_arrivee: arrivee,
          date_depart: depart,
          nb_personnes: nbPers,
          montant_total: total,
          acompte_verse: acompte,
          notes: notes.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle réservation chambre" onClose={onClose} disabled={isPending}>
      <Field label="Chambre">
        <select value={chambreId} onChange={e => setChambreId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          {chambres.map(c => <option key={c.id} value={c.id}>N°{c.numero} {c.nom} — {fmtPrix(c.prix_nuit_ht)}/nuit ({c.capacite} pers)</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Arrivée"><input type="date" value={arrivee} onChange={e => setArrivee(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Départ"><input type="date" value={depart} onChange={e => setDepart(e.target.value)} min={arrivee} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Nb personnes"><input type="number" min={1} value={nbPers} onChange={e => setNbPers(parseInt(e.target.value) || 1)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <p className="text-sm bg-zinc-50 border border-zinc-200 rounded p-2">
        <b>{nb_n}</b> nuit{nb_n > 1 ? 's' : ''} · Total : <b className="tabular-nums">{fmtPrix(total)}</b>
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Nom client"><input value={clientNom} onChange={e => setClientNom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Email"><input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Téléphone"><input value={clientTel} onChange={e => setClientTel(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Acompte versé (€)"><input type="number" step="0.01" value={acompte} onChange={e => setAcompte(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Réserver" />
    </Modal>
  )
}

function DetailResaChambreModal({ resa, chambre, onClose, onError, onOk }: {
  resa: ResaChambre; chambre: Chambre | null;
  onClose: () => void; onError: (e: unknown) => void; onOk: (m: string) => void
}) {
  const [acompte, setAcompte] = useState(resa.acompte_verse)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const reste = resa.montant_total - resa.acompte_verse

  return (
    <Modal title={`Réservation ${resa.chambre_nom}`} onClose={onClose} disabled={isPending}>
      <div className="bg-zinc-50 border border-zinc-200 rounded p-3 text-sm space-y-1">
        <p><b>{resa.client_nom}</b> · {resa.nb_personnes} pers</p>
        {resa.client_email && <p>📧 {resa.client_email}</p>}
        {resa.client_telephone && <p>📞 {resa.client_telephone}</p>}
        <p>📅 Du <b>{fmtDate(resa.date_arrivee)}</b> au <b>{fmtDate(resa.date_depart)}</b> ({nbNuits(resa.date_arrivee, resa.date_depart)} nuits)</p>
        <p className="font-bold">Total : {fmtPrix(resa.montant_total)} · Reste : <span className={reste > 0 ? 'text-red-700' : 'text-emerald-700'}>{fmtPrix(reste)}</span></p>
        {resa.notes && <p className="text-xs italic">Notes : {resa.notes}</p>}
      </div>

      <Field label="Ajuster acompte">
        <div className="flex gap-2">
          <input type="number" step="0.01" value={acompte} onChange={e => setAcompte(parseFloat(e.target.value) || 0)} className="flex-1 h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" />
          <button onClick={async () => {
            try { await ajusterAcompte(resa.id, acompte); onOk('Acompte mis à jour'); router.refresh() } catch (e) { onError(e) }
          }} className="h-12 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">✓</button>
        </div>
      </Field>

      <div className="flex gap-2 pt-2 flex-wrap">
        <a href={`/admin/reservations/chambres/${resa.id}/facture/print`} target="_blank" rel="noopener" className="text-xs h-9 px-3 inline-flex items-center rounded bg-zinc-900 hover:bg-zinc-800 text-white font-bold">🖨 Facture</a>
        {resa.statut === 'demande' && <button onClick={async () => { startTransition(async () => { try { await changerStatutResaChambre(resa.id, 'confirmee'); onOk('Confirmée'); router.refresh(); onClose() } catch (e) { onError(e) } }) }} className="text-xs h-9 px-3 rounded bg-blue-500 hover:bg-blue-400 text-white font-bold">✓ Confirmer</button>}
        {resa.statut === 'confirmee' && <button onClick={async () => { startTransition(async () => { try { await changerStatutResaChambre(resa.id, 'arrivee'); onOk('Check-in'); router.refresh(); onClose() } catch (e) { onError(e) } }) }} className="text-xs h-9 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">🛎️ Check-in</button>}
        {resa.statut === 'arrivee' && <button onClick={async () => { startTransition(async () => { try { await changerStatutResaChambre(resa.id, 'terminee'); onOk('Check-out'); router.refresh(); onClose() } catch (e) { onError(e) } }) }} className="text-xs h-9 px-3 rounded bg-zinc-700 hover:bg-zinc-600 text-white font-bold">🚪 Check-out</button>}
        {resa.statut !== 'annulee' && resa.statut !== 'terminee' && <button onClick={async () => { if (!confirm('Annuler ?')) return; startTransition(async () => { try { await changerStatutResaChambre(resa.id, 'annulee'); onOk('Annulée'); router.refresh(); onClose() } catch (e) { onError(e) } }) }} className="text-xs h-9 px-3 rounded bg-red-500 hover:bg-red-400 text-white font-bold">✕ Annuler</button>}
        <button onClick={async () => { if (!confirm('Supprimer définitivement ?')) return; try { await supprimerResaChambre(resa.id); onOk('Supprimée'); router.refresh(); onClose() } catch (e) { onError(e) } }} className="ml-auto text-xs h-9 px-3 text-zinc-500 hover:text-red-700">🗑</button>
      </div>
    </Modal>
  )
}

// ─── TAB 2 — Tables/terrasse ───────────────────────────────────────
function TablesTab({ resas, tables, readOnly = false, onError, onOk }: { resas: ResaTable[]; tables: { id: string; numero: string; capacite: number; zone: string }[]; readOnly?: boolean; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [filtreDate, setFiltreDate] = useState(new Date().toISOString().slice(0, 10))
  const router = useRouter()

  const filtered = useMemo(() => resas.filter(r => r.date_resa === filtreDate), [resas, filtreDate])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Field label="Date">
          <input type="date" value={filtreDate} onChange={e => setFiltreDate(e.target.value)} className="h-10 px-3 rounded-md border border-zinc-300" />
        </Field>
        {!readOnly && <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle réservation</button>}
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune réservation pour {fmtDate(filtreDate)}.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {filtered.sort((a, b) => a.heure_arrivee.localeCompare(b.heure_arrivee)).map(r => {
              const sInfo = STATUT_RESA_TABLE_INFO[r.statut]
              return (
                <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold tabular-nums">{r.heure_arrivee.slice(0, 5)}</span>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                      <span className="text-sm font-bold">{r.client_nom}</span>
                      <span className="text-xs">· {r.nb_personnes} pers</span>
                      {r.zone && <span className="text-[10px] text-zinc-500">📍 {r.zone}</span>}
                      {r.table_numero && <span className="text-[10px] text-zinc-500">T{r.table_numero}</span>}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {r.client_telephone && <>📞 {r.client_telephone} · </>}
                      {r.client_email && <>📧 {r.client_email}</>}
                    </p>
                    {r.notes && <p className="text-xs italic text-zinc-600 mt-1">« {r.notes} »</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    {r.statut === 'confirmee' && <button onClick={async () => { try { await changerStatutResaTable(r.id, 'arrivee'); onOk('Arrivée'); router.refresh() } catch (e) { onError(e) } }} className="text-xs h-7 px-2 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">↗ Arrivée</button>}
                    {r.statut === 'arrivee' && <button onClick={async () => { try { await changerStatutResaTable(r.id, 'terminee'); onOk('Terminée'); router.refresh() } catch (e) { onError(e) } }} className="text-xs h-7 px-2 rounded bg-zinc-700 hover:bg-zinc-600 text-white font-bold">✓ Fini</button>}
                    {r.statut === 'confirmee' && <button onClick={async () => { try { await changerStatutResaTable(r.id, 'no_show'); onOk('No-show'); router.refresh() } catch (e) { onError(e) } }} className="text-xs h-7 px-2 rounded bg-red-100 text-red-900 border border-red-300 font-bold">✗ No-show</button>}
                    {!readOnly && <button onClick={async () => { if (!confirm('Supprimer ?')) return; try { await supprimerResaTable(r.id); onOk('Supprimée'); router.refresh() } catch (e) { onError(e) } }} className="text-xs h-6 px-2 text-zinc-400 hover:text-red-600">×</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <ResaTableModal date={filtreDate} tables={tables} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Réservation créée') }} />
      )}
    </div>
  )
}

function ResaTableModal({ date, tables, onClose, onError, onSuccess }: { date: string; tables: { id: string; numero: string; capacite: number; zone: string }[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [tableId, setTableId] = useState('')
  const [zone, setZone] = useState('terrasse')
  const [dateResa, setDateResa] = useState(date)
  const [heureArr, setHeureArr] = useState('19:30')
  const [heureDep, setHeureDep] = useState('21:30')
  const [nbPers, setNbPers] = useState(2)
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!nom.trim()) { onError(new Error('Nom obligatoire')); return }
    startTransition(async () => {
      try {
        await creerResaTable({
          table_id: tableId || null, zone: zone || null,
          date_resa: dateResa, heure_arrivee: heureArr, heure_depart: heureDep || null,
          nb_personnes: nbPers,
          client_nom: nom.trim(), client_telephone: tel.trim() || null, client_email: email.trim() || null,
          client_id: null, notes: notes.trim() || null,
        })
        onSuccess(); router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle réservation table" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Zone">
          <select value={zone} onChange={e => setZone(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="terrasse">Terrasse</option>
            <option value="salle">Salle</option>
            <option value="salon prive">Salon privatisé</option>
            <option value="autre">Autre</option>
          </select>
        </Field>
        <Field label="Table spécifique (optionnel)">
          <select value={tableId} onChange={e => setTableId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Aucune (zone uniquement) —</option>
            {tables.map(t => <option key={t.id} value={t.id}>T{t.numero} ({t.capacite} pers · {t.zone})</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="Date"><input type="date" value={dateResa} onChange={e => setDateResa(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Arrivée"><input type="time" value={heureArr} onChange={e => setHeureArr(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
        <Field label="Départ"><input type="time" value={heureDep} onChange={e => setHeureDep(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
        <Field label="Nb pers"><input type="number" min={1} value={nbPers} onChange={e => setNbPers(parseInt(e.target.value) || 1)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Nom"><input value={nom} onChange={e => setNom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Téléphone"><input value={tel} onChange={e => setTel(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Allergies, anniversaire..." className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Réserver" />
    </Modal>
  )
}

// ─── TAB 3 — Événements ────────────────────────────────────────────
function EvenementsTab({ evenements, readOnly = false, onError, onOk }: { evenements: Evenement[]; readOnly?: boolean; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState<Evenement | true | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {!readOnly && <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvel événement</button>}
      </div>

      <div className="space-y-2">
        {evenements.length === 0 ? (
          <p className="text-center py-8 text-zinc-400">Aucun événement.</p>
        ) : evenements.map(e => {
          const tInfo = e.type ? TYPE_EVENT_INFO[e.type] : null
          const sInfo = STATUT_EVENT_INFO[e.statut]
          const reste = e.montant_devis - e.acompte_verse
          const isOpen = openId === e.id
          return (
            <article key={e.id} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
              <button onClick={() => setOpenId(isOpen ? null : e.id)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {tInfo && <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', tInfo.cls)}>{tInfo.emoji} {tInfo.label}</span>}
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                    {e.privatisation && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-900 border border-red-300">🔒 Privatisation</span>}
                    <span className="font-bold">{e.titre}</span>
                    <span className="text-xs text-zinc-500">{fmtDate(e.date_evenement)}{e.heure_debut && ` ${e.heure_debut.slice(0, 5)}`}</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    👥 {e.nb_personnes} pers · {fmtPrix(e.montant_devis)} {reste > 0.01 && <>· reste <b className="text-amber-700">{fmtPrix(reste)}</b></>}
                    {e.client_nom && <> · 👤 {e.client_nom}</>}
                  </p>
                </div>
                <span>{isOpen ? '▼' : '▶'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-zinc-100 p-4 bg-zinc-50 space-y-3 text-sm">
                  {e.lieu && <p>📍 <b>Lieu :</b> {e.lieu}</p>}
                  {e.heure_debut && <p>🕐 <b>Horaires :</b> {e.heure_debut.slice(0, 5)} → {e.heure_fin?.slice(0, 5) ?? '?'}</p>}
                  {e.client_email && <p>📧 {e.client_email}</p>}
                  {e.client_telephone && <p>📞 {e.client_telephone}</p>}
                  {e.materiel_demande && <p><b>Matériel :</b> {e.materiel_demande}</p>}
                  {e.besoins_techniques && <p><b>Technique :</b> {e.besoins_techniques}</p>}
                  {e.notes && <p className="italic">Notes : {e.notes}</p>}
                  <div className="flex gap-2 flex-wrap pt-2">
                    {!readOnly && <button onClick={() => setShowForm(e)} className="text-xs h-9 px-3 rounded border border-zinc-300 bg-white hover:bg-zinc-100 font-bold">✏️ Modifier</button>}
                    <a href={`/admin/reservations/evenements/${e.id}/devis/print`} target="_blank" rel="noopener" className="text-xs h-9 px-3 inline-flex items-center rounded bg-blue-600 hover:bg-blue-500 text-white font-bold">📋 Devis</a>
                    {e.privatisation && <a href={`/admin/reservations/evenements/${e.id}/contrat/print`} target="_blank" rel="noopener" className="text-xs h-9 px-3 inline-flex items-center rounded bg-red-600 hover:bg-red-500 text-white font-bold">📜 Contrat</a>}
                    {e.statut === 'demande' && <button onClick={async () => { try { await changerStatutEvenement(e.id, 'confirmee'); onOk('Confirmé'); router.refresh() } catch (err) { onError(err) } }} className="text-xs h-9 px-3 rounded bg-blue-500 hover:bg-blue-400 text-white font-bold">✓ Confirmer</button>}
                    {e.statut === 'confirmee' && <button onClick={async () => { try { await changerStatutEvenement(e.id, 'realise'); onOk('Réalisé'); router.refresh() } catch (err) { onError(err) } }} className="text-xs h-9 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">✓ Marquer réalisé</button>}
                    {e.statut !== 'annulee' && <button onClick={async () => { if (!confirm('Annuler ?')) return; try { await changerStatutEvenement(e.id, 'annulee'); onOk('Annulé'); router.refresh() } catch (err) { onError(err) } }} className="text-xs h-9 px-3 rounded bg-red-500 hover:bg-red-400 text-white font-bold">✕ Annuler</button>}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {showForm && (
        <EvenementModal evenement={showForm === true ? null : showForm}
          onClose={() => setShowForm(null)} onError={onError}
          onSuccess={(msg) => { setShowForm(null); onOk(msg) }} />
      )}
    </div>
  )
}

function EvenementModal({ evenement, onClose, onError, onSuccess }: { evenement: Evenement | null; onClose: () => void; onError: (e: unknown) => void; onSuccess: (m: string) => void }) {
  const isEdit = !!evenement
  const [titre, setTitre] = useState(evenement?.titre ?? '')
  const [type, setType] = useState<TypeEvenement>(evenement?.type ?? 'mariage')
  const [date, setDate] = useState(evenement?.date_evenement ?? new Date().toISOString().slice(0, 10))
  const [hDebut, setHDebut] = useState(evenement?.heure_debut ?? '19:00')
  const [hFin, setHFin] = useState(evenement?.heure_fin ?? '23:00')
  const [nbPers, setNbPers] = useState(evenement?.nb_personnes ?? 30)
  const [prixPP, setPrixPP] = useState(evenement?.prix_par_personne_ht ?? 50)
  const [tva, setTva] = useState(evenement?.taux_tva ?? 10)
  const [montant, setMontant] = useState(evenement?.montant_devis ?? 0)
  const [acompte, setAcompte] = useState(evenement?.acompte_verse ?? 0)
  const [clientNom, setClientNom] = useState(evenement?.client_nom ?? '')
  const [clientEmail, setClientEmail] = useState(evenement?.client_email ?? '')
  const [clientTel, setClientTel] = useState(evenement?.client_telephone ?? '')
  const [lieu, setLieu] = useState(evenement?.lieu ?? '')
  const [privatisation, setPrivatisation] = useState(evenement?.privatisation ?? false)
  const [materiel, setMateriel] = useState(evenement?.materiel_demande ?? '')
  const [besoins, setBesoins] = useState(evenement?.besoins_techniques ?? '')
  const [notes, setNotes] = useState(evenement?.notes ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Auto-calcul montant si prix_pp défini
  const montantCalc = nbPers * prixPP

  function valider() {
    if (!titre.trim()) { onError(new Error('Titre obligatoire')); return }
    startTransition(async () => {
      try {
        const finalMontant = montant > 0 ? montant : montantCalc
        const payload = {
          titre: titre.trim(),
          type_evenement: type,
          date_evenement: date,
          heure_debut: hDebut || null,
          heure_fin: hFin || null,
          nb_personnes: nbPers,
          prix_par_personne_ht: prixPP || null,
          taux_tva: tva,
          montant_devis: finalMontant,
          acompte_verse: acompte,
          client_nom: clientNom.trim() || null,
          client_email: clientEmail.trim() || null,
          client_telephone: clientTel.trim() || null,
          lieu: lieu.trim() || null,
          privatisation,
          materiel_demande: materiel.trim() || null,
          besoins_techniques: besoins.trim() || null,
          notes: notes.trim() || null,
        }
        if (isEdit && evenement) await updateEvenement({ ...payload, id: evenement.id })
        else await creerEvenement(payload)
        onSuccess(isEdit ? 'Mis à jour' : 'Événement créé')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={isEdit ? `Modifier — ${evenement!.titre}` : 'Nouvel événement'} onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Titre"><input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Mariage Dupont, Séminaire ACME..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypeEvenement)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(TYPE_EVENT_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Heure début"><input type="time" value={hDebut} onChange={e => setHDebut(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
        <Field label="Heure fin"><input type="time" value={hFin} onChange={e => setHFin(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="Nb pers"><input type="number" min={1} value={nbPers} onChange={e => setNbPers(parseInt(e.target.value) || 1)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Prix/pers HT"><input type="number" step="0.01" value={prixPP} onChange={e => setPrixPP(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="TVA %"><input type="number" step="0.5" value={tva} onChange={e => setTva(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Montant devis"><input type="number" step="0.01" value={montant} onChange={e => setMontant(parseFloat(e.target.value) || 0)} placeholder={String(montantCalc)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums font-bold" /></Field>
      </div>
      <p className="text-xs bg-zinc-50 border border-zinc-200 rounded p-2">
        Auto : {nbPers} × {fmtPrix(prixPP)} = <b className="tabular-nums">{fmtPrix(montantCalc)}</b> HT
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Client"><input value={clientNom} onChange={e => setClientNom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Email"><input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Téléphone"><input value={clientTel} onChange={e => setClientTel(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Lieu"><input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="Salle privatisée, terrasse..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Acompte versé"><input type="number" step="0.01" value={acompte} onChange={e => setAcompte(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={privatisation} onChange={e => setPrivatisation(e.target.checked)} />
        🔒 Privatisation totale (génère un contrat dédié)
      </label>
      <Field label="Matériel demandé"><textarea value={materiel} onChange={e => setMateriel(e.target.value)} rows={2} placeholder="Sono, vidéoprojecteur, micro..." className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="Besoins techniques"><textarea value={besoins} onChange={e => setBesoins(e.target.value)} rows={2} placeholder="Décoration, traiteur extérieur..." className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <div className="flex gap-2 pt-3 border-t border-zinc-200 -mx-5 px-5 -mb-5 pb-5 sticky bottom-0 bg-white">
        <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
        {isEdit && (
          <button onClick={async () => {
            if (!confirm('Supprimer définitivement ?')) return
            try { await supprimerEvenement(evenement!.id); onSuccess('Supprimé'); router.refresh() } catch (e) { onError(e) }
          }} className="min-h-[48px] px-4 rounded-md bg-red-500 hover:bg-red-400 text-white font-bold">🗑</button>
        )}
        <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : (isEdit ? '✓ Mettre à jour' : '+ Créer')}</button>
      </div>
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
      <button onClick={onValider} disabled={pending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{pending ? '…' : validLabel}</button>
    </div>
  )
}
