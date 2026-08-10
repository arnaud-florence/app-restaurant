import type { SupabaseClient } from '@supabase/supabase-js'

// Filet de sécurité réconciliation caisse : retourne l'id de la session caisse
// ouverte du jour, en la CRÉANT si aucune n'existe. Sans ça, un encaissement fait
// alors que personne n'a « ouvert la caisse » produirait un paiement orphelin
// (session_caisse_id = null) → absent du Z-report → CA non réconcilié.
// La session auto a un fond initial 0 + une note pour que le gérant vérifie le fond.
export async function getOrCreateSessionCaisseId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: open } = await supabase
    .from('sessions_caisse')
    .select('id')
    .is('fermee_at', null)
    .eq('date_session', today)
    .maybeSingle()
  if (open?.id) return open.id as string
  const { data: created } = await supabase
    .from('sessions_caisse')
    .insert({
      date_session: today,
      fond_initial: 0,
      notes: 'Ouverture automatique au 1er encaissement — fond initial à vérifier.',
    })
    .select('id')
    .maybeSingle()
  return (created?.id as string) ?? null
}
