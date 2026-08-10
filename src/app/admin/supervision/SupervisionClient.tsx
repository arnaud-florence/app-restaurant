'use client'

import { useEffect, useState, useId, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { PillTab } from '@/components/ui/PillTab'
import { Card, CardContent } from '@/components/ui/card'
import {
  STATUT_COMMANDE_LABEL, SOURCE_LABEL, fmtPrix,
  type StatutCommande, type SourceCommande,
} from '@/lib/service'

export type RecapEmploye = {
  id: string
  prenom: string
  nom: string
  poste: string
  present: boolean
  arrivee: string | null
  heuresJour: number
  aCompte: boolean
  derniereConnexion: string | null
  derniereActivite: string | null
  derniereZone: string | null
  caGenere: number
  nbCmd: number
  formValidees: number
}

export type FeedCommande = {
  id: string
  numero: number | null
  numero_table: string | null
  serveur_id: string | null
  statut: StatutCommande
  source: SourceCommande
  montant_total_ttc: number | null
  created_at: string
}

export type JournalEntry = {
  id: string
  employe_nom: string | null
  action: string
  zone: string | null
  cible: string | null
  created_at: string
}

const ACTION_LABEL: Record<string, { emoji: string; label: string }> = {
  commande_creee:  { emoji: '🧾', label: 'a pris une commande' },
  encaissement:    { emoji: '💶', label: 'a encaissé' },
  annulation:      { emoji: '✖', label: 'a annulé' },
  ouverture_caisse:{ emoji: '🔓', label: 'a ouvert la caisse' },
  cloture_caisse:  { emoji: '🔒', label: 'a clôturé la caisse' },
  prise_poste:     { emoji: '👤', label: 'a pris le poste' },
  fin_poste:       { emoji: '🔚', label: 'a quitté le poste' },
  stock_entree:    { emoji: '📦', label: 'a entré du stock' },
  stock_perte:     { emoji: '🗑️', label: 'a déclaré une perte' },
  stock_sortie:    { emoji: '📤', label: 'a sorti du stock' },
  inventaire:      { emoji: '📋', label: 'a fait un inventaire' },
  recette_creee:   { emoji: '📖', label: 'a créé une recette' },
  recette_modifiee:{ emoji: '📖', label: 'a modifié une recette' },
  reception:       { emoji: '🚚', label: 'a réceptionné' },
  hygiene:         { emoji: '🌡️', label: 'a relevé (hygiène)' },
}

const RECENT_MIN = 15 // minutes pour considérer un compte « en ligne »

export default function SupervisionClient({
  recap, feedInitial, empMap, journalInitial,
}: {
  recap: RecapEmploye[]
  feedInitial: FeedCommande[]
  empMap: Record<string, string>
  journalInitial: JournalEntry[]
}) {
  const [tab, setTab] = useState<'present' | 'live' | '7jours'>('present')
  const [feed, setFeed] = useState<FeedCommande[]>(feedInitial)
  const [journal, setJournal] = useState<JournalEntry[]>(journalInitial)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(() => Date.now())
  const instanceId = useId()

  // Horloge légère pour rafraîchir « depuis X min » / « en ligne »
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Temps réel : commandes (INSERT = nouvelle, UPDATE = changement de statut)
  useEffect(() => {
    const sb = createClient()
    const flash = (id: string) => {
      setNewIds(prev => new Set(prev).add(id))
      setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(id); return n }), 5000)
    }
    const upsert = (row: FeedCommande) => {
      setFeed(prev => [row, ...prev.filter(c => c.id !== row.id)].slice(0, 40))
      flash(row.id)
    }
    const channel = sb
      .channel(`supervision_live_${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commandes' },
        (p) => upsert(p.new as FeedCommande))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commandes' },
        (p) => upsert(p.new as FeedCommande))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journal_activite' },
        (p) => {
          const j = p.new as JournalEntry
          setJournal(prev => [j, ...prev.filter(x => x.id !== j.id)].slice(0, 60))
          flash(j.id)
        })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [instanceId])

  const presents = useMemo(() => recap.filter(r => r.present), [recap])
  const comptes = useMemo(
    () => recap.filter(r => r.aCompte).sort((a, b) =>
      ((b.derniereActivite ?? b.derniereConnexion) ?? '').localeCompare((a.derniereActivite ?? a.derniereConnexion) ?? '')),
    [recap],
  )

  function isEnLigne(iso: string | null) {
    if (!iso) return false
    return now - new Date(iso).getTime() < RECENT_MIN * 60000
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 pb-mobile-nav">
        <AdminPageHeader
          accent="emerald"
          subtitle="Pilotage"
          title="Équipe en direct"
          description="Qui travaille, qui est connecté, activité du service en temps réel et récap par employé."
          actions={
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              Temps réel
            </span>
          }
        />

        {/* KPIs flash */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <KPI label="Présents maintenant" value={String(presents.length)} icon="🟢" tone={presents.length > 0 ? 'emerald' : 'zinc'} />
          <KPI label="Comptes en ligne" value={String(comptes.filter(c => isEnLigne(c.derniereActivite)).length)} icon="🔌" />
          <KPI label="Équipe active" value={String(recap.length)} icon="👥" />
          <KPI label="Commandes (live)" value={String(feed.length)} icon="🧾" />
        </div>

        {/* Sélecteur d'onglets sticky */}
        <div className="sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 bg-zinc-50/90 backdrop-blur flex gap-1.5 overflow-x-auto">
          <PillTab active={tab === 'present'} onClick={() => setTab('present')}>👥 Présent</PillTab>
          <PillTab active={tab === 'live'} onClick={() => setTab('live')}>🎬 Live</PillTab>
          <PillTab active={tab === '7jours'} onClick={() => setTab('7jours')}>📊 7 jours</PillTab>
        </div>

        {tab === 'present' && (<>
        {/* Qui travaille maintenant */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🟢 Qui travaille maintenant</h2>
          {presents.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-zinc-400 italic">Personne n&apos;a badgé son arrivée aujourd&apos;hui. (Le pointage se fait dans /admin/rh ou /mon-espace.)</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {presents.map(r => (
                <Card key={r.id} className="border-emerald-300 bg-emerald-50">
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{r.prenom} {r.nom}</p>
                      <p className="text-[11px] text-zinc-600 capitalize">{r.poste}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-emerald-800 font-bold">depuis {r.arrivee?.slice(0, 5) ?? '—'}</p>
                      {r.heuresJour > 0 && <p className="text-[11px] text-zinc-500 tabular-nums">{r.heuresJour.toFixed(1)} h</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Connectés à l'app (comptes) */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🔌 Comptes connectés</h2>
          {comptes.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-zinc-400 italic">Aucun employé n&apos;a encore de compte connecté. (Les écrans de service s&apos;utilisent sans compte.)</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {comptes.map(r => {
                const online = isEnLigne(r.derniereActivite)
                const vu = r.derniereActivite ?? r.derniereConnexion
                return (
                  <Card key={r.id} className={cn(online && 'border-emerald-300 bg-emerald-50')}>
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{r.prenom} {r.nom}</p>
                        <p className="text-[11px] text-zinc-600 capitalize">{r.poste}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {online
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">● en ligne{r.derniereZone ? ` · ${r.derniereZone}` : ''}</span>
                          : <span className="text-[11px] text-zinc-400">hors ligne</span>}
                        <p className="text-[11px] text-zinc-500">
                          {vu ? `vu ${format(parseISO(vu), 'd MMM HH:mm', { locale: fr })}` : 'jamais connecté'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
        </>)}

        {tab === 'live' && (<>
        {/* Activité service en temps réel */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🧾 Activité du service — en direct</h2>
          {feed.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-zinc-400 italic">Aucune commande récente. Le flux se remplit dès qu&apos;une commande est créée ou change de statut.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-zinc-100">
                {feed.map(c => {
                  const st = STATUT_COMMANDE_LABEL[c.statut] ?? { label: c.statut, emoji: '•', cls: '' }
                  const src = SOURCE_LABEL[c.source] ?? null
                  const serveur = c.serveur_id ? empMap[c.serveur_id] : null
                  return (
                    <div key={c.id} className={cn('flex items-center justify-between gap-2 px-3 py-2 transition-colors', newIds.has(c.id) && 'bg-emerald-50')}>
                      <div className="min-w-0 flex items-center gap-2">
                        {src && <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0', src.bg, src.text)}>{src.emoji}</span>}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {c.numero_table ? `Table ${c.numero_table}` : c.numero ? `Cmd #${c.numero}` : 'Commande'}
                            {serveur && <span className="text-zinc-500 font-normal"> · {serveur}</span>}
                          </p>
                          <p className="text-[11px] text-zinc-500">{format(parseISO(c.created_at), 'HH:mm', { locale: fr })}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn('inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border', st.cls)}>{st.emoji} {st.label}</span>
                        {c.montant_total_ttc != null && <p className="text-[11px] text-zinc-600 tabular-nums mt-0.5">{fmtPrix(Number(c.montant_total_ttc))}</p>}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Journal — qui a fait quoi */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">🕵️ Journal — qui a fait quoi</h2>
          {journal.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-zinc-400 italic">Aucune action enregistrée pour l&apos;instant. Le journal se remplit dès qu&apos;un opérateur (identifié par PIN) agit sur un écran de service.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y divide-zinc-100">
                {journal.map(j => {
                  const a = ACTION_LABEL[j.action] ?? { emoji: '•', label: j.action }
                  return (
                    <div key={j.id} className={cn('flex items-center justify-between gap-2 px-3 py-2 transition-colors', newIds.has(j.id) && 'bg-emerald-50')}>
                      <div className="min-w-0">
                        <p className="text-sm truncate">
                          <span className="mr-1">{a.emoji}</span>
                          <b>{j.employe_nom ?? 'Inconnu'}</b> {a.label}
                          {j.cible && <span className="text-zinc-600"> · {j.cible}</span>}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {j.zone ? `${j.zone} · ` : ''}{format(parseISO(j.created_at), 'HH:mm', { locale: fr })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
          <p className="text-[11px] text-zinc-400 italic px-1">
            Chaque action est attribuée à l&apos;opérateur qui a « pris le poste » via son code PIN. Si personne n&apos;a pris le poste, l&apos;action est notée « Inconnu ».
          </p>
        </section>
        </>)}

        {tab === '7jours' && (<>
        {/* Récap par employé (7 jours) */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">📊 Récap par employé — 7 derniers jours</h2>
          <Card>
            <CardContent className="p-0">
              {/* Mobile : une card par employé */}
              <ul className="md:hidden divide-y divide-zinc-100">
                {recap.map(r => (
                  <li key={r.id} className="px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{r.prenom} {r.nom}</p>
                        <p className="text-[11px] text-zinc-600 capitalize">{r.poste}</p>
                      </div>
                      {r.present
                        ? <span className="text-[11px] font-bold text-emerald-700 shrink-0">🟢 présent</span>
                        : <span className="text-[11px] text-zinc-400 shrink-0">—</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Heures (jour)</span>
                        <span className="tabular-nums">{r.heuresJour > 0 ? `${r.heuresJour.toFixed(1)} h` : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">CA généré</span>
                        <span className="tabular-nums font-semibold">{r.caGenere > 0 ? fmtPrix(r.caGenere) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Commandes</span>
                        <span className="tabular-nums">{r.nbCmd || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Formations ✓</span>
                        <span className="tabular-nums">{r.formValidees || '—'}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500">
                      Dern. connexion : {r.derniereConnexion ? format(parseISO(r.derniereConnexion), 'd MMM HH:mm', { locale: fr }) : '—'}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="text-left px-3 py-2">Employé</th>
                      <th className="text-left px-3 py-2">Poste</th>
                      <th className="text-center px-3 py-2">Statut</th>
                      <th className="text-right px-3 py-2">Heures (jour)</th>
                      <th className="text-right px-3 py-2">CA généré</th>
                      <th className="text-right px-3 py-2">Commandes</th>
                      <th className="text-right px-3 py-2">Formations ✓</th>
                      <th className="text-left px-3 py-2">Dern. connexion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {recap.map(r => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-semibold">{r.prenom} {r.nom}</td>
                        <td className="px-3 py-2 text-zinc-600 capitalize">{r.poste}</td>
                        <td className="px-3 py-2 text-center">
                          {r.present
                            ? <span className="text-[11px] font-bold text-emerald-700">🟢 présent</span>
                            : <span className="text-[11px] text-zinc-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.heuresJour > 0 ? `${r.heuresJour.toFixed(1)} h` : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.caGenere > 0 ? fmtPrix(r.caGenere) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.nbCmd || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.formValidees || '—'}</td>
                        <td className="px-3 py-2 text-[11px] text-zinc-500">
                          {r.derniereConnexion ? format(parseISO(r.derniereConnexion), 'd MMM HH:mm', { locale: fr }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-[11px] text-zinc-400 italic px-1">
            CA généré et commandes attribués au serveur qui prend la commande. Les écrans cuisine/bar en mode tablette partagée ne sont pas nominatifs.
          </p>
        </section>
        </>)}
      </main>
    </div>
  )
}

function KPI({ label, value, icon, tone = 'zinc' }: { label: string; value: string; icon: string; tone?: 'zinc' | 'emerald' }) {
  return (
    <Card className={cn(tone === 'emerald' && 'border-emerald-300 bg-emerald-50')}>
      <CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">{icon} {label}</p>
        <p className="text-2xl font-black tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}
