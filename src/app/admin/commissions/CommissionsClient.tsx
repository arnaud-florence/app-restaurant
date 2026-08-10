'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { fmtPrix } from '@/lib/service'
import type { ServiceTiers, Commission } from './page'
import { addCommission, deleteCommission } from './actions'

const moisCourant = () => new Date().toISOString().slice(0, 7) // YYYY-MM

function bornesMois(mois: string): { debut: string; fin: string } {
  const [y, m] = mois.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { debut: `${mois}-01`, fin: `${mois}-${String(lastDay).padStart(2, '0')}` }
}

const inputCls = 'w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none'

export default function CommissionsClient({ services, commissions }: { services: ServiceTiers[]; commissions: Commission[] }) {
  const [moisFacture, setMoisFacture] = useState(moisCourant())
  const totalAll = useMemo(() => commissions.reduce((s, c) => s + c.montant_commission, 0), [commissions])
  const totalMois = useMemo(() => {
    const m = moisCourant()
    return commissions.filter(c => c.periode_debut.startsWith(m)).reduce((s, c) => s + c.montant_commission, 0)
  }, [commissions])
  const parService = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of commissions) map.set(c.service_nom, (map.get(c.service_nom) ?? 0) + c.montant_commission)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [commissions])

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">🤝 Commissions services tiers</h1>
        <p className="text-sm text-zinc-500 mt-1">
          FDJ, tabac, relais colis… Saisis ta <b>commission</b> (ton revenu) par période. Le brut transité
          ne t'appartient pas (pour compte de tiers) — il reste <b>hors CA principal</b>.
        </p>
      </header>

      {/* Totaux */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Commissions ce mois" value={fmtPrix(totalMois)} accent="emerald" />
        <StatCard label="Commissions cumulées" value={fmtPrix(totalAll)} accent="blue" />
        <StatCard label="Services tiers actifs" value={String(services.length)} accent="zinc" />
      </div>

      {/* Facture mensuelle pour le comptable */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-zinc-700">📄 Facture mensuelle des commissions</p>
          <p className="text-xs text-zinc-500 mt-0.5">Récap TVA 20 % à transmettre au comptable (FDJ, tabac sur marge, colis).</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={moisFacture}
            onChange={e => setMoisFacture(e.target.value || moisCourant())}
            className="h-10 px-3 rounded-md border border-zinc-300 text-sm outline-none focus:border-emerald-500"
          />
          <Link
            href={`/admin/commissions/facture/print?mois=${moisFacture}`}
            className="h-10 px-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
          >
            <Printer className="h-4 w-4" /> Éditer la facture
          </Link>
        </div>
      </div>

      {services.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Aucun service tiers. Va dans <b>Points de vente</b>, décoche « Compte dans le CA principal » sur un
          point de vente (FDJ, tabac, colis) pour qu'il apparaisse ici.
        </div>
      ) : (
        <FormCommission services={services} />
      )}

      {/* Répartition par service */}
      {parService.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-700 mb-2">Par service (cumulé)</p>
          <div className="flex flex-wrap gap-2">
            {parService.map(([nom, total]) => (
              <span key={nom} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 text-sm">
                <span className="font-bold text-zinc-700">{nom}</span>
                <span className="text-emerald-600 font-black tabular-nums">{fmtPrix(total)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <p className="text-sm font-bold text-zinc-700 px-4 py-3 border-b border-zinc-100">Historique</p>
        {commissions.length === 0 ? (
          <p className="text-sm text-zinc-400 px-4 py-8 text-center">Aucune commission enregistrée pour l'instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500 bg-zinc-50">
                <tr>
                  <th className="px-4 py-2 font-medium">Période</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium text-right">Commission</th>
                  <th className="px-4 py-2 font-medium text-right">Brut transité</th>
                  <th className="px-4 py-2 font-medium text-right">Opér.</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {commissions.map(c => <LigneCommission key={c.id} c={c} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function FormCommission({ services }: { services: ServiceTiers[] }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [mois, setMois] = useState(moisCourant())
  const [commission, setCommission] = useState('')
  const [brut, setBrut] = useState('')
  const [nbOp, setNbOp] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const router = useRouter()

  function submit() {
    const montant = parseFloat(commission.replace(',', '.'))
    if (!serviceId || isNaN(montant)) { setMsg('Sélectionne un service et saisis une commission.'); return }
    const { debut, fin } = bornesMois(mois)
    start(async () => {
      const r = await addCommission({
        etablissement_id: serviceId,
        periode_debut: debut,
        periode_fin: fin,
        montant_commission: montant,
        montant_brut_transite: brut.trim() ? parseFloat(brut.replace(',', '.')) : null,
        nb_operations: nbOp.trim() ? parseInt(nbOp, 10) : null,
        notes: notes.trim() || null,
      })
      if (r.ok) {
        setCommission(''); setBrut(''); setNbOp(''); setNotes(''); setMsg('✓ Commission enregistrée')
        router.refresh()
      } else setMsg(`Erreur : ${r.error}`)
      setTimeout(() => setMsg(null), 5000)
    })
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-zinc-700 mb-3">Enregistrer une commission</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Service tiers">
          <select className={inputCls} value={serviceId} onChange={e => setServiceId(e.target.value)}>
            {services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </Field>
        <Field label="Mois">
          <input type="month" className={inputCls} value={mois} onChange={e => setMois(e.target.value)} />
        </Field>
        <Field label="Commission (€)">
          <input className={inputCls + ' tabular-nums text-right'} value={commission} onChange={e => setCommission(e.target.value)} placeholder="0,00" inputMode="decimal" />
        </Field>
        <Field label="Brut transité (€) — optionnel">
          <input className={inputCls + ' tabular-nums text-right'} value={brut} onChange={e => setBrut(e.target.value)} placeholder="info" inputMode="decimal" />
        </Field>
        <Field label="Nb opérations — optionnel">
          <input className={inputCls + ' tabular-nums text-right'} value={nbOp} onChange={e => setNbOp(e.target.value)} placeholder="0" inputMode="numeric" />
        </Field>
        <Field label="Notes — optionnel">
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="…" />
        </Field>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={submit} disabled={pending} className="h-11 px-5 rounded-md bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-700 disabled:opacity-40">
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {msg && <span className="text-xs text-zinc-600">{msg}</span>}
      </div>
    </div>
  )
}

function LigneCommission({ c }: { c: Commission }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <tr className="hover:bg-zinc-50">
      <td className="px-4 py-2 tabular-nums text-zinc-600 whitespace-nowrap">{c.periode_debut} → {c.periode_fin}</td>
      <td className="px-4 py-2 font-medium text-zinc-800">{c.service_nom}</td>
      <td className="px-4 py-2 text-right tabular-nums font-bold text-emerald-600">{fmtPrix(c.montant_commission)}</td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-400">{c.montant_brut_transite != null ? fmtPrix(c.montant_brut_transite) : '—'}</td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{c.nb_operations ?? '—'}</td>
      <td className="px-4 py-2 text-zinc-500 max-w-[160px] truncate">{c.notes ?? ''}</td>
      <td className="px-4 py-2 text-right">
        <button
          onClick={() => start(async () => { await deleteCommission(c.id); router.refresh() })}
          disabled={pending}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          title="Supprimer"
        >🗑</button>
      </td>
    </tr>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: 'emerald' | 'blue' | 'zinc' }) {
  const cls = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    zinc: 'border-zinc-200 bg-white text-zinc-700',
  }[accent]
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cls}`}>
      <p className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-black tabular-nums mt-1">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
