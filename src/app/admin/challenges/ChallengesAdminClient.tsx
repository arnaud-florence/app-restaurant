'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Trophy, Save, X, ToggleLeft, ToggleRight, Loader2, Info, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { upsertChallenge, toggleActifChallenge, supprimerChallenge, creerPackDemarrage } from './actions'
import type { ChallengeAvecLive } from './page'
import type { CibleSuggeree } from '@/lib/challenges-cibles'
import type { Metrique } from '@/lib/challenges-metrics'

const METRIQUES = [
  { v: 'ca_personnel_serveur',          label: 'CA personnel (serveur)',          unite: '€',     scope: 'individuel' },
  { v: 'tables_servies_personnelles',   label: 'Tables servies (perso)',          unite: 'tables', scope: 'individuel' },
  { v: 'pourboires_personnels',         label: 'Pourboires perçus (perso)',       unite: '€',     scope: 'individuel' },
  { v: 'plats_prepares_equipe_cuisine', label: 'Plats préparés cuisine (équipe)', unite: 'plats', scope: 'equipe' },
  { v: 'plats_prepares_equipe_pizza',   label: 'Pizzas préparées (équipe)',       unite: 'pizzas', scope: 'equipe' },
  { v: 'boissons_servies_equipe',       label: 'Boissons servies (équipe)',       unite: 'boissons', scope: 'equipe' },
  { v: 'reservations_recues',           label: 'Réservations reçues',             unite: 'résas', scope: 'equipe' },
  { v: 'no_shows_pct',                  label: 'Taux no-show (%)',                unite: '%',     scope: 'equipe' },
  { v: 'taches_obligatoires_pct',       label: 'Tâches obligatoires cochées',     unite: 'tâches', scope: 'individuel' },
  { v: 'nc_critiques_count',            label: 'NC critiques sur la période',     unite: 'NC',    scope: 'equipe' },
  { v: 'food_cost_pct',                 label: 'Food cost moyen (%)',             unite: '%',     scope: 'restaurant' },
  { v: 'ca_restaurant',                 label: 'CA restaurant total',             unite: '€',     scope: 'restaurant' },
  { v: 'ca_surplus_point_mort',         label: 'Surplus CA vs point mort',        unite: '€',     scope: 'restaurant' },
] as const

const POSTES = ['serveur', 'salle', 'cuisine', 'cuisinier', 'pizzaiolo', 'bar', 'barman', 'receptionniste', 'plonge', 'second']

