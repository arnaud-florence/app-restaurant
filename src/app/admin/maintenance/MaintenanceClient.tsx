'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, addMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  type Equipement, type Intervention,
  type CategorieEquip, type TypeControle, type TypeIntervention,
  CATEGORIE_INFO, TYPE_CONTROLE_INFO, TYPE_INTERVENTION_INFO,
  STATUT_ECHEANCE_STYLE, statutEcheance, joursRestants,
  fmtPrix, fmtDate,
} from '@/lib/maintenance'
import { creerEquipement, updateEquipement, archiverEquipement, creerIntervention, supprimerIntervention } from './actions'
import type { DataMaintenance } from './page'

type Tab = 'equipements' | 'planning' | 'interventions' | 'controles'

export default function MaintenanceClient({ data }: { data: DataMaintenance }) {
  const [tab, setTab] = useState<Tab>('equipements')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const equipsActifs = data.equipements.filter(e => e.actif)
  const planningProche = equipsActifs.filter(e => {
    const s = statutEcheance(e.prochaine_maintenance)
    return s === 'expire' || s === 'critique' || s === 'proche'
  }).length
  const controlesAlerte = equipsActifs.filter(e => {
    if (!e.type_controle_obligatoire) return false
    const s = statutEcheance(e.prochain_controle_obligatoire)
    return s === 'expire' || s === 'critique' || s === 'proche'
  }).length

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">← Accueil</Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Patrimoine</p>
              <h1 className="text-2xl font-bold">🔧 Maintenance</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="Équipements actifs" value={equipsActifs.length} />
            <KPI label="Maintenances proches" value={planningProche} accent={planningProche > 0 ? 'orange' : 'zinc'} />
            <KPI label="Contrôles ≤ 1 mois" value={controlesAlerte} accent={controlesAlerte > 0 ? 'rouge' : 'vert'} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'equipements'}   onClick={() => setTab('equipements')}>🛠️ Équipements ({equipsActifs.length})</TabBtn>
          <TabBtn active={tab === 'planning'}      onClick={() => setTab('planning')}>📅 Planning préventif{planningProche > 0 && ` (${planningProche})`}</TabBtn>
          <TabBtn active={tab === 'interventions'} onClick={() => setTab('interventions')}>🔧 Interventions ({data.interventions.length})</TabBtn>
          <TabBtn active={tab === 'controles'}     onClick={() => setTab('controles')}>🚨 Contrôles obligatoires{controlesAlerte > 0 && ` (${controlesAlerte})`}</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {tab === 'equipements'   && <EquipementsTab equipements={data.equipements} interventions={data.interventions} onError={flashKo} onOk={flashOk} />}
        {tab === 'planning'      && <PlanningTab equipements={equipsActifs} onError={flashKo} onOk={flashOk} />}
        {tab === 'interventions' && <InterventionsTab interventions={data.interventions} equipements={equipsActifs} onError={flashKo} onOk={flashOk} />}
        {tab === 'controles'     && <ControlesTab equipements={equipsActifs} onError={flashKo} onOk={flashOk} />}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: number; accent?: 'zinc' | 'orange' | 'rouge' | 'vert' }) {
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

// ─── TAB 1 — Équipements ───────────────────────────────────────────
function EquipementsTab({ equipements, interventions, onError, onOk }: { equipements: Equipement[]; interventions: Intervention[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState<Equipement | true | null>(null)
  const [search, setSearch] = useState('')
  const [filtreCat, setFiltreCat] = useState<CategorieEquip | ''>('')
  const [showInactifs, setShowInactifs] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipements.filter(e => {
      if (!showInactifs && !e.actif) return false
      if (filtreCat && e.categorie !== filtreCat) return false
      if (q && !`${e.nom} ${e.marque ?? ''} ${e.modele ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [equipements, search, filtreCat, showInactifs])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="h-10 px-3 rounded-md border border-zinc-300 text-sm w-64" />
          <select value={filtreCat} onChange={e => setFiltreCat(e.target.value as CategorieEquip | '')}
            className="h-10 px-3 rounded-md border border-zinc-300 text-sm">
            <option value="">Toutes catégories</option>
            {Object.entries(CATEGORIE_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          <label className="text-xs flex items-center gap-1.5">
            <input type="checkbox" checked={showInactifs} onChange={e => setShowInactifs(e.target.checked)} />
            Voir archivés
          </label>
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvel équipement</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.length === 0 ? (
          <p className="col-span-full text-center py-8 text-zinc-400">Aucun équipement.</p>
        ) : filtered.map(e => {
          const catInfo = e.categorie ? CATEGORIE_INFO[e.categorie] : null
          const garantieS = statutEcheance(e.garantie_fin)
          const maintS = statutEcheance(e.prochaine_maintenance)
          const ctrlS = statutEcheance(e.prochain_controle_obligatoire)
          const nbInter = interventions.filter(i => i.equipement_id === e.id).length
          return (
            <article key={e.id} className={cn('rounded-lg border bg-white overflow-hidden', !e.actif && 'opacity-60')}>
              <header className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm truncate">{e.nom}</h3>
                  <p className="text-[11px] text-zinc-500">{e.marque} {e.modele}</p>
                </div>
                <button onClick={() => setShowForm(e)} className="text-xs h-7 px-2 rounded border border-zinc-300 hover:bg-zinc-50 font-bold">✏️</button>
              </header>
              <div className="px-3 py-2 text-xs space-y-1">
                {catInfo && <div><span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', catInfo.cls)}>{catInfo.emoji} {catInfo.label}</span></div>}
                {e.numero_serie && <p className="text-zinc-500 font-mono text-[10px]">N° {e.numero_serie}</p>}
                {e.date_achat && <p className="text-zinc-600">📅 Acheté le {fmtDate(e.date_achat)}</p>}
                {e.valeur_achat != null && <p className="text-zinc-600 tabular-nums">💶 {fmtPrix(e.valeur_achat)}</p>}
                <div className="space-y-1 pt-1">
                  <EcheanceLine label="Garantie" date={e.garantie_fin} statut={garantieS} />
                  <EcheanceLine label="Prochaine maintenance" date={e.prochaine_maintenance} statut={maintS} />
                  {e.type_controle_obligatoire && (
                    <EcheanceLine label={`🛡️ ${TYPE_CONTROLE_INFO[e.type_controle_obligatoire].label}`} date={e.prochain_controle_obligatoire} statut={ctrlS} />
                  )}
                </div>
              </div>
              <footer className="px-3 py-1.5 border-t border-zinc-100 text-[10px] text-zinc-500">
                {nbInter} intervention{nbInter > 1 ? 's' : ''} historique
              </footer>
            </article>
          )
        })}
      </div>

      {showForm && (
        <EquipementModal equipement={showForm === true ? null : showForm}
          onClose={() => setShowForm(null)} onError={onError}
          onSuccess={(msg) => { setShowForm(null); onOk(msg) }} />
      )}
    </div>
  )
}

function EcheanceLine({ label, date, statut }: { label: string; date: string | null; statut: ReturnType<typeof statutEcheance> }) {
  const sty = STATUT_ECHEANCE_STYLE[statut]
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-600 text-[11px]">{label} :</span>
      {date ? (
        <span className="flex items-center gap-1 text-[11px]">
          <span>{fmtDate(date)}</span>
          <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded border', sty.cls)}>{sty.label}</span>
        </span>
      ) : (
        <span className="text-zinc-400 text-[11px]">—</span>
      )}
    </div>
  )
}

function EquipementModal({ equipement, onClose, onError, onSuccess }: { equipement: Equipement | null; onClose: () => void; onError: (e: unknown) => void; onSuccess: (msg: string) => void }) {
  const isEdit = !!equipement
  const [nom, setNom] = useState(equipement?.nom ?? '')
  const [marque, setMarque] = useState(equipement?.marque ?? '')
  const [modele, setModele] = useState(equipement?.modele ?? '')
  const [numSerie, setNumSerie] = useState(equipement?.numero_serie ?? '')
  const [categorie, setCategorie] = useState<CategorieEquip | ''>(equipement?.categorie ?? '')
  const [dateAchat, setDateAchat] = useState(equipement?.date_achat ?? '')
  const [valeurAchat, setValeurAchat] = useState(equipement?.valeur_achat ?? 0)
  const [garantieFin, setGarantieFin] = useState(equipement?.garantie_fin ?? '')
  const [prestataire, setPrestataire] = useState(equipement?.prestataire_maintenance ?? '')
  const [contact, setContact] = useState(equipement?.contact_prestataire ?? '')
  const [freq, setFreq] = useState(equipement?.frequence_maintenance ?? '')
  const [prochaineMaint, setProchaineMaint] = useState(equipement?.prochaine_maintenance ?? '')
  const [typeCtrl, setTypeCtrl] = useState<TypeControle | ''>(equipement?.type_controle_obligatoire ?? '')
  const [derniereCtrl, setDerniereCtrl] = useState(equipement?.derniere_controle_obligatoire ?? '')
  const [prochainCtrl, setProchainCtrl] = useState(equipement?.prochain_controle_obligatoire ?? '')
  const [organisme, setOrganisme] = useState(equipement?.organisme_certifie ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Auto-suggérer prochain contrôle quand on saisit dernière + type
  function autoProchain() {
    if (typeCtrl && derniereCtrl) {
      const periode = TYPE_CONTROLE_INFO[typeCtrl as TypeControle].periodicite_mois
      setProchainCtrl(format(addMonths(parseISO(derniereCtrl), periode), 'yyyy-MM-dd'))
    }
  }

  function valider() {
    if (!nom.trim()) { onError(new Error('Nom obligatoire')); return }
    startTransition(async () => {
      try {
        const payload = {
          nom: nom.trim(),
          marque: marque.trim() || null,
          modele: modele.trim() || null,
          numero_serie: numSerie.trim() || null,
          categorie: categorie || null,
          date_achat: dateAchat || null,
          valeur_achat: valeurAchat || null,
          garantie_fin: garantieFin || null,
          prestataire_maintenance: prestataire.trim() || null,
          contact_prestataire: contact.trim() || null,
          frequence_maintenance: freq.trim() || null,
          prochaine_maintenance: prochaineMaint || null,
          type_controle_obligatoire: typeCtrl || null,
          derniere_controle_obligatoire: derniereCtrl || null,
          prochain_controle_obligatoire: prochainCtrl || null,
          organisme_certifie: organisme.trim() || null,
        }
        if (isEdit && equipement) await updateEquipement({ ...payload, id: equipement.id })
        else await creerEquipement(payload)
        onSuccess(isEdit ? 'Équipement mis à jour' : 'Équipement créé')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={isEdit ? `Modifier — ${equipement!.nom}` : 'Nouvel équipement'} onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nom"><input value={nom} onChange={e => setNom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Catégorie">
          <select value={categorie} onChange={e => setCategorie(e.target.value as CategorieEquip | '')} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Aucune —</option>
            {Object.entries(CATEGORIE_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Marque"><input value={marque} onChange={e => setMarque(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Modèle"><input value={modele} onChange={e => setModele(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="N° série"><input value={numSerie} onChange={e => setNumSerie(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date achat"><input type="date" value={dateAchat} onChange={e => setDateAchat(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Valeur achat €"><input type="number" step="0.01" value={valeurAchat} onChange={e => setValeurAchat(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Fin de garantie"><input type="date" value={garantieFin} onChange={e => setGarantieFin(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>

      <div className="border-t border-zinc-200 pt-3 mt-2">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Maintenance préventive</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Prestataire"><input value={prestataire} onChange={e => setPrestataire(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          <Field label="Contact"><input value={contact} onChange={e => setContact(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-xs" /></Field>
          <Field label="Fréquence"><input value={freq} onChange={e => setFreq(e.target.value)} placeholder="Annuelle, semestrielle…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        </div>
        <Field label="Prochaine maintenance"><input type="date" value={prochaineMaint} onChange={e => setProchaineMaint(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>

      <div className="border-t border-zinc-200 pt-3 mt-2">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">🛡️ Contrôle obligatoire (si concerné)</p>
        <Field label="Type de contrôle">
          <select value={typeCtrl} onChange={e => setTypeCtrl(e.target.value as TypeControle | '')} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Aucun —</option>
            {Object.entries(TYPE_CONTROLE_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}{v.obligatoire && ' (obligatoire)'}</option>)}
          </select>
        </Field>
        {typeCtrl && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Dernier contrôle">
                <input type="date" value={derniereCtrl} onChange={e => { setDerniereCtrl(e.target.value); setTimeout(autoProchain, 0) }}
                  className="w-full h-12 px-3 rounded-md border border-zinc-300" />
              </Field>
              <Field label="Prochain contrôle (auto-calculé)">
                <input type="date" value={prochainCtrl} onChange={e => setProchainCtrl(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" />
              </Field>
            </div>
            <Field label="Organisme certifié"><input value={organisme} onChange={e => setOrganisme(e.target.value)} placeholder="APAVE, BUREAU VERITAS, SOCOTEC…" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-3 border-t border-zinc-200 -mx-5 px-5 -mb-5 pb-5 sticky bottom-0 bg-white">
        <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
        {isEdit && equipement?.actif && (
          <button onClick={async () => {
            if (!confirm(`Archiver "${equipement.nom}" ?`)) return
            try { await archiverEquipement(equipement.id); onSuccess('Archivé'); router.refresh() }
            catch (e) { onError(e) }
          }} className="min-h-[48px] px-4 rounded-md bg-amber-500 hover:bg-amber-400 text-white font-bold">📦 Archiver</button>
        )}
        <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : (isEdit ? '✓ Mettre à jour' : '+ Créer')}</button>
      </div>
    </Modal>
  )
}

// ─── TAB 2 — Planning préventif ────────────────────────────────────
function PlanningTab({ equipements, onError, onOk }: { equipements: Equipement[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const sorted = useMemo(() => {
    return equipements
      .filter(e => e.prochaine_maintenance)
      .sort((a, b) => (a.prochaine_maintenance ?? '').localeCompare(b.prochaine_maintenance ?? ''))
  }, [equipements])

  const [showInter, setShowInter] = useState<Equipement | null>(null)

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">Trié par échéance. Click "+ Intervention" pour enregistrer une visite et planifier la prochaine.</p>
      <section className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune maintenance préventive planifiée.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Équipement</th>
                <th className="text-left px-3 py-1.5">Catégorie</th>
                <th className="text-left px-3 py-1.5">Prestataire</th>
                <th className="text-left px-3 py-1.5">Prochaine</th>
                <th className="text-right px-3 py-1.5">Jours</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sorted.map(e => {
                const s = statutEcheance(e.prochaine_maintenance)
                const j = joursRestants(e.prochaine_maintenance)
                const sty = STATUT_ECHEANCE_STYLE[s]
                const cat = e.categorie ? CATEGORIE_INFO[e.categorie] : null
                return (
                  <tr key={e.id} className={cn(s === 'expire' && 'bg-red-50', s === 'critique' && 'bg-red-50', s === 'proche' && 'bg-amber-50')}>
                    <td className="px-3 py-2 font-bold">{e.nom}</td>
                    <td className="px-3 py-2">{cat ? <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', cat.cls)}>{cat.emoji} {cat.label}</span> : '—'}</td>
                    <td className="px-3 py-2 text-zinc-600">{e.prestataire_maintenance ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(e.prochaine_maintenance)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', sty.cls)}>
                        {j !== null && (j < 0 ? `${j} j` : `${j} j`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setShowInter(e)} className="text-xs h-8 px-2 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-bold">+ Intervention</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
      {showInter && (
        <InterventionModal equipement={showInter} type="preventive" onClose={() => setShowInter(null)} onError={onError}
          onSuccess={() => { setShowInter(null); onOk('Intervention enregistrée') }} />
      )}
    </div>
  )
}

// ─── TAB 3 — Interventions ─────────────────────────────────────────
function InterventionsTab({ interventions, equipements, onError, onOk }: { interventions: Intervention[]; equipements: Equipement[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [filtre, setFiltre] = useState<TypeIntervention | 'tous'>('tous')
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  const filtered = useMemo(() => filtre === 'tous' ? interventions : interventions.filter(i => i.type === filtre), [interventions, filtre])
  const totalCout = filtered.reduce((s, i) => s + i.cout, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <FiltreBtn active={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous ({interventions.length})</FiltreBtn>
          {(Object.keys(TYPE_INTERVENTION_INFO) as TypeIntervention[]).map(t => {
            const info = TYPE_INTERVENTION_INFO[t]
            const n = interventions.filter(i => i.type === t).length
            return <FiltreBtn key={t} active={filtre === t} onClick={() => setFiltre(t)}>{info.emoji} {info.label} ({n})</FiltreBtn>
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-600">Coût total : <b className="tabular-nums">{fmtPrix(totalCout)}</b></span>
          <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Intervention</button>
        </div>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune intervention.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {filtered.map(i => {
              const info = TYPE_INTERVENTION_INFO[i.type]
              return (
                <li key={i.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', info.cls)}>{info.emoji} {info.label}</span>
                      <span className="font-bold text-sm">{i.equipement_nom ?? '— Équipement supprimé —'}</span>
                      <span className="text-[11px] text-zinc-500">{fmtDate(i.date_intervention)}</span>
                    </div>
                    {i.description && <p className="text-xs text-zinc-700 mt-1 italic">« {i.description} »</p>}
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {i.prestataire && <>👤 {i.prestataire} · </>}
                      {i.cout > 0 && <>💶 {fmtPrix(i.cout)} · </>}
                      {i.prochaine_intervention && <>📅 prochaine : {fmtDate(i.prochaine_intervention)}</>}
                    </p>
                  </div>
                  <button onClick={async () => {
                    if (!confirm('Supprimer cette intervention ?')) return
                    try { await supprimerIntervention(i.id); onOk('Supprimée'); router.refresh() }
                    catch (e) { onError(e) }
                  }} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <InterventionModal equipements={equipements} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Intervention enregistrée') }} />
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

function InterventionModal({ equipement, equipements, type, onClose, onError, onSuccess }: {
  equipement?: Equipement
  equipements?: Equipement[]
  type?: TypeIntervention
  onClose: () => void
  onError: (e: unknown) => void
  onSuccess: () => void
}) {
  const [equipId, setEquipId] = useState(equipement?.id ?? equipements?.[0]?.id ?? '')
  const [iType, setIType] = useState<TypeIntervention>(type ?? 'preventive')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [prestataire, setPrestataire] = useState(equipement?.prestataire_maintenance ?? '')
  const [cout, setCout] = useState(0)
  const [prochaine, setProchaine] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const equipChoisi = equipements?.find(e => e.id === equipId) ?? equipement

  // Auto-suggérer prochaine si type=controle_obligatoire et l'équipement a un type_controle
  function autoProchaine() {
    if (iType === 'controle_obligatoire' && equipChoisi?.type_controle_obligatoire) {
      const periode = TYPE_CONTROLE_INFO[equipChoisi.type_controle_obligatoire].periodicite_mois
      setProchaine(format(addMonths(parseISO(date), periode), 'yyyy-MM-dd'))
    }
  }

  function valider() {
    if (!equipId) { onError(new Error('Équipement obligatoire')); return }
    startTransition(async () => {
      try {
        await creerIntervention({
          equipement_id: equipId, type: iType, date_intervention: date,
          description: description.trim() || null,
          prestataire: prestataire.trim() || null,
          cout, prochaine_intervention: prochaine || null,
          documents_url: [],
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={`Intervention ${equipement ? '— ' + equipement.nom : ''}`} onClose={onClose} disabled={isPending}>
      {!equipement && equipements && (
        <Field label="Équipement">
          <select value={equipId} onChange={e => setEquipId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Choisir —</option>
            {equipements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select value={iType} onChange={e => { setIType(e.target.value as TypeIntervention); setTimeout(autoProchaine, 0) }} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(TYPE_INTERVENTION_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Date intervention"><input type="date" value={date} onChange={e => { setDate(e.target.value); setTimeout(autoProchaine, 0) }} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prestataire"><input value={prestataire} onChange={e => setPrestataire(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Coût €"><input type="number" step="0.01" value={cout} onChange={e => setCout(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <Field label="Prochaine intervention (optionnel — auto si contrôle obligatoire)">
        <input type="date" value={prochaine} onChange={e => setProchaine(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" />
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Enregistrer" />
    </Modal>
  )
}

// ─── TAB 4 — Contrôles obligatoires ────────────────────────────────
function ControlesTab({ equipements, onError, onOk }: { equipements: Equipement[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const concernes = useMemo(() => {
    return equipements
      .filter(e => e.type_controle_obligatoire)
      .sort((a, b) => (a.prochain_controle_obligatoire ?? '').localeCompare(b.prochain_controle_obligatoire ?? ''))
  }, [equipements])

  const [showInter, setShowInter] = useState<Equipement | null>(null)

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <b>🛡️ Contrôles légaux obligatoires :</b> électricité Q-18 (1 an), gaz (1 an), extincteurs (1 an), hotte (6 mois), désenfumage (1 an).
        Doivent être réalisés par un organisme certifié (APAVE, BUREAU VERITAS, SOCOTEC…). Conserver les rapports 5 ans.
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        {concernes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun équipement marqué comme soumis à contrôle obligatoire. Édite tes équipements pour les renseigner.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Équipement</th>
                <th className="text-left px-3 py-1.5">Type contrôle</th>
                <th className="text-left px-3 py-1.5">Organisme</th>
                <th className="text-left px-3 py-1.5">Dernier</th>
                <th className="text-left px-3 py-1.5">Prochain</th>
                <th className="text-right px-3 py-1.5">Statut</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {concernes.map(e => {
                const ctrl = e.type_controle_obligatoire ? TYPE_CONTROLE_INFO[e.type_controle_obligatoire] : null
                const s = statutEcheance(e.prochain_controle_obligatoire)
                const sty = STATUT_ECHEANCE_STYLE[s]
                const j = joursRestants(e.prochain_controle_obligatoire)
                return (
                  <tr key={e.id} className={cn(s === 'expire' && 'bg-red-50', s === 'critique' && 'bg-red-50', s === 'proche' && 'bg-amber-50')}>
                    <td className="px-3 py-2 font-bold">{e.nom}</td>
                    <td className="px-3 py-2">{ctrl?.emoji} {ctrl?.label}</td>
                    <td className="px-3 py-2 text-zinc-600">{e.organisme_certifie ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(e.derniere_controle_obligatoire)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDate(e.prochain_controle_obligatoire)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', sty.cls)}>{sty.label}</span>
                      {j !== null && <p className="text-[10px] text-zinc-500 mt-0.5">{j < 0 ? `il y a ${-j} j` : `dans ${j} j`}</p>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setShowInter(e)} className="text-xs h-8 px-2 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">+ Visite</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {showInter && (
        <InterventionModal equipement={showInter} type="controle_obligatoire" onClose={() => setShowInter(null)} onError={onError}
          onSuccess={() => { setShowInter(null); onOk('Contrôle enregistré, prochain calculé auto') }} />
      )}
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
      <button onClick={onValider} disabled={pending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{pending ? '…' : validLabel}</button>
    </div>
  )
}
