'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, addMonths, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { PillTab, PillCount } from '@/components/ui/PillTab'
import {
  type Groupe, type Paiement, type MenuGroupe,
  type TypeGroupe, type StatutGroupe, type TypePaiement, type MethodePaiement,
  TYPE_GROUPE_INFO, STATUT_GROUPE_INFO, TYPE_PAIEMENT_LABEL,
  totalGroupeHT, totalGroupeTTC, totalPaye, resteAPayer, joursCalendrier,
  fmtPrix, fmtDate, fmtMois,
} from '@/lib/groupes'
import {
  creerGroupe, updateGroupe, changerStatutGroupe, supprimerGroupe,
  ajouterPlat, supprimerPlat,
  enregistrerPaiement, supprimerPaiement,
} from './actions'
import type { DataGroupes } from './page'

type Tab = 'liste' | 'planning' | 'facturation'

export default function GroupesClient({ data }: { data: DataGroupes }) {
  const [tab, setTab] = useState<Tab>('liste')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const today = new Date().toISOString().slice(0, 10)
  const aVenir = data.groupes.filter(g => g.statut !== 'annule' && g.date_visite >= today).length
  const totalRevenuPrevu = data.groupes
    .filter(g => g.statut === 'confirme' || g.statut === 'realise')
    .reduce((s, g) => s + totalGroupeTTC(g), 0)
  const aFacturer = data.groupes.filter(g => g.statut === 'realise' || g.statut === 'confirme')
    .filter(g => resteAPayer(g, data.paiements.filter(p => p.groupe_id === g.id)) > 0.01)

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold whitespace-nowrap">← Accueil</Link>
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xl shadow-lg shadow-violet-500/30 shrink-0">🎉</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">B2B & événements</p>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Groupes</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="À venir" value={String(aVenir)} />
            <KPI label="CA prévu" value={fmtPrix(totalRevenuPrevu)} />
            <KPI label="À facturer" value={String(aFacturer.length)} accent={aFacturer.length > 0 ? 'orange' : 'zinc'} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-3 flex gap-1.5 overflow-x-auto">
          <PillTab active={tab === 'liste'} onClick={() => setTab('liste')}>
            📋 Liste <PillCount n={data.groupes.length} active={tab === 'liste'} />
          </PillTab>
          <PillTab active={tab === 'planning'} onClick={() => setTab('planning')}>📅 Planning</PillTab>
          <PillTab active={tab === 'facturation'} onClick={() => setTab('facturation')}>
            💰 Facturation {aFacturer.length > 0 && <PillCount n={aFacturer.length} active={tab === 'facturation'} />}
          </PillTab>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {tab === 'liste'       && <ListeTab data={data} onError={flashKo} onOk={flashOk} />}
        {tab === 'planning'    && <PlanningTab groupes={data.groupes} />}
        {tab === 'facturation' && <FacturationTab groupes={aFacturer} paiements={data.paiements} onError={flashKo} onOk={flashOk} />}
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

// ─── TAB 1 — Liste ──────────────────────────────────────────────────
function ListeTab({ data, onError, onOk }: { data: DataGroupes; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState<Groupe | true | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<StatutGroupe | 'tous'>('tous')

  const filtered = useMemo(() => {
    return filtre === 'tous' ? data.groupes : data.groupes.filter(g => g.statut === filtre)
  }, [data.groupes, filtre])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <FiltreBtn active={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous ({data.groupes.length})</FiltreBtn>
          {(Object.keys(STATUT_GROUPE_INFO) as StatutGroupe[]).map(s => {
            const n = data.groupes.filter(g => g.statut === s).length
            return n > 0 ? <FiltreBtn key={s} active={filtre === s} onClick={() => setFiltre(s)}>{STATUT_GROUPE_INFO[s].label} ({n})</FiltreBtn> : null
          })}
        </div>
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau groupe</button>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center py-8 text-zinc-400">Aucun groupe.</p>
        ) : filtered.map(g => {
          const tInfo = TYPE_GROUPE_INFO[g.type]
          const sInfo = STATUT_GROUPE_INFO[g.statut]
          const ttc = totalGroupeTTC(g)
          const paies = data.paiements.filter(p => p.groupe_id === g.id)
          const reste = resteAPayer(g, paies)
          const isOpen = openId === g.id
          const menus = data.menus.filter(m => m.groupe_id === g.id)
          return (
            <article key={g.id} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
              <button onClick={() => setOpenId(isOpen ? null : g.id)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', tInfo.cls)}>{tInfo.emoji} {tInfo.label}</span>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                    <span className="font-bold text-base">{g.nom}</span>
                    <span className="text-xs text-zinc-500">{fmtDate(g.date_visite)}{g.heure_arrivee && ` ${g.heure_arrivee.slice(0, 5)}`}</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    👥 {g.nb_personnes} pers · {fmtPrix(g.prix_par_personne_ht)}/pers HT
                    {g.tour_operateur && <> · 🚌 {g.tour_operateur}</>}
                    {g.contact_nom && <> · 👤 {g.contact_nom}</>}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold tabular-nums">{fmtPrix(ttc)} TTC</p>
                  {reste > 0.01 && <p className={cn('tabular-nums font-bold', g.statut === 'realise' ? 'text-red-700' : 'text-amber-700')}>Reste {fmtPrix(reste)}</p>}
                  {reste <= 0.01 && paies.length > 0 && <p className="text-emerald-700 font-bold">✓ Payé</p>}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-zinc-100 p-4 bg-zinc-50 space-y-4">
                  <DetailGroupe groupe={g} menus={menus} paiements={paies} recettes={data.recettes} onError={onError} onOk={onOk} />
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setShowForm(g)} className="text-xs h-9 px-3 rounded border border-zinc-300 bg-white hover:bg-zinc-100 font-bold">✏️ Modifier</button>
                    <a href={`/admin/groupes/${g.id}/facture/print`} target="_blank" rel="noopener" className="text-xs h-9 px-3 inline-flex items-center rounded bg-zinc-900 hover:bg-zinc-800 text-white font-bold">🖨 Facture</a>
                    {g.statut === 'demande' && <button onClick={async () => { try { await changerStatutGroupe(g.id, 'confirme'); onOk('Confirmé') } catch (e) { onError(e) } }} className="text-xs h-9 px-3 rounded bg-blue-500 hover:bg-blue-400 text-white font-bold">✓ Confirmer</button>}
                    {g.statut === 'confirme' && <button onClick={async () => { try { await changerStatutGroupe(g.id, 'realise'); onOk('Réalisé') } catch (e) { onError(e) } }} className="text-xs h-9 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">✓ Marquer réalisé</button>}
                    {g.statut !== 'annule' && <button onClick={async () => { if (!confirm(`Annuler "${g.nom}" ?`)) return; try { await changerStatutGroupe(g.id, 'annule'); onOk('Annulé') } catch (e) { onError(e) } }} className="text-xs h-9 px-3 rounded bg-red-500 hover:bg-red-400 text-white font-bold">✕ Annuler</button>}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {showForm && (
        <GroupeModal groupe={showForm === true ? null : showForm} employes={data.employes}
          onClose={() => setShowForm(null)} onError={onError}
          onSuccess={(msg) => { setShowForm(null); onOk(msg) }} />
      )}
    </div>
  )
}

function DetailGroupe({ groupe, menus, paiements, recettes, onError, onOk }: {
  groupe: Groupe
  menus: MenuGroupe[]
  paiements: Paiement[]
  recettes: { id: string; nom: string; categorie: string; prix_vente_ht: number }[]
  onError: (e: unknown) => void
  onOk: (m: string) => void
}) {
  const [showAddPlat, setShowAddPlat] = useState(false)
  const [showAddPaiement, setShowAddPaiement] = useState(false)
  const router = useRouter()
  const ttc = totalGroupeTTC(groupe)
  const paye = totalPaye(paiements)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Menu */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-3 py-2 border-b border-zinc-200 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">🍽️ Menu groupe ({menus.length})</h4>
          <button onClick={() => setShowAddPlat(true)} className="text-[11px] h-7 px-2 rounded bg-zinc-900 text-white font-bold">+ Plat</button>
        </header>
        {menus.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-zinc-400 italic">Aucun plat dans le menu.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {menus.map(m => (
              <li key={m.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{m.recette_nom}</p>
                  <p className="text-[10px] text-zinc-500">
                    ×{m.quantite_par_personne}/pers
                    {m.categorie && ` · ${m.categorie}`}
                    {m.prix_negocie_ht != null && ` · ${fmtPrix(m.prix_negocie_ht)}/pers`}
                  </p>
                </div>
                <button onClick={async () => { try { await supprimerPlat(m.id); onOk('Plat retiré'); router.refresh() } catch (e) { onError(e) } }} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Paiements */}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <header className="px-3 py-2 border-b border-zinc-200 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">💰 Paiements ({paiements.length})</h4>
          <button onClick={() => setShowAddPaiement(true)} className="text-[11px] h-7 px-2 rounded bg-zinc-900 text-white font-bold">+ Paiement</button>
        </header>
        <div className="px-3 py-2 text-xs space-y-0.5 bg-zinc-50 border-b border-zinc-100">
          <div className="flex justify-between"><span className="text-zinc-600">Total dû</span><span className="font-bold tabular-nums">{fmtPrix(ttc)}</span></div>
          <div className="flex justify-between"><span className="text-zinc-600">Payé</span><span className="text-emerald-700 font-bold tabular-nums">{fmtPrix(paye)}</span></div>
          <div className="flex justify-between border-t border-zinc-200 pt-0.5"><span className="font-bold">Reste</span><span className={cn('font-bold tabular-nums', resteAPayer(groupe, paiements) > 0.01 ? 'text-red-700' : 'text-emerald-700')}>{fmtPrix(resteAPayer(groupe, paiements))}</span></div>
        </div>
        {paiements.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-zinc-400 italic">Aucun paiement enregistré.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {paiements.map(p => {
              const info = TYPE_PAIEMENT_LABEL[p.type]
              return (
                <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p>{info.emoji} {info.label} <span className="text-[10px] text-zinc-500">({p.methode})</span></p>
                    <p className="text-[10px] text-zinc-500">{fmtDate(p.date_paiement)}{p.reference && ` · ${p.reference}`}</p>
                  </div>
                  <span className={cn('font-bold tabular-nums', p.type === 'remboursement' ? 'text-red-700' : 'text-emerald-700')}>
                    {p.type === 'remboursement' ? '−' : '+'}{fmtPrix(p.montant)}
                  </span>
                  <button onClick={async () => { if (!confirm('Supprimer ce paiement ?')) return; try { await supprimerPaiement(p.id); onOk('Supprimé'); router.refresh() } catch (e) { onError(e) } }} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showAddPlat && (
        <PlatModal groupe_id={groupe.id} recettes={recettes} onClose={() => setShowAddPlat(false)} onError={onError}
          onSuccess={() => { setShowAddPlat(false); onOk('Plat ajouté') }} />
      )}
      {showAddPaiement && (
        <PaiementModal groupe_id={groupe.id} reste={resteAPayer(groupe, paiements)} onClose={() => setShowAddPaiement(false)} onError={onError}
          onSuccess={() => { setShowAddPaiement(false); onOk('Paiement enregistré') }} />
      )}
    </div>
  )
}

// ─── TAB 2 — Planning calendrier ────────────────────────────────────
function PlanningTab({ groupes }: { groupes: Groupe[] }) {
  const [refDate, setRefDate] = useState(new Date())
  const jours = useMemo(() => joursCalendrier(refDate, groupes), [refDate, groupes])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setRefDate(subMonths(refDate, 1))} className="h-10 px-4 rounded-md border border-zinc-300 hover:bg-zinc-50">← {format(subMonths(refDate, 1), 'MMM', { locale: fr })}</button>
        <h2 className="text-lg font-bold capitalize">{fmtMois(refDate)}</h2>
        <button onClick={() => setRefDate(addMonths(refDate, 1))} className="h-10 px-4 rounded-md border border-zinc-300 hover:bg-zinc-50">{format(addMonths(refDate, 1), 'MMM', { locale: fr })} →</button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
          {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => <div key={d} className="px-2 py-1.5 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {jours.map((j, i) => (
            <div key={i} className={cn(
              'min-h-[100px] border-r border-b border-zinc-100 p-1.5 relative',
              !j.estCeMois && 'bg-zinc-50 opacity-50',
              j.estAujourdhui && 'bg-blue-50',
            )}>
              <p className={cn('text-xs font-bold', j.estAujourdhui && 'text-blue-700')}>{j.jour}</p>
              <div className="space-y-0.5 mt-1">
                {j.groupes.slice(0, 3).map(g => {
                  const tInfo = TYPE_GROUPE_INFO[g.type]
                  return (
                    <div key={g.id} className={cn('text-[9px] px-1 py-0.5 rounded truncate', tInfo.cls)}
                      title={`${g.nom} · ${g.nb_personnes} pers`}>
                      {tInfo.emoji} {g.nom} <span className="opacity-70">({g.nb_personnes})</span>
                    </div>
                  )
                })}
                {j.groupes.length > 3 && (
                  <p className="text-[9px] text-zinc-500 italic">+{j.groupes.length - 3}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TAB 3 — Facturation ────────────────────────────────────────────
function FacturationTab({ groupes, paiements, onError, onOk }: { groupes: Groupe[]; paiements: Paiement[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const totalAFacturer = groupes.reduce((s, g) => s + resteAPayer(g, paiements.filter(p => p.groupe_id === g.id)), 0)

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center justify-between">
        <p className="text-sm">
          <b>{groupes.length}</b> groupe{groupes.length > 1 ? 's' : ''} avec solde dû — total :
          <b className="tabular-nums ml-2">{fmtPrix(totalAFacturer)}</b>
        </p>
      </div>

      {groupes.length === 0 ? (
        <p className="text-center py-12 text-zinc-400">✓ Aucune facturation en attente.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {groupes.map(g => {
            const paies = paiements.filter(p => p.groupe_id === g.id)
            const reste = resteAPayer(g, paies)
            return (
              <li key={g.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{g.nom}</p>
                  <p className="text-[11px] text-zinc-600">{fmtDate(g.date_visite)} · {g.nb_personnes} pers · {fmtPrix(totalGroupeTTC(g))} TTC</p>
                </div>
                <p className="text-amber-700 font-bold tabular-nums">{fmtPrix(reste)} dû</p>
                <a href={`/admin/groupes/${g.id}/facture/print`} target="_blank" rel="noopener" className="text-xs h-9 px-3 inline-flex items-center rounded bg-zinc-900 hover:bg-zinc-800 text-white font-bold">🖨 Facture</a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Modaux ─────────────────────────────────────────────────────────
function GroupeModal({ groupe, employes, onClose, onError, onSuccess }: { groupe: Groupe | null; employes: { id: string; prenom: string; nom: string }[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: (msg: string) => void }) {
  const isEdit = !!groupe
  const [nom, setNom] = useState(groupe?.nom ?? '')
  const [type, setType] = useState<TypeGroupe>(groupe?.type ?? 'tourisme')
  const [tour, setTour] = useState(groupe?.tour_operateur ?? '')
  const [contactNom, setContactNom] = useState(groupe?.contact_nom ?? '')
  const [contactTel, setContactTel] = useState(groupe?.contact_telephone ?? '')
  const [contactEmail, setContactEmail] = useState(groupe?.contact_email ?? '')
  const [date, setDate] = useState(groupe?.date_visite ?? new Date().toISOString().slice(0, 10))
  const [arrivee, setArrivee] = useState(groupe?.heure_arrivee ?? '12:00')
  const [depart, setDepart] = useState(groupe?.heure_depart ?? '14:30')
  const [nbPers, setNbPers] = useState(groupe?.nb_personnes ?? 20)
  const [prixPP, setPrixPP] = useState(groupe?.prix_par_personne_ht ?? 25)
  const [tva, setTva] = useState(groupe?.taux_tva ?? 10)
  const [viaTO, setViaTO] = useState(groupe?.facturation_via_to ?? false)
  const [statut, setStatut] = useState<StatutGroupe>(groupe?.statut ?? 'demande')
  const [zone, setZone] = useState(groupe?.zone_assignee ?? '')
  const [responsableId, setResponsableId] = useState(groupe?.responsable_employe_id ?? '')
  const [notes, setNotes] = useState(groupe?.notes ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!nom.trim()) { onError(new Error('Nom du groupe obligatoire')); return }
    startTransition(async () => {
      try {
        const payload = {
          nom: nom.trim(), type,
          tour_operateur: tour.trim() || null,
          contact_nom: contactNom.trim() || null,
          contact_telephone: contactTel.trim() || null,
          contact_email: contactEmail.trim() || null,
          date_visite: date,
          heure_arrivee: arrivee || null,
          heure_depart: depart || null,
          nb_personnes: nbPers,
          prix_par_personne_ht: prixPP,
          taux_tva: tva,
          facturation_via_to: viaTO,
          statut,
          notes: notes.trim() || null,
          zone_assignee: zone.trim() || null,
          responsable_employe_id: responsableId || null,
        }
        if (isEdit && groupe) await updateGroupe({ ...payload, id: groupe.id })
        else await creerGroupe(payload)
        onSuccess(isEdit ? 'Groupe mis à jour' : 'Groupe créé')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={isEdit ? `Modifier — ${groupe!.nom}` : 'Nouveau groupe'} onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nom du groupe"><input value={nom} onChange={e => setNom(e.target.value)} placeholder="CE Renault, Visite scolaire..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypeGroupe)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(TYPE_GROUPE_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tour-opérateur (optionnel)"><input value={tour} onChange={e => setTour(e.target.value)} placeholder="CitySightseeing, ParisTours..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Statut">
          <select value={statut} onChange={e => setStatut(e.target.value as StatutGroupe)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(STATUT_GROUPE_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Contact nom"><input value={contactNom} onChange={e => setContactNom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Téléphone"><input value={contactTel} onChange={e => setContactTel(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Email"><input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date visite"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Arrivée"><input type="time" value={arrivee} onChange={e => setArrivee(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
        <Field label="Départ"><input type="time" value={depart} onChange={e => setDepart(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 tabular-nums" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Nb personnes"><input type="number" min={1} value={nbPers} onChange={e => setNbPers(parseInt(e.target.value) || 1)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Prix HT/pers"><input type="number" step="0.01" value={prixPP} onChange={e => setPrixPP(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums font-bold" /></Field>
        <Field label="TVA %"><input type="number" step="0.5" value={tva} onChange={e => setTva(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <p className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">
        Total estimé : <b className="tabular-nums">{fmtPrix(nbPers * prixPP)}</b> HT · <b className="tabular-nums">{fmtPrix(nbPers * prixPP * (1 + tva / 100))}</b> TTC
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Zone assignée"><input value={zone} onChange={e => setZone(e.target.value)} placeholder="Salle privative, terrasse..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Responsable">
          <select value={responsableId} onChange={e => setResponsableId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Aucun —</option>
            {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={viaTO} onChange={e => setViaTO(e.target.checked)} />
        Facturation via tour-opérateur (et non au groupe directement)
      </label>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel={isEdit ? '✓ Mettre à jour' : '+ Créer'} />
    </Modal>
  )
}

function PlatModal({ groupe_id, recettes, onClose, onError, onSuccess }: { groupe_id: string; recettes: { id: string; nom: string; categorie: string; prix_vente_ht: number }[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [recetteId, setRecetteId] = useState('')
  const [nomLibre, setNomLibre] = useState('')
  const [categorie, setCategorie] = useState('plat')
  const [qte, setQte] = useState(1)
  const [prix, setPrix] = useState<number | ''>('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!recetteId && !nomLibre.trim()) { onError(new Error('Sélectionner une recette OU saisir un nom libre')); return }
    startTransition(async () => {
      try {
        await ajouterPlat({
          groupe_id, recette_id: recetteId || null,
          recette_nom_libre: recetteId ? null : (nomLibre.trim() || null),
          categorie: categorie || null, quantite_par_personne: qte,
          prix_negocie_ht: prix === '' ? null : Number(prix),
          ordre: 0, notes: null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Ajouter un plat au menu" onClose={onClose} disabled={isPending}>
      <Field label="Recette de la carte">
        <select value={recetteId} onChange={e => setRecetteId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Choisir / saisir nom libre ci-dessous —</option>
          {recettes.map(r => <option key={r.id} value={r.id}>{r.categorie} — {r.nom} ({fmtPrix(r.prix_vente_ht)})</option>)}
        </select>
      </Field>
      {!recetteId && (
        <Field label="OU nom libre"><input value={nomLibre} onChange={e => setNomLibre(e.target.value)} placeholder="Plat spécifique pour le groupe" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Catégorie">
          <select value={categorie} onChange={e => setCategorie(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="entree">Entrée</option>
            <option value="plat">Plat</option>
            <option value="dessert">Dessert</option>
            <option value="boisson">Boisson</option>
            <option value="autre">Autre</option>
          </select>
        </Field>
        <Field label="Qté/personne"><input type="number" step="0.5" value={qte} onChange={e => setQte(parseFloat(e.target.value) || 1)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
        <Field label="Prix négocié (optionnel)"><input type="number" step="0.01" value={prix} onChange={e => setPrix(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Vide = inclus" className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Ajouter" />
    </Modal>
  )
}

function PaiementModal({ groupe_id, reste, onClose, onError, onSuccess }: { groupe_id: string; reste: number; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [type, setType] = useState<TypePaiement>('arrhes')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [montant, setMontant] = useState(reste > 0 ? reste : 0)
  const [methode, setMethode] = useState<MethodePaiement>('virement')
  const [reference, setReference] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (montant <= 0) { onError(new Error('Montant > 0 obligatoire')); return }
    startTransition(async () => {
      try {
        await enregistrerPaiement({
          groupe_id, type, date_paiement: date, montant, methode,
          reference: reference.trim() || null, notes: null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Enregistrer un paiement" onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypePaiement)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(TYPE_PAIEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Méthode">
          <select value={methode} onChange={e => setMethode(e.target.value as MethodePaiement)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="especes">Espèces</option>
            <option value="carte">Carte</option>
            <option value="virement">Virement</option>
            <option value="cheque">Chèque</option>
            <option value="autre">Autre</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Montant €"><input type="number" step="0.01" min={0} value={montant} onChange={e => setMontant(parseFloat(e.target.value) || 0)} className="w-full h-14 px-3 rounded-md border border-zinc-300 text-2xl font-bold tabular-nums text-right" /></Field>
      </div>
      <Field label="Référence (n° chèque, virement...)"><input value={reference} onChange={e => setReference(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300 font-mono text-xs" /></Field>
      {reste > 0 && <p className="text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded p-2">Reste à payer : <b>{fmtPrix(reste)}</b></p>}
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

function FiltreBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      'px-3 h-9 rounded-full text-xs font-bold border whitespace-nowrap',
      active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
    )}>{children}</button>
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
