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
  type CompteResultat, type TvaSummary, type ChargeFixe, type NoteDeFrais,
  type CategorieCharge, type FrequenceCharge, type StatutNDF, type ProjectionPoint,
  CATEGORIE_CHARGE_INFO, STATUT_NDF_LABEL,
  fmtPrix, fmtPct, fmtDate,
  seuilRentabiliteJour, simulerCA,
} from '@/lib/finances'
import {
  creerCharge, supprimerCharge,
  creerNoteDeFrais, rembourserNDF, refuserNDF,
  ajusterTresorerie, exporterCSVMois,
} from './actions'

type Tab = 'cr' | 'charges' | 'tresor' | 'ndf' | 'export'

type Employe = { id: string; prenom: string; nom: string; poste: string }

export default function FinancesClient({
  cr, tva, moisLibelle, moisIso,
  charges, notes, employes,
  tresorSolde, tresorDate, caJourMoyen, projection,
}: {
  cr: CompteResultat
  tva: TvaSummary
  moisLibelle: string
  moisIso: string
  charges: ChargeFixe[]
  notes: NoteDeFrais[]
  employes: Employe[]
  tresorSolde: number
  tresorDate: string
  caJourMoyen: number
  projection: ProjectionPoint[]
}) {
  const [tab, setTab] = useState<Tab>('cr')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const ndfEnAttente = notes.filter(n => n.statut === 'en_attente').length
  const echeancesProches = charges.filter(c =>
    c.prochaine_echeance && new Date(c.prochaine_echeance) <= new Date(Date.now() + 7 * 86400000)
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
          accent="emerald"
          subtitle="Finances"
          title="Finances & TVA"
          description="P&L live, trésorerie 30/60/90j, charges fixes, simulateurs, notes de frais."
          actions={
            <div className="hidden sm:flex flex-wrap gap-2 text-sm">
              <KPI label={`Résultat ${moisLibelle}`} value={fmtPrix(cr.resultat_net)} accent={cr.resultat_net >= 0 ? 'vert' : 'rouge'} />
              <KPI label="TVA" value={fmtPrix(tva.tva_a_reverser)} accent={tva.tva_a_reverser > 0 ? 'orange' : 'zinc'} />
              <KPI label="Trésor." value={fmtPrix(tresorSolde)} />
            </div>
          }
        >
          <div className="flex gap-1.5 overflow-x-auto">
            <PillTab active={tab === 'cr'}      onClick={() => setTab('cr')}>📊 Compte de résultat</PillTab>
            <PillTab active={tab === 'charges'} onClick={() => setTab('charges')}>
              💸 Charges & TVA {echeancesProches > 0 && <PillCount n={echeancesProches} active={tab === 'charges'} />}
            </PillTab>
            <PillTab active={tab === 'tresor'}  onClick={() => setTab('tresor')}>💰 Trésorerie & simulateurs</PillTab>
            <PillTab active={tab === 'ndf'}     onClick={() => setTab('ndf')}>
              📋 Notes de frais {ndfEnAttente > 0 && <PillCount n={ndfEnAttente} active={tab === 'ndf'} />}
            </PillTab>
            <PillTab active={tab === 'export'}  onClick={() => setTab('export')}>📤 Export & rapport</PillTab>
          </div>
        </AdminPageHeader>

        {tab === 'cr'      && <CRTab cr={cr} moisLibelle={moisLibelle} chargesFixesMensuelles={cr.charges_fixes_mensuelles} masseSalariale={cr.masse_salariale} />}
        {tab === 'charges' && <ChargesTab charges={charges} tva={tva} moisLibelle={moisLibelle} onError={flashKo} onOk={flashOk} />}
        {tab === 'tresor'  && <TresorTab solde={tresorSolde} date={tresorDate} caJour={caJourMoyen} projection={projection} cr={cr} onError={flashKo} onOk={flashOk} />}
        {tab === 'ndf'     && <NDFTab notes={notes} employes={employes} onError={flashKo} onOk={flashOk} />}
        {tab === 'export'  && <ExportTab moisIso={moisIso} onError={flashKo} onOk={flashOk} />}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: string; accent?: 'zinc' | 'vert' | 'orange' | 'rouge' }) {
  const cls = {
    zinc:   'bg-zinc-50 text-zinc-700 border-zinc-200',
    vert:   'bg-emerald-50 text-emerald-900 border-emerald-200',
    orange: 'bg-amber-50 text-amber-900 border-amber-200',
    rouge:  'bg-red-50 text-red-900 border-red-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Compte de résultat ────────────────────────────────────
function CRTab({ cr, moisLibelle, chargesFixesMensuelles, masseSalariale }: {
  cr: CompteResultat
  moisLibelle: string
  chargesFixesMensuelles: number
  masseSalariale: number
}) {
  const seuil = seuilRentabiliteJour(chargesFixesMensuelles, masseSalariale, 26)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <BigStat label="CA TTC" value={fmtPrix(cr.ca_ttc)} accent="zinc" subtitle={moisLibelle} />
        <BigStat label="Food cost" value={fmtPrix(cr.food_cost)} accent={cr.food_cost_pct > 32 ? 'rouge' : cr.food_cost_pct > 28 ? 'orange' : 'vert'} subtitle={fmtPct(cr.food_cost_pct) + ' du CA HT'} />
        <BigStat label="Masse salariale" value={fmtPrix(cr.masse_salariale)} accent={cr.masse_salariale_pct > 35 ? 'rouge' : cr.masse_salariale_pct > 30 ? 'orange' : 'vert'} subtitle={fmtPct(cr.masse_salariale_pct) + ' du CA HT'} />
        <BigStat label="Charges fixes" value={fmtPrix(cr.charges_fixes_mensuelles)} subtitle={fmtPct(cr.charges_fixes_pct) + ' du CA HT'} />
        <BigStat label="Résultat net" value={fmtPrix(cr.resultat_net)} accent={cr.resultat_net < 0 ? 'rouge' : cr.marge_nette_pct < 5 ? 'orange' : 'vert'} subtitle={`Marge ${fmtPct(cr.marge_nette_pct)}`} />
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📋 Compte de résultat détaillé — {moisLibelle}</h2>
        </header>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            <tr className="bg-emerald-50">
              <td className="px-4 py-2 font-bold">+ Chiffre d&apos;affaires HT</td>
              <td className="px-4 py-2 text-right tabular-nums font-bold">{fmtPrix(cr.ca_ht)}</td>
            </tr>
            <tr><td className="px-4 py-2 pl-8 text-zinc-600">CA TTC : {fmtPrix(cr.ca_ttc)}</td><td></td></tr>
            <tr className="bg-red-50">
              <td className="px-4 py-2 font-bold">− Charges totales</td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-red-700">{fmtPrix(cr.total_charges)}</td>
            </tr>
            <tr><td className="px-4 py-2 pl-8 text-zinc-600">Food cost (réceptions fournisseurs)</td><td className="px-4 py-2 text-right tabular-nums">{fmtPrix(cr.food_cost)}</td></tr>
            <tr><td className="px-4 py-2 pl-8 text-zinc-600">Masse salariale (shifts planifiés)</td><td className="px-4 py-2 text-right tabular-nums">{fmtPrix(cr.masse_salariale)}</td></tr>
            {cr.ca_ttc > 0 && (cr.food_cost === 0 || cr.masse_salariale === 0) && (
              <tr><td colSpan={2} className="px-4 py-1.5 pl-8 text-[11px] text-amber-700 bg-amber-50 leading-snug">
                ⚠ Résultat net surévalué :{cr.food_cost === 0 ? ' food cost à 0 € (saisis tes réceptions fournisseurs)' : ''}{cr.food_cost === 0 && cr.masse_salariale === 0 ? ' ·' : ''}{cr.masse_salariale === 0 ? ' masse salariale à 0 € (planifie les shifts dans RH)' : ''}.
              </td></tr>
            )}
            <tr><td className="px-4 py-2 pl-8 text-zinc-600">Charges fixes mensualisées</td><td className="px-4 py-2 text-right tabular-nums">{fmtPrix(cr.charges_fixes_mensuelles)}</td></tr>
            <tr><td className="px-4 py-2 pl-8 text-zinc-600">Notes de frais remboursées</td><td className="px-4 py-2 text-right tabular-nums">{fmtPrix(cr.notes_de_frais_mois)}</td></tr>
            <tr className={cn('font-bold border-t-2 border-zinc-900', cr.resultat_net >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
              <td className="px-4 py-2 text-base">= Résultat net</td>
              <td className={cn('px-4 py-2 text-right tabular-nums text-lg', cr.resultat_net >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtPrix(cr.resultat_net)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Seuil de rentabilité quotidien</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{fmtPrix(seuil)}</p>
          <p className="text-[11px] text-zinc-500 mt-1">CA minimum / jour pour couvrir charges fixes + masse salariale (base 26 jours ouverts)</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Marge nette</p>
          <p className={cn('text-2xl font-bold tabular-nums mt-1', cr.marge_nette_pct >= 10 ? 'text-emerald-700' : cr.marge_nette_pct >= 5 ? 'text-amber-700' : 'text-red-700')}>{fmtPct(cr.marge_nette_pct)}</p>
          <p className="text-[11px] text-zinc-500 mt-1">Cible secteur restauration : 8–12%</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Charges variables</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{fmtPct(cr.food_cost_pct + cr.masse_salariale_pct)}</p>
          <p className="text-[11px] text-zinc-500 mt-1">Food cost + masse salariale du CA</p>
        </div>
      </section>
    </div>
  )
}

function BigStat({ label, value, accent = 'zinc', subtitle }: { label: string; value: string; accent?: 'zinc' | 'vert' | 'orange' | 'rouge'; subtitle?: string }) {
  const cls = {
    zinc:   'bg-white border-zinc-200',
    vert:   'bg-emerald-50 border-emerald-200',
    orange: 'bg-amber-50 border-amber-200',
    rouge:  'bg-red-50 border-red-200',
  }[accent]
  return (
    <div className={cn('rounded-lg border p-3', cls)}>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {subtitle && <p className="text-[10px] mt-0.5 text-zinc-600">{subtitle}</p>}
    </div>
  )
}

// ─── TAB 2 — Charges & TVA ─────────────────────────────────────────
function ChargesTab({ charges, tva, moisLibelle, onError, onOk }: {
  charges: ChargeFixe[]
  tva: TvaSummary
  moisLibelle: string
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* Charges fixes */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">💸 Charges fixes ({charges.length})</h2>
          <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle charge</button>
        </header>
        {/* Mobile : cartes */}
        {charges.length === 0 ? (
          <p className="md:hidden text-center py-8 text-zinc-400 text-sm">Aucune charge fixe.</p>
        ) : (
          <ul className="md:hidden divide-y divide-zinc-100">
            {charges.map(c => {
              const info = CATEGORIE_CHARGE_INFO[c.categorie]
              const proche = c.prochaine_echeance && new Date(c.prochaine_echeance) <= new Date(Date.now() + 7 * 86400000)
              return (
                <li key={c.id} className={cn('py-3 px-3 flex items-start justify-between gap-3', proche && 'bg-amber-50')}>
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900 truncate">{c.libelle}</p>
                    {c.fournisseur_nom && <p className="text-[11px] text-zinc-500 truncate">{c.fournisseur_nom}</p>}
                    <span className={cn('inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      {c.frequence}
                      {' · '}
                      <span className={cn('tabular-nums', proche && 'font-bold text-amber-700')}>
                        {c.prochaine_echeance ? fmtDate(c.prochaine_echeance) : '—'}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className="font-bold tabular-nums text-zinc-900">{fmtPrix(c.montant_ttc)}</p>
                    <p className="text-[11px] text-zinc-500 tabular-nums">{fmtPrix(c.montant_ht)} HT</p>
                    <button onClick={async () => {
                      if (!(await askConfirm(`Désactiver "${c.libelle}" ?`))) return
                      try { await supprimerCharge(c.id); onOk('Désactivée'); router.refresh() } catch (e) { onError(e) }
                    }} className="min-h-[44px] px-3 text-red-600 font-bold text-sm">Désactiver</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* Desktop : table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Libellé</th>
                <th className="text-left px-3 py-1.5">Catégorie</th>
                <th className="text-right px-3 py-1.5">HT</th>
                <th className="text-right px-3 py-1.5">TTC</th>
                <th className="text-left px-3 py-1.5">Fréquence</th>
                <th className="text-left px-3 py-1.5">Prochaine</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {charges.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-zinc-400">Aucune charge fixe.</td></tr>
              ) : charges.map(c => {
                const info = CATEGORIE_CHARGE_INFO[c.categorie]
                const proche = c.prochaine_echeance && new Date(c.prochaine_echeance) <= new Date(Date.now() + 7 * 86400000)
                return (
                  <tr key={c.id} className={cn(proche && 'bg-amber-50')}>
                    <td className="px-3 py-2">
                      <p className="font-bold">{c.libelle}</p>
                      {c.fournisseur_nom && <p className="text-[10px] text-zinc-500">{c.fournisseur_nom}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPrix(c.montant_ht)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtPrix(c.montant_ttc)}</td>
                    <td className="px-3 py-2 text-zinc-600 text-[11px]">{c.frequence}</td>
                    <td className={cn('px-3 py-2 text-[11px] tabular-nums', proche && 'font-bold text-amber-700')}>
                      {c.prochaine_echeance ? fmtDate(c.prochaine_echeance) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={async () => {
                        if (!(await askConfirm(`Désactiver "${c.libelle}" ?`))) return
                        try { await supprimerCharge(c.id); onOk('Désactivée'); router.refresh() } catch (e) { onError(e) }
                      }} className="text-zinc-400 hover:text-red-600">×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* TVA */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🧾 TVA — {moisLibelle}</h2>
        </header>
        <div className="p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span>TVA collectée (vente)</span>
            <span className="font-bold tabular-nums">{fmtPrix(tva.tva_collectee)}</span>
          </div>
          <div className="flex justify-between">
            <span>− TVA déductible (achat)</span>
            <span className="font-bold tabular-nums text-emerald-700">−{fmtPrix(tva.tva_deductible)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-zinc-900 pt-2 text-base font-bold">
            <span>= TVA à reverser</span>
            <span className={cn('tabular-nums', tva.tva_a_reverser > 0 ? 'text-amber-700' : 'text-emerald-700')}>{fmtPrix(tva.tva_a_reverser)}</span>
          </div>
          <p className="text-[10px] text-zinc-500 italic mt-2">Calcul sur taux uniforme 10% (restauration sur place). Affinage TVA mixte à venir.</p>
        </div>
      </section>

      {showForm && (
        <ChargeModal onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Charge créée') }} />
      )}
    </div>
  )
}

function ChargeModal({ onClose, onError, onSuccess }: { onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [libelle, setLibelle] = useState('')
  const [categorie, setCategorie] = useState<CategorieCharge>('loyer')
  const [ht, setHt] = useState(0)
  const [ttc, setTtc] = useState(0)
  const [freq, setFreq] = useState<FrequenceCharge>('mensuel')
  const [jour, setJour] = useState<number | ''>('')
  const [echeance, setEcheance] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [iban, setIban] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!libelle.trim()) { onError(new Error('Libellé obligatoire')); return }
    if (ttc <= 0) { onError(new Error('Montant TTC obligatoire')); return }
    startTransition(async () => {
      try {
        await creerCharge({
          libelle: libelle.trim(), categorie,
          montant_ht: ht || ttc / 1.10, montant_ttc: ttc,
          frequence: freq,
          jour_prelevement: jour === '' ? null : Number(jour),
          prochaine_echeance: echeance || null,
          fournisseur_nom: fournisseur.trim() || null,
          iban: iban.trim() || null,
          notes: notes.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle charge fixe" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Libellé"><input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Loyer, EDF, MAIF..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Catégorie">
          <select value={categorie} onChange={e => setCategorie(e.target.value as CategorieCharge)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(CATEGORIE_CHARGE_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Montant HT"><input type="number" step="0.01" value={ht} onChange={e => setHt(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Montant TTC *"><input type="number" step="0.01" value={ttc} onChange={e => setTtc(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums font-bold" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Fréquence">
          <select value={freq} onChange={e => setFreq(e.target.value as FrequenceCharge)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="mensuel">Mensuel</option>
            <option value="bimestriel">Bimestriel</option>
            <option value="trimestriel">Trimestriel</option>
            <option value="semestriel">Semestriel</option>
            <option value="annuel">Annuel</option>
          </select>
        </Field>
        <Field label="Jour prélèvement"><input type="number" min={1} max={31} value={jour} onChange={e => setJour(e.target.value === '' ? '' : Number(e.target.value))} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Prochaine échéance"><input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fournisseur"><input value={fournisseur} onChange={e => setFournisseur(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="IBAN (optionnel)"><input value={iban} onChange={e => setIban(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
      </div>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Créer" />
    </Modal>
  )
}

// ─── TAB 3 — Trésorerie & simulateurs ─────────────────────────────
function TresorTab({ solde, date, caJour, projection, cr, onError, onOk }: {
  solde: number
  date: string
  caJour: number
  projection: ProjectionPoint[]
  cr: CompteResultat
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showAjuster, setShowAjuster] = useState(false)
  const [caCible, setCaCible] = useState(cr.ca_ttc > 0 ? cr.ca_ttc : 50000)
  const sim = simulerCA(caCible, cr.food_cost_pct || 30, cr.masse_salariale_pct || 30, cr.charges_fixes_mensuelles)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* Trésorerie */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">💰 Trésorerie & projection</h2>
          <button onClick={() => setShowAjuster(true)} className="text-xs h-8 px-2 rounded border border-zinc-300 hover:bg-zinc-50 font-bold">Ajuster solde</button>
        </header>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Solde de référence (au {fmtDate(date)})</p>
            <p className="text-3xl font-bold tabular-nums mt-1">{fmtPrix(solde)}</p>
          </div>
          <div className="text-xs text-zinc-600">CA jour moyen 30 derniers jours : <b>{fmtPrix(caJour)}</b></div>
          <table className="w-full text-sm border-t border-zinc-200 mt-2">
            <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left py-1.5">Horizon</th>
                <th className="text-left py-1.5">Date</th>
                <th className="text-right py-1.5">Solde projeté</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {projection.map(p => (
                <tr key={p.jour}>
                  <td className="py-2 font-bold">{p.jour === 0 ? 'Aujourd\'hui' : `+${p.jour}j`}</td>
                  <td className="py-2 text-zinc-600">{fmtDate(p.date)}</td>
                  <td className={cn('py-2 text-right tabular-nums font-bold', p.solde < 0 ? 'text-red-700' : 'text-emerald-700')}>{fmtPrix(p.solde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Simulateur CA */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-4 py-2 border-b border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🎯 Simulateur de CA</h2>
        </header>
        <div className="p-4 space-y-3">
          <Field label="CA TTC cible (€)">
            <input type="number" step="100" value={caCible} onChange={e => setCaCible(parseFloat(e.target.value) || 0)}
              className="w-full h-14 px-3 rounded-md border border-zinc-300 text-2xl font-bold tabular-nums text-right" />
          </Field>
          <p className="text-[11px] text-zinc-500">
            Hypothèses : food cost {cr.food_cost_pct}% du CA HT, masse salariale {cr.masse_salariale_pct}% du CA HT, charges fixes mensuelles {fmtPrix(cr.charges_fixes_mensuelles)} (basé sur le mois en cours)
          </p>
          <div className="rounded bg-zinc-50 border border-zinc-200 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Food cost estimé</span><span className="tabular-nums">{fmtPrix(sim.food_cost_estime)}</span></div>
            <div className="flex justify-between"><span>Masse salariale estimée</span><span className="tabular-nums">{fmtPrix(sim.masse_salariale_estimee)}</span></div>
            <div className="flex justify-between"><span>Charges fixes</span><span className="tabular-nums">{fmtPrix(sim.charges_fixes)}</span></div>
            <div className="flex justify-between border-t border-zinc-300 pt-1.5 mt-1.5 font-bold">
              <span>Résultat net estimé</span>
              <span className={cn('tabular-nums text-lg', sim.resultat_net_estime >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtPrix(sim.resultat_net_estime)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Marge nette</span>
              <span className="tabular-nums">{fmtPct(sim.marge_nette_pct)}</span>
            </div>
          </div>
        </div>
      </section>

      {showAjuster && (
        <AjusterTresorModal solde={solde} date={date} onClose={() => setShowAjuster(false)} onError={onError}
          onSuccess={() => { setShowAjuster(false); onOk('Solde mis à jour') }} />
      )}
    </div>
  )
}

function AjusterTresorModal({ solde, date, onClose, onError, onSuccess }: { solde: number; date: string; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [newSolde, setNewSolde] = useState(solde)
  const [newDate, setNewDate] = useState(date)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    startTransition(async () => {
      try { await ajusterTresorerie({ solde: newSolde, date: newDate }); onSuccess(); router.refresh() }
      catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Ajuster le solde de trésorerie" onClose={onClose} disabled={isPending}>
      <Field label="Solde réel (€)">
        <input type="number" step="0.01" value={newSolde} onChange={e => setNewSolde(parseFloat(e.target.value) || 0)}
          className="w-full h-14 px-3 rounded-md border border-zinc-300 text-2xl font-bold tabular-nums text-right" />
      </Field>
      <Field label="Date du relevé">
        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" />
      </Field>
      <p className="text-xs text-zinc-500 italic">À mettre à jour idéalement chaque semaine en saisissant le solde de votre relevé bancaire.</p>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Mettre à jour" />
    </Modal>
  )
}

// ─── TAB 4 — Notes de frais ────────────────────────────────────────
function NDFTab({ notes, employes, onError, onOk }: { notes: NoteDeFrais[]; employes: Employe[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [filtre, setFiltre] = useState<StatutNDF | 'toutes'>('en_attente')
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  const filtered = useMemo(() => filtre === 'toutes' ? notes : notes.filter(n => n.statut === filtre), [notes, filtre])
  const totalEnAttente = notes.filter(n => n.statut === 'en_attente').reduce((s, n) => s + n.montant, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {(['en_attente','remboursee','refusee','toutes'] as const).map(f => (
            <button key={f} onClick={() => setFiltre(f)} className={cn(
              'px-3 h-9 rounded-full text-xs font-bold border',
              filtre === f ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300'
            )}>{f === 'en_attente' ? 'En attente' : f === 'remboursee' ? 'Remboursées' : f === 'refusee' ? 'Refusées' : 'Toutes'}</button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600">À rembourser : <b className="tabular-nums text-amber-700">{fmtPrix(totalEnAttente)}</b></span>
          <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Note de frais</button>
        </div>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune note dans ce filtre.</p>
        ) : (
          <>
          {/* Mobile : cartes */}
          <ul className="md:hidden divide-y divide-zinc-100">
            {filtered.map(n => {
              const sInfo = STATUT_NDF_LABEL[n.statut]
              return (
                <li key={n.id} className="py-3 px-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900 truncate">{n.libelle}</p>
                    <p className="text-[11px] text-zinc-500">{n.employe_nom} · <span className="tabular-nums">{fmtDate(n.date_depense)}</span></p>
                    {n.motif && <p className="text-[11px] text-zinc-500 truncate">{n.motif}</p>}
                    {n.justificatif_url && <a href={n.justificatif_url} target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:underline">📎 Justificatif</a>}
                    <div className="mt-1">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                      {n.remboursee_at && <p className="text-[10px] text-zinc-500 mt-0.5">par {n.remboursee_par_nom} le {format(parseISO(n.remboursee_at), 'd MMM', { locale: fr })}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className="font-bold tabular-nums text-zinc-900">{fmtPrix(n.montant)}</p>
                    {n.statut === 'en_attente' && (
                      <div className="flex flex-col gap-1 w-full">
                        <button onClick={async () => {
                          try { await rembourserNDF({ ndf_id: n.id, remboursee_par: null, notes_admin: null }); onOk('Remboursée'); router.refresh() }
                          catch (e) { onError(e) }
                        }} className="min-h-[44px] px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm">✓ Rembourser</button>
                        <button onClick={async () => {
                          try { await refuserNDF({ ndf_id: n.id, remboursee_par: null, notes_admin: null }); onOk('Refusée'); router.refresh() }
                          catch (e) { onError(e) }
                        }} className="min-h-[44px] px-3 rounded bg-red-500 hover:bg-red-400 text-white font-bold text-sm">✕ Refuser</button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Desktop : table */}
          <div className="hidden md:block overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Date</th>
                <th className="text-left px-3 py-1.5">Employé</th>
                <th className="text-left px-3 py-1.5">Libellé</th>
                <th className="text-right px-3 py-1.5">Montant</th>
                <th className="text-left px-3 py-1.5">Statut</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(n => {
                const sInfo = STATUT_NDF_LABEL[n.statut]
                return (
                  <tr key={n.id}>
                    <td className="px-3 py-2 text-[11px] tabular-nums">{fmtDate(n.date_depense)}</td>
                    <td className="px-3 py-2">{n.employe_nom}</td>
                    <td className="px-3 py-2">
                      <p className="font-bold">{n.libelle}</p>
                      {n.motif && <p className="text-[11px] text-zinc-500">{n.motif}</p>}
                      {n.justificatif_url && <a href={n.justificatif_url} target="_blank" rel="noopener" className="text-[10px] text-blue-600 hover:underline">📎 Justificatif</a>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtPrix(n.montant)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                      {n.remboursee_at && <p className="text-[10px] text-zinc-500 mt-0.5">par {n.remboursee_par_nom} le {format(parseISO(n.remboursee_at), 'd MMM', { locale: fr })}</p>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {n.statut === 'en_attente' && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={async () => {
                            try { await rembourserNDF({ ndf_id: n.id, remboursee_par: null, notes_admin: null }); onOk('Remboursée'); router.refresh() }
                            catch (e) { onError(e) }
                          }} className="text-xs h-8 px-2 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">✓ Rembourser</button>
                          <button onClick={async () => {
                            try { await refuserNDF({ ndf_id: n.id, remboursee_par: null, notes_admin: null }); onOk('Refusée'); router.refresh() }
                            catch (e) { onError(e) }
                          }} className="text-xs h-8 px-2 rounded bg-red-500 hover:bg-red-400 text-white font-bold">✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          </>
        )}
      </section>

      {showForm && (
        <NDFModal employes={employes} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Note de frais créée') }} />
      )}
    </div>
  )
}

function NDFModal({ employes, onClose, onError, onSuccess }: { employes: Employe[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [empId, setEmpId] = useState(employes[0]?.id ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [libelle, setLibelle] = useState('')
  const [motif, setMotif] = useState('')
  const [montant, setMontant] = useState(0)
  const [url, setUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!libelle.trim() || montant <= 0) { onError(new Error('Libellé et montant obligatoires')); return }
    startTransition(async () => {
      try {
        await creerNoteDeFrais({
          employe_id: empId, date_depense: date, libelle: libelle.trim(),
          motif: motif.trim() || null, montant, justificatif_url: url.trim() || null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle note de frais" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Employé">
          <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </Field>
        <Field label="Date dépense"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Libellé"><input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Ex: Taxi rendez-vous fournisseur" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Montant TTC (€)"><input type="number" step="0.01" value={montant} onChange={e => setMontant(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums font-bold" /></Field>
        <Field label="URL justificatif"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className="w-full h-12 px-3 rounded-md border border-zinc-300 text-xs font-mono" /></Field>
      </div>
      <Field label="Motif (optionnel)"><textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Créer" />
    </Modal>
  )
}

// ─── TAB 5 — Export & rapport ──────────────────────────────────────
function ExportTab({ moisIso, onError, onOk }: { moisIso: string; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [mois, setMois] = useState(moisIso)
  const [isPending, startTransition] = useTransition()

  function exporterCSV() {
    startTransition(async () => {
      try {
        const r = await exporterCSVMois(mois)
        const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ecritures_${mois}.csv`
        a.click()
        URL.revokeObjectURL(url)
        onOk(`${r.nb_ecritures} écriture(s) exportée(s) — ${r.libelle}`)
      } catch (e) { onError(e) }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📤 Export comptable CSV</h2>
        <p className="text-sm text-zinc-600">
          Génère un fichier CSV format écritures comptables (colonnes Date · N° pièce · Libellé · Compte · Débit · Crédit · Journal).
          Inclut : ventes (paiements_caisse, journal VTE), achats (factures fournisseurs, journal ACH), charges fixes échues (journal OD).
        </p>
        <Field label="Mois à exporter"><input type="month" value={mois} onChange={e => setMois(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <button onClick={exporterCSV} disabled={isPending}
          className="w-full min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">
          {isPending ? 'Génération…' : '⬇ Télécharger CSV'}
        </button>
        <p className="text-[11px] text-zinc-500 italic">Encodage UTF-8 avec BOM, séparateur point-virgule. Importable dans Sage, EBP, Quadra, Cegid, Pennylane.</p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📜 Rapport mensuel PDF</h2>
        <p className="text-sm text-zinc-600">Vue imprimable A4 du compte de résultat du mois (en-tête établissement, P&L détaillé, ratios, charges, TVA, signature).</p>
        <Link href={`/admin/finances/rapport/print?mois=${mois}`} target="_blank" rel="noopener"
          className="block text-center w-full min-h-[48px] py-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold">
          🖨 Ouvrir le rapport
        </Link>
      </section>
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
