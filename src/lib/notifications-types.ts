// Types et constantes runtime (Client-safe).

export type NotificationType =
  | 'nc_critique'
  | 'conge_demande'
  | 'conge_validee'
  | 'conge_refusee'
  | 'pourboires_distribues'
  | 'challenge_atteint'
  | 'formation_expire'
  | 'message_general'
  | 'commande_online_recue'

export const TYPE_INFO: Record<NotificationType, { emoji: string; cls: string }> = {
  nc_critique:           { emoji: '🚨', cls: 'bg-red-100 text-red-900 border-red-300' },
  conge_demande:         { emoji: '📅', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  conge_validee:         { emoji: '✅', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  conge_refusee:         { emoji: '❌', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  pourboires_distribues: { emoji: '💸', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  challenge_atteint:     { emoji: '🏆', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  formation_expire:      { emoji: '🎓', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  message_general:       { emoji: '📨', cls: 'bg-blue-100 text-blue-900 border-blue-300' },
  commande_online_recue: { emoji: '📦', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
}

export type Notification = {
  id: string
  destinataire_employe_id: string | null
  type: NotificationType
  titre: string
  message: string
  url_action: string | null
  lu: boolean
  email_envoye: boolean
  created_at: string
}
