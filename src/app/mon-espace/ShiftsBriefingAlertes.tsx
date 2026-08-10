// 3 cards complémentaires sur /mon-espace : prochains shifts + briefing + alertes.
// Server Component (fetch direct).

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  CalendarClock, Megaphone, Bell, ArrowRight, AlertTriangle,
  GraduationCap, ListChecks, Users,
} from 'lucide-react'
import { TACHES, type Moment, type PosteWidget } from '@/lib/taches-du-jour'

type Props = {
  employeId: string
  poste: string                       // poste raw de l'employé
  posteWidget: PosteWidget | null
}

const POSTE_TO_CANAUX: Record<string, Array<'cuisine' | 'bar' | 'salle' | 'admin' | 'tous'>> = {
  cuisine:        ['cuisine', 'tous'],
  cuisinier:      ['cuisine', 'tous'],
  pizzaiolo:      ['cuisine', 'tous'],
  second:         ['cuisine', 'admin', 'tous'],
  bar:            ['bar', 'tous'],
  barman:         ['bar', 'tous'],
  serveur:        ['salle', 'tous'],
  salle:          ['salle', 'tous'],
  receptionniste: ['salle', 'tous', 'admin'],
  plonge:         ['cuisine', 'tous'],
  extra:          ['cuisine', 'tous'],
  manager:        ['cuisine', 'bar', 'salle', 'admin', 'tous'],
  gerant:         ['cuisine', 'bar', 'salle', 'admin', 'tous'],
}

function pad2(n: number) { return n.toString().padStart(2, '0') }
function dateISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

