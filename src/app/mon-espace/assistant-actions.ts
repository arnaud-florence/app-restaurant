'use server'

// Action de l'assistant salarié « Demande à Arnaud ».
// Accessible à TOUT salarié connecté (pas de requireManager). Cloisonné côté lib.

import { getProfile } from '@/lib/auth'
import { chatAssistantSalarie, type AssistMsg } from '@/lib/co-gerant/assistant-salarie'

export async function demanderAArnaudAction(history: AssistMsg[]): Promise<{ reponse: string }> {
  const profil = await getProfile()
  if (!profil) throw new Error('Connecte-toi pour parler à Arnaud.')
  return chatAssistantSalarie(history, profil.poste ?? null)
}
