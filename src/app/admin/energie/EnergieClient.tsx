'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { cn } from '@/lib/utils'
import {
  type ReleveEnergie, type TypeEnergie, type UniteEnergie,
  TYPE_ENERGIE_INFO, ALERTE_STYLE, fmtPrix, fmtConso, fmtPct, fmtDate,
} from '@/lib/energie'
import { creerReleveEnergie, supprimerReleveEnergie } from './actions'
import type { DataEnergie } from './page'

type Tab = 'dashboard' | 'releves' | 'suggestions'

export default function EnergieClient({ data }: { data: DataEnergie }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const nbAlertes = (['electricite','gaz','eau'] as TypeEnergie[])
    .map(t => data.comparaisons[t].find(c => c.mois_iso === data.moisCourant))
    .filter(c => c?.alerte === 'critique' || c?.alerte === 'haute').length

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">← Accueil</Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Pilotage</p>
              <h1 className="text-2xl font-bold">⚡ Énergie</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="Coût mois" value={fmtPrix(data.total_energie_mois)} />
            <KPI label="Coût / plat" value={fmtPrix(data.cout_par_plat_mois)} accent={data.cout_par_plat_mois > 1.5 ? 'rouge' : data.cout_par_plat_mois > 1 ? 'orange' : 'vert'} />
            <KPI label="Alertes" value={nbAlertes} accent={nbAlertes > 0 ? 'orange' : 'vert'} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>📊 Tableau de bord</TabBtn>
          <TabBtn active={tab === 'releves'}   onClick={() => setTab('releves')}>📝 Relevés ({data.releves.length})</TabBtn>
          <TabBtn active={tab === 'suggestions'} onClick={() => setTab('suggestions')}>💡 Suggestions ({data.suggestions.length})</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {tab === 'dashboard'   && <DashboardTab data={data} />}
        {tab === 'releves'     && <RelevesTab releves={data.releves} onError={flashKo} onOk={flashOk} />}
        {tab === 'suggestions' && <SuggestionsTab suggestions={data.suggestions} />}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: number | string; accent?: 'zinc' | 'vert' | 'orange' | 'rouge' }) {
  const cls = {
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    vert: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    orange: 'bg-amber-50 text-amber-900 border-amber-200',
    rouge: 'bg-red-50 text-red-900 border-red-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Dashboard ─────────────────────────────────────────────
function DashboardTab({ data }: { data: DataEnergie }) {
  // Construit dataset pour le graphe : on prend les 12 derniers mois et
  // on combine elec/gaz/eau (montant_ttc en barres groupées).
  const chartData = useMemo(() => {
    const moisSet = new Set<string>()
    for (const t of ['electricite', 'gaz', 'eau'] as TypeEnergie[]) {
      data.comparaisons[t].forEach(c => moisSet.add(c.mois_iso))
    }
    const mois = Array.from(moisSet).sort()
    return mois.map(m => {
      const elec = data.comparaisons.electricite.find(c => c.mois_iso === m)
      const gaz = data.comparaisons.gaz.find(c => c.mois_iso === m)
      const eau = data.comparaisons.eau.find(c => c.mois_iso === m)
      return {
        mois: m.slice(5) + '/' + m.slice(2, 4),
        Électricité: Math.round(elec?.montant_n ?? 0),
        Gaz: Math.round(gaz?.montant_n ?? 0),
        Eau: Math.round(eau?.montant_n ?? 0),
      }
    })
  }, [data.comparaisons])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['electricite','gaz','eau'] as TypeEnergie[]).map(t => {
          const info = TYPE_ENERGIE_INFO[t]
          const moisCur = data.comparaisons[t].find(c => c.mois_iso === data.moisCourant)
          const sty = moisCur ? ALERTE_STYLE[moisCur.alerte] : ALERTE_STYLE.normale
          return (
            <article key={t} className={cn('rounded-lg border-2 p-3', info.cls)}>
              <p className="text-xs font-bold uppercase tracking-wider opacity-70">{info.emoji} {info.label}</p>
              {moisCur ? (
                <>
                  <p className="text-2xl font-bold tabular-nums mt-1">{fmtConso(moisCur.conso_n, t === 'eau' ? 'm3' : 'kWh')}</p>
                  <p className="text-sm font-bold tabular-nums">{fmtPrix(moisCur.montant_n)}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', sty.cls)}>{sty.label}</span>
                    {moisCur.conso_n1 > 0 && (
                      <span className="text-xs">
                        N-1 : {moisCur.conso_n1.toFixed(0)} ({fmtPct(moisCur.variation_pct)})
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-500 italic mt-1">Pas encore de relevé pour {data.moisCourant}.</p>
              )}
            </article>
          )
        })}
      </div>

      {/* Graphe annuel */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-3">📈 Coût mensuel énergie sur 12 mois</h2>
        {chartData.length === 0 ? (
          <p className="text-center py-12 text-zinc-400">Pas encore de relevés.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="mois" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => v + '€'} />
                <Tooltip formatter={(v) => Number(v) + ' €'} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Électricité" fill={TYPE_ENERGIE_INFO.electricite.cls_solid} />
                <Bar dataKey="Gaz" fill={TYPE_ENERGIE_INFO.gaz.cls_solid} />
                <Bar dataKey="Eau" fill={TYPE_ENERGIE_INFO.eau.cls_solid} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Tableau N vs N-1 */}
      <section className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📊 Comparaison N vs N-1 (12 derniers mois)</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-2 py-1.5">Type</th>
                <th className="text-left px-2 py-1.5">Mois</th>
                <th className="text-right px-2 py-1.5">Conso N</th>
                <th className="text-right px-2 py-1.5">Conso N-1</th>
                <th className="text-right px-2 py-1.5">Variation</th>
                <th className="text-right px-2 py-1.5">€ N</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(['electricite','gaz','eau'] as TypeEnergie[]).flatMap(t =>
                data.comparaisons[t].filter(c => c.conso_n > 0 || c.conso_n1 > 0).map(c => {
                  const info = TYPE_ENERGIE_INFO[t]
                  const sty = ALERTE_STYLE[c.alerte]
                  return (
                    <tr key={t + c.mois_iso} className={cn(c.alerte === 'critique' && 'bg-red-50', c.alerte === 'haute' && 'bg-amber-50')}>
                      <td className="px-2 py-1.5"><span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span></td>
                      <td className="px-2 py-1.5 capitalize">{c.libelle}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold">{c.conso_n > 0 ? c.conso_n.toFixed(0) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{c.conso_n1 > 0 ? c.conso_n1.toFixed(0) : '—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        {c.conso_n1 > 0 ? (
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', sty.cls)}>
                            {fmtPct(c.variation_pct)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtPrix(c.montant_n)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Coût par plat détail */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🍽️ Coût énergétique par plat — {data.moisCourant}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <p className="text-xs text-zinc-500">Total énergie mois</p>
            <p className="text-2xl font-bold tabular-nums">{fmtPrix(data.total_energie_mois)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Plats servis ce mois</p>
            <p className="text-2xl font-bold tabular-nums">{data.nb_plats_mois}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Coût / plat</p>
            <p className={cn('text-2xl font-bold tabular-nums', data.cout_par_plat_mois > 1.5 ? 'text-red-700' : data.cout_par_plat_mois > 1 ? 'text-amber-700' : 'text-emerald-700')}>{fmtPrix(data.cout_par_plat_mois)}</p>
            <p className="text-[10px] text-zinc-500">Cible secteur &lt; 1,20 €</p>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── TAB 2 — Relevés ───────────────────────────────────────────────
function RelevesTab({ releves, onError, onOk }: { releves: ReleveEnergie[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [filtre, setFiltre] = useState<TypeEnergie | 'tous'>('tous')
  const router = useRouter()

  const filtered = useMemo(() => {
    if (filtre === 'tous') return releves
    return releves.filter(r => r.type === filtre)
  }, [releves, filtre])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <FiltreBtn active={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous ({releves.length})</FiltreBtn>
          {(['electricite','gaz','eau','autre'] as TypeEnergie[]).map(t => {
            const info = TYPE_ENERGIE_INFO[t]
            const n = releves.filter(r => r.type === t).length
            return (
              <FiltreBtn key={t} active={filtre === t} onClick={() => setFiltre(t)}>
                {info.emoji} {info.label} ({n})
              </FiltreBtn>
            )
          })}
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau relevé</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun relevé. Saisis le premier !</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Type</th>
                <th className="text-left px-3 py-1.5">Période</th>
                <th className="text-right px-3 py-1.5">Conso</th>
                <th className="text-right px-3 py-1.5">€ HT</th>
                <th className="text-right px-3 py-1.5">€ TTC</th>
                <th className="text-left px-3 py-1.5">Fournisseur</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.slice().reverse().map(r => {
                const info = TYPE_ENERGIE_INFO[r.type]
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2"><span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span></td>
                    <td className="px-3 py-2 text-[11px] text-zinc-600">{fmtDate(r.periode_debut)} → {fmtDate(r.periode_fin)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtConso(r.consommation, r.unite)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{fmtPrix(r.montant_ht)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtPrix(r.montant_ttc)}</td>
                    <td className="px-3 py-2 text-zinc-600">
                      {r.fournisseur ?? '—'}
                      {r.num_facture && <p className="text-[10px] text-zinc-400">{r.num_facture}</p>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={async () => {
                        if (!confirm(`Supprimer ce relevé ${info.label} ?`)) return
                        try { await supprimerReleveEnergie(r.id); onOk('Supprimé'); router.refresh() }
                        catch (e) { onError(e) }
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
        <ReleveModal onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Relevé enregistré') }} />
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

function ReleveModal({ onClose, onError, onSuccess }: { onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const today = new Date()
  const debutMoisDernier = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10)
  const finMoisDernier = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10)

  const [type, setType] = useState<TypeEnergie>('electricite')
  const [unite, setUnite] = useState<UniteEnergie>('kWh')
  const [periodeDebut, setPeriodeDebut] = useState(debutMoisDernier)
  const [periodeFin, setPeriodeFin] = useState(finMoisDernier)
  const [conso, setConso] = useState(0)
  const [ht, setHt] = useState(0)
  const [ttc, setTtc] = useState(0)
  const [fournisseur, setFournisseur] = useState('')
  const [numFacture, setNumFacture] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function changeType(t: TypeEnergie) {
    setType(t)
    setUnite(TYPE_ENERGIE_INFO[t].uniteDefaut)
  }

  function valider() {
    if (conso <= 0) { onError(new Error('Consommation obligatoire')); return }
    if (ttc <= 0) { onError(new Error('Montant TTC obligatoire')); return }
    startTransition(async () => {
      try {
        await creerReleveEnergie({
          type,
          date_releve: new Date().toISOString().slice(0, 10),
          periode_debut: periodeDebut, periode_fin: periodeFin,
          consommation: conso, unite,
          prix_unitaire_ht: ht > 0 && conso > 0 ? ht / conso : null,
          montant_ht: ht || ttc / 1.20, montant_ttc: ttc,
          fournisseur: fournisseur.trim() || null,
          num_facture: numFacture.trim() || null,
          notes: notes.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nouveau relevé énergie</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full hover:bg-zinc-100">×</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          <Field label="Type d'énergie">
            <div className="flex flex-wrap gap-1.5">
              {(['electricite','gaz','eau','autre'] as TypeEnergie[]).map(t => {
                const info = TYPE_ENERGIE_INFO[t]
                return (
                  <button key={t} onClick={() => changeType(t)} className={cn(
                    'px-3 h-12 rounded-md border-2 text-sm font-bold transition-colors',
                    type === t ? info.cls + ' border-current' : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
                  )}>{info.emoji} {info.label}</button>
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Période début"><input type="date" value={periodeDebut} onChange={e => setPeriodeDebut(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
            <Field label="Période fin"><input type="date" value={periodeFin} onChange={e => setPeriodeFin(e.target.value)} min={periodeDebut} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label={`Consommation (${unite === 'm3' ? 'm³' : unite})`}>
              <input type="number" step="0.001" value={conso} onChange={e => setConso(parseFloat(e.target.value) || 0)} className="w-full h-14 px-3 rounded-md border border-zinc-300 text-2xl font-bold tabular-nums text-right" />
            </Field>
            <Field label="Unité">
              <select value={unite} onChange={e => setUnite(e.target.value as UniteEnergie)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
                <option value="kWh">kWh</option>
                <option value="m3">m³</option>
                <option value="litre">Litres</option>
                <option value="autre">Autre</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Montant HT (€)"><input type="number" step="0.01" value={ht} onChange={e => setHt(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
            <Field label="Montant TTC (€) *"><input type="number" step="0.01" value={ttc} onChange={e => setTtc(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums font-bold" /></Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Fournisseur"><input value={fournisseur} onChange={e => setFournisseur(e.target.value)} placeholder="EDF, ENGIE…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
            <Field label="N° facture"><input value={numFacture} onChange={e => setNumFacture(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
          </div>

          <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>

          <div className="flex gap-2 pt-3 border-t border-zinc-200 -mx-5 px-5 -mb-5 pb-5 sticky bottom-0 bg-white">
            <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
            <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : '+ Enregistrer'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TAB 3 — Suggestions ───────────────────────────────────────────
function SuggestionsTab({ suggestions }: { suggestions: DataEnergie['suggestions'] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">Recommandations générées automatiquement à partir de vos relevés du mois courant et de l&apos;historique disponible.</p>
      <div className="space-y-2">
        {suggestions.map((s, i) => {
          const cls = s.niveau === 'urgent' ? 'border-red-300 bg-red-50'
            : s.niveau === 'warn' ? 'border-amber-300 bg-amber-50'
            : 'border-blue-300 bg-blue-50'
          return (
            <article key={i} className={cn('rounded-lg border-2 p-3', cls)}>
              <h3 className="font-bold text-base">{s.titre}</h3>
              <p className="text-sm mt-1">{s.detail}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
