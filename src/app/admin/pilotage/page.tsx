// Module 25 — Page Pilotage stratégique (refonte 2026-05-14).
// 2 onglets :
//   - "Aujourd'hui" : 7 sections alimentées uniquement par les 15 agents IA
//   - "Stratégie"   : KPIs charts, objectifs, kanban actions, saisonnier 12 mois
//
// Aucune donnée fictive ou hardcodée : chaque widget affiche soit des données
// réelles d'agent, soit un état vide élégant.

import { createClient } from '@/lib/supabase/server'
import PilotageClient from './PilotageClient'
import TachesEquipeCard from './TachesEquipeCard'
import PerformanceCard from './PerformanceCard'
import BandeauSetupIncomplet from './BandeauSetupIncomplet'
import AgentsAuTravail from '@/components/AgentsAuTravail'
import SectionAlertes from './sections/SectionAlertes'
import SectionKPIs from './sections/SectionKPIs'
import SectionSuggestions from './sections/SectionSuggestions'
import SectionParAgent from './sections/SectionParAgent'
import { calculerKPIs, calculerSaisonnier, periodeMoisCourant } from '@/lib/pilotage'
import { getProfile } from '@/lib/auth'

export const metadata = { title: 'Pilotage stratégique — Admin' }
export const dynamic = 'force-dynamic'

export default async function PilotagePage() {
  const supabase = await createClient()
  const periode = periodeMoisCourant()

  const profilPromise = getProfile()
  const employeIdHint = (await profilPromise)?.employe_id ?? null

  // Données pour l'onglet "Stratégie" (existant, inchangé)
  const [kpis, saisonnier, objectifsRes, actionsRes, employesRes, tachesCompleteesRes] = await Promise.all([
    calculerKPIs(supabase),
    calculerSaisonnier(supabase),
    supabase.from('objectifs').select('*').order('annee', { ascending: false }).order('mois', { ascending: false, nullsFirst: false }),
    supabase.from('actions_strategiques').select('*, responsable:employes!responsable_id(prenom, nom)')
      .order('priorite', { ascending: true }).order('echeance', { ascending: true, nullsFirst: false }),
    supabase.from('employes').select('id, prenom, nom').eq('actif', true).order('prenom'),
    employeIdHint
      ? supabase.from('taches_completees')
          .select('tache_id')
          .eq('employe_id', employeIdHint)
          .eq('date', new Date().toISOString().slice(0, 10))
      : Promise.resolve({ data: [] }),
  ])

  const initialDone = (tachesCompleteesRes.data ?? []).map(r => (r as { tache_id: string }).tache_id)

  // Sections de l'onglet "Aujourd'hui" — pré-rendues côté serveur
  const aujourdhuiSections = (
    <div className="space-y-4">
      <AgentsAuTravail />
      <SectionAlertes />
      <SectionKPIs />
      <SectionSuggestions />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionParAgent
          agentId="stock"
          titre="Stock & approvisionnement"
          emoji="📦"
          emptyMsg="Stock en ordre — aucune alerte"
          emptyHint="Le Gestionnaire de Stock tourne toutes les 2 heures."
          drilldownHref="/admin/stock"
        />
        <SectionParAgent
          agentId="rh"
          titre="Planning & RH"
          emoji="👥"
          emptyMsg="Configurez votre planning pour activer cet espace"
          emptyHint="Le Manager RH tourne chaque soir à 22h."
          drilldownHref="/admin/rh"
        />
        <SectionParAgent
          agentId="haccp"
          titre="HACCP & conformité"
          emoji="🌡️"
          emptyMsg="Conformité parfaite aujourd'hui"
          emptyHint="Le Responsable HACCP tourne toutes les heures."
          drilldownHref="/admin/hygiene"
        />
      </div>
    </div>
  )

  return (
    <PilotageClient
      kpis={kpis}
      saisonnier={saisonnier}
      objectifs={objectifsRes.data ?? []}
      actions={(actionsRes.data ?? []) as unknown as ActionRow[]}
      employes={employesRes.data ?? []}
      periode={periode}
      widgetEmployeId={employeIdHint}
      widgetInitialDone={initialDone}
      aujourdhuiSections={aujourdhuiSections}
      strategieExtras={<><BandeauSetupIncomplet /><TachesEquipeCard /><PerformanceCard /></>}
    />
  )
}

type ActionRow = {
  id: string; titre: string; description: string | null; kpi_lie: string | null
  statut: 'a_faire' | 'en_cours' | 'fait' | 'annule'
  priorite: 'haute' | 'normale' | 'basse'
  echeance: string | null; responsable_id: string | null; fait_le: string | null
  created_at: string
  responsable?: { prenom?: string; nom?: string } | null
}
