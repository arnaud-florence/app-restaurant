'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import {
  Plus, Trash2, Pencil, Target, ListTodo, BarChart3, TrendingUp, TrendingDown, Minus, Check,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  type Kpi, type KpiCode, type AnalyseMois, type Periode, type Statut, KPI_LABELS, formatValeur,
} from '@/lib/pilotage'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'
import {
  upsertObjectif, supprimerObjectif,
  creerAction, updateAction, changerStatutAction, supprimerAction,
} from './actions'

type Objectif = {
  id: string; periode: 'mensuel' | 'annuel'; mois: string | null; annee: number
  kpi: KpiCode; valeur_cible: number; unite: string; notes: string | null
}
type ActionRow = {
  id: string; titre: string; description: string | null; kpi_lie: string | null
  statut: 'a_faire' | 'en_cours' | 'fait' | 'annule'
  priorite: 'haute' | 'normale' | 'basse'
  echeance: string | null; responsable_id: string | null; fait_le: string | null
  created_at: string
  responsable?: { prenom?: string; nom?: string } | null
}

const STATUT_BG: Record<Statut, string> = {
  vert:    'bg-emerald-50 border-emerald-300',
  orange:  'bg-amber-50 border-amber-300',
  rouge:   'bg-red-50 border-red-300',
  neutre:  'bg-zinc-50 border-zinc-200',
}
const STATUT_TEXT: Record<Statut, string> = {
  vert:    'text-emerald-900',
  orange:  'text-amber-900',
  rouge:   'text-red-900',
  neutre:  'text-zinc-700',
}

const PRIORITE_BG: Record<ActionRow['priorite'], string> = {
  haute:   'bg-red-100 border-red-300 text-red-900',
  normale: 'bg-blue-100 border-blue-300 text-blue-900',
  basse:   'bg-zinc-100 border-zinc-300 text-zinc-700',
}

