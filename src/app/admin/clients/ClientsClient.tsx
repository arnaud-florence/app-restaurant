'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { PillTab, PillCount } from '@/components/ui/PillTab'
import {
  type Client, type Campagne, type Reclamation, type RetourPlat,
  type SegmentClient, type SegmentCampagne, type TypeCampagne, type StatutCampagne,
  type TypeReclamation, type GraviteReclam, type StatutReclam, type MotifRetour,
  NIVEAU_INFO, SEGMENT_INFO, SEGMENT_CAMPAGNE_LABEL, STATUT_CAMPAGNE_INFO,
  TYPE_RECLAM_INFO, GRAVITE_RECLAM_INFO, STATUT_RECLAM_INFO, MOTIF_RETOUR_LABEL,
  appartientSegment, calculerNiveau,
  fmtPrix, fmtDate,
} from '@/lib/clients'
import {
  creerClient, updateClient, supprimerClient, recalculerStatsClient,
  creerCampagne, marquerCampagneEnvoyee, supprimerCampagne,
  creerReclamation, resoudreReclamation,
  creerRetour, supprimerRetour,
} from './actions'
import type { DataClients } from './page'

type Tab = 'fichier' | 'campagnes' | 'reclamations' | 'retours' | 'parrainage'

export default function ClientsClient({ data }: { data: DataClients }) {
  const [tab, setTab] = useState<Tab>('fichier')
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 2200) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  const reclamOuvertes = data.reclamations.filter(r => r.statut !== 'resolue').length
  const optinCount = data.clients.filter(c => c.opt_in_marketing).length
  const coutFoodCostRetours = data.retours.reduce((s, r) => s + r.cout_food_cost, 0)

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900 font-semibold whitespace-nowrap">← Accueil</Link>
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xl shadow-lg shadow-violet-500/30 shrink-0">🤝</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">CRM & fidélité</p>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Clients</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <KPI label="Total" value={data.clients.length} />
            <KPI label="Opt-in" value={optinCount} accent={optinCount > 0 ? 'vert' : 'zinc'} />
            <KPI label="Réclam. ouvertes" value={reclamOuvertes} accent={reclamOuvertes > 0 ? 'rouge' : 'vert'} />
            <KPI label="Retours coût" value={fmtPrix(coutFoodCostRetours)} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'fichier'}      onClick={() => setTab('fichier')}>📒 Fichier ({data.clients.length})</TabBtn>
          <TabBtn active={tab === 'campagnes'}    onClick={() => setTab('campagnes')}>📨 Campagnes ({data.campagnes.length})</TabBtn>
          <TabBtn active={tab === 'reclamations'} onClick={() => setTab('reclamations')}>⚠️ Réclamations{reclamOuvertes > 0 && ` (${reclamOuvertes})`}</TabBtn>
          <TabBtn active={tab === 'retours'}      onClick={() => setTab('retours')}>↩️ Retours ({data.retours.length})</TabBtn>
          <TabBtn active={tab === 'parrainage'}   onClick={() => setTab('parrainage')}>🎁 Parrainage</TabBtn>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {tab === 'fichier'      && <FichierTab clients={data.clients} onError={flashKo} onOk={flashOk} />}
        {tab === 'campagnes'    && <CampagnesTab campagnes={data.campagnes} clients={data.clients} onError={flashKo} onOk={flashOk} />}
        {tab === 'reclamations' && <ReclamTab reclamations={data.reclamations} clients={data.clients} employes={data.employes} onError={flashKo} onOk={flashOk} />}
        {tab === 'retours'      && <RetoursTab retours={data.retours} clients={data.clients} recettes={data.recettes} employes={data.employes} onError={flashKo} onOk={flashOk} />}
        {tab === 'parrainage'   && <ParrainageTab clients={data.clients} />}
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

