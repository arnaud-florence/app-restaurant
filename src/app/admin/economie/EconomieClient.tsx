'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Pencil, Wallet, Calculator, TrendingUp, Save, X, Loader2,
  ListTree, Sparkles, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { askConfirm } from '@/lib/confirm'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PillTab } from '@/components/ui/PillTab'
import {
  majConfigEconomique, upsertPointMort, supprimerPointMort,
  upsertCharge, supprimerCharge, toggleActifCharge,
  upsertChargeVar, supprimerChargeVar, toggleActifChargeVar,
  updateContratEmploye,
} from './actions'
import {
  CATEGORIE_INFO, CHARGE_VAR_INFO,
  type ChargeCategorie, type ChargeRow, type ChargeVarRow, type ChargeVarType, type ChargeVarMode,
} from '@/lib/economie-types'

type Config  = { id: string; smic_horaire_brut: number; pct_redistribution_surplus: number; notes: string | null; updated_at: string }
type PMMois  = { id: string; mois: string; charges_fixes_eur: number; taux_charges_variables_pct: number; ca_seuil_calcule: number; notes: string | null }

type SuggestionT = {
  charges_fixes_eur: number
  taux_charges_variables_pct: number
  ca_seuil_calcule: number
  details: {
    charges: { total: number; nb: number; categories: number }
    masse_sal_estimee?: number
    food_cost_pct: number
    commissions_pct: number
    autres_var_pct?: number
    sans_donnees: boolean
  }
}

type SalarialeT = {
  total_eur: number
  par_employe: Array<{
    id: string; prenom: string; nom: string; poste: string; type_contrat: string
    heures_mois: number; salaire_horaire: number; coef: number
    cout_brut_mensuel: number; cout_employeur_mensuel: number; avantages: number; cout_total_mensuel: number
  }>
}

type OverviewT = {
  ca_mois: number; seuil: number; pct_atteint: number
  charges_fixes: number; cout_employeur_total: number
  food_cost_pct: number; commissions_pct: number
  autres_var_pct: number; taux_variable_total: number
  marge_brute_estimee_pct: number
}

