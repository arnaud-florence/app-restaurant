'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { cn } from '@/lib/utils'
import {
  type Pesee, type Collecte, type TypeDechet,
  TYPE_DECHET_INFO, fmtPrix, fmtPoids, fmtDate,
} from '@/lib/dechets'
import { creerPesee, supprimerPesee, creerCollecte, supprimerCollecte } from './actions'
import type { DataDechets } from './page'

type Tab = 'dashboard' | 'pesees' | 'collectes'

export default function DechetsClient({ data }: { data: DataDechets }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  // Alerte biodéchet > 5 kg/sem (seuil légal BSD obligatoire)
  const peseesBio7j = data.pesees.filter(p => p.type_dechet === 'biodechet' && new Date(p.date_pesee) >= new Date(Date.now() - 7 * 86400000))
  const bio7jPoids = peseesBio7j.reduce((s, p) => s + p.poids_kg, 0)

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold whitespace-nowrap">← Accueil</Link>
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xl shadow-lg shadow-amber-500/30 shrink-0">🗑️</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Tri sélectif & gaspillage</p>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Déchets</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="Total an" value={fmtPoids(data.total_an_poids)} />
            <KPI label="Coût mois" value={fmtPrix(data.total_mois_cout)} accent={data.total_mois_cout > 200 ? 'orange' : 'zinc'} />
            <KPI label="Bio 7j" value={fmtPoids(bio7jPoids)} accent={bio7jPoids > 5 ? 'rouge' : 'vert'} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>📊 Tableau de bord</TabBtn>
          <TabBtn active={tab === 'pesees'}    onClick={() => setTab('pesees')}>⚖️ Pesées ({data.pesees.length})</TabBtn>
          <TabBtn active={tab === 'collectes'} onClick={() => setTab('collectes')}>🚛 Collectes ({data.collectes.length})</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {tab === 'dashboard' && <DashboardTab data={data} />}
        {tab === 'pesees'    && <PeseesTab pesees={data.pesees} employes={data.employes} onError={flashKo} onOk={flashOk} />}
        {tab === 'collectes' && <CollectesTab collectes={data.collectes} onError={flashKo} onOk={flashOk} />}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: string; accent?: 'zinc' | 'orange' | 'rouge' | 'vert' }) {
  const cls = {
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    orange: 'bg-amber-50 text-amber-900 border-amber-200',
    rouge: 'bg-red-50 text-red-900 border-red-200',
    vert: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center min-w-[80px]', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Dashboard ─────────────────────────────────────────────
function DashboardTab({ data }: { data: DataDechets }) {
  const chartData = useMemo(() => {
    return data.agg_par_mois.slice(-12).map(m => ({ mois: m.libelle, kg: m.poids, cout: m.cout }))
  }, [data.agg_par_mois])

  return (
    <div className="space-y-4">
      {/* Cards par type */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {(Object.keys(TYPE_DECHET_INFO) as TypeDechet[]).map(t => {
          const info = TYPE_DECHET_INFO[t]
          const an = data.agg_an.find(a => a.type === t)
          return (
            <div key={t} className={cn('rounded-lg border p-2 text-center', info.cls)}>
              <p className="text-2xl">{info.emoji}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{info.label}</p>
              <p className="text-sm font-bold tabular-nums">{an ? fmtPoids(an.poids_kg) : '—'}</p>
              {an && an.cout > 0 && <p className="text-[10px] tabular-nums">{fmtPrix(an.cout)}</p>}
            </div>
          )
        })}
      </section>

      {/* Graphe mensuel */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-3">📈 Évolution mensuelle (kg + €)</h2>
        {chartData.length === 0 ? (
          <p className="text-center py-12 text-zinc-400">Pas encore de pesées.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="mois" fontSize={11} />
                <YAxis yAxisId="kg" fontSize={11} tickFormatter={(v) => v + ' kg'} />
                <YAxis yAxisId="cout" orientation="right" fontSize={11} tickFormatter={(v) => v + '€'} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="kg" dataKey="kg" fill="#10b981" name="Poids (kg)" />
                <Bar yAxisId="cout" dataKey="cout" fill="#f59e0b" name="Coût (€)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Top types annuel */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📊 Récap 12 mois — Total : {fmtPoids(data.total_an_poids)} · {fmtPrix(data.total_an_cout)}</h2>
          <Link href="/admin/dechets/rapport-annuel/print" target="_blank" rel="noopener" className="text-xs h-8 px-3 inline-flex items-center rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold">🖨 Rapport annuel</Link>
        </header>
        {data.agg_an.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune pesée enregistrée.</p>
        ) : (
          <table className="responsive-table w-full text-sm">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Type</th>
                <th className="text-right px-3 py-1.5">Poids total</th>
                <th className="text-right px-3 py-1.5">Coût gaspi.</th>
                <th className="text-right px-3 py-1.5">% du total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.agg_an.map(a => {
                const info = TYPE_DECHET_INFO[a.type]
                const pct = data.total_an_poids > 0 ? (a.poids_kg / data.total_an_poids) * 100 : 0
                return (
                  <tr key={a.type}>
                    <td className="px-3 py-2">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span>
                      {info.bsd_obligatoire && <span className="ml-1 text-[9px] text-amber-700 font-bold">BSD</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtPoids(a.poids_kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPrix(a.cout)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{pct.toFixed(1)} %</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

// ─── TAB 2 — Pesées ────────────────────────────────────────────────
function PeseesTab({ pesees, employes, onError, onOk }: { pesees: Pesee[]; employes: { id: string; prenom: string; nom: string }[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [filtre, setFiltre] = useState<TypeDechet | 'tous'>('tous')
  const router = useRouter()

  const filtered = useMemo(() => filtre === 'tous' ? pesees : pesees.filter(p => p.type_dechet === filtre), [pesees, filtre])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          <FiltreBtn active={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous ({pesees.length})</FiltreBtn>
          {(Object.keys(TYPE_DECHET_INFO) as TypeDechet[]).map(t => {
            const info = TYPE_DECHET_INFO[t]
            const n = pesees.filter(p => p.type_dechet === t).length
            return n > 0 ? <FiltreBtn key={t} active={filtre === t} onClick={() => setFiltre(t)}>{info.emoji} {info.label} ({n})</FiltreBtn> : null
          })}
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle pesée</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune pesée.</p>
        ) : (
          <table className="responsive-table w-full text-sm">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Date</th>
                <th className="text-left px-3 py-1.5">Type</th>
                <th className="text-right px-3 py-1.5">Poids</th>
                <th className="text-right px-3 py-1.5">Coût gaspi.</th>
                <th className="text-left px-3 py-1.5">Employé</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(p => {
                const info = TYPE_DECHET_INFO[p.type_dechet]
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 tabular-nums text-[11px]">{fmtDate(p.date_pesee)}</td>
                    <td className="px-3 py-2"><span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtPoids(p.poids_kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">{p.cout_estime > 0 ? fmtPrix(p.cout_estime) : '—'}</td>
                    <td className="px-3 py-2 text-zinc-600 text-[11px]">{p.employe_nom ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={async () => {
                        if (!confirm('Supprimer cette pesée ?')) return
                        try { await supprimerPesee(p.id); onOk('Supprimée'); router.refresh() } catch (e) { onError(e) }
                      }} className="text-zinc-400 hover:text-red-600">×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {showForm && (
        <PeseeModal employes={employes} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Pesée enregistrée') }} />
      )}
    </div>
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

function PeseeModal({ employes, onClose, onError, onSuccess }: { employes: { id: string; prenom: string; nom: string }[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<TypeDechet>('biodechet')
  const [poids, setPoids] = useState(0)
  const [cout, setCout] = useState(0)
  const [empId, setEmpId] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (poids <= 0) { onError(new Error('Poids obligatoire')); return }
    startTransition(async () => {
      try {
        await creerPesee({ date_pesee: date, type_dechet: type, poids_kg: poids, cout_estime: cout, employe_id: empId || null, notes: notes.trim() || null })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle pesée" onClose={onClose} disabled={isPending}>
      <Field label="Type de déchet">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TYPE_DECHET_INFO) as TypeDechet[]).map(t => {
            const info = TYPE_DECHET_INFO[t]
            return (
              <button key={t} onClick={() => setType(t)} className={cn(
                'px-3 h-12 rounded-md border-2 text-sm font-bold transition-colors',
                type === t ? info.cls + ' border-current' : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
              )}>{info.emoji} {info.label}</button>
            )
          })}
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Poids (kg)"><input type="number" step="0.01" value={poids} onChange={e => setPoids(parseFloat(e.target.value) || 0)} className="w-full h-14 px-3 rounded-md border border-zinc-300 text-2xl font-bold tabular-nums text-right" /></Field>
        <Field label="Coût gaspillage (€)"><input type="number" step="0.01" value={cout} onChange={e => setCout(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <Field label="Pesé par">
        <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Anonyme —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </Field>
      <Field label="Notes (optionnel)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Enregistrer" />
    </Modal>
  )
}

// ─── TAB 3 — Collectes ─────────────────────────────────────────────
function CollectesTab({ collectes, onError, onOk }: { collectes: Collecte[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <b>📋 Bordereau de Suivi des Déchets (BSD) :</b> obligatoire pour les biodéchets {'>'}5 kg/sem, huiles usagées, DASRI. Conservation 5 ans.
      </div>
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle collecte</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {collectes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune collecte enregistrée.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {collectes.map(c => {
              const info = TYPE_DECHET_INFO[c.type_dechet]
              return (
                <li key={c.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span>
                      <span className="font-bold text-sm">{c.prestataire}</span>
                      <span className="text-[11px] text-zinc-500">{fmtDate(c.date_collecte)}</span>
                      {c.num_bsd && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-900 border-blue-300 font-mono">BSD {c.num_bsd}</span>}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {c.poids_total_kg != null && <>⚖️ {fmtPoids(c.poids_total_kg)} · </>}
                      {c.cout_collecte != null && <>💶 {fmtPrix(c.cout_collecte)}</>}
                    </p>
                    {c.document_url && <a href={c.document_url} target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:underline">📎 Document</a>}
                    {c.notes && <p className="text-xs italic text-zinc-600 mt-1">« {c.notes} »</p>}
                  </div>
                  <button onClick={async () => {
                    if (!confirm('Supprimer cette collecte ?')) return
                    try { await supprimerCollecte(c.id); onOk('Supprimée'); router.refresh() } catch (e) { onError(e) }
                  }} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <CollecteModal onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Collecte enregistrée') }} />
      )}
    </div>
  )
}

function CollecteModal({ onClose, onError, onSuccess }: { onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [type, setType] = useState<TypeDechet>('biodechet')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [prestataire, setPrestataire] = useState('')
  const [poids, setPoids] = useState<number | ''>('')
  const [bsd, setBsd] = useState('')
  const [cout, setCout] = useState<number | ''>('')
  const [docUrl, setDocUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!prestataire.trim()) { onError(new Error('Prestataire obligatoire')); return }
    startTransition(async () => {
      try {
        await creerCollecte({
          type_dechet: type, date_collecte: date,
          prestataire: prestataire.trim(),
          poids_total_kg: poids === '' ? null : Number(poids),
          num_bsd: bsd.trim() || null,
          cout_collecte: cout === '' ? null : Number(cout),
          document_url: docUrl.trim() || null,
          notes: notes.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle collecte (enlèvement prestataire)" onClose={onClose} disabled={isPending}>
      <Field label="Type de déchet">
        <select value={type} onChange={e => setType(e.target.value as TypeDechet)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          {(Object.keys(TYPE_DECHET_INFO) as TypeDechet[]).map(t => {
            const info = TYPE_DECHET_INFO[t]
            return <option key={t} value={t}>{info.emoji} {info.label}{info.bsd_obligatoire ? ' (BSD obligatoire)' : ''}</option>
          })}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date collecte"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Prestataire"><input value={prestataire} onChange={e => setPrestataire(e.target.value)} placeholder="Veolia, Suez, GreenCity..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Poids total (kg)"><input type="number" step="0.01" value={poids} onChange={e => setPoids(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="N° BSD"><input value={bsd} onChange={e => setBsd(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
        <Field label="Coût (€)"><input type="number" step="0.01" value={cout} onChange={e => setCout(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <Field label="URL document BSD"><input value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://…" className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
      <Field label="Notes (optionnel)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
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
      <button onClick={onValider} disabled={pending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{pending ? '…' : validLabel}</button>
    </div>
  )
}
