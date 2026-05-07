'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { cn } from '@/lib/utils'
import {
  type ReleveMeteo, type ConditionMeteo,
  CONDITION_INFO, fmtPrix, fmtDate,
} from '@/lib/previsionnel'
import { creerReleveMeteo, supprimerReleveMeteo, importerPrevisionsOWM } from './actions'
import type { DataPrevisionnel } from './page'

type Tab = 'meteo' | 'previsions' | 'correlations'

export default function PrevisionnelClient({ data }: { data: DataPrevisionnel }) {
  const [tab, setTab] = useState<Tab>('previsions')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2400) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const totalCA = data.prevision.reduce((s, p) => s + p.ca_prevision, 0)
  const totalCouverts = data.prevision.reduce((s, p) => s + p.nb_couverts_prevu, 0)
  const alertes = data.prevision.filter(p => p.alerte === 'critique' || p.alerte === 'faible').length

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">← Accueil</Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Pilotage prédictif</p>
              <h1 className="text-2xl font-bold">🔮 Prévisionnel</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="CA prévu 7j" value={fmtPrix(totalCA)} />
            <KPI label="Couverts 7j" value={String(totalCouverts)} />
            <KPI label="Jours à risque" value={String(alertes)} accent={alertes > 0 ? 'orange' : 'vert'} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'previsions'}   onClick={() => setTab('previsions')}>📊 Prévisions 7j</TabBtn>
          <TabBtn active={tab === 'meteo'}        onClick={() => setTab('meteo')}>🌤️ Météo ({data.releves.length})</TabBtn>
          <TabBtn active={tab === 'correlations'} onClick={() => setTab('correlations')}>📈 Corrélations</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {tab === 'previsions'   && <PrevisionsTab data={data} />}
        {tab === 'meteo'        && <MeteoTab data={data} onError={flashKo} onOk={flashOk} />}
        {tab === 'correlations' && <CorrelationsTab data={data} />}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: string; accent?: 'zinc' | 'orange' | 'vert' }) {
  const cls = {
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
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

// ─── TAB 1 — Prévisions 7 jours ────────────────────────────────────
function PrevisionsTab({ data }: { data: DataPrevisionnel }) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📊 Prévisions par jour (7 prochains jours)</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-3 py-1.5">Jour</th>
              <th className="text-left px-3 py-1.5">Météo</th>
              <th className="text-right px-3 py-1.5">CA base</th>
              <th className="text-right px-3 py-1.5">CA prévu</th>
              <th className="text-right px-3 py-1.5">Couverts</th>
              <th className="text-left px-3 py-1.5">Alerte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.prevision.map(p => {
              const meteoInfo = p.meteo ? CONDITION_INFO[p.meteo] : null
              const ecart = p.ca_base > 0 ? ((p.ca_prevision - p.ca_base) / p.ca_base) * 100 : 0
              return (
                <tr key={p.date} className={cn(
                  p.alerte === 'critique' && 'bg-red-50',
                  p.alerte === 'faible' && 'bg-amber-50',
                  p.alerte === 'forte' && 'bg-emerald-50',
                )}>
                  <td className="px-3 py-2">
                    <p className="font-bold capitalize">{fmtDate(p.date)}</p>
                  </td>
                  <td className="px-3 py-2">
                    {meteoInfo ? (
                      <span className="text-sm">{meteoInfo.emoji} {meteoInfo.label}</span>
                    ) : (
                      <span className="text-zinc-400 text-xs italic">— pas de prévision —</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{fmtPrix(p.ca_base)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">
                    {fmtPrix(p.ca_prevision)}
                    {Math.abs(ecart) > 1 && <span className={cn('text-[10px] ml-1', ecart < 0 ? 'text-red-700' : 'text-emerald-700')}>({ecart > 0 ? '+' : ''}{ecart.toFixed(1)}%)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.nb_couverts_prevu}</td>
                  <td className="px-3 py-2 text-[11px]">
                    {p.alerte && <span className={cn('font-bold', p.alerte === 'critique' && 'text-red-700', p.alerte === 'faible' && 'text-amber-700', p.alerte === 'forte' && 'text-emerald-700')}>{p.raison}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* Suggestions */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-2">💡 Suggestions IA</h2>
        <div className="space-y-2">
          {data.suggestions.map((s, i) => {
            const cls = s.niveau === 'urgent' ? 'border-red-300 bg-red-50'
              : s.niveau === 'warn' ? 'border-amber-300 bg-amber-50'
              : 'border-blue-300 bg-blue-50'
            return (
              <article key={i} className={cn('rounded-lg border-2 p-3', cls)}>
                <h3 className="font-bold text-sm">{s.titre}</h3>
                <p className="text-sm mt-1">{s.detail}</p>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ─── TAB 2 — Météo ─────────────────────────────────────────────────
function MeteoTab({ data, onError, onOk }: { data: DataPrevisionnel; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const today = new Date().toISOString().slice(0, 10)
  const passes = data.releves.filter(r => !r.est_prevision).sort((a, b) => b.date_meteo.localeCompare(a.date_meteo))
  const futurs = data.releves.filter(r => r.est_prevision && r.date_meteo >= today).sort((a, b) => a.date_meteo.localeCompare(b.date_meteo))

  function importer() {
    startTransition(async () => {
      const r = await importerPrevisionsOWM()
      if (r.ok) { onOk(`${r.nb_jours} jours importés depuis OpenWeatherMap`); router.refresh() }
      else { onError(new Error(r.raison)) }
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <p className="font-bold">🌐 OpenWeatherMap : {data.hasOWMKey ? `clé configurée${data.ville ? ` · ville "${data.ville}"` : ''}` : 'non configuré'}</p>
          <p className="text-[11px] text-zinc-600">Configurer dans /admin/setup les paramètres `openweathermap_api_key` et `meteo_ville` (ex: "Paris,FR").</p>
        </div>
        <button onClick={importer} disabled={isPending || !data.hasOWMKey || !data.ville}
          className="min-h-[40px] px-3 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-300 text-white font-bold text-sm">
          {isPending ? 'Import…' : '🔄 Importer prévisions 5j'}
        </button>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Saisir météo</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-lg border border-zinc-200 bg-white">
          <header className="px-4 py-2 border-b border-zinc-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🌤️ Prévisions à venir ({futurs.length})</h2>
          </header>
          {futurs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune prévision. Importe depuis OpenWeatherMap ou saisis manuellement.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {futurs.map(r => <ReleveItem key={r.id} releve={r} onError={onError} onOk={onOk} />)}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white">
          <header className="px-4 py-2 border-b border-zinc-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📅 Relevés passés ({passes.length})</h2>
          </header>
          {passes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun relevé constaté. Saisis la météo des jours passés pour améliorer les corrélations.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 max-h-[60vh] overflow-y-auto">
              {passes.slice(0, 30).map(r => <ReleveItem key={r.id} releve={r} onError={onError} onOk={onOk} />)}
            </ul>
          )}
        </section>
      </div>

      {showForm && (
        <ReleveModal onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Relevé enregistré') }} />
      )}
    </div>
  )
}

function ReleveItem({ releve, onError, onOk }: { releve: ReleveMeteo; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const info = CONDITION_INFO[releve.conditions]
  const router = useRouter()
  return (
    <li className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold capitalize">{fmtDate(releve.date_meteo)}</span>
          <span>{info.emoji} {info.label}</span>
          {releve.source !== 'manuel' && <span className="text-[10px] text-blue-700">via {releve.source}</span>}
        </div>
        <p className="text-[11px] text-zinc-500">
          {releve.temperature_min !== null && releve.temperature_max !== null && `${releve.temperature_min}°→${releve.temperature_max}°`}
          {releve.precipitations_mm > 0 && ` · 💧 ${releve.precipitations_mm}mm`}
          {releve.vent_kmh > 5 && ` · 💨 ${releve.vent_kmh}km/h`}
        </p>
      </div>
      <button onClick={async () => {
        if (!confirm('Supprimer ce relevé ?')) return
        try { await supprimerReleveMeteo(releve.id); onOk('Supprimé'); router.refresh() } catch (e) { onError(e) }
      }} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
    </li>
  )
}

function ReleveModal({ onClose, onError, onSuccess }: { onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [conditions, setConditions] = useState<ConditionMeteo>('ensoleille')
  const [tempMin, setTempMin] = useState<number | ''>('')
  const [tempMax, setTempMax] = useState<number | ''>('')
  const [precip, setPrecip] = useState(0)
  const [vent, setVent] = useState(0)
  const [estPrevision, setEstPrevision] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    startTransition(async () => {
      try {
        await creerReleveMeteo({
          date_meteo: date,
          temperature_min: tempMin === '' ? null : Number(tempMin),
          temperature_max: tempMax === '' ? null : Number(tempMax),
          conditions,
          precipitations_mm: precip,
          vent_kmh: vent,
          humidite_pct: null,
          source: 'manuel',
          est_prevision: estPrevision,
          notes: null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Saisir météo</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          <Field label="Type">
            <select value={estPrevision ? '1' : '0'} onChange={e => setEstPrevision(e.target.value === '1')} className="w-full h-12 px-3 rounded-md border border-zinc-300">
              <option value="0">Relevé constaté</option>
              <option value="1">Prévision</option>
            </select>
          </Field>
        </div>
        <Field label="Conditions">
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(CONDITION_INFO) as ConditionMeteo[]).map(c => {
              const info = CONDITION_INFO[c]
              return (
                <button key={c} onClick={() => setConditions(c)} className={cn(
                  'px-2 h-12 rounded-md border-2 text-xs font-bold transition-colors',
                  conditions === c ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                )}>{info.emoji} {info.label}</button>
              )
            })}
          </div>
        </Field>
        <div className="grid grid-cols-4 gap-2">
          <Field label="T° min"><input type="number" step="0.1" value={tempMin} onChange={e => setTempMin(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
          <Field label="T° max"><input type="number" step="0.1" value={tempMax} onChange={e => setTempMax(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
          <Field label="Pluie mm"><input type="number" step="0.1" value={precip} onChange={e => setPrecip(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
          <Field label="Vent km/h"><input type="number" step="1" value={vent} onChange={e => setVent(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
          <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : '+ Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── TAB 3 — Corrélations ──────────────────────────────────────────
function CorrelationsTab({ data }: { data: DataPrevisionnel }) {
  const points = data.historique.map(h => {
    const meteo = data.releves.find(r => r.date_meteo === h.date && !r.est_prevision)
    return meteo ? { x: CONDITION_INFO[meteo.conditions].impact_ca * 100, y: h.ca, label: format(parseISO(h.date), 'd MMM', { locale: fr }) } : null
  }).filter(p => p !== null) as { x: number; y: number; label: string }[]

  const r2 = data.regression.r2
  const force = r2 < 0.1 ? 'très faible' : r2 < 0.3 ? 'faible' : r2 < 0.5 ? 'modérée' : r2 < 0.7 ? 'forte' : 'très forte'

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-3">📈 Régression linéaire CA vs météo</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Stat label="Coefficient de détermination R²" value={r2.toFixed(3)} subtitle={`Corrélation ${force}`} accent={r2 > 0.5 ? 'vert' : r2 > 0.3 ? 'orange' : 'zinc'} />
          <Stat label="Pente (slope)" value={data.regression.slope.toFixed(2)} subtitle={data.regression.slope > 0 ? 'Beau temps = ↑ CA' : 'Pas de tendance claire'} />
          <Stat label="Points analysés" value={String(data.regression.n)} subtitle="Plus de points = plus fiable" />
        </div>

        {points.length === 0 ? (
          <p className="text-center py-8 text-zinc-400 text-sm">Pas assez de données. Saisis météo + commandes encaissées pour activer les corrélations.</p>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="x" name="Impact météo" unit="%" type="number" domain={[-30, 15]} fontSize={11} label={{ value: 'Impact météo théorique (%)', position: 'bottom', offset: 0, fontSize: 11 }} />
                <YAxis dataKey="y" name="CA" type="number" fontSize={11} tickFormatter={(v) => `${v}€`} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => n === 'CA' ? `${v}€` : `${v}%`} />
                <ReferenceLine y={data.regression.intercept} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `Moyenne ${data.regression.intercept.toFixed(0)}€`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
                <Scatter name="Jours" data={points} fill="#10b981" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 mb-2">⚙️ Coefficients d&apos;impact météo (constants)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(CONDITION_INFO) as ConditionMeteo[]).map(c => {
            const i = CONDITION_INFO[c]
            return (
              <div key={c} className="flex items-center justify-between border border-zinc-200 rounded p-2 text-xs">
                <span>{i.emoji} {i.label}</span>
                <span className={cn('font-bold tabular-nums', i.impact_ca > 0 ? 'text-emerald-700' : i.impact_ca < 0 ? 'text-red-700' : 'text-zinc-500')}>
                  {i.impact_ca > 0 ? '+' : ''}{(i.impact_ca * 100).toFixed(0)}%
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-zinc-500 italic mt-2">
          Coefficients par défaut basés sur les retours du secteur. Personnalisables dans <code>src/lib/previsionnel.ts</code> selon ton historique réel.
        </p>
      </section>
    </div>
  )
}

function Stat({ label, value, subtitle, accent = 'zinc' }: { label: string; value: string; subtitle?: string; accent?: 'zinc' | 'orange' | 'vert' }) {
  const cls = {
    zinc: 'bg-white border-zinc-200',
    orange: 'bg-amber-50 border-amber-200',
    vert: 'bg-emerald-50 border-emerald-200',
  }[accent]
  return (
    <div className={cn('rounded-lg border p-3', cls)}>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
      {subtitle && <p className="text-[10px] mt-0.5 text-zinc-600">{subtitle}</p>}
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
