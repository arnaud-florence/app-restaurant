// Helpers pour le centre de notifications internes.
// Server-only — types dans lib/notifications-types.ts.

import { createClient } from '@/lib/supabase/server'
import type { NotificationType } from '@/lib/notifications-types'

export type { NotificationType }
export { TYPE_INFO } from '@/lib/notifications-types'

export type CreerNotifInput = {
  destinataire_employe_id: string | null     // null = manager(s)
  type: NotificationType
  titre: string
  message: string
  url_action?: string | null
}

/** Insert une notification dans la table. Best-effort : ne throw jamais. */
export async function creerNotification(input: CreerNotifInput): Promise<void> {
  try {
    const sb = await createClient()
    await sb.from('notifications').insert({
      destinataire_employe_id: input.destinataire_employe_id,
      type:                    input.type,
      titre:                   input.titre,
      message:                 input.message,
      url_action:              input.url_action ?? null,
    })
  } catch {
    /* best-effort — ne bloque pas le flux principal */
  }
}

/** Liste les notifs d'un employé (employé + manager), récentes en premier. */
export async function listerMesNotifications(employe_id: string, role: 'manager' | 'employe', limit = 20) {
  const sb = await createClient()
  const q = sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  // Manager voit aussi les notifs sans destinataire (= pour les managers)
  if (role === 'manager') {
    return (await q.or(`destinataire_employe_id.eq.${employe_id},destinataire_employe_id.is.null`)).data ?? []
  }
  return (await q.eq('destinataire_employe_id', employe_id)).data ?? []
}

export async function compterNonLues(employe_id: string, role: 'manager' | 'employe'): Promise<number> {
  const sb = await createClient()
  const q = sb.from('notifications').select('id', { count: 'exact', head: true }).eq('lu', false)
  if (role === 'manager') {
    const { count } = await q.or(`destinataire_employe_id.eq.${employe_id},destinataire_employe_id.is.null`)
    return count ?? 0
  }
  const { count } = await q.eq('destinataire_employe_id', employe_id)
  return count ?? 0
}
