// /mon-espace — Tableau de bord personnel de l'employé connecté.
//
// Sections :
//  1. Identité (avatar, nom, poste, ancienneté, statut formation)
//  2. KPIs principaux : heures semaine, tâches du jour, score quiz, onboarding
//  3. Stats spécifiques au poste (varie selon : serveur / cuisinier / barman / etc.)
//  4. Historique 7 jours (heures + % checklist)
//  5. Mes manuels (progression formations internes)
//  6. Section challenges (placeholder pour gamification future)
//
// Server Component. Pas d'interactivité côté client (display only).

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { getMainRoute } from '@/lib/permissions'
import { TACHES, MOMENT_INFO, POSTE_INFO as POSTE_INFO_WIDGET, type PosteWidget, type Moment } from '@/lib/taches-du-jour'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CalendarDays, ListTodo, GraduationCap, ShieldCheck,
  ChefHat, Wine, Utensils, Trophy, Sparkles,
  Rocket, Wallet, Target, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import PointageCard, { type Pointage as PointageRow } from './PointageCard'
import ShiftsBriefingAlertes from './ShiftsBriefingAlertes'
import PerformanceCongesMeteo from './PerformanceCongesMeteo'
import MonEspaceTabs from './MonEspaceTabs'
import VoirEnTantQue from './VoirEnTantQue'
import PullToRefresh from '@/components/PullToRefresh'
import NotificationsBell from '@/components/NotificationsBell'
import TopActionBar from '@/components/TopActionBar'
import BackToCategoryButton from '@/components/BackToCategoryButton'
import StoriesNavServer from '@/components/StoriesNavServer'
import RappelsSalarieCard from '@/components/RappelsSalarie'
import { getRappelsPourEmploye } from '@/lib/co-gerant/rappels-salarie'
import AssistantSalarieChat from './AssistantSalarieChat'
import { evaluerChallengesEmploye, partSurplusPondereeHeures } from '@/lib/challenges-evaluation'
import { calculerMetrique, METRIQUE_LABEL, periodeMoisCourant } from '@/lib/challenges-metrics'
import { leaderboardsPourEmploye, type ChallengeLeaderboard } from '@/lib/challenges-leaderboards'
import ChallengeSurplusViz from '@/components/ChallengeSurplusViz'
import RelancerVisite from '@/components/RelancerVisite'

export const metadata = { title: 'Mon espace — Tableau de bord' }
export const dynamic = 'force-dynamic'

const POSTE_TO_WIDGET: Record<string, PosteWidget> = {
  manager: 'gerant', gerant: 'gerant',
  cuisine: 'cuisinier', cuisinier: 'cuisinier',
  cuisinier_snacking: 'snacking',   // production snacking (burgers/tacos/paninis)
  pizzaiolo: 'pizzaiolo',
  bar: 'barman', barman: 'barman',
  serveur: 'serveur', salle: 'serveur',
  snack: 'caisse_snacking',         // encaissement comptoir/borne
  livreur: 'livreur',               // débloque la checklist livreur (kilométrage, fond rendu)
  receptionniste: 'receptionniste',
  second: 'second',
  plonge: 'plonge', extra: 'plonge',
}

// Page « action » de chaque poste — le bouton CTA central pointe ici.
const POSTE_TO_ACTION: Record<string, { href: string; label: string; emoji: string }> = {
  manager:        { href: '/admin/pilotage',     label: 'Aller au pilotage',  emoji: '📊' },
  gerant:         { href: '/admin/pilotage',     label: 'Aller au pilotage',  emoji: '📊' },
  second:         { href: '/cuisine',            label: 'Service cuisine',    emoji: '🍳' },
  cuisine:        { href: '/cuisine',            label: 'Service cuisine',    emoji: '🍳' },
  cuisinier:      { href: '/cuisine',            label: 'Service cuisine',    emoji: '🍳' },
  cuisinier_snacking: { href: '/cuisine',        label: 'Préparation snack',  emoji: '🍔' },
  pizzaiolo:      { href: '/pizza',               label: 'Service pizza',      emoji: '🍕' },
  serveur:        { href: '/serveur',            label: 'Service salle',      emoji: '🍽️' },
  salle:          { href: '/serveur',            label: 'Service salle',      emoji: '🍽️' },
  bar:            { href: '/bar',                label: 'Service bar',        emoji: '🍷' },
  barman:         { href: '/bar',                label: 'Service bar',        emoji: '🍷' },
  snack:          { href: '/comptoir/fournil/kds', label: 'Préparation',      emoji: '🛒' },
  livreur:        { href: '/livreur',            label: 'Mes livraisons',     emoji: '🛵' },
  receptionniste: { href: '/admin/reservations', label: 'Réservations',       emoji: '📅' },
  plonge:         { href: '/admin/hygiene',      label: 'Hygiène & nettoyage', emoji: '🧴' },
  extra:          { href: '/admin/hygiene',      label: 'Hygiène & nettoyage', emoji: '🧴' },
  autre:          { href: '/equipes',            label: 'Chat équipe',        emoji: '💬' },
}