function KPI({ label, value, accent = 'zinc' }: { label: string; value: number | string; accent?: 'zinc' | 'vert' | 'rouge' }) {
  const cls = {
    zinc: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    vert: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    rouge: 'bg-red-50 text-red-900 border-red-200',
  }[accent]
  return (
    <div className={cn('px-3 py-1.5 rounded-md border text-center', cls)}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

// ─── TAB 1 — Fichier ───────────────────────────────────────────────
function FichierTab({ clients, onError, onOk }: { clients: Client[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState<Client | true | null>(null)
  const [search, setSearch] = useState('')
  const [filtreSeg, setFiltreSeg] = useState<SegmentClient | ''>('')
  const router = useRouter()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      if (q && !`${c.prenom ?? ''} ${c.nom} ${c.email ?? ''}`.toLowerCase().includes(q)) return false
      if (filtreSeg && !appartientSegment(c, filtreSeg)) return false
      return true
    })
  }, [clients, search, filtreSeg])

  return (
    <div className="space-y-3">
      <div className="sticky top-[64px] z-10 -mx-4 px-4 py-3 bg-zinc-50/95 backdrop-blur-md border-b border-zinc-200 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher nom, email..."
            className="h-11 px-3 rounded-md border border-zinc-300 text-base flex-1 min-w-[200px] max-w-md focus:border-emerald-500 outline-none"
          />
          <button
            onClick={() => setShowForm(true)}
            className="min-h-[44px] px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm shrink-0 active:scale-95 transition-transform"
          >+ Nouveau client</button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          <PillTab active={filtreSeg === ''} onClick={() => setFiltreSeg('')}>
            ✦ Tous <PillCount n={clients.length} active={filtreSeg === ''} />
          </PillTab>
          {(Object.keys(SEGMENT_INFO) as SegmentClient[]).map(s => {
            const info = SEGMENT_INFO[s]
            const n = clients.filter(c => appartientSegment(c, s)).length
            if (n === 0) return null
            return (
              <PillTab key={s} active={filtreSeg === s} onClick={() => setFiltreSeg(s)}>
                {info.emoji} {info.label} <PillCount n={n} active={filtreSeg === s} />
              </PillTab>
            )
          })}
        </div>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun client.</p>
        ) : (
          <table className="responsive-table w-full text-sm">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-3 py-1.5">Client</th>
                <th className="text-left px-3 py-1.5">Niveau</th>
                <th className="text-right px-3 py-1.5">Visites</th>
                <th className="text-right px-3 py-1.5">Dépensé</th>
                <th className="text-left px-3 py-1.5">Dern. visite</th>
                <th className="text-left px-3 py-1.5">Allergies</th>
                <th className="text-left px-3 py-1.5">Opt-in</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(c => {
                const niv = calculerNiveau(c.nb_visites)
                const nivInfo = NIVEAU_INFO[niv]
                return (
                  <tr key={c.id}>
                    <td className="px-3 py-2">
                      <p className="font-bold">{c.prenom} {c.nom}</p>
                      {c.email && <p className="text-[10px] text-zinc-500">{c.email}</p>}
                      {c.telephone && <p className="text-[10px] text-zinc-500">{c.telephone}</p>}
                    </td>
                    <td className="px-3 py-2"><span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', nivInfo.cls)}>{nivInfo.emoji} {nivInfo.label}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{c.nb_visites}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPrix(c.total_depense)}</td>
                    <td className="px-3 py-2 text-[11px] text-zinc-600">{fmtDate(c.derniere_visite)}</td>
                    <td className="px-3 py-2 text-[10px]">{c.allergies.length > 0 ? <span className="text-red-700">⚠ {c.allergies.length}</span> : '—'}</td>
                    <td className="px-3 py-2 text-[10px]">{c.opt_in_marketing ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setShowForm(c)} className="text-xs h-8 px-2 rounded border border-zinc-300 hover:bg-zinc-50 font-bold">✏️</button>
                      <button onClick={async () => {
                        try { await recalculerStatsClient(c.id); onOk('Stats recalculées'); router.refresh() }
                        catch (e) { onError(e) }
                      }} className="text-xs h-8 px-2 rounded text-zinc-500 hover:text-blue-700" title="Recalculer nb visites + total + niveau depuis commandes">↻</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {showForm && (
        <ClientModal client={showForm === true ? null : showForm} clients={clients}
          onClose={() => setShowForm(null)} onError={onError}
          onSuccess={(msg) => { setShowForm(null); onOk(msg) }} />
      )}
    </div>
  )
}

function ClientModal({ client, clients, onClose, onError, onSuccess }: { client: Client | null; clients: Client[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: (msg: string) => void }) {
  const isEdit = !!client
  const [prenom, setPrenom] = useState(client?.prenom ?? '')
  const [nom, setNom] = useState(client?.nom ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [telephone, setTelephone] = useState(client?.telephone ?? '')
  const [adresse, setAdresse] = useState(client?.adresse ?? '')
  const [naissance, setNaissance] = useState(client?.date_naissance ?? '')
  const [allergies, setAllergies] = useState(client?.allergies?.join(', ') ?? '')
  const [preferences, setPreferences] = useState(client?.preferences ?? '')
  const [optIn, setOptIn] = useState(client?.opt_in_marketing ?? false)
  const [parrainId, setParrainId] = useState(client?.parraine_par_id ?? '')
  const [notes, setNotes] = useState(client?.notes_internes ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!nom.trim()) { onError(new Error('Nom obligatoire')); return }
    startTransition(async () => {
      try {
        const payload = {
          prenom: prenom.trim() || null, nom: nom.trim(),
          email: email.trim() || null, telephone: telephone.trim() || null,
          adresse: adresse.trim() || null,
          date_naissance: naissance || null,
          allergies: allergies.split(',').map(s => s.trim()).filter(Boolean),
          preferences: preferences.trim() || null,
          opt_in_marketing: optIn,
          parraine_par_id: parrainId || null,
          notes_internes: notes.trim() || null,
        }
        if (isEdit && client) await updateClient({ ...payload, id: client.id })
        else await creerClient(payload)
        onSuccess(isEdit ? 'Client mis à jour' : 'Client créé')
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title={isEdit ? `Modifier — ${client!.prenom} ${client!.nom}` : 'Nouveau client'} onClose={onClose} disabled={isPending}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Prénom"><input value={prenom} onChange={e => setPrenom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Nom"><input value={nom} onChange={e => setNom(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Téléphone"><input value={telephone} onChange={e => setTelephone(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      <Field label="Adresse"><input value={adresse} onChange={e => setAdresse(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date naissance"><input type="date" value={naissance} onChange={e => setNaissance(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Parrainé par">
          <select value={parrainId} onChange={e => setParrainId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Aucun —</option>
            {clients.filter(c => !client || c.id !== client.id).map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom} ({c.code_parrainage})</option>)}
          </select>
        </Field>
      </div>
      <Field label="Allergies (séparées par virgule)"><input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="gluten, lait, fruits_a_coque" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <Field label="Préférences"><textarea value={preferences} onChange={e => setPreferences(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <label className="flex items-center gap-2 text-sm border-t border-zinc-200 pt-3">
        <input type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)} />
        ✉️ Accepte de recevoir les campagnes marketing (RGPD)
      </label>
      <Field label="Notes internes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <div className="flex gap-2 pt-3 border-t border-zinc-200 -mx-5 px-5 -mb-5 pb-5 sticky bottom-0 bg-white">
        <button onClick={onClose} disabled={isPending} className="flex-1 min-h-[48px] rounded-md bg-zinc-100 hover:bg-zinc-200 font-bold">Annuler</button>
        {isEdit && (
          <button onClick={async () => {
            if (!confirm(`Supprimer définitivement "${client!.prenom} ${client!.nom}" ?`)) return
            try { await supprimerClient(client!.id); onSuccess('Supprimé'); router.refresh() } catch (e) { onError(e) }
          }} className="min-h-[48px] px-4 rounded-md bg-red-500 hover:bg-red-400 text-white font-bold">🗑</button>
        )}
        <button onClick={valider} disabled={isPending} className="flex-[2] min-h-[48px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold">{isPending ? '…' : (isEdit ? '✓ Mettre à jour' : '+ Créer')}</button>
      </div>
    </Modal>
  )
}

// ─── TAB 2 — Campagnes ─────────────────────────────────────────────
function CampagnesTab({ campagnes, clients, onError, onOk }: { campagnes: Campagne[]; clients: Client[]; onError: (e: unknown) => void; onOk: (m: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [showDestinataires, setShowDestinataires] = useState<Campagne | null>(null)
  const router = useRouter()

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle campagne</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {campagnes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune campagne. Crée la première !</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {campagnes.map(c => {
              const sInfo = STATUT_CAMPAGNE_INFO[c.statut]
              return (
                <li key={c.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base">{c.type === 'email' ? '✉️' : '📱'}</span>
                      <span className="font-bold text-sm">{c.titre}</span>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                      <span className="text-[10px] text-zinc-500">→ {SEGMENT_CAMPAGNE_LABEL[c.segment]}</span>
                    </div>
                    {c.sujet && <p className="text-xs italic text-zinc-600 mt-1">« {c.sujet} »</p>}
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {c.nb_destinataires} destinataires
                      {c.date_envoi && ` · envoyée le ${format(parseISO(c.date_envoi), 'd MMM HH:mm', { locale: fr })}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setShowDestinataires(c)} className="text-xs h-8 px-2 rounded border border-zinc-300 hover:bg-zinc-50 font-bold">📋 Destinataires</button>
                    {c.statut === 'brouillon' && (
                      <button onClick={async () => {
                        if (!confirm('Marquer comme envoyée ? (Pas d\'envoi réel — à faire manuellement via Mailchimp/Brevo/Twilio)')) return
                        try { await marquerCampagneEnvoyee(c.id); onOk('Marquée envoyée'); router.refresh() } catch (e) { onError(e) }
                      }} className="text-xs h-8 px-2 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">✓ Envoyée</button>
                    )}
                    <button onClick={async () => {
                      if (!confirm('Supprimer cette campagne ?')) return
                      try { await supprimerCampagne(c.id); onOk('Supprimée'); router.refresh() } catch (e) { onError(e) }
                    }} className="text-xs h-8 px-2 text-zinc-400 hover:text-red-600">×</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <CampagneModal clients={clients} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Campagne créée') }} />
      )}
      {showDestinataires && (
        <DestinatairesModal campagne={showDestinataires} clients={clients} onClose={() => setShowDestinataires(null)} />
      )}
    </div>
  )
}

function CampagneModal({ clients, onClose, onError, onSuccess }: { clients: Client[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [titre, setTitre] = useState('')
  const [type, setType] = useState<TypeCampagne>('email')
  const [segment, setSegment] = useState<SegmentCampagne>('tous')
  const [sujet, setSujet] = useState('')
  const [contenu, setContenu] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Calcule destinataires selon segment et opt-in
  const dests = useMemo(() => {
    const base = clients.filter(c => c.opt_in_marketing && (type === 'email' ? c.email : c.telephone))
    switch (segment) {
      case 'tous': return base
      case 'vip': return base.filter(c => appartientSegment(c, 'vip'))
      case 'dormants': return base.filter(c => appartientSegment(c, 'dormant'))
      case 'nouveaux': return base.filter(c => appartientSegment(c, 'nouveau'))
      case 'allergiques': return base.filter(c => appartientSegment(c, 'allergique'))
      case 'anniversaires': return base.filter(c => appartientSegment(c, 'anniversaire'))
      default: return base
    }
  }, [clients, segment, type])

  function valider() {
    if (!titre.trim() || !contenu.trim()) { onError(new Error('Titre + contenu obligatoires')); return }
    if (type === 'email' && !sujet.trim()) { onError(new Error('Sujet obligatoire pour email')); return }
    startTransition(async () => {
      try {
        await creerCampagne({
          titre: titre.trim(), type, segment,
          sujet: sujet.trim() || null,
          contenu: contenu.trim(),
          nb_destinataires: dests.length,
          notes: null,
        })
        onSuccess()
        router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle campagne marketing" onClose={onClose} disabled={isPending}>
      <Field label="Titre interne"><input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex: Promo Saint-Valentin 2026" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypeCampagne)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="email">✉️ Email</option>
            <option value="sms">📱 SMS</option>
          </select>
        </Field>
        <Field label="Segment">
          <select value={segment} onChange={e => setSegment(e.target.value as SegmentCampagne)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {(Object.keys(SEGMENT_CAMPAGNE_LABEL) as SegmentCampagne[]).filter(s => s !== 'custom').map(s => <option key={s} value={s}>{SEGMENT_CAMPAGNE_LABEL[s]}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-xs bg-zinc-50 border border-zinc-200 rounded p-2">
        🎯 <b>{dests.length}</b> destinataires (clients opt-in avec {type === 'email' ? 'email' : 'téléphone'})
      </p>
      {type === 'email' && (
        <Field label="Sujet"><input value={sujet} onChange={e => setSujet(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      )}
      <Field label="Contenu"><textarea value={contenu} onChange={e => setContenu(e.target.value)} rows={8} placeholder={type === 'email' ? 'Bonjour {prenom},\n\n...' : 'Texte SMS court (160 caractères)'} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <p className="text-[11px] text-zinc-500 italic">⚠ Cette campagne ne sera pas envoyée automatiquement. Une fois créée, copie le contenu vers Mailchimp/Brevo (email) ou Twilio (SMS) pour l&apos;envoi réel.</p>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel={`+ Créer (${dests.length} dest.)`} />
    </Modal>
  )
}

function DestinatairesModal({ campagne, clients, onClose }: { campagne: Campagne; clients: Client[]; onClose: () => void }) {
  const dests = useMemo(() => {
    const base = clients.filter(c => c.opt_in_marketing && (campagne.type === 'email' ? c.email : c.telephone))
    switch (campagne.segment) {
      case 'tous': return base
      case 'vip': return base.filter(c => appartientSegment(c, 'vip'))
      case 'dormants': return base.filter(c => appartientSegment(c, 'dormant'))
      case 'nouveaux': return base.filter(c => appartientSegment(c, 'nouveau'))
      case 'allergiques': return base.filter(c => appartientSegment(c, 'allergique'))
      case 'anniversaires': return base.filter(c => appartientSegment(c, 'anniversaire'))
      default: return base
    }
  }, [clients, campagne])

  function copier() {
    const txt = dests.map(c => campagne.type === 'email' ? c.email : c.telephone).filter(Boolean).join(',')
    navigator.clipboard.writeText(txt).then(() => alert('Liste copiée dans le presse-papier'))
  }

  return (
    <Modal title={`Destinataires — ${campagne.titre}`} onClose={onClose} disabled={false}>
      <div className="flex justify-between items-center">
        <p className="text-sm">{dests.length} destinataires</p>
        <button onClick={copier} className="text-xs h-8 px-3 rounded bg-zinc-900 text-white font-bold">📋 Copier emails</button>
      </div>
      <div className="max-h-96 overflow-y-auto border border-zinc-200 rounded">
        <table className="responsive-table w-full text-xs">
          <tbody className="divide-y divide-zinc-100">
            {dests.map(c => (
              <tr key={c.id}>
                <td className="px-2 py-1">{c.prenom} {c.nom}</td>
                <td className="px-2 py-1 text-zinc-600">{campagne.type === 'email' ? c.email : c.telephone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

// ─── TAB 3 — Réclamations ──────────────────────────────────────────
function ReclamTab({ reclamations, clients, employes, onError, onOk }: {
  reclamations: Reclamation[]; clients: Client[]; employes: { id: string; prenom: string; nom: string }[];
  onError: (e: unknown) => void; onOk: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [resoudre, setResoudre] = useState<Reclamation | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouvelle réclamation</button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white">
        {reclamations.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucune réclamation.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {reclamations.map(r => {
              const tInfo = TYPE_RECLAM_INFO[r.type]
              const gInfo = GRAVITE_RECLAM_INFO[r.gravite]
              const sInfo = STATUT_RECLAM_INFO[r.statut]
              return (
                <li key={r.id} className={cn('px-4 py-3', r.statut === 'resolue' && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-zinc-500">{tInfo.emoji} {tInfo.label}</span>
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', gInfo.cls)}>{gInfo.label}</span>
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', sInfo.cls)}>{sInfo.label}</span>
                        <span className="text-sm font-bold">{r.client_nom}</span>
                        <span className="text-[11px] text-zinc-500">{fmtDate(r.date_reclamation)}</span>
                      </div>
                      <p className="text-sm mt-1">{r.description}</p>
                      {r.geste_commercial && <p className="text-xs text-emerald-700 mt-1">🎁 Geste : {r.geste_commercial}</p>}
                      {r.action_corrective && <p className="text-xs mt-1"><b>Action :</b> {r.action_corrective}</p>}
                      {r.responsable_nom && <p className="text-[10px] text-zinc-500 mt-1">Résolue par {r.responsable_nom}</p>}
                    </div>
                    {r.statut !== 'resolue' && (
                      <button onClick={() => setResoudre(r)} className="text-xs h-8 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold">✓ Résoudre</button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <ReclamModal clients={clients} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Réclamation créée') }} />
      )}
      {resoudre && (
        <ResoudreReclamModal reclam={resoudre} employes={employes} onClose={() => setResoudre(null)} onError={onError}
          onSuccess={() => { setResoudre(null); onOk('Résolue') }} />
      )}
    </div>
  )
}

function ReclamModal({ clients, onClose, onError, onSuccess }: { clients: Client[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [clientId, setClientId] = useState('')
  const [nomLibre, setNomLibre] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<TypeReclamation>('service')
  const [gravite, setGravite] = useState<GraviteReclam>('mineure')
  const [description, setDescription] = useState('')
  const [geste, setGeste] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!description.trim()) { onError(new Error('Description obligatoire')); return }
    startTransition(async () => {
      try {
        await creerReclamation({
          client_id: clientId || null, client_nom_libre: clientId ? null : (nomLibre.trim() || null),
          date_reclamation: date, type, gravite, description: description.trim(),
          geste_commercial: geste.trim() || null,
        })
        onSuccess(); router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouvelle réclamation" onClose={onClose} disabled={isPending}>
      <Field label="Client (fiché)">
        <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Anonyme / nom libre ci-dessous —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
        </select>
      </Field>
      {!clientId && (
        <Field label="OU nom libre"><input value={nomLibre} onChange={e => setNomLibre(e.target.value)} placeholder="M. Dupont" className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value as TypeReclamation)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(TYPE_RECLAM_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Gravité">
          <select value={gravite} onChange={e => setGravite(e.target.value as GraviteReclam)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(GRAVITE_RECLAM_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="Geste commercial immédiat (optionnel)"><input value={geste} onChange={e => setGeste(e.target.value)} placeholder="Plat offert, remise 20%..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Enregistrer" />
    </Modal>
  )
}

function ResoudreReclamModal({ reclam, employes, onClose, onError, onSuccess }: { reclam: Reclamation; employes: { id: string; prenom: string; nom: string }[]; onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void }) {
  const [action, setAction] = useState(reclam.action_corrective ?? '')
  const [respId, setRespId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!action.trim()) { onError(new Error('Action corrective obligatoire')); return }
    startTransition(async () => {
      try { await resoudreReclamation({ id: reclam.id, action_corrective: action.trim(), responsable_id: respId || null }); onSuccess(); router.refresh() }
      catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Résoudre la réclamation" onClose={onClose} disabled={isPending}>
      <p className="text-sm bg-zinc-50 border border-zinc-200 rounded p-2"><b>{reclam.client_nom}</b> · {reclam.description}</p>
      <Field label="Action corrective"><textarea value={action} onChange={e => setAction(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="Résolue par">
        <select value={respId} onChange={e => setRespId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Aucun —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="✓ Marquer résolue" />
    </Modal>
  )
}

// ─── TAB 4 — Retours plats ─────────────────────────────────────────
function RetoursTab({ retours, clients, recettes, employes, onError, onOk }: {
  retours: RetourPlat[]; clients: Client[];
  recettes: { id: string; nom: string }[];
  employes: { id: string; prenom: string; nom: string }[];
  onError: (e: unknown) => void; onOk: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  // Top 5 plats les plus retournés
  const topRetours = useMemo(() => {
    const m = new Map<string, { recette_nom: string; nb: number; cout: number }>()
    for (const r of retours) {
      const key = r.recette_id ?? r.recette_nom
      const cur = m.get(key) ?? { recette_nom: r.recette_nom, nb: 0, cout: 0 }
      cur.nb += 1
      cur.cout += r.cout_food_cost
      m.set(key, cur)
    }
    return Array.from(m.values()).sort((a, b) => b.nb - a.nb).slice(0, 5)
  }, [retours])

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="min-h-[40px] px-3 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm">+ Nouveau retour</button>
      </div>

      {topRetours.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">⚠ Top 5 plats retournés</h3>
          <ul className="text-sm space-y-0.5">
            {topRetours.map((t, i) => (
              <li key={i} className="flex justify-between">
                <span><b>{t.nb}×</b> {t.recette_nom}</span>
                <span className="tabular-nums text-red-700">{fmtPrix(t.cout)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white">
        {retours.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun retour de plat. ✓</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {retours.map(r => {
              const mInfo = MOTIF_RETOUR_LABEL[r.motif]
              return (
                <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{r.recette_nom}</span>
                      <span className="text-[10px] text-zinc-500">{mInfo.emoji} {mInfo.label}</span>
                      <span className="text-[11px] text-zinc-500">{fmtDate(r.date_retour)}</span>
                      {r.refait && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">Refait</span>}
                    </div>
                    {r.description && <p className="text-xs text-zinc-700 mt-1 italic">« {r.description} »</p>}
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {r.client_nom && <>👤 {r.client_nom} · </>}
                      💸 Coût matière perdu : <b className="text-red-700">{fmtPrix(r.cout_food_cost)}</b>
                      {r.geste_commercial && ` · 🎁 ${r.geste_commercial}`}
                    </p>
                  </div>
                  <button onClick={async () => {
                    if (!confirm('Supprimer ce retour ?')) return
                    try { await supprimerRetour(r.id); onOk('Supprimé'); router.refresh() } catch (e) { onError(e) }
                  }} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showForm && (
        <RetourModal clients={clients} recettes={recettes} employes={employes} onClose={() => setShowForm(false)} onError={onError}
          onSuccess={() => { setShowForm(false); onOk('Retour enregistré') }} />
      )}
    </div>
  )
}

function RetourModal({ clients, recettes, employes, onClose, onError, onSuccess }: {
  clients: Client[]; recettes: { id: string; nom: string }[]; employes: { id: string; prenom: string; nom: string }[];
  onClose: () => void; onError: (e: unknown) => void; onSuccess: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [recetteId, setRecetteId] = useState('')
  const [nomLibre, setNomLibre] = useState('')
  const [motif, setMotif] = useState<MotifRetour>('cuisson')
  const [description, setDescription] = useState('')
  const [cout, setCout] = useState(0)
  const [geste, setGeste] = useState('')
  const [refait, setRefait] = useState(false)
  const [respId, setRespId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function valider() {
    if (!recetteId && !nomLibre.trim()) { onError(new Error('Recette ou nom libre obligatoire')); return }
    startTransition(async () => {
      try {
        await creerRetour({
          client_id: clientId || null, date_retour: date,
          recette_id: recetteId || null,
          recette_nom_libre: recetteId ? null : (nomLibre.trim() || null),
          motif, description: description.trim() || null,
          cout_food_cost: cout, geste_commercial: geste.trim() || null,
          refait, responsable_id: respId || null,
        })
        onSuccess(); router.refresh()
      } catch (e) { onError(e) }
    })
  }

  return (
    <Modal title="Nouveau retour de plat" onClose={onClose} disabled={isPending}>
      <Field label="Client (fiché)">
        <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Anonyme —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Recette de la carte">
          <select value={recetteId} onChange={e => setRecetteId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            <option value="">— Choisir / nom libre —</option>
            {recettes.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      </div>
      {!recetteId && (
        <Field label="OU nom libre"><input value={nomLibre} onChange={e => setNomLibre(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Motif">
          <select value={motif} onChange={e => setMotif(e.target.value as MotifRetour)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
            {Object.entries(MOTIF_RETOUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </Field>
        <Field label="Coût food cost (€)"><input type="number" step="0.01" value={cout} onChange={e => setCout(parseFloat(e.target.value) || 0)} className="w-full h-12 px-3 rounded-md border border-zinc-300 text-right tabular-nums" /></Field>
      </div>
      <Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-zinc-300 resize-none text-sm" /></Field>
      <Field label="Geste commercial"><input value={geste} onChange={e => setGeste(e.target.value)} placeholder="Plat refait, remise..." className="w-full h-12 px-3 rounded-md border border-zinc-300" /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={refait} onChange={e => setRefait(e.target.checked)} />
        Plat refait au client
      </label>
      <Field label="Responsable">
        <select value={respId} onChange={e => setRespId(e.target.value)} className="w-full h-12 px-3 rounded-md border border-zinc-300">
          <option value="">— Aucun —</option>
          {employes.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
        </select>
      </Field>
      <ModalActions onClose={onClose} onValider={valider} pending={isPending} validLabel="+ Enregistrer" />
    </Modal>
  )
}

// ─── TAB 5 — Parrainage ────────────────────────────────────────────
function ParrainageTab({ clients }: { clients: Client[] }) {
  const parrains = useMemo(() => {
    const m = new Map<string, { client: Client; filleuls: Client[] }>()
    for (const c of clients) {
      if (c.parraine_par_id) {
        const parrain = clients.find(x => x.id === c.parraine_par_id)
        if (parrain) {
          const cur = m.get(parrain.id) ?? { client: parrain, filleuls: [] }
          cur.filleuls.push(c)
          m.set(parrain.id, cur)
        }
      }
    }
    return Array.from(m.values()).sort((a, b) => b.filleuls.length - a.filleuls.length)
  }, [clients])

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        Chaque client a un code de parrainage unique. À transmettre au moment de l&apos;inscription pour lier filleul ↔ parrain.
      </p>
      <section className="rounded-lg border border-zinc-200 bg-white">
        {parrains.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">Aucun parrainage actif.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {parrains.map(p => (
              <li key={p.client.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-bold text-sm">{p.client.prenom} {p.client.nom}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">Code : {p.client.code_parrainage}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{p.filleuls.length} filleul{p.filleuls.length > 1 ? 's' : ''}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.filleuls.map(f => (
                    <span key={f.id} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200">{f.prenom} {f.nom}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
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