export default function EconomieClient({
  config, pointsMort, charges, chargesTotal, chargesParCategorie,
  chargesVariables, tauxVariableEffectif, salariale, overview, suggestion,
}: {
  config: Config | null
  pointsMort: PMMois[]
  charges: ChargeRow[]
  chargesTotal: number
  chargesParCategorie: Array<{ categorie: ChargeCategorie; total: number; nb: number }>
  chargesVariables: ChargeVarRow[]
  tauxVariableEffectif: number
  salariale: SalarialeT
  overview: OverviewT
  suggestion: SuggestionT
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'overview' | 'config' | 'charges' | 'equipe' | 'pointmort'>('overview')
  const [, startTransition] = useTransition()
  const [showChargeForm, setShowChargeForm] = useState<ChargeRow | true | null>(null)
  const [showChargeVarForm, setShowChargeVarForm] = useState<ChargeVarRow | true | null>(null)
  const [showContratForm, setShowContratForm] = useState<SalarialeT['par_employe'][0] | null>(null)

  // Config form state
  const [smic, setSmic] = useState<string>(config?.smic_horaire_brut?.toString() ?? '11.65')
  const [pct, setPct]   = useState<string>(config?.pct_redistribution_surplus?.toString() ?? '30')
  const [pendingC, setPendingC] = useState(false)

  // Point mort form
  const [showPmForm, setShowPmForm]   = useState<PMMois | true | null>(null)

  function saveConfig() {
    setPendingC(true)
    startTransition(async () => {
      try {
        await majConfigEconomique({
          smic_horaire_brut:           parseFloat(smic) || 0,
          pct_redistribution_surplus:  parseFloat(pct) || 0,
        })
      } catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
      finally { setPendingC(false); router.refresh() }
    })
  }

  async function delPm(id: string) {
    if (!(await askConfirm({ title: 'Supprimer le point mort', message: 'Supprimer ce point mort ?', confirmLabel: 'Supprimer', danger: true }))) return
    startTransition(async () => {
      try { await supprimerPointMort({ id }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  async function delCharge(id: string) {
    if (!(await askConfirm({ title: 'Supprimer la charge', message: 'Supprimer cette charge ?', confirmLabel: 'Supprimer', danger: true }))) return
    startTransition(async () => {
      try { await supprimerCharge({ id }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }
  function toggleCharge(c: ChargeRow) {
    startTransition(async () => {
      try { await toggleActifCharge({ id: c.id, actif: !c.actif }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }
  async function delChargeVar(id: string) {
    if (!(await askConfirm({ title: 'Supprimer la charge variable', message: 'Supprimer cette charge variable ?', confirmLabel: 'Supprimer', danger: true }))) return
    startTransition(async () => {
      try { await supprimerChargeVar({ id }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }
  function toggleChargeVar(c: ChargeVarRow) {
    startTransition(async () => {
      try { await toggleActifChargeVar({ id: c.id, actif: !c.actif }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

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

      <main className="relative max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <AdminPageHeader
          accent="emerald"
          subtitle="Finances"
          title="Centre économique"
          description="Point mort, marges, surplus, redistribution — source unique config + charges + contrats."
        />

      {/* ─── Barre d'onglets sticky ──────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 bg-zinc-50/90 backdrop-blur flex gap-1.5 overflow-x-auto">
        <PillTab active={tab === 'overview'}  onClick={() => setTab('overview')}>📊 Vue d&apos;ensemble</PillTab>
        <PillTab active={tab === 'config'}    onClick={() => setTab('config')}>⚙️ Configuration</PillTab>
        <PillTab active={tab === 'charges'}   onClick={() => setTab('charges')}>💸 Charges</PillTab>
        <PillTab active={tab === 'equipe'}    onClick={() => setTab('equipe')}>👥 Équipe &amp; coûts</PillTab>
        <PillTab active={tab === 'pointmort'} onClick={() => setTab('pointmort')}>🎯 Point mort</PillTab>
      </div>

      {tab === 'overview' && (
      <>
      {/* ─── 0. Vue d'ensemble live (masquée sur mobile, place pour le contenu prio) ── */}
      <Card className="hidden md:block p-5 bg-gradient-to-br from-emerald-50 to-stone-50 border-emerald-200">
        <h2 className="font-bold flex items-center gap-2 mb-3">
          📊 Vue d&apos;ensemble — {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-zinc-500">CA réalisé</span>
            <span className="font-bold tabular-nums">{overview.ca_mois.toFixed(2)} € / {overview.seuil.toFixed(0)} € seuil</span>
          </div>
          <div className="relative h-3 bg-zinc-200 rounded-full overflow-hidden">
            <div className={cn(
              'absolute left-0 top-0 h-full transition-all',
              overview.pct_atteint >= 100 ? 'bg-emerald-500' : 'bg-amber-400',
            )} style={{ width: `${Math.min(100, overview.pct_atteint)}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-zinc-700" style={{ left: '100%' }} />
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">{overview.pct_atteint}% du point mort</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-md bg-white p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Charges fixes</p>
            <p className="text-base font-bold tabular-nums">{overview.charges_fixes.toFixed(0)} €</p>
            <p className="text-[10px] text-zinc-400">/ mois saisi</p>
          </div>
          <div className="rounded-md bg-white p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Coût équipe</p>
            <p className="text-base font-bold tabular-nums">{overview.cout_employeur_total.toFixed(0)} €</p>
            <p className="text-[10px] text-zinc-400">brut + charges patr.</p>
          </div>
          <div className="rounded-md bg-white p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Food cost</p>
            <p className="text-base font-bold tabular-nums">{overview.food_cost_pct.toFixed(1)} %</p>
            <p className="text-[10px] text-zinc-400">moy. 30 jours</p>
          </div>
          <div className="rounded-md bg-white p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Var. total</p>
            <p className="text-base font-bold tabular-nums">{overview.taux_variable_total.toFixed(1)} %</p>
            <p className="text-[10px] text-zinc-400">food cost + autres</p>
          </div>
          <div className="rounded-md bg-emerald-100 p-3 border border-emerald-300">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700">Marge brute</p>
            <p className="text-base font-bold tabular-nums text-emerald-800">{overview.marge_brute_estimee_pct.toFixed(1)} %</p>
            <p className="text-[10px] text-emerald-600">100% − var.</p>
          </div>
        </div>
      </Card>
      </>
      )}

      {tab === 'config' && (
      <>
      {/* ─── 1. Config économique ─────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-600" /> Paramètres économiques
          </h2>
          {config?.updated_at && (
            <p className="text-xs text-zinc-500">MàJ : {new Date(config.updated_at).toLocaleString('fr-FR')}</p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1">SMIC horaire brut (€/h)</label>
            <Input type="number" step="0.01" min="0" value={smic} onChange={e => setSmic(e.target.value)} />
            <p className="text-xs text-zinc-500 mt-1">Base salariale appliquée à tous les employés × leurs heures pointées.</p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">% du surplus redistribué (sur le mois)</label>
            <Input type="number" step="1" min="0" max="100" value={pct} onChange={e => setPct(e.target.value)} />
            <p className="text-xs text-zinc-500 mt-1">Quand le CA dépasse le point mort, X% du surplus est partagé entre l'équipe pondéré heures.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveConfig} disabled={pendingC} className="gap-1">
            {pendingC ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
        </div>
      </Card>
      </>
      )}

      {tab === 'charges' && (
      <>
      {/* ─── 2. Charges fixes récurrentes ─────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-bold flex items-center gap-2">
              <ListTree className="h-5 w-5 text-emerald-600" /> Charges fixes mensuelles récurrentes
            </h2>
            <p className="text-xs text-zinc-500">
              Saisis chaque charge UNE FOIS. Le total se recalcule auto et pré-remplit ton point mort.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-zinc-500">Total mensuel</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-700">{chargesTotal.toFixed(2)} €</p>
            </div>
            <Button onClick={() => setShowChargeForm(true)} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
        </div>

        {showChargeForm && (
          <ChargeForm
            initial={typeof showChargeForm === 'object' ? showChargeForm : null}
            onClose={() => setShowChargeForm(null)}
            onSaved={() => { setShowChargeForm(null); router.refresh() }}
          />
        )}

        {charges.length === 0 ? (
          <p className="text-sm text-zinc-500 italic text-center py-6">
            Aucune charge récurrente saisie. Ajoute le loyer, les salaires, l'énergie, etc. pour activer l'auto-suggestion.
          </p>
        ) : (
          <>
            {/* Récap par catégorie */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 mt-3">
              {chargesParCategorie.map(cat => (
                <div key={cat.categorie} className="rounded-md bg-zinc-50 p-2">
                  <p className="text-xs text-zinc-500">
                    {CATEGORIE_INFO[cat.categorie].emoji} {CATEGORIE_INFO[cat.categorie].label}
                  </p>
                  <p className="text-base font-bold tabular-nums">{cat.total.toFixed(2)} €</p>
                  <p className="text-[10px] text-zinc-400">{cat.nb} ligne{cat.nb > 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>

            {/* Liste détaillée — cartes mobile */}
            <ul className="md:hidden divide-y divide-zinc-100 mt-3">
              {charges.map(c => (
                <li key={c.id} className={cn('py-3 flex items-center justify-between gap-3', !c.actif && 'opacity-50')}>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">
                      <span className="mr-1">{CATEGORIE_INFO[c.categorie].emoji}</span>{c.libelle}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {CATEGORIE_INFO[c.categorie].label}
                      {c.fournisseur ? ` · ${c.fournisseur}` : ''}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-zinc-900 mt-0.5">
                      {Number(c.montant_mensuel_eur).toFixed(2)} €
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleCharge(c)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded text-zinc-600" title={c.actif ? 'Désactiver' : 'Activer'}>
                      {c.actif ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => setShowChargeForm(c)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded text-zinc-600">
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button onClick={() => delCharge(c.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-red-50 rounded text-red-600">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Liste détaillée — table desktop */}
            <div className="hidden md:block overflow-x-auto -mx-2 mt-3">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-3 py-2">Catégorie</th>
                    <th className="text-left px-3 py-2">Libellé</th>
                    <th className="text-left px-3 py-2">Fournisseur</th>
                    <th className="text-right px-3 py-2">Mensuel</th>
                    <th className="px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map(c => (
                    <tr key={c.id} className={cn('border-t hover:bg-zinc-50', !c.actif && 'opacity-50')}>
                      <td className="px-3 py-2">
                        <span className="text-base">{CATEGORIE_INFO[c.categorie].emoji}</span>
                        <span className="text-xs ml-1">{CATEGORIE_INFO[c.categorie].label}</span>
                      </td>
                      <td className="px-3 py-2">{c.libelle}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{c.fournisseur ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {Number(c.montant_mensuel_eur).toFixed(2)} €
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button onClick={() => toggleCharge(c)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600" title={c.actif ? 'Désactiver' : 'Activer'}>
                          {c.actif ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setShowChargeForm(c)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => delCharge(c.id)} className="p-1 hover:bg-red-50 rounded text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* ─── 2.5. Charges variables ─────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-bold flex items-center gap-2">
              📉 Charges variables ({tauxVariableEffectif.toFixed(2)} % effectif)
            </h2>
            <p className="text-xs text-zinc-500">
              Tout ce qui varie avec le CA. Auto = calculé live, manuel % = saisi en %, manuel € = en €/mois.
            </p>
          </div>
          <Button onClick={() => setShowChargeVarForm(true)} size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>

        {showChargeVarForm && (
          <ChargeVarForm
            initial={typeof showChargeVarForm === 'object' ? showChargeVarForm : null}
            onClose={() => setShowChargeVarForm(null)}
            onSaved={() => { setShowChargeVarForm(null); router.refresh() }}
          />
        )}

        {chargesVariables.length === 0 ? (
          <p className="text-sm text-zinc-500 italic text-center py-4">Aucune charge variable.</p>
        ) : (
          <>
          {/* Cartes mobile */}
          <ul className="md:hidden divide-y divide-zinc-100 mt-2">
            {chargesVariables.map(c => {
              const valTxt = c.mode === 'auto'
                ? '— auto —'
                : c.mode === 'manuel_pct'
                  ? `${Number(c.valeur_pct ?? 0).toFixed(2)} %`
                  : `${Number(c.valeur_fixe_eur ?? 0).toFixed(2)} €`
              return (
                <li key={c.id} className={cn('py-3 flex items-center justify-between gap-3', !c.actif && 'opacity-50')}>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">
                      <span className="mr-1">{CHARGE_VAR_INFO[c.type].emoji}</span>{c.libelle}
                    </p>
                    <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
                      <span>{CHARGE_VAR_INFO[c.type].label}</span>
                      {c.mode === 'auto' && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px]">AUTO</span>}
                      {c.mode === 'manuel_pct' && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[10px]">% saisi</span>}
                      {c.mode === 'manuel_fixe' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px]">€ saisi</span>}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-zinc-900 mt-0.5">{valTxt}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleChargeVar(c)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded text-zinc-600" title={c.actif ? 'Désactiver' : 'Activer'}>
                      {c.actif ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => setShowChargeVarForm(c)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded text-zinc-600">
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button onClick={() => delChargeVar(c.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-red-50 rounded text-red-600">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Table desktop */}
          <div className="hidden md:block overflow-x-auto -mx-2 mt-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Libellé</th>
                  <th className="text-left px-3 py-2">Mode</th>
                  <th className="text-right px-3 py-2">Valeur</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody>
                {chargesVariables.map(c => {
                  const valTxt = c.mode === 'auto'
                    ? '— auto —'
                    : c.mode === 'manuel_pct'
                      ? `${Number(c.valeur_pct ?? 0).toFixed(2)} %`
                      : `${Number(c.valeur_fixe_eur ?? 0).toFixed(2)} €`
                  return (
                    <tr key={c.id} className={cn('border-t hover:bg-zinc-50', !c.actif && 'opacity-50')}>
                      <td className="px-3 py-2">
                        <span className="text-base">{CHARGE_VAR_INFO[c.type].emoji}</span>
                        <span className="text-xs ml-1">{CHARGE_VAR_INFO[c.type].label}</span>
                      </td>
                      <td className="px-3 py-2">{c.libelle}</td>
                      <td className="px-3 py-2 text-xs">
                        {c.mode === 'auto' && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px]">AUTO</span>}
                        {c.mode === 'manuel_pct' && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[10px]">% saisi</span>}
                        {c.mode === 'manuel_fixe' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px]">€ saisi</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{valTxt}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button onClick={() => toggleChargeVar(c)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600">
                          {c.actif ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setShowChargeVarForm(c)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => delChargeVar(c.id)} className="p-1 hover:bg-red-50 rounded text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
      </>
      )}

      {tab === 'equipe' && (
      <>
      {/* ─── 2.7. Contrats équipe ───────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-bold flex items-center gap-2">
              👥 Contrats équipe — coût mensuel prévisible
            </h2>
            <p className="text-xs text-zinc-500">
              Heures × salaire × coef charges patronales (~1.45) + avantages = coût employeur réel.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Total équipe</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">{salariale.total_eur.toFixed(2)} €</p>
            <p className="text-[10px] text-zinc-400">/ mois (charges patronales incluses)</p>
          </div>
        </div>

        {showContratForm && (
          <ContratForm
            employe={showContratForm}
            onClose={() => setShowContratForm(null)}
            onSaved={() => { setShowContratForm(null); router.refresh() }}
          />
        )}

        {salariale.par_employe.length === 0 ? (
          <p className="text-sm text-zinc-500 italic text-center py-4">Aucun employé actif.</p>
        ) : (
          <>
          {/* Cartes mobile */}
          <ul className="md:hidden divide-y divide-zinc-100">
            {salariale.par_employe.map(e => (
              <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 truncate">{e.prenom} {e.nom}</p>
                  <p className="text-xs text-zinc-500 truncate">{e.poste} · {e.type_contrat}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                    {e.heures_mois.toFixed(1)} h/mois · {e.salaire_horaire.toFixed(2)} €/h · coef {e.coef.toFixed(2)} · avantages {e.avantages.toFixed(0)} €
                  </p>
                  <p className="text-lg font-bold tabular-nums text-emerald-700 mt-0.5">{e.cout_total_mensuel.toFixed(2)} €</p>
                </div>
                <div className="shrink-0">
                  <button onClick={() => setShowContratForm(e)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded text-zinc-600" title="Éditer le contrat">
                    <Pencil className="h-5 w-5" />
                  </button>
                </div>
              </li>
            ))}
            <li className="py-3 flex items-center justify-between gap-3 bg-zinc-50 -mx-1 px-1 rounded">
              <p className="font-bold text-zinc-900">TOTAL ÉQUIPE</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700">{salariale.total_eur.toFixed(2)} €</p>
            </li>
          </ul>

          {/* Table desktop */}
          <div className="hidden md:block overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left px-3 py-2">Employé</th>
                  <th className="text-left px-3 py-2">Contrat</th>
                  <th className="text-right px-3 py-2">H/mois</th>
                  <th className="text-right px-3 py-2">Brut/h</th>
                  <th className="text-right px-3 py-2">Coef</th>
                  <th className="text-right px-3 py-2">Avantages</th>
                  <th className="text-right px-3 py-2">Total mois</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody>
                {salariale.par_employe.map(e => (
                  <tr key={e.id} className="border-t hover:bg-zinc-50">
                    <td className="px-3 py-2">
                      <p className="font-medium">{e.prenom} {e.nom}</p>
                      <p className="text-[11px] text-zinc-500">{e.poste}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">{e.type_contrat}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.heures_mois.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.salaire_horaire.toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.coef.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.avantages.toFixed(0)} €</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{e.cout_total_mensuel.toFixed(2)} €</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => setShowContratForm(e)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600" title="Éditer le contrat">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-zinc-50">
                <tr>
                  <td className="px-3 py-2 font-bold" colSpan={6}>TOTAL ÉQUIPE</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700">{salariale.total_eur.toFixed(2)} €</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </Card>
      </>
      )}

      {tab === 'pointmort' && (
      <>
      {/* ─── 3. Points mort mensuels ──────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" /> Point mort par mois
          </h2>
          <Button onClick={() => setShowPmForm(true)} size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Nouveau mois
          </Button>
        </div>

        {showPmForm && (
          <PointMortForm
            initial={typeof showPmForm === 'object' ? showPmForm : null}
            suggestion={suggestion}
            onClose={() => setShowPmForm(null)}
            onSaved={() => { setShowPmForm(null); router.refresh() }}
          />
        )}

        {pointsMort.length === 0 ? (
          <p className="text-sm text-zinc-500 italic text-center py-6">
            Aucun point mort saisi. Crée celui du mois en cours pour activer les challenges.
          </p>
        ) : (
          <>
          {/* Cartes mobile */}
          <ul className="md:hidden divide-y divide-zinc-100 mt-4">
            {pointsMort.map(p => (
              <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 truncate">
                    {new Date(p.mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                    Charges fixes {Number(p.charges_fixes_eur).toFixed(2)} € · variable {Number(p.taux_charges_variables_pct).toFixed(1)} %
                  </p>
                  {p.notes && <p className="text-xs text-zinc-500 truncate mt-0.5">{p.notes}</p>}
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">CA seuil</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-700">{Number(p.ca_seuil_calcule).toFixed(2)} €</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setShowPmForm(p)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-100 rounded text-zinc-600">
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button onClick={() => delPm(p.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-red-50 rounded text-red-600">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Table desktop */}
          <div className="hidden md:block overflow-x-auto -mx-2 mt-4">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left px-3 py-2">Mois</th>
                  <th className="text-right px-3 py-2">Charges fixes</th>
                  <th className="text-right px-3 py-2">% variable</th>
                  <th className="text-right px-3 py-2">CA seuil</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody>
                {pointsMort.map(p => (
                  <tr key={p.id} className="border-t hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium">
                      {new Date(p.mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.charges_fixes_eur).toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.taux_charges_variables_pct).toFixed(1)} %</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">
                      {Number(p.ca_seuil_calcule).toFixed(2)} €
                    </td>
                    <td className="px-3 py-2 text-zinc-600 text-xs">{p.notes ?? '—'}</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => setShowPmForm(p)} className="p-1 hover:bg-zinc-100 rounded text-zinc-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => delPm(p.id)} className="p-1 hover:bg-red-50 rounded text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        <div className="mt-4 rounded-md bg-zinc-50 border p-3 text-xs text-zinc-600">
          <strong>Formule :</strong> CA seuil = charges fixes ÷ (1 − taux variables / 100).
          Exemple : 25 000 € ÷ (1 − 0,30) = 35 714,29 € → c'est le CA mensuel à atteindre pour rentrer dans tes frais.
          Au-delà, le surplus est partagé entre l'équipe à <strong>{Number(config?.pct_redistribution_surplus ?? 30).toFixed(0)} %</strong>.
        </div>
      </Card>
      </>
      )}
      </main>
    </div>
  )
}

function PointMortForm({
  initial, suggestion, onClose, onSaved,
}: {
  initial: PMMois | null
  suggestion: SuggestionT
  onClose: () => void
  onSaved: () => void
}) {
  const isoToday = new Date().toISOString().slice(0, 10)
  const monthDefault = isoToday.slice(0, 7) + '-01'

  // Pré-remplit avec suggestion si pas d'initial.
  const defaultCharges = suggestion.charges_fixes_eur > 0 ? suggestion.charges_fixes_eur.toString() : '25000'
  const defaultTaux    = suggestion.taux_charges_variables_pct > 0 ? suggestion.taux_charges_variables_pct.toString() : '30'

  const [mois, setMois]               = useState(initial?.mois.slice(0, 10) ?? monthDefault)
  const [charges, setCharges]         = useState<string>(initial?.charges_fixes_eur?.toString() ?? defaultCharges)
  const [taux, setTaux]               = useState<string>(initial?.taux_charges_variables_pct?.toString() ?? defaultTaux)
  const [notes, setNotes]             = useState(initial?.notes ?? '')
  const [pending, setPending]         = useState(false)

  function appliquerSuggestion() {
    setCharges(suggestion.charges_fixes_eur.toString())
    setTaux(suggestion.taux_charges_variables_pct.toString())
  }

  const ca_seuil = (() => {
    const c = parseFloat(charges) || 0
    const t = parseFloat(taux) || 0
    if (t >= 100) return 0
    return c / (1 - t / 100)
  })()

  function save() {
    setPending(true)
    const moisISO = mois.length === 10 ? (mois.slice(0, 7) + '-01') : mois
    upsertPointMort({
      mois:                        moisISO,
      charges_fixes_eur:           parseFloat(charges) || 0,
      taux_charges_variables_pct:  parseFloat(taux) || 0,
      notes:                       notes || null,
    }).then(() => onSaved())
      .catch((e: unknown) => alert(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setPending(false))
  }

  return (
    <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/30 p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial ? 'Modifier' : 'Nouveau'} point mort mensuel</h3>
        <button onClick={onClose} className="p-1 hover:bg-emerald-100 rounded"><X className="h-4 w-4" /></button>
      </div>
      {/* Suggestion auto */}
      {suggestion.charges_fixes_eur > 0 && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-blue-900">Suggestion automatique</p>
              <p className="text-xs text-blue-800 mt-0.5">
                D'après tes <strong>{suggestion.details.charges.nb} charges récurrentes</strong> ({suggestion.details.charges.total.toFixed(0)} €/mois)
                {' '}+ <strong>food cost moyen {suggestion.details.food_cost_pct.toFixed(1)}%</strong> sur 30 jours
                {' '}+ <strong>commissions CB {suggestion.details.commissions_pct.toFixed(2)}%</strong> :
              </p>
              <p className="text-sm text-blue-900 mt-1">
                Charges fixes <strong>{suggestion.charges_fixes_eur.toFixed(0)} €</strong>,
                taux variable <strong>{suggestion.taux_charges_variables_pct.toFixed(1)}%</strong> →
                CA seuil <strong>{suggestion.ca_seuil_calcule.toFixed(0)} €</strong>.
              </p>
              {suggestion.details.sans_donnees && (
                <p className="text-[11px] text-amber-700 mt-1">
                  ⚠️ Pas assez de commandes sur 30 jours → taux variable estimé à 30% par défaut.
                </p>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={appliquerSuggestion} className="shrink-0 gap-1 border-blue-300 text-blue-700 hover:bg-blue-100">
              <Sparkles className="h-3 w-3" /> Appliquer
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Mois</label>
          <Input type="month" value={mois.slice(0, 7)} onChange={e => setMois(e.target.value + '-01')} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Charges fixes (€)</label>
          <Input type="number" step="100" min="0" value={charges} onChange={e => setCharges(e.target.value)} />
          <p className="text-[11px] text-zinc-500 mt-0.5">Loyer + salaires + abos + assurances</p>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Taux variables (%)</label>
          <Input type="number" step="0.1" min="0" max="99" value={taux} onChange={e => setTaux(e.target.value)} />
          <p className="text-[11px] text-zinc-500 mt-0.5">Food cost + commissions CB</p>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1">Notes (facultatif)</label>
        <Input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex : ajusté après hausse loyer" />
      </div>
      <div className={cn(
        'rounded-md p-3 text-sm font-medium',
        ca_seuil > 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-zinc-100 text-zinc-500',
      )}>
        CA seuil calculé : <strong className="text-lg tabular-nums">{ca_seuil.toFixed(2)} €</strong>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} variant="outline" size="sm">Annuler</Button>
        <Button onClick={save} disabled={pending} size="sm" className="gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}

function ChargeVarForm({
  initial, onClose, onSaved,
}: {
  initial: ChargeVarRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType]               = useState<ChargeVarType>(initial?.type ?? 'jetable_emballage')
  const [libelle, setLibelle]         = useState(initial?.libelle ?? '')
  const [mode, setMode]               = useState<ChargeVarMode>(initial?.mode ?? 'manuel_pct')
  const [pct, setPct]                 = useState<string>(initial?.valeur_pct?.toString() ?? '')
  const [fixe, setFixe]               = useState<string>(initial?.valeur_fixe_eur?.toString() ?? '')
  const [notes, setNotes]             = useState(initial?.notes ?? '')
  const [actif, setActif]             = useState<boolean>(initial?.actif ?? true)
  const [pending, setPending]         = useState(false)

  function save() {
    if (!libelle.trim()) { alert('Libellé obligatoire'); return }
    setPending(true)
    upsertChargeVar({
      id: initial?.id ?? null,
      type, libelle: libelle.trim(), mode,
      valeur_pct:      mode === 'manuel_pct'  ? parseFloat(pct)  || 0 : null,
      valeur_fixe_eur: mode === 'manuel_fixe' ? parseFloat(fixe) || 0 : null,
      notes:           notes || null,
      actif,
    }).then(() => onSaved())
      .catch((e: unknown) => alert(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setPending(false))
  }

  return (
    <div className="rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial ? 'Modifier' : 'Nouvelle'} charge variable</h3>
        <button onClick={onClose} className="p-1 hover:bg-blue-100 rounded"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value as ChargeVarType)} className="w-full border rounded px-2 py-2 text-sm">
            {(Object.keys(CHARGE_VAR_INFO) as ChargeVarType[]).map(k => (
              <option key={k} value={k}>{CHARGE_VAR_INFO[k].emoji} {CHARGE_VAR_INFO[k].label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium block mb-1">Libellé</label>
          <Input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="ex : Gobelets et serviettes" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Mode</label>
          <select value={mode} onChange={e => setMode(e.target.value as ChargeVarMode)} className="w-full border rounded px-2 py-2 text-sm">
            <option value="auto">Auto (food cost / commissions CB)</option>
            <option value="manuel_pct">Manuel %</option>
            <option value="manuel_fixe">Manuel € / mois</option>
          </select>
        </div>
        {mode === 'manuel_pct' && (
          <div>
            <label className="text-xs font-medium block mb-1">% du CA</label>
            <Input type="number" step="0.1" min="0" max="100" value={pct} onChange={e => setPct(e.target.value)} placeholder="ex : 3" />
          </div>
        )}
        {mode === 'manuel_fixe' && (
          <div>
            <label className="text-xs font-medium block mb-1">Montant fixe / mois</label>
            <Input type="number" step="any" min="0" value={fixe} onChange={e => setFixe(e.target.value)} placeholder="ex : 150" />
          </div>
        )}
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} className="h-4 w-4" />
            Active (incluse dans le total)
          </label>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1">Notes (facultatif)</label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex : CFE due en décembre, mensualisée à 12,5 €/mois" />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button onClick={onClose} variant="outline" size="sm">Annuler</Button>
        <Button onClick={save} disabled={pending} size="sm" className="gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}

function ContratForm({
  employe, onClose, onSaved,
}: {
  employe: SalarialeT['par_employe'][0]
  onClose: () => void
  onSaved: () => void
}) {
  const [salaire, setSalaire]             = useState<string>(employe.salaire_horaire.toString())
  const [heures, setHeures]               = useState<string>((employe.heures_mois / 4.33).toFixed(1))
  const [coef, setCoef]                   = useState<string>(employe.coef.toString())
  const [avantages, setAvantages]         = useState<string>(employe.avantages.toString())
  const [pending, setPending]             = useState(false)

  function save() {
    setPending(true)
    updateContratEmploye({
      id: employe.id,
      salaire_horaire:         parseFloat(salaire) || 0,
      heures_contrat:          parseFloat(heures) || 0,
      coef_charges_patronales: parseFloat(coef) || 1.45,
      avantages_mensuel_eur:   parseFloat(avantages) || 0,
    }).then(() => onSaved())
      .catch((e: unknown) => alert(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setPending(false))
  }

  const cout_estime = (parseFloat(heures) || 0) * 4.33 * (parseFloat(salaire) || 0) * (parseFloat(coef) || 1.45) + (parseFloat(avantages) || 0)

  return (
    <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/30 p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Contrat — {employe.prenom} {employe.nom}</h3>
        <button onClick={onClose} className="p-1 hover:bg-emerald-100 rounded"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Heures hebdo</label>
          <Input type="number" step="0.5" min="0" max="50" value={heures} onChange={e => setHeures(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Salaire brut horaire (€)</label>
          <Input type="number" step="0.01" min="0" value={salaire} onChange={e => setSalaire(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Coef charges patronales</label>
          <Input type="number" step="0.01" min="1" max="2" value={coef} onChange={e => setCoef(e.target.value)} />
          <p className="text-[10px] text-zinc-500">Standard 1.45 (= +45% de charges)</p>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Avantages mensuels (€)</label>
          <Input type="number" step="any" min="0" value={avantages} onChange={e => setAvantages(e.target.value)} />
          <p className="text-[10px] text-zinc-500">Titres resto + mutuelle + etc.</p>
        </div>
      </div>
      <div className="rounded-md bg-emerald-100 p-3 text-sm font-medium text-emerald-900">
        Coût employeur mensuel estimé : <strong className="text-lg tabular-nums">{cout_estime.toFixed(2)} €</strong>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button onClick={onClose} variant="outline" size="sm">Annuler</Button>
        <Button onClick={save} disabled={pending} size="sm" className="gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}

function ChargeForm({
  initial, onClose, onSaved,
}: {
  initial: ChargeRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [categorie, setCategorie]   = useState<ChargeCategorie>(initial?.categorie ?? 'loyer')
  const [libelle, setLibelle]       = useState(initial?.libelle ?? '')
  const [montant, setMontant]       = useState<string>(initial?.montant_mensuel_eur?.toString() ?? '')
  const [fournisseur, setFour]      = useState(initial?.fournisseur ?? '')
  const [notes, setNotes]           = useState(initial?.notes ?? '')
  const [actif, setActif]           = useState<boolean>(initial?.actif ?? true)
  const [pending, setPending]       = useState(false)

  function save() {
    if (!libelle.trim()) { alert('Libellé obligatoire'); return }
    if (!montant || parseFloat(montant) < 0) { alert('Montant invalide'); return }
    setPending(true)
    upsertCharge({
      id:                  initial?.id ?? null,
      categorie,
      libelle:             libelle.trim(),
      montant_mensuel_eur: parseFloat(montant),
      fournisseur:         fournisseur || null,
      notes:               notes || null,
      actif,
    }).then(() => onSaved())
      .catch((e: unknown) => alert(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setPending(false))
  }

  return (
    <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/30 p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial ? 'Modifier' : 'Nouvelle'} charge récurrente</h3>
        <button onClick={onClose} className="p-1 hover:bg-emerald-100 rounded"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Catégorie</label>
          <select value={categorie} onChange={e => setCategorie(e.target.value as ChargeCategorie)} className="w-full border rounded px-2 py-2 text-sm">
            {(Object.keys(CATEGORIE_INFO) as ChargeCategorie[]).map(k => (
              <option key={k} value={k}>{CATEGORIE_INFO[k].emoji} {CATEGORIE_INFO[k].label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium block mb-1">Libellé</label>
          <Input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="ex : Loyer du local" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Montant mensuel (€)</label>
          <Input type="number" step="any" min="0" value={montant} onChange={e => setMontant(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Fournisseur (facultatif)</label>
          <Input value={fournisseur} onChange={e => setFour(e.target.value)} placeholder="ex : EDF, Foncia, …" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} className="h-4 w-4" />
            Active (incluse dans le total)
          </label>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1">Notes (facultatif)</label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex : indexée sur l'IRL chaque janvier" />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button onClick={onClose} variant="outline" size="sm">Annuler</Button>
        <Button onClick={save} disabled={pending} size="sm" className="gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