function pad2(n: number) { return n.toString().padStart(2, '0') }
function dateISO(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function startOfWeek(d: Date) {
  const x = new Date(d); const dow = (x.getDay() + 6) % 7  // Lundi = 0
  x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0)
  return x
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }

export default async function MonEspacePage({ searchParams }: { searchParams: { as?: string } }) {
  const profil = await getProfile()
  if (!profil) redirect('/login?next=/mon-espace')
  const isManager = profil.role === 'manager'
  const asParam = typeof searchParams?.as === 'string' ? searchParams.as : null
  // « Voir en tant que » : RÉSERVÉ au gérant. Affiche le mon-espace d'un autre
  // salarié en lecture seule. Un non-manager ne peut jamais voir un autre.
  // Priorité au mode « aperçu » persistant (cookie, app-wide) ; sinon ?as= ponctuel.
  const viewAsId = profil.apercu?.cibleId ?? (isManager && asParam ? asParam : null)
  const cibleEmployeId = viewAsId ?? profil.employe_id
  if (!cibleEmployeId) {
    return (
      <div className="min-h-screen bg-stone-50 p-6 flex items-center justify-center">
        <Card className="p-6 max-w-md text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <h1 className="text-lg font-bold mb-2">Profil non rattaché</h1>
          <p className="text-sm text-zinc-600">
            Ton compte n'est pas encore lié à une fiche employé. Demande au gérant de t'ajouter dans <code>/admin/rh</code> avec ton email <strong>{profil.email}</strong>.
          </p>
          <Link href={getMainRoute(profil.poste)} className="inline-block mt-4">
            <Button variant="outline">Retour</Button>
          </Link>
        </Card>
      </div>
    )
  }

  const supabase = await createClient()
  const today    = new Date()
  const todayISO = dateISO(today)
  const weekISO  = dateISO(startOfWeek(today))
  const monthISO = dateISO(startOfMonth(today))
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const sevenDaysAgoISO = dateISO(sevenDaysAgo)

  // ─── 1. Identité ──────────────────────────────────────────────
  const { data: emp } = await supabase.from('employes')
    .select('id, prenom, nom, poste, type_contrat, email, telephone, salaire_horaire, heures_contrat, solde_conges_jours, created_at')
    .eq('id', cibleEmployeId).maybeSingle()

  if (!emp) redirect('/login')

  const empId = emp.id as string
  // Liste des salariés pour le sélecteur « Voir en tant que » (gérant seulement)
  const { data: employesListe } = isManager
    ? await supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom')
    : { data: null }
  const posteWidget = POSTE_TO_WIDGET[emp.poste as string] ?? null

  // Arnaud côté salarié : ses rappels du jour (déterministe, lecture seule)
  const rappels = await getRappelsPourEmploye(empId, emp.poste as string)

  // Ancienneté en mois (depuis created_at)
  const created = new Date(emp.created_at as string)
  const ancMois = Math.max(0, Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 30)))

  // ─── 2-3. Queries parallèles ──────────────────────────────────
  type Pointage    = { date_pointage: string; heures_travaillees: number | null }
  type Progression = { guide_id: string; statut: string; etapes_vues_ids: string[]; dernier_score_pct: number | null; derniere_tentative_le: string | null }
  type GuideRow    = { id: string; titre: string; poste: string; seuil_reussite_pct: number; duree_minutes: number | null }
  type TacheRow    = { tache_id: string; moment: Moment; obligatoire: boolean; date: string }

  // ─── Évaluation des challenges + leaderboards + rémunération ─────────
  const periode = periodeMoisCourant()
  const [evaluations, surplusInfo, configEcoRes, leaderboards, caMoisActuel, pmMoisRes] = await Promise.all([
    evaluerChallengesEmploye(cibleEmployeId, emp?.poste as string ?? null),
    partSurplusPondereeHeures(cibleEmployeId),
    supabase.from('config_economique').select('smic_horaire_brut, pct_redistribution_surplus').limit(1).maybeSingle(),
    leaderboardsPourEmploye(cibleEmployeId, emp?.poste as string ?? null),
    calculerMetrique('ca_restaurant', periode),
    supabase.from('point_mort_mensuel')
      .select('ca_seuil_calcule')
      .eq('mois', periode.debut.slice(0, 7) + '-01')
      .maybeSingle(),
  ])
  const smic = Number(configEcoRes.data?.smic_horaire_brut ?? 11.65)
  const caSeuilMois = Number(pmMoisRes.data?.ca_seuil_calcule ?? 0)
  const pctSeuilAtteint = caSeuilMois > 0 ? (caMoisActuel / caSeuilMois) * 100 : 0
  // Index leaderboard par challenge_id pour affichage inline
  const lbByChallenge = new Map<string, ChallengeLeaderboard>()
  for (const lb of leaderboards) lbByChallenge.set(lb.challenge.id, lb)

  const [pointagesRes, pointageJourRes, taches7Res, progressionsRes, guidesRes, etapesCountRes, quizCountRes] = await Promise.all([
    supabase.from('pointage')
      .select('date_pointage, heures_travaillees')
      .eq('employe_id', empId)
      .gte('date_pointage', monthISO),
    supabase.from('pointage')
      .select('id, heure_arrivee, heure_depart, heures_travaillees')
      .eq('employe_id', empId)
      .eq('date_pointage', todayISO)
      .maybeSingle(),
    supabase.from('taches_completees')
      .select('tache_id, moment, obligatoire, date')
      .eq('employe_id', empId)
      .gte('date', sevenDaysAgoISO),
    supabase.from('progressions_formation')
      .select('guide_id, statut, etapes_vues_ids, dernier_score_pct, derniere_tentative_le')
      .eq('employe_id', empId),
    supabase.from('guides_formation')
      .select('id, titre, poste, seuil_reussite_pct, duree_minutes')
      .eq('actif', true)
      .order('ordre'),
    supabase.from('etapes_formation').select('guide_id'),
    supabase.from('quiz_questions').select('guide_id'),
  ])

  const pointages    = (pointagesRes.data    ?? []) as Pointage[]
  const pointageJour = (pointageJourRes.data ?? null) as PointageRow | null
  const taches7      = (taches7Res.data      ?? []) as TacheRow[]
  const progressions = (progressionsRes.data ?? []) as Progression[]
  const guides       = (guidesRes.data       ?? []) as GuideRow[]

  const nbEtapesParGuide = new Map<string, number>()
  for (const e of (etapesCountRes.data ?? []) as Array<{ guide_id: string }>) {
    nbEtapesParGuide.set(e.guide_id, (nbEtapesParGuide.get(e.guide_id) ?? 0) + 1)
  }
  const nbQuestionsParGuide = new Map<string, number>()
  for (const q of (quizCountRes.data ?? []) as Array<{ guide_id: string }>) {
    nbQuestionsParGuide.set(q.guide_id, (nbQuestionsParGuide.get(q.guide_id) ?? 0) + 1)
  }

  // ─── KPI : heures semaine + mois ──────────────────────────────
  const heuresSemaine = pointages
    .filter(p => p.date_pointage >= weekISO)
    .reduce((s, p) => s + Number(p.heures_travaillees ?? 0), 0)
  const heuresMois = pointages
    .reduce((s, p) => s + Number(p.heures_travaillees ?? 0), 0)
  const heuresContrat = Number(emp.heures_contrat ?? 35)

  // ─── KPI : tâches du jour ──────────────────────────────────────
  const tachesAujourd = taches7.filter(t => t.date === todayISO)
  let totalAujourd = 0, obligTotalAujourd = 0
  if (posteWidget) {
    const m = TACHES[posteWidget]
    if (m) {
      for (const moment of ['matin', 'service', 'fin'] as Moment[]) {
        totalAujourd += m[moment].length
        obligTotalAujourd += m[moment].filter(t => t.obligatoire).length
      }
    }
  }
  const obligFaitAujourd = tachesAujourd.filter(t => t.obligatoire).length

  // ─── KPI : score quiz formation (poste matchant) ──────────────
  const monGuide = posteWidget ? guides.find(g => g.poste === emp.poste) ?? guides.find(g => POSTE_TO_WIDGET[g.poste] === posteWidget) ?? null : null
  const maProgression = monGuide ? progressions.find(p => p.guide_id === monGuide.id) ?? null : null

  // ─── KPI : onboarding ─────────────────────────────────────────
  const onboarded = !!profil.onboarding_completed_at
  const onboardingDate = profil.onboarding_completed_at
    ? new Date(profil.onboarding_completed_at).toLocaleDateString('fr-FR')
    : null

  // ─── 3. Stats spécifiques au poste ────────────────────────────
  let statsPoste: { emoji: string; label: string; value: string; sublabel?: string }[] = []

  if (emp.poste === 'serveur' || emp.poste === 'salle') {
    const [cmdRes, payRes] = await Promise.all([
      supabase.from('commandes')
        .select('id, montant_total_ttc, pourboire_total, created_at')
        .eq('serveur_id', empId)
        .gte('created_at', weekISO + 'T00:00:00'),
      supabase.from('paiements_caisse')
        .select('id, montant')
        .eq('serveur_id', empId)
        .gte('encaisse_at', weekISO + 'T00:00:00'),
    ])
    const cmds = (cmdRes.data ?? []) as Array<{ montant_total_ttc?: number; pourboire_total?: number }>
    const pays = (payRes.data ?? []) as Array<{ montant?: number }>
    const ca       = cmds.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
    const tips     = cmds.reduce((s, c) => s + Number(c.pourboire_total ?? 0), 0)
    const encaisse = pays.reduce((s, p) => s + Number(p.montant ?? 0), 0)
    statsPoste = [
      { emoji: '🍽',  label: 'Tables servies', value: String(cmds.length), sublabel: '7 derniers jours' },
      { emoji: '💰', label: 'CA généré',       value: ca.toFixed(2) + ' €', sublabel: '7 derniers jours' },
      { emoji: '💳', label: 'Encaissements',   value: encaisse.toFixed(2) + ' €', sublabel: 'sur tes commandes' },
      { emoji: '💸', label: 'Pourboires',      value: tips.toFixed(2) + ' €', sublabel: 'à répartir' },
    ]
  }
  else if (emp.poste === 'cuisine' || emp.poste === 'cuisinier' || emp.poste === 'pizzaiolo') {
    const tags = emp.poste === 'pizzaiolo' ? ['PIZZA'] : ['CUISINE', 'PIZZA']
    const { data: cmdsIds } = await supabase.from('commandes')
      .select('id').gte('created_at', weekISO + 'T00:00:00')
    const ids = (cmdsIds ?? []).map(c => c.id as string)
    const [cmdArtRes, tempRes, ncRes] = await Promise.all([
      ids.length > 0
        ? supabase.from('commande_articles')
            .select('id', { count: 'exact', head: true })
            .in('commande_id', ids)
            .in('tag_destination', tags)
            .in('statut', ['pret', 'servi'])
        : Promise.resolve({ count: 0 } as { count: number }),
      supabase.from('releves_temperatures')
        .select('id', { count: 'exact', head: true })
        .gte('date_releve', weekISO),
      supabase.from('non_conformites')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekISO + 'T00:00:00')
        .eq('gravite', 'critique')
        .eq('statut', 'ouverte'),
    ])
    statsPoste = [
      { emoji: emp.poste === 'pizzaiolo' ? '🍕' : '🍳', label: 'Plats préparés', value: String(cmdArtRes.count ?? 0), sublabel: 'équipe · 7 derniers jours' },
      { emoji: '🌡',  label: 'Relevés T°',     value: String(tempRes.count ?? 0), sublabel: 'cette semaine' },
      { emoji: '🚨', label: 'NC critiques',   value: String(ncRes.count ?? 0),   sublabel: 'ouvertes' },
    ]
  }
  else if (emp.poste === 'bar' || emp.poste === 'barman') {
    const { data: cmdsIds } = await supabase.from('commandes')
      .select('id').gte('created_at', weekISO + 'T00:00:00')
    const ids = (cmdsIds ?? []).map(c => c.id as string)
    const [boissonsRes, collectRes] = await Promise.all([
      ids.length > 0
        ? supabase.from('commande_articles')
            .select('id', { count: 'exact', head: true })
            .in('commande_id', ids)
            .eq('tag_destination', 'BAR')
            .in('statut', ['pret', 'servi'])
        : Promise.resolve({ count: 0 } as { count: number }),
      supabase.from('collectes_dechets')
        .select('id', { count: 'exact', head: true })
        .gte('date_collecte', weekISO),
    ])
    statsPoste = [
      { emoji: '🍹', label: 'Boissons servies', value: String(boissonsRes.count ?? 0), sublabel: 'équipe · 7 derniers jours' },
      { emoji: '🗑', label: 'Collectes déchets', value: String(collectRes.count ?? 0), sublabel: 'cette semaine' },
    ]
  }
  else if (emp.poste === 'receptionniste') {
    const [resaRes] = await Promise.all([
      supabase.from('reservations_tables')
        .select('id, statut', { count: 'exact', head: false })
        .gte('created_at', weekISO + 'T00:00:00'),
    ])
    const resas = (resaRes.data ?? []) as Array<{ statut: string }>
    const noShow = resas.filter(r => r.statut === 'no_show').length
    statsPoste = [
      { emoji: '📅', label: 'Réservations',  value: String(resas.length), sublabel: 'cette semaine' },
      { emoji: '👻', label: 'No-shows',      value: String(noShow),      sublabel: 'à relancer' },
    ]
  }
  else if (emp.poste === 'plonge' || emp.poste === 'extra') {
    const [collectRes, ncRes] = await Promise.all([
      supabase.from('collectes_dechets')
        .select('id', { count: 'exact', head: true })
        .gte('date_collecte', weekISO),
      supabase.from('non_conformites')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekISO + 'T00:00:00')
        .eq('statut', 'ouverte'),
    ])
    statsPoste = [
      { emoji: '🗑', label: 'Collectes déchets', value: String(collectRes.count ?? 0), sublabel: 'cette semaine' },
      { emoji: '🚨', label: 'NC ouvertes',       value: String(ncRes.count ?? 0),      sublabel: 'à régulariser' },
    ]
  }
  else if (emp.poste === 'second') {
    const { data: cmdsIds } = await supabase.from('commandes')
      .select('id').gte('created_at', weekISO + 'T00:00:00')
    const ids = (cmdsIds ?? []).map(c => c.id as string)
    const [cmdArtRes, tempRes] = await Promise.all([
      ids.length > 0
        ? supabase.from('commande_articles')
            .select('id', { count: 'exact', head: true })
            .in('commande_id', ids)
            .in('tag_destination', ['CUISINE', 'PIZZA'])
            .in('statut', ['pret', 'servi'])
        : Promise.resolve({ count: 0 } as { count: number }),
      supabase.from('releves_temperatures')
        .select('id', { count: 'exact', head: true })
        .gte('date_releve', weekISO),
    ])
    statsPoste = [
      { emoji: '🍳', label: 'Plats équipe',  value: String(cmdArtRes.count ?? 0), sublabel: 'cette semaine' },
      { emoji: '🌡', label: 'Relevés T°',    value: String(tempRes.count ?? 0),   sublabel: 'cette semaine' },
    ]
  }

  // ─── 4. Historique 7 jours (heures + % tâches) ────────────────
  type DayStat = { iso: string; jour: string; heures: number; tachesPct: number; tachesFait: number; tachesTotal: number }
  const days7: DayStat[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
    const iso = dateISO(d)
    const heures = pointages.filter(p => p.date_pointage === iso).reduce((s, p) => s + Number(p.heures_travaillees ?? 0), 0)
    const tachesJ = taches7.filter(t => t.date === iso)
    const tachesPct = totalAujourd > 0 ? Math.round((tachesJ.length / totalAujourd) * 100) : 0
    days7.push({
      iso,
      jour: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
      heures,
      tachesPct,
      tachesFait: tachesJ.length,
      tachesTotal: totalAujourd,
    })
  }

  // ─── Profil pour OpsBottomNav ─────────────────────────────────
  const navProfil: OpsBottomNavProfil = {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
        apercu: profil.apercu,
  }

  // Couleur pastille principale
  const onboardCls = onboarded ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-amber-100 text-amber-900 border-amber-300'
  const quizScore = maProgression?.dernier_score_pct
  const quizCls = quizScore == null ? 'text-zinc-500'
    : quizScore >= (monGuide?.seuil_reussite_pct ?? 80) ? 'text-emerald-600' : 'text-red-600'

  // CTA principal selon poste
  const actionPrincipale = POSTE_TO_ACTION[emp.poste as string] ?? POSTE_TO_ACTION.autre

  // ─── Sections groupées par onglet (façon Facebook/Instagram) ──────
  // 1) Vue d'ensemble = pointage + ma formation + KPIs flash + historique 7j

  const vueSections = (
    <>
      {/* Pointage rapide arrivée/sortie */}
      <div id="pointage">
        <PointageCard pointage={pointageJour} readOnly={!!viewAsId} />
      </div>

      {/* Ma formation en cours — action quotidienne n°2, remontée tout en haut */}
      {monGuide && (() => {
        const prog = progressions.find(p => p.guide_id === monGuide.id) ?? null
        const nbEt = nbEtapesParGuide.get(monGuide.id) ?? 0
        const nbEv = prog?.etapes_vues_ids.length ?? 0
        const pct  = nbEt > 0 ? Math.round((nbEv / nbEt) * 100) : 0
        const fini = prog?.statut === 'reussi'
        return (
          <Card className={cn('p-4', fini ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white')}>
            <div className="flex items-center gap-3">
              <div className="text-4xl shrink-0">{fini ? '🏆' : '📖'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                  {fini ? 'Formation validée' : 'Ma formation en cours'}
                </p>
                <p className="font-bold text-base truncate">{monGuide.titre}</p>
                <div className="mt-1.5 h-2 bg-zinc-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">{nbEv}/{nbEt} étapes lues · {pct}%</p>
              </div>
            </div>
            <Link
              href={`/formation/${monGuide.id}?emp=${empId}`}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-base font-bold active:scale-95 transition"
            >
              {fini ? '↺ Revoir ma formation' : '▶ Continuer ma formation'}
            </Link>
          </Card>
        )
      })()}

      {/* KPIs flash en bandeau dense */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Heures semaine"
          value={`${heuresSemaine.toFixed(1)}h`}
          sublabel={`/ ${heuresContrat}h contrat · mois ${heuresMois.toFixed(0)}h`}
          tone={heuresSemaine >= heuresContrat ? 'emerald' : 'zinc'}
        />
        <KpiTile
          icon={<GraduationCap className="h-3.5 w-3.5" />}
          label="Quiz formation"
          value={quizScore != null ? `${quizScore}%` : '—'}
          sublabel={maProgression?.statut ? statutLabel(maProgression.statut) : 'pas commencé'}
          tone={quizScore == null ? 'zinc' : quizScore >= (monGuide?.seuil_reussite_pct ?? 80) ? 'emerald' : 'red'}
        />
        <KpiTile
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Onboarding"
          value={onboarded ? 'Validé' : 'En cours'}
          sublabel={onboardingDate ?? 'à compléter'}
          tone={onboarded ? 'emerald' : 'amber'}
        />
        <KpiTile
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Challenges"
          value={`${evaluations.filter(e => e.cible_atteinte).length}/${evaluations.length}`}
          sublabel="atteints ce mois"
          tone={evaluations.filter(e => e.cible_atteinte).length > 0 ? 'emerald' : 'zinc'}
        />
      </section>

      {/* Reprise de la visite guidée. Sans ce bouton, un « Non merci » cliqué
          par réflexe le premier jour est définitif : le panneau ne se propose
          qu'une fois, et personne ne devine qu'il existe encore. */}
      <section className="px-4 sm:px-6 max-w-md">
        <RelancerVisite etat={profil.visite_guidee_etape ?? null} />
      </section>

      {/* Stats poste + 7 jours en 2 colonnes desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {statsPoste.length > 0 && (
          <Card className="p-3 lg:col-span-2">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
              {iconForPoste(emp.poste as string)}
              Mon activité — {emp.poste}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {statsPoste.map(s => (
                <div key={s.label} className="rounded-lg bg-zinc-50 p-2.5">
                  <p className="text-lg leading-none">{s.emoji}</p>
                  <p className="text-lg font-black tabular-nums mt-1">{s.value}</p>
                  <p className="text-[11px] text-zinc-700 font-bold">{s.label}</p>
                  {s.sublabel && <p className="text-[11px] text-zinc-500 mt-0.5">{s.sublabel}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className={cn('p-3', statsPoste.length === 0 && 'lg:col-span-3')}>
          <h2 className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2">
            7 derniers jours
          </h2>
          <div className="grid grid-cols-7 gap-1">
            {days7.map(d => (
              <div key={d.iso} className={cn(
                'rounded-md border p-1.5 text-center',
                d.iso === todayISO ? 'border-emerald-400 bg-emerald-50' : 'border-zinc-200 bg-zinc-50',
              )}>
                <p className="text-[11px] uppercase font-bold text-zinc-500 leading-none">{d.jour}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">{d.iso.slice(8)}</p>
                <p className="text-xs font-black mt-0.5">{d.heures > 0 ? `${d.heures.toFixed(1)}h` : '—'}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )

  // 2) Présence & shifts = shifts/briefing/alertes
  const presenceSections = (
    <details id="shifts" className="group rounded-2xl border border-zinc-200 bg-white overflow-hidden" open>
      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none hover:bg-zinc-50">
        <h2 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
          📅 Prochains shifts · briefing · alertes perso
        </h2>
        <span className="text-xs text-zinc-400 group-open:rotate-180 transition">▾</span>
      </summary>
      <div className="p-3 border-t border-zinc-100">
        <ShiftsBriefingAlertes
          employeId={empId}
          poste={emp.poste as string}
          posteWidget={posteWidget}
        />
      </div>
    </details>
  )

  // 3) Congés & perf = performance/congés/météo
  const congesSections = (
    <details id="conges" className="group rounded-2xl border border-zinc-200 bg-white overflow-hidden" open>
      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none hover:bg-zinc-50">
        <h2 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
          🏖 Performance · congés · météo affluence
        </h2>
        <span className="text-xs text-zinc-400 group-open:rotate-180 transition">▾</span>
      </summary>
      <div className="p-3 border-t border-zinc-100">
        <PerformanceCongesMeteo
          employeId={empId}
          poste={emp.poste as string}
          soldeConges={Number((emp as { solde_conges_jours?: number }).solde_conges_jours ?? 0)}
        />
      </div>
    </details>
  )

  // 4) Paie & récompenses = rémunération estimée + challenges
  const paieSections = (
    <>
      {/* Rémunération du mois — estimation brute (collapsible) */}
      {(() => {
        const baseHeures = heuresMois * smic
        const primesFixes = evaluations
          .filter(e => e.cible_atteinte && e.challenge.recompense_type === 'fixe')
          .reduce((s, e) => s + Number(e.prime_estimee_eur), 0)
        const bonusSurplus = surplusInfo.ma_part
        const total = baseHeures + primesFixes + bonusSurplus
        return (
          <details id="paie" className="group rounded-2xl border border-zinc-200 bg-white overflow-hidden" open>
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none hover:bg-zinc-50">
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Ma rémunération brute estimée — ce mois
                <span className="ml-1 inline-flex items-center h-5 px-2 rounded-full bg-zinc-900 text-white text-[11px] font-black tabular-nums normal-case tracking-normal">
                  {total.toFixed(0)} €
                </span>
              </h2>
              <span className="text-xs text-zinc-400 group-open:rotate-180 transition">▾</span>
            </summary>
            <div className="p-3 border-t border-zinc-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="text-xs text-zinc-500">Heures × SMIC</p>
                <p className="text-xl font-bold tabular-nums">{baseHeures.toFixed(2)} €</p>
                <p className="text-[11px] text-zinc-400">{heuresMois.toFixed(1)} h × {smic.toFixed(2)} €/h</p>
              </div>
              <div className="rounded-md bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Primes challenges atteintes</p>
                <p className="text-xl font-bold tabular-nums text-emerald-800">+ {primesFixes.toFixed(2)} €</p>
                <p className="text-[11px] text-emerald-600">
                  {evaluations.filter(e => e.cible_atteinte && e.challenge.recompense_type === 'fixe').length} cible(s) atteinte(s)
                </p>
              </div>
              <div className="rounded-md bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Bonus surplus (point mort)</p>
                <p className="text-xl font-bold tabular-nums text-amber-800">+ {bonusSurplus.toFixed(2)} €</p>
                <p className="text-[11px] text-amber-600">
                  {surplusInfo.surplus > 0
                    ? `${(surplusInfo.surplus).toFixed(0)} € surplus · ${surplusInfo.pct_redistribution.toFixed(0)}% pool`
                    : 'pas encore de surplus ce mois'
                  }
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-md bg-zinc-900 text-white p-3 flex items-center justify-between">
              <span className="text-sm uppercase tracking-wider opacity-80">Total brut estimé</span>
              <span className="text-2xl font-bold tabular-nums">{total.toFixed(2)} €</span>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 italic">
              Estimation live. Le total final sera arrêté à la clôture du mois par le manager.
            </p>
            </div>
          </details>
        )
      })()}

      {/* Mes challenges actifs (collapsible) */}
      <details id="challenges" className="group rounded-2xl border border-zinc-200 bg-white overflow-hidden" open>
        <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none hover:bg-zinc-50">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Mes challenges actifs
            <span className="ml-1 inline-flex items-center h-5 px-2 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-black tabular-nums normal-case tracking-normal">
              {evaluations.filter(e => e.cible_atteinte).length} / {evaluations.length}
            </span>
          </h2>
          <span className="text-xs text-zinc-400 group-open:rotate-180 transition">▾</span>
        </summary>
        <div className="p-3 border-t border-zinc-100">
        {evaluations.length === 0 ? (
          <p className="text-sm text-zinc-500 italic text-center py-6">
            Aucun challenge actif pour ton poste. Demande au gérant.
          </p>
        ) : (
          <div className="space-y-3">
            {evaluations.map(e => {
              const c = e.challenge

              // Cas spécial : challenge restaurant CA surplus → viz gamifiée
              if (c.type === 'restaurant' && c.metrique === 'ca_surplus_point_mort') {
                return (
                  <div key={c.id}>
                    <ChallengeSurplusViz
                      pctSeuilAtteint={pctSeuilAtteint}
                      surplusTotal={surplusInfo.surplus}
                      maPart={surplusInfo.ma_part}
                      mesHeures={surplusInfo.mes_heures}
                      totalHeures={surplusInfo.total_heures}
                      pctRedistribution={surplusInfo.pct_redistribution}
                      recompenseTitre={c.titre}
                    />
                  </div>
                )
              }
              const recompTxt = c.recompense_type === 'fixe'
                ? `+${Number(c.recompense_montant).toFixed(0)} €`
                : `${Number(c.recompense_montant).toFixed(0)}% surplus`
              const couleur =
                e.cible_atteinte         ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                e.progression_pct >= 60  ? 'bg-amber-100 text-amber-900 border-amber-300' :
                                            'bg-zinc-100 text-zinc-700 border-zinc-300'
              return (
                <div key={c.id} className={cn('rounded-md border p-3', couleur)}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold">{c.titre}</p>
                        <Badge variant="outline" className="text-xs">
                          {c.type === 'individuel' ? 'Indiv' : c.type === 'equipe' ? 'Équipe' : 'Resto'}
                        </Badge>
                        {c.leaderboard_public && <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-xs">🏆</Badge>}
                        {e.cible_atteinte && <Badge className="bg-emerald-600 text-white text-xs">✓ atteint</Badge>}
                      </div>
                      {c.description && <p className="text-xs opacity-80 mt-0.5">{c.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">{recompTxt}</p>
                      <p className="text-[11px] opacity-70">{c.periode}</p>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span>{Number(e.valeur_atteinte).toFixed(2)} {c.cible_unite}</span>
                      <span className="opacity-70">cible : {c.cible_operateur} {Number(c.cible_valeur).toFixed(2)} {c.cible_unite}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full transition-all',
                          e.cible_atteinte         ? 'bg-emerald-500' :
                          e.progression_pct >= 60  ? 'bg-amber-500' :
                                                     'bg-zinc-400',
                        )}
                        style={{ width: `${e.progression_pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] mt-0.5 opacity-70">{e.progression_pct}% de progression</p>
                  </div>

                  {/* Leaderboard inline si challenge public */}
                  {(() => {
                    const lb = lbByChallenge.get(c.id)
                    if (!lb || lb.entries.length === 0) return null
                    const top3 = lb.entries.slice(0, 3)
                    const moiDansTop3 = top3.some(t => t.employe_id === empId)
                    const medals = ['🥇', '🥈', '🥉']
                    return (
                      <div className="mt-2.5 pt-2.5 border-t border-current/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1.5">
                          🏆 Classement ({lb.total_participants} participants)
                        </p>
                        <div className="space-y-0.5">
                          {top3.map((entry, i) => (
                            <div
                              key={entry.employe_id}
                              className={cn(
                                'flex items-center justify-between text-xs px-2 py-1 rounded',
                                entry.employe_id === empId
                                  ? 'bg-amber-200/60 font-bold'
                                  : 'bg-white/40',
                              )}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="text-base">{medals[i]}</span>
                                <span>{entry.prenom} {entry.nom[0]}.</span>
                              </span>
                              <span className="tabular-nums">{Number(entry.valeur).toFixed(0)} {c.cible_unite}</span>
                            </div>
                          ))}
                          {!moiDansTop3 && lb.mon_rang && (
                            <div className="flex items-center justify-between text-xs px-2 py-1 rounded bg-amber-200/60 font-bold mt-1 border border-current/20">
                              <span className="flex items-center gap-1.5">
                                <span className="text-base">📍</span>
                                <span>Toi · {lb.mon_rang}<sup>e</sup>/{lb.total_participants}</span>
                              </span>
                              <span className="tabular-nums">{Number(lb.ma_valeur ?? 0).toFixed(0)} {c.cible_unite}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-zinc-400 italic">
          🎯 Atteins tes cibles pour décrocher les primes. Mises à jour live à chaque action.
        </p>
        </div>
      </details>
    </>
  )

  return (
    <div className={cn('min-h-screen bg-zinc-50', profil.apercu ? 'pb-mobile-nav-apercu' : 'pb-mobile-nav')}>
      <TopActionBar theme="light" profil={navProfil} />
      <BackToCategoryButton theme="light" />
      <StoriesNavServer />

      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <PullToRefresh>
      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        {/* Gérant : sélecteur « Voir en tant que… » + bandeau lecture seule */}
        {isManager && employesListe && employesListe.length > 0 && (
          <div className="space-y-2">
            <VoirEnTantQue
              employes={employesListe as Array<{ id: string; prenom: string; nom: string; poste: string }>}
              current={cibleEmployeId}
              soiMemeId={profil.employe_id ?? null}
            />
            {viewAsId && (
              <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-2.5">
                <p className="text-sm font-bold text-amber-900">
                  👁 Tu regardes l&apos;espace de <span className="underline">{emp.prenom as string} {emp.nom as string}</span> · lecture seule
                </p>
                <a href="/api/apercu/stop" className="inline-flex items-center gap-1 h-9 px-3 rounded-full bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 active:scale-95 transition">
                  ← Revenir à mon espace
                </a>
              </div>
            )}
          </div>
        )}

        {/* Header éditorial : avatar gradient + identité Fraunces + résumé + cloche */}
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-stretch gap-4 min-w-0 flex-1">
            {/* Avatar initiale gradient */}
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-2xl sm:text-3xl font-black shadow-xl shadow-emerald-500/30 ring-4 ring-emerald-500/20 shrink-0">
              {(emp.prenom as string)[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {posteWidget ? `${POSTE_INFO_WIDGET[posteWidget].emoji} ${POSTE_INFO_WIDGET[posteWidget].label}` : 'Membre équipe'}
              </p>
              <h1 className="font-display italic text-2xl sm:text-5xl font-medium text-zinc-900 tracking-[-0.02em] leading-tight sm:leading-[0.95]">
                {emp.prenom} {emp.nom}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
                {emp.type_contrat ?? 'CDI'} · {emp.heures_contrat ?? 35}h/sem
                <span className="ml-2 text-zinc-400">· équipe depuis {ancMois} mois</span>
                {heuresSemaine > 0 && (
                  <span className={cn('ml-2 font-bold', heuresSemaine >= heuresContrat ? 'text-emerald-700' : 'text-zinc-600')}>
                    · {heuresSemaine.toFixed(1)}h cette semaine
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* CTAs principaux toujours visibles */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={actionPrincipale.href}
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-full bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 active:scale-95 transition"
            >
              {actionPrincipale.emoji} {actionPrincipale.label}
            </Link>
            <NotificationsBell />
          </div>
        </header>

        {/* 🧑‍💼 Arnaud t'aide aujourd'hui — rappels perso du salarié */}
        <RappelsSalarieCard data={rappels} prenom={emp.prenom as string} />

        {/* 💬 Demande à Arnaud — l'assistant métier du salarié (cloisonné) */}
        <AssistantSalarieChat />

        <MonEspaceTabs
          vueSections={vueSections}
          presenceSections={presenceSections}
          congesSections={congesSections}
          paieSections={paieSections}
        />
      </main>
      </PullToRefresh>
    </div>
  )
}

// ─── KPI tile dense ───────────────────────────────────────────────
function KpiTile({ icon, label, value, sublabel, tone }: {
  icon: React.ReactNode
  label: string
  value: string
  sublabel?: string
  tone: 'emerald' | 'amber' | 'red' | 'zinc'
}) {
  const tones: Record<typeof tone, { bg: string; value: string; label: string }> = {
    emerald: { bg: 'bg-emerald-50 border-emerald-200', value: 'text-emerald-700', label: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50 border-amber-200',     value: 'text-amber-800',   label: 'text-amber-700' },
    red:     { bg: 'bg-red-50 border-red-200',         value: 'text-red-700',     label: 'text-red-700' },
    zinc:    { bg: 'bg-white border-zinc-200',         value: 'text-zinc-900',    label: 'text-zinc-500' },
  }
  const t = tones[tone]
  return (
    <div className={cn('rounded-2xl border p-3', t.bg)}>
      <div className={cn('flex items-center gap-1 text-[11px] font-black uppercase tracking-wider', t.label)}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={cn('text-xl font-black tabular-nums mt-1 leading-none', t.value)}>{value}</p>
      {sublabel && <p className="text-[11px] text-zinc-500 mt-1 truncate">{sublabel}</p>}
    </div>
  )
}

function statutLabel(s: string): string {
  switch (s) {
    case 'reussi':         return '✅ réussi'
    case 'echoue':         return '❌ à retenter'
    case 'quiz_a_passer':  return '📝 quiz à passer'
    case 'en_cours':       return '⏳ en cours'
    default:               return 'pas commencé'
  }
}

function iconForPoste(poste: string): React.ReactNode {
  if (poste === 'serveur' || poste === 'salle') return <Utensils className="h-4 w-4" />
  if (poste === 'cuisine' || poste === 'cuisinier' || poste === 'pizzaiolo' || poste === 'second') return <ChefHat className="h-4 w-4" />
  if (poste === 'bar' || poste === 'barman') return <Wine className="h-4 w-4" />
  return <ChefHat className="h-4 w-4" />
}