export default function ChallengesAdminClient({
  challenges, periode, suggestions,
}: {
  challenges: ChallengeAvecLive[]
  periode: { debut: string; fin: string }
  suggestions: Record<Metrique, CibleSuggeree>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [showForm, setShowForm] = useState<ChallengeAvecLive | true | null>(null)
  const [packResult, setPackResult] = useState<{ nb_crees: number; nb_skipped: number; details: string[] } | null>(null)
  const [packPending, setPackPending] = useState(false)

  function lancerPack() {
    if (!confirm('Créer le pack démarrage ? 8 challenges types seront créés (ou ignorés si déjà actifs). Cibles auto-suggérées depuis tes données.')) return
    setPackPending(true)
    startTransition(async () => {
      try {
        const r = await creerPackDemarrage()
        setPackResult({ nb_crees: r.nb_crees, nb_skipped: r.nb_skipped, details: r.details })
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setPackPending(false)
      }
    })
  }

  function toggle(c: ChallengeAvecLive) {
    startTransition(async () => {
      try { await toggleActifChallenge({ id: c.id, actif: !c.actif }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }
  function del(c: ChallengeAvecLive) {
    if (!confirm(`Supprimer "${c.titre}" ?`)) return
    startTransition(async () => {
      try { await supprimerChallenge({ id: c.id }); router.refresh() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xl shadow-lg shadow-amber-500/30 shrink-0">
            <Trophy className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Motivation équipe</p>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Challenges</h1>
            <p className="text-xs text-zinc-500 mt-1">
              Période courante : <strong>{periode.debut}</strong> → <strong>{periode.fin}</strong>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={lancerPack} disabled={packPending} variant="outline" className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            {packPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Pack démarrage
          </Button>
          <Button onClick={() => setShowForm(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Nouveau challenge
          </Button>
        </div>
      </div>

      {/* Résultat pack démarrage */}
      {packResult && (
        <Card className={cn(
          'p-4',
          packResult.nb_crees > 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300',
        )}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h3 className="font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Pack démarrage : {packResult.nb_crees} créé{packResult.nb_crees > 1 ? 's' : ''}
                {packResult.nb_skipped > 0 && `, ${packResult.nb_skipped} ignoré${packResult.nb_skipped > 1 ? 's' : ''}`}
              </h3>
              <p className="text-xs text-zinc-600 mt-0.5">
                Tu peux modifier chaque challenge (cible, récompense, période) ci-dessous.
              </p>
            </div>
            <button onClick={() => setPackResult(null)} className="p-1 hover:bg-white/50 rounded text-zinc-500"><X className="h-4 w-4" /></button>
          </div>
          <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
            {packResult.details.map((d, i) => <li key={i} className="font-mono">{d}</li>)}
          </ul>
        </Card>
      )}

      {showForm && (
        <ChallengeForm
          initial={typeof showForm === 'object' ? showForm : null}
          suggestions={suggestions}
          onClose={() => setShowForm(null)}
          onSaved={() => { setShowForm(null); router.refresh() }}
        />
      )}

      {challenges.length === 0 ? (
        <Card className="p-10 text-center text-zinc-500">
          <Trophy className="h-12 w-12 mx-auto text-zinc-300 mb-3" />
          <p>Aucun challenge configuré.</p>
          <p className="text-xs mt-1">Crée le premier pour démarrer la gamification.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {challenges.map(c => (
            <ChallengeCard key={c.id} challenge={c} onEdit={() => setShowForm(c)} onToggle={() => toggle(c)} onDel={() => del(c)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChallengeCard({
  challenge, onEdit, onToggle, onDel,
}: {
  challenge: ChallengeAvecLive
  onEdit: () => void
  onToggle: () => void
  onDel: () => void
}) {
  const c = challenge
  const labelType = c.type === 'individuel' ? 'Individuel' : c.type === 'equipe' ? 'Équipe' : 'Restaurant'
  const recompTxt = c.recompense_type === 'fixe' ? `+${Number(c.recompense_montant).toFixed(0)} €` : `${Number(c.recompense_montant).toFixed(0)}% surplus`
  const labelMetric = METRIQUES.find(m => m.v === c.metrique)?.label ?? c.metrique

  return (
    <Card className={cn('p-4', !c.actif && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold truncate">{c.titre}</h3>
            <Badge variant="outline" className={
              c.type === 'individuel' ? 'bg-blue-100 text-blue-900 border-blue-300'
              : c.type === 'equipe'   ? 'bg-violet-100 text-violet-900 border-violet-300'
              :                         'bg-emerald-100 text-emerald-900 border-emerald-300'
            }>{labelType}</Badge>
            {c.poste_concerne && <Badge variant="outline">{c.poste_concerne}</Badge>}
            {c.leaderboard_public && <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300">🏆 Public</Badge>}
            {!c.actif && <Badge variant="outline" className="bg-zinc-100 text-zinc-500">Inactif</Badge>}
          </div>
          {c.description && <p className="text-xs text-zinc-600 mt-1">{c.description}</p>}
          <div className="mt-2 text-sm">
            <p className="text-zinc-700"><strong>Cible :</strong> {labelMetric} {c.cible_operateur} {Number(c.cible_valeur).toFixed(2)} {c.cible_unite}</p>
            <p className="text-zinc-700"><strong>Récompense :</strong> {recompTxt}</p>
            <p className="text-zinc-500 text-xs"><strong>Période :</strong> {c.periode}</p>
          </div>
          {c.type === 'restaurant' && (
            <div className={cn(
              'mt-2 rounded-md px-2 py-1.5 text-xs font-medium',
              c.cible_atteinte ? 'bg-emerald-100 text-emerald-900' : 'bg-zinc-100 text-zinc-700',
            )}>
              Live : {Number(c.valeur_live).toFixed(2)} {c.cible_unite}
              {c.cible_atteinte && ' ✅ atteinte'}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={onToggle} className="p-1.5 hover:bg-zinc-100 rounded text-zinc-600" title={c.actif ? 'Désactiver' : 'Activer'}>
            {c.actif ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />}
          </button>
          <button onClick={onEdit} className="p-1.5 hover:bg-zinc-100 rounded text-zinc-600" title="Modifier">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onDel} className="p-1.5 hover:bg-red-50 rounded text-red-600" title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  )
}

function ChallengeForm({
  initial, suggestions, onClose, onSaved,
}: {
  initial: ChallengeAvecLive | null
  suggestions: Record<Metrique, CibleSuggeree>
  onClose: () => void
  onSaved: () => void
}) {
  const [titre, setTitre]                 = useState(initial?.titre ?? '')
  const [description, setDescription]     = useState(initial?.description ?? '')
  const [type, setType]                   = useState<'individuel' | 'equipe' | 'restaurant'>(initial?.type ?? 'individuel')
  const [poste, setPoste]                 = useState(initial?.poste_concerne ?? '')
  const [metrique, setMetrique]           = useState<string>(initial?.metrique ?? 'ca_personnel_serveur')
  const [op, setOp]                       = useState<'>=' | '<=' | '='>(initial?.cible_operateur ?? '>=')
  const [val, setVal]                     = useState<string>(initial?.cible_valeur?.toString() ?? '0')
  const [unite, setUnite]                 = useState(initial?.cible_unite ?? '€')
  const [recType, setRecType]             = useState<'fixe' | 'pct_surplus'>(initial?.recompense_type ?? 'fixe')
  const [recMontant, setRecMontant]       = useState<string>(initial?.recompense_montant?.toString() ?? '50')
  const [periode, setPeriode]             = useState<'jour' | 'semaine' | 'mois'>(initial?.periode ?? 'mois')
  const [dateDebut, setDateDebut]         = useState(initial?.date_debut ?? new Date().toISOString().slice(0, 10))
  const [dateFin, setDateFin]             = useState(initial?.date_fin ?? '')
  const [pub, setPub]                     = useState<boolean>(initial?.leaderboard_public ?? false)
  const [actif, setActif]                 = useState<boolean>(initial?.actif ?? true)
  const [pending, setPending]             = useState(false)

  function autoFillUnite(metr: string) {
    const m = METRIQUES.find(x => x.v === metr)
    if (m) setUnite(m.unite)
  }

  function appliquerSuggestion() {
    const s = suggestions[metrique as Metrique]
    if (!s) return
    setVal(s.valeur.toString())
    setUnite(s.unite)
  }
  const suggCourante = suggestions[metrique as Metrique]

  function save() {
    setPending(true)
    upsertChallenge({
      id:                  initial?.id ?? null,
      titre,
      description:         description || null,
      type,
      poste_concerne:      type === 'individuel' && poste ? poste : null,
      metrique,
      cible_operateur:     op,
      cible_valeur:        parseFloat(val) || 0,
      cible_unite:         unite,
      recompense_type:     recType,
      recompense_montant:  parseFloat(recMontant) || 0,
      periode,
      date_debut:          dateDebut,
      date_fin:            dateFin || null,
      leaderboard_public:  pub,
      actif,
    }).then(() => onSaved())
      .catch((e: unknown) => alert(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setPending(false))
  }

  return (
    <Card className="p-4 border-2 border-emerald-200 bg-emerald-50/30 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{initial ? 'Modifier' : 'Nouveau'} challenge</h3>
        <button onClick={onClose} className="p-1 hover:bg-emerald-100 rounded"><X className="h-4 w-4" /></button>
      </div>

      <div>
        <label className="text-xs font-medium block mb-1">Titre</label>
        <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="ex : CA personnel ≥ 5000 €/mois" />
      </div>
      <div>
        <label className="text-xs font-medium block mb-1">Description (facultatif)</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Détails affichés à l'employé" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Type</label>
          <select value={type} onChange={e => setType(e.target.value as typeof type)} className="w-full border rounded px-2 py-2 text-sm">
            <option value="individuel">Individuel</option>
            <option value="equipe">Équipe (poste)</option>
            <option value="restaurant">Restaurant (collectif global)</option>
          </select>
        </div>
        {type === 'individuel' && (
          <div>
            <label className="text-xs font-medium block mb-1">Poste concerné</label>
            <select value={poste} onChange={e => setPoste(e.target.value)} className="w-full border rounded px-2 py-2 text-sm">
              <option value="">— Tous les postes —</option>
              {POSTES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium block mb-1">Période</label>
          <select value={periode} onChange={e => setPeriode(e.target.value as typeof periode)} className="w-full border rounded px-2 py-2 text-sm">
            <option value="jour">Journalier</option>
            <option value="semaine">Hebdomadaire</option>
            <option value="mois">Mensuel</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="text-xs font-medium block mb-1">Métrique mesurée</label>
          <select value={metrique} onChange={e => { setMetrique(e.target.value); autoFillUnite(e.target.value) }} className="w-full border rounded px-2 py-2 text-sm">
            {METRIQUES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Opérateur</label>
          <select value={op} onChange={e => setOp(e.target.value as typeof op)} className="w-full border rounded px-2 py-2 text-sm">
            <option value=">=">≥ (au moins)</option>
            <option value="<=">≤ (au plus)</option>
            <option value="=">= (exactement)</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Cible</label>
          <div className="flex gap-1">
            <Input type="number" step="any" value={val} onChange={e => setVal(e.target.value)} className="flex-1" />
            <Input type="text" value={unite} onChange={e => setUnite(e.target.value)} className="w-16 text-center" />
          </div>
        </div>
      </div>

      {suggCourante && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-blue-900">
              Cible suggérée : {suggCourante.valeur} {suggCourante.unite}
            </p>
            <p className="text-xs text-blue-700">{suggCourante.source}</p>
          </div>
          <Button size="sm" variant="outline" onClick={appliquerSuggestion} className="shrink-0 gap-1 border-blue-300 text-blue-700 hover:bg-blue-100">
            <Sparkles className="h-3 w-3" /> Appliquer
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Récompense</label>
          <select value={recType} onChange={e => setRecType(e.target.value as typeof recType)} className="w-full border rounded px-2 py-2 text-sm">
            <option value="fixe">Montant fixe (€)</option>
            <option value="pct_surplus">% du surplus point mort</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">{recType === 'fixe' ? 'Montant (€)' : '% du surplus'}</label>
          <Input type="number" step="any" min="0" value={recMontant} onChange={e => setRecMontant(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">Date début</label>
          <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium block mb-1">Date fin (facultatif)</label>
          <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} className="h-4 w-4" />
            🏆 Leaderboard public (top 3)
          </label>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} className="h-4 w-4" />
            Actif
          </label>
        </div>
      </div>

      <div className="rounded-md bg-zinc-100 p-2 text-xs text-zinc-700 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Astuce : pour un challenge <strong>restaurant surplus</strong>, choisis métrique « Surplus CA vs point mort »,
          opérateur <code>{'>='}</code> 0, récompense type « % surplus » avec ton pourcentage souhaité.
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button onClick={onClose} variant="outline">Annuler</Button>
        <Button onClick={save} disabled={pending} className="gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
    </Card>
  )
}