export default async function ShiftsBriefingAlertes({ employeId, poste, posteWidget }: Props) {
  const sb = await createClient()
  const today      = new Date()
  const todayISO   = dateISO(today)
  const inSevenISO = dateISO(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000))
  const inSixtyISO = dateISO(new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000))
  const canaux     = POSTE_TO_CANAUX[poste] ?? ['tous']

  const [
    shiftsRes, msgsRes, infosRes,
    tachesJourRes, certifsRes, ncsRes, resasJourRes,
  ] = await Promise.all([
    // 1. Prochains shifts (planning)
    sb.from('planning')
      .select('id, date_travail, heure_debut, heure_fin, poste_jour, notes')
      .eq('employe_id', employeId)
      .gte('date_travail', todayISO).lte('date_travail', inSevenISO)
      .order('date_travail').order('heure_debut'),
    // 2. Briefing : 5 derniers messages canaux pertinents
    sb.from('messages')
      .select('id, canal, contenu, created_at, expediteur:employes!expediteur_id(prenom, nom)')
      .in('canal', canaux)
      .order('created_at', { ascending: false })
      .limit(5),
    // 2bis. Affichage_infos pinned actifs
    sb.from('affichage_infos')
      .select('id, titre, contenu, priorite, valable_du, valable_jusqu')
      .lte('valable_du', todayISO)
      .or(`valable_jusqu.is.null,valable_jusqu.gte.${todayISO}`)
      .order('priorite').order('ordre').limit(3),
    // 3a. Tâches obligatoires cochées du jour
    sb.from('taches_completees')
      .select('tache_id, moment, obligatoire')
      .eq('employe_id', employeId).eq('date', todayISO).eq('obligatoire', true),
    // 3b. Certifications expirant
    sb.from('formations_employes')
      .select('id, formation, titre, date_expiration')
      .eq('employe_id', employeId)
      .not('date_expiration', 'is', null)
      .lte('date_expiration', inSixtyISO)
      .order('date_expiration'),
    // 3c. NCs ouvertes où je suis responsable
    sb.from('non_conformites')
      .select('id, type, gravite, description, statut, date_constat')
      .eq('responsable_id', employeId)
      .neq('statut', 'resolue')
      .order('date_constat', { ascending: false })
      .limit(5),
    // 3d. Réservations VIP/allergies du jour (pour serveur/réception)
    (poste === 'serveur' || poste === 'salle' || poste === 'receptionniste')
      ? sb.from('reservations_tables')
          .select('id, client_nom, heure_arrivee, nb_personnes, notes, statut')
          .eq('date_resa', todayISO)
          .in('statut', ['confirmee', 'arrivee'])
          .order('heure_arrivee')
      : Promise.resolve({ data: [] }),
  ])

  // ─── 3. Calculs alertes ────────────────────────────────────
  // Tâches obligatoires non cochées (matrice - cochées du jour)
  let totalOblig = 0
  if (posteWidget) {
    const m = TACHES[posteWidget]
    if (m) {
      for (const moment of ['matin', 'service', 'fin'] as Moment[]) {
        totalOblig += m[moment].filter(t => t.obligatoire).length
      }
    }
  }
  const obligFaites = (tachesJourRes.data ?? []).length
  const tachesAFaire = Math.max(0, totalOblig - obligFaites)

  // Certifications expirant
  type CertifRow = { id: string; formation: string; titre: string; date_expiration: string | null }
  const certifsExp = (certifsRes.data ?? []) as CertifRow[]

  // NCs où je suis responsable
  type NcRow = { id: string; type: string; gravite: string; description: string; statut: string; date_constat: string }
  const ncs = (ncsRes.data ?? []) as NcRow[]

  // Réservations VIP/allergies
  type ResaRow = { id: string; client_nom: string; heure_arrivee: string; nb_personnes: number; notes: string | null; statut: string }
  const resasJour = (resasJourRes.data ?? []) as ResaRow[]
  const resasVip = resasJour.filter(r => {
    const n = (r.notes ?? '').toLowerCase()
    return n.includes('vip') || n.includes('allergi') || n.includes('cachère') || n.includes('intolérance')
  })

  // Compteur total alertes (pour affichage badge)
  // tachesAFaire retiré du total d'alertes (suivi déplacé sur les écrans ops)
  const totalAlertes = certifsExp.length + ncs.length + resasVip.length

  // Données pour rendering
  type ShiftRow = { id: string; date_travail: string; heure_debut: string; heure_fin: string; poste_jour: string | null; notes: string | null }
  const shifts = (shiftsRes.data ?? []) as ShiftRow[]
  type MsgRow = { id: string; canal: string; contenu: string; created_at: string; expediteur?: { prenom?: string; nom?: string } | null }
  const msgs = (msgsRes.data ?? []) as MsgRow[]
  type InfoRow = { id: string; titre: string; contenu: string; priorite: string; valable_du: string; valable_jusqu: string | null }
  const infos = (infosRes.data ?? []) as InfoRow[]

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {/* ─── 1. Prochains shifts ─────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5 text-sm">
            <CalendarClock className="h-4 w-4 text-emerald-600" /> Prochains shifts
          </h3>
          <Link href="/equipes" className="text-[11px] text-emerald-700 hover:text-emerald-900">Voir tout →</Link>
        </div>
        {shifts.length === 0 ? (
          <p className="text-xs text-zinc-500 italic text-center py-4">Aucun shift planifié sur 7 jours.</p>
        ) : (
          <ul className="space-y-1.5">
            {shifts.slice(0, 5).map(s => {
              const date = new Date(s.date_travail)
              const isToday = s.date_travail === todayISO
              const jourLabel = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
              return (
                <li key={s.id} className={cn(
                  'rounded-md border p-2 text-xs',
                  isToday ? 'border-emerald-300 bg-emerald-50' : 'border-zinc-200',
                )}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('font-bold', isToday && 'text-emerald-700')}>
                      {isToday ? 'Aujourd\'hui' : jourLabel}
                    </span>
                    <span className="tabular-nums">
                      {String(s.heure_debut).slice(0, 5)} → {String(s.heure_fin).slice(0, 5)}
                    </span>
                  </div>
                  {s.poste_jour && <p className="text-[11px] text-zinc-500 mt-0.5">{s.poste_jour}</p>}
                  {s.notes && <p className="text-[11px] text-zinc-600 italic mt-0.5">{s.notes}</p>}
                </li>
              )
            })}
            {shifts.length > 5 && (
              <li className="text-[11px] text-zinc-500 text-center pt-1">+ {shifts.length - 5} autres</li>
            )}
          </ul>
        )}
      </Card>

      {/* ─── 2. Briefing du jour ─────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5 text-sm">
            <Megaphone className="h-4 w-4 text-amber-600" /> Briefing du jour
          </h3>
          <Link href="/equipes" className="text-[11px] text-emerald-700 hover:text-emerald-900">Chat →</Link>
        </div>
        {/* Infos pinned d'abord */}
        {infos.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {infos.map(i => (
              <div key={i.id} className={cn(
                'rounded-md border-l-4 px-2 py-1.5 text-xs',
                i.priorite === 'urgent' ? 'border-red-500 bg-red-50' :
                i.priorite === 'warn'   ? 'border-amber-500 bg-amber-50' :
                                          'border-blue-500 bg-blue-50',
              )}>
                <p className="font-bold">{i.priorite === 'urgent' ? '🚨 ' : i.priorite === 'warn' ? '⚠️ ' : '📌 '}{i.titre}</p>
                <p className="text-[11px] text-zinc-700 mt-0.5">{i.contenu}</p>
              </div>
            ))}
          </div>
        )}
        {/* Messages récents */}
        {msgs.length === 0 && infos.length === 0 ? (
          <p className="text-xs text-zinc-500 italic text-center py-4">Aucun message récent.</p>
        ) : msgs.length > 0 ? (
          <ul className="space-y-1.5">
            {msgs.slice(0, 3).map(m => {
              const exp = m.expediteur ? `${m.expediteur.prenom ?? ''} ${m.expediteur.nom?.[0] ?? ''}.`.trim() : 'Anonyme'
              const ago = relativeTime(m.created_at)
              return (
                <li key={m.id} className="rounded-md bg-zinc-50 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-medium">{exp}</span>
                    <span className="text-[11px] text-zinc-400">#{m.canal} · {ago}</span>
                  </div>
                  <p className="text-zinc-700 line-clamp-2">{m.contenu}</p>
                </li>
              )
            })}
          </ul>
        ) : null}
      </Card>

      {/* ─── 3. Centre alertes personnelles — masqué si rien à afficher ───── */}
      {totalAlertes > 0 && (
      <Card className={cn(
        'p-4',
        totalAlertes >= 3 ? 'border-red-300 bg-red-50/50' :
                            'border-amber-300 bg-amber-50/50',
      )}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold flex items-center gap-1.5 text-sm">
            <Bell className="h-4 w-4 text-amber-600" /> À faire pour toi
            <Badge variant="outline" className={cn(
              'ml-1 text-[11px]',
              totalAlertes >= 3 ? 'bg-red-200 text-red-900 border-red-400' :
                                  'bg-amber-200 text-amber-900 border-amber-400',
            )}>{totalAlertes}</Badge>
          </h3>
        </div>
        <ul className="space-y-1.5">
            {/* Alerte tâches retirée : suivi des tâches désormais uniquement dans les écrans ops */}
            {ncs.map(nc => (
              <li key={nc.id} className="rounded-md bg-white border border-red-200 p-2 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">NC {nc.gravite} · {nc.type}</p>
                  <p className="text-[11px] text-zinc-700 line-clamp-2">{nc.description}</p>
                </div>
              </li>
            ))}
            {certifsExp.map(c => {
              const days = Math.ceil((new Date(c.date_expiration!).getTime() - today.getTime()) / 86400000)
              return (
                <li key={c.id} className="rounded-md bg-white border p-2 text-xs flex items-start gap-2">
                  <GraduationCap className={cn('h-4 w-4 shrink-0 mt-0.5', days < 0 ? 'text-red-600' : days < 30 ? 'text-amber-600' : 'text-zinc-500')} />
                  <div className="flex-1">
                    <p className="font-bold">{c.titre}</p>
                    <p className="text-[11px] text-zinc-600">
                      {days < 0   ? `Expirée depuis ${-days} j` :
                       days === 0 ? 'Expire aujourd\'hui' :
                                    `Expire dans ${days} j (${c.date_expiration})`}
                    </p>
                  </div>
                </li>
              )
            })}
            {resasVip.map(r => (
              <li key={r.id} className="rounded-md bg-white border border-amber-200 p-2 text-xs flex items-start gap-2">
                <Users className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">{r.client_nom} · {r.nb_personnes} pers · {String(r.heure_arrivee).slice(0, 5)}</p>
                  <p className="text-[11px] text-zinc-700 line-clamp-2">{r.notes}</p>
                </div>
              </li>
            ))}
            <li>
              <Link href="/admin/hygiene" className="block text-[11px] text-emerald-700 hover:text-emerald-900 text-center pt-1">
                Voir tout →
              </Link>
            </li>
          </ul>
      </Card>
      )}
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1)    return 'à l\'instant'
  if (min < 60)   return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)     return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7)      return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}
