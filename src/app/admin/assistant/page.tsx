// Module 24 — Page Assistant IA gérant.

import { createClient } from '@/lib/supabase/server'
import AssistantClient from './AssistantClient'
import type { Conversation, Message } from './types'
import { genererSnapshot } from '@/lib/assistant/snapshot'
import { detecterAnomalies, actionsPrioritaires } from '@/lib/assistant/anomalies'

export const metadata = { title: 'Assistant IA — Admin' }
export const dynamic = 'force-dynamic'

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: { c?: string }
}) {
  const supabase = await createClient()

  // Snapshot live pour le bandeau "actions prioritaires"
  const snapshotLive = await genererSnapshot(supabase)
  const anomaliesLive = detecterAnomalies(snapshotLive)
  const top3 = actionsPrioritaires(anomaliesLive)

  // Liste des conversations non archivées
  const { data: convsRaw } = await supabase
    .from('assistant_conversations')
    .select('id, titre, modele, archivee, created_at, last_message_at, contexte_snap')
    .eq('archivee', false)
    .order('last_message_at', { ascending: false })

  const conversations: Conversation[] = (convsRaw ?? []) as unknown as Conversation[]
  const conversationActiveId = searchParams?.c ?? conversations[0]?.id ?? null

  // Messages de la conversation active
  let messages: Message[] = []
  if (conversationActiveId) {
    const { data: msgsRaw } = await supabase
      .from('assistant_messages')
      .select('*')
      .eq('conversation_id', conversationActiveId)
      .order('created_at', { ascending: true })
    messages = (msgsRaw ?? []) as unknown as Message[]
  }

  return (
    <AssistantClient
      conversations={conversations}
      conversationActiveId={conversationActiveId}
      messages={messages}
      anomaliesLive={anomaliesLive}
      top3={top3}
      kpiResume={{
        ca_mois: snapshotLive.ca.mois_courant,
        food_cost: snapshotLive.food_cost.moyen_pct,
        ratio_masse: snapshotLive.rh.ratio_masse_ca,
        nc_ouvertes: snapshotLive.hygiene.nc_ouvertes,
      }}
    />
  )
}