export default function PilotageClient({
  kpis, saisonnier, objectifs, actions, employes, periode,
}: {
  kpis: Kpi[]
  saisonnier: AnalyseMois[]
  objectifs: Objectif[]
  actions: ActionRow[]
  employes: { id: string; prenom: string; nom: string }[]
  periode: Periode
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [showObjForm, setShowObjForm] = useState<{ kpi: KpiCode } | null>(null)
  const [showActForm, setShowActForm] = useState<ActionRow | true | null>(null)

  // Map objectifs du mois courant pour vue par KPI
  const objMois = useMemo(() => {
    const m = new Map<KpiCode, Objectif>()
    for (const o of objectifs) {
      if (o.periode === 'mensuel' && o.mois === periode.mois) m.set(o.kpi, o)
    }
    return m
  }, [objectifs, periode.mois])

  const colonnes = useMemo(() => ({
    a_faire:  actions.filter(a => a.statut === 'a_faire'),
    en_cours: actions.filter(a => a.statut === 'en_cours'),
    fait:     actions.filter(a => a.statut === 'fait'),
    annule:   actions.filter(a => a.statut === 'annule'),
  }), [actions])

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-emerald-600" /> Pilotage stratégique
        </h1>
        <p className="text-sm text-zinc-500">
          Vue 2 minutes — KPIs clés, objectifs, plan d'action, saisonnalité.
        </p>
      </div>

      <TachesDuJourWidget poste="gerant" defaultOpen />

      {/* ─── 10 KPIs ─────────────────────────────────────────────── */}
      <section>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Target className="h-5 w-5" /> Indicateurs clés — {format(parseISO(periode.debut), 'MMMM yyyy', { locale: fr })}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(k => (
            <Card key={k.code} className={cn('p-3 border-2', STATUT_BG[k.statut])}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-500">{k.emoji} {k.label}</span>
                <button
                  onClick={() => setShowObjForm({ kpi: k.code })}
                  className="text-zinc-400 hover:text-zinc-700"
                  title="Définir objectif"
                ><Target className="h-3.5 w-3.5" /></button>
              </div>
              <div className={cn('text-xl font-bold', STATUT_TEXT[k.statut])}>
                {formatValeur(k.valeur, k.unite)}
              </div>
              {k.variation_pct != null && (
                <div className={cn(
                  'text-xs flex items-center gap-1 mt-1',
                  k.variation_pct > 0 ? 'text-emerald-700' : k.variation_pct < 0 ? 'text-red-700' : 'text-zinc-500',
                )}>
                  {k.variation_pct > 0 ? <TrendingUp className="h-3 w-3" /> : k.variation_pct < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {k.variation_pct > 0 ? '+' : ''}{k.variation_pct} % vs N-1
                </div>
              )}
              {k.cible != null && (
                <div className="text-xs text-zinc-600 mt-1">
                  Cible : {formatValeur(k.cible, k.unite)}
                  {k.cible_atteinte_pct != null && <span className="ml-1 font-semibold">({k.cible_atteinte_pct}%)</span>}
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Objectifs ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2"><Target className="h-5 w-5" /> Objectifs définis</h2>
          <Badge variant="outline">{objectifs.length}</Badge>
        </div>
        {objectifs.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Aucun objectif défini. Cliquez sur 🎯 dans une carte KPI ci-dessus.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2">Période</th>
                  <th className="px-3 py-2">KPI</th>
                  <th className="px-3 py-2 text-right">Cible</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {objectifs.map(o => (
                  <tr key={o.id} className="border-t">
                    <td className="px-3 py-2">
                      <Badge variant="outline">{o.periode}</Badge>{' '}
                      {o.mois ?? o.annee}
                    </td>
                    <td className="px-3 py-2 font-medium">{KPI_LABELS[o.kpi]}</td>
                    <td className="px-3 py-2 text-right">{Number(o.valeur_cible).toLocaleString('fr-FR')} {o.unite}</td>
                    <td className="px-3 py-2 text-zinc-600">{o.notes ?? ''}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => { if (confirm('Supprimer cet objectif ?')) startTransition(() => supprimerObjectif(o.id).then(() => router.refresh())) }}
                        className="text-red-600 hover:bg-red-50 p-1 rounded"
                        title="Supprimer"
                      ><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ─── Plan d'action (kanban) ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2"><ListTodo className="h-5 w-5" /> Plan d'action mensuel</h2>
          <Button size="sm" onClick={() => setShowActForm(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Nouvelle action
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['a_faire', 'en_cours', 'fait'] as const).map(col => (
            <Card key={col} className="p-3">
              <h3 className="font-semibold mb-2 text-sm capitalize">
                {col === 'a_faire' ? '📋 À faire' : col === 'en_cours' ? '🔄 En cours' : '✅ Fait'}
                <span className="ml-2 text-zinc-400">({colonnes[col].length})</span>
              </h3>
              <div className="space-y-2">
                {colonnes[col].map(a => (
                  <div key={a.id} className={cn('rounded-md p-2 border text-sm', PRIORITE_BG[a.priorite])}>
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-medium flex-1">{a.titre}</span>
                      <button
                        onClick={() => setShowActForm(a)}
                        className="opacity-50 hover:opacity-100"
                        title="Modifier"
                      ><Pencil className="h-3 w-3" /></button>
                    </div>
                    {a.description && <p className="text-xs mt-1 opacity-80 whitespace-pre-wrap">{a.description}</p>}
                    {a.echeance && <p className="text-xs mt-1 opacity-80">📅 {format(parseISO(a.echeance), 'd MMM', { locale: fr })}</p>}
                    {a.responsable && <p className="text-xs mt-1 opacity-80">👤 {a.responsable.prenom} {a.responsable.nom}</p>}
                    {a.kpi_lie && <p className="text-xs mt-1 opacity-80">🎯 {KPI_LABELS[a.kpi_lie as KpiCode]}</p>}
                    <div className="mt-2 flex gap-1">
                      {col !== 'a_faire' && (
                        <button onClick={() => startTransition(() => changerStatutAction(a.id, 'a_faire').then(() => router.refresh()))} className="text-xs px-2 py-0.5 bg-white/60 hover:bg-white rounded">← À faire</button>
                      )}
                      {col !== 'en_cours' && (
                        <button onClick={() => startTransition(() => changerStatutAction(a.id, 'en_cours').then(() => router.refresh()))} className="text-xs px-2 py-0.5 bg-white/60 hover:bg-white rounded">En cours</button>
                      )}
                      {col !== 'fait' && (
                        <button onClick={() => startTransition(() => changerStatutAction(a.id, 'fait').then(() => router.refresh()))} className="text-xs px-2 py-0.5 bg-white/60 hover:bg-white rounded inline-flex items-center gap-1"><Check className="h-3 w-3" /> Fait</button>
                      )}
                    </div>
                  </div>
                ))}
                {colonnes[col].length === 0 && <p className="text-xs text-zinc-400 italic">aucune</p>}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Saisonnalité ────────────────────────────────────────── */}
      <section>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Analyse saisonnière (12 derniers mois)
        </h2>
        <Card className="p-3">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={saisonnier}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="libelle" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, name) =>
                  name === 'CA' ? [Number(value).toLocaleString('fr-FR') + ' €', 'CA']
                  : name === 'Couverts' ? [String(value), 'Couverts']
                  : [String(value), String(name)]
                }
              />
              <Legend />
              <Bar yAxisId="left"  dataKey="ca"          name="CA"      fill="#10b981" />
              <Bar yAxisId="right" dataKey="nb_couverts" name="Couverts" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </section>

      {/* ─── Modale objectif ─────────────────────────────────────── */}
      {showObjForm && (
        <ObjectifModal
          kpi={showObjForm.kpi}
          periode={periode}
          existant={objMois.get(showObjForm.kpi) ?? null}
          onClose={() => setShowObjForm(null)}
          onSaved={() => { setShowObjForm(null); router.refresh() }}
        />
      )}

      {/* ─── Modale action ───────────────────────────────────────── */}
      {showActForm && (
        <ActionModal
          action={showActForm === true ? null : showActForm}
          employes={employes}
          onClose={() => setShowActForm(null)}
          onSaved={() => { setShowActForm(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─── Modale objectif ──────────────────────────────────────────────
function ObjectifModal({ kpi, periode, existant, onClose, onSaved }: {
  kpi: KpiCode; periode: Periode; existant: Objectif | null
  onClose: () => void; onSaved: () => void
}) {
  const [valeur, setValeur] = useState<string>(existant ? String(existant.valeur_cible) : '')
  const [notes, setNotes] = useState<string>(existant?.notes ?? '')
  const [pending, startTransition] = useTransition()

  function save() {
    const num = Number(valeur.replace(',', '.'))
    if (!Number.isFinite(num)) return alert('Valeur invalide')
    startTransition(() => upsertObjectif({
      periode: 'mensuel',
      mois: periode.mois,
      annee: periode.annee,
      kpi,
      valeur_cible: num,
      unite: 'auto',
      notes: notes || null,
    }).then(onSaved).catch(e => alert(e.message)))
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">🎯 Objectif {KPI_LABELS[kpi]} — {periode.mois}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Valeur cible</label>
            <Input value={valeur} onChange={e => setValeur(e.target.value)} type="number" step="0.01" autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium">Notes (optionnel)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex : effort pour la haute saison" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={pending || !valeur}>Enregistrer</Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Modale action ────────────────────────────────────────────────
function ActionModal({ action, employes, onClose, onSaved }: {
  action: ActionRow | null
  employes: { id: string; prenom: string; nom: string }[]
  onClose: () => void; onSaved: () => void
}) {
  const [titre, setTitre] = useState(action?.titre ?? '')
  const [description, setDescription] = useState(action?.description ?? '')
  const [priorite, setPriorite] = useState<ActionRow['priorite']>(action?.priorite ?? 'normale')
  const [statut, setStatut] = useState<ActionRow['statut']>(action?.statut ?? 'a_faire')
  const [echeance, setEcheance] = useState(action?.echeance ?? '')
  const [kpiLie, setKpiLie] = useState<string>(action?.kpi_lie ?? '')
  const [responsable, setResponsable] = useState(action?.responsable_id ?? '')
  const [pending, startTransition] = useTransition()

  function save() {
    if (!titre.trim()) return alert('Titre obligatoire')
    const payload = {
      titre: titre.trim(),
      description: description || null,
      priorite, statut,
      echeance: echeance || null,
      kpi_lie: (kpiLie || null) as KpiCode | null,
      responsable_id: responsable || null,
    }
    startTransition(() => {
      const p = action
        ? updateAction({ id: action.id, ...payload })
        : creerAction(payload)
      p.then(onSaved).catch(e => alert(e.message))
    })
  }

  function remove() {
    if (!action) return
    if (!confirm('Supprimer cette action ?')) return
    startTransition(() => supprimerAction(action.id).then(onSaved).catch(e => alert(e.message)))
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">{action ? '✏️ Modifier' : '➕ Nouvelle'} action</h3>
        <div className="space-y-3">
          <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre (ex : Réviser carte d'été)" autoFocus />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description / contexte"
            className="w-full text-sm rounded-md border px-3 py-2 min-h-[80px]" />
          <div className="grid grid-cols-2 gap-2">
            <select value={priorite} onChange={e => setPriorite(e.target.value as ActionRow['priorite'])}
              className="w-full text-sm rounded-md border px-3 py-2">
              <option value="haute">⚡ Haute</option>
              <option value="normale">🟦 Normale</option>
              <option value="basse">⚪ Basse</option>
            </select>
            <select value={statut} onChange={e => setStatut(e.target.value as ActionRow['statut'])}
              className="w-full text-sm rounded-md border px-3 py-2">
              <option value="a_faire">📋 À faire</option>
              <option value="en_cours">🔄 En cours</option>
              <option value="fait">✅ Fait</option>
              <option value="annule">❌ Annulé</option>
            </select>
          </div>
          <Input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} />
          <select value={kpiLie} onChange={e => setKpiLie(e.target.value)}
            className="w-full text-sm rounded-md border px-3 py-2">
            <option value="">— KPI lié (optionnel) —</option>
            {(Object.keys(KPI_LABELS) as KpiCode[]).map(k => (
              <option key={k} value={k}>{KPI_LABELS[k]}</option>
            ))}
          </select>
          <select value={responsable} onChange={e => setResponsable(e.target.value)}
            className="w-full text-sm rounded-md border px-3 py-2">
            <option value="">— Responsable (optionnel) —</option>
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </div>
        <div className="mt-4 flex justify-between">
          {action ? (
            <Button variant="outline" onClick={remove} className="text-red-700 border-red-300 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-1" /> Supprimer
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={save} disabled={pending || !titre.trim()}>Enregistrer</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
