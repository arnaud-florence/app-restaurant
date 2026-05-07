// Module 24 — Types partagés assistant.

export type Role = 'user' | 'assistant' | 'system'

export type Conversation = {
  id: string
  titre: string
  modele: string
  archivee: boolean
  created_at: string
  last_message_at: string
  contexte_snap: unknown
}

export type Message = {
  id: string
  conversation_id: string
  role: Role
  contenu: string
  tokens_in: number | null
  tokens_out: number | null
  cache_read_tokens: number | null
  cache_write_tokens: number | null
  stop_reason: string | null
  created_at: string
}
