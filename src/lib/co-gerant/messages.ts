// Co-gérant « Arnaud » · il prépare le sensible (mode C).
// Tu lui dis ce dont tu as besoin → il rédige un brouillon que tu relis,
// ajustes, puis envoies à l'équipe (interne) ou copies (externe : client,
// fournisseur, presse…). Il ne ROND JAMAIS un message sensible tout seul.
// Côté serveur uniquement.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getContexteResto } from './propositions'
import { sendPushToPostes } from '@/lib/push'
import { type BrouillonMessage } from './types'

const CANAUX = ['tous', 'cuisine', 'bar', 'salle', 'admin']
const POSTES_PAR_CANAL: Record<string, string[]> = {
  cuisine: ['cuisinier', 'cuisine', 'second', 'pizzaiolo', 'cuisinier_snacking', 'polyvalent'],
  bar: ['barman', 'bar', 'polyvalent'],
  salle: ['serveur', 'salle', 'polyvalent'],
  admin: ['manager', 'gerant'],
}

/** Arnaud rédige un brouillon de message à partir d'une demande du patron. */
export async function preparerBrouillon(demande: string): Promise<BrouillonMessage> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  const ctx = await getContexteResto()
  const client = new Anthropic({ apiKey })

  const system = `Tu es Arnaud, le co-gérant de "${ctx.cg_concept || 'un restaurant'}". Tu RÉDIGES un brouillon de message pour ton patron : il le relira, l'ajustera et l'enverra lui-même. Ton clair, humain, professionnel, direct, sans blabla. Pas de "Cher/Chère" guindé sauf si c'est un client. Tu n'inventes pas de faits (dates, chiffres) — si une info manque, tu laisses un [crochet] à compléter.`
  const prompt = `Le patron a besoin de ce message : « ${demande} ».
Rédige UNIQUEMENT le texte du message, prêt à partir (aucune méta-phrase type "voici le message").
Dis si c'est un message INTERNE (à l'équipe) ou EXTERNE (client/fournisseur/autre), et pour l'interne propose le canal.
Réponds UNIQUEMENT en JSON strict : {"texte":"...","interne":true,"canal":"tous|cuisine|bar|salle|admin","conseil":"1 phrase : à qui / quand l'envoyer, ou un point de vigilance"}`

  const resp = await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 900, system, messages: [{ role: 'user', content: prompt }] })
  const txt = resp.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n').trim()
  let parsed: { texte?: string; interne?: boolean; canal?: string; conseil?: string }
  try { parsed = JSON.parse(txt) }
  catch { const m = txt.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { texte: txt } }

  const canal = CANAUX.includes(String(parsed.canal)) ? String(parsed.canal) : 'tous'
  return {
    texte: String(parsed.texte ?? txt).trim(),
    canalSuggere: canal,
    interne: parsed.interne !== false,
    conseil: String(parsed.conseil ?? '').trim(),
  }
}

/** Poste un message à l'équipe, signé Arnaud de la part du patron (+ push best-effort). */
export async function posterMessageEquipe(canal: string, texte: string): Promise<void> {
  const t = (texte || '').trim()
  if (!t) throw new Error('Message vide')
  const c = CANAUX.includes(canal) ? canal : 'tous'
  const sb = await createClient()
  await sb.from('messages').insert({ canal: c, expediteur_id: null, contenu: `${t}\n— Arnaud (de la part du patron)` })
  try {
    let postes: string[]
    if (c === 'tous') {
      const { data: emps } = await sb.from('employes').select('poste').eq('actif', true)
      postes = [...new Set((emps ?? []).map(e => e.poste as string).filter(Boolean))]
    } else {
      postes = POSTES_PAR_CANAL[c] ?? []
    }
    if (postes.length) await sendPushToPostes(postes, { title: '📣 Arnaud', body: t.slice(0, 140), url: '/equipes', tag: 'arnaud-equipe' })
  } catch { /* push best-effort */ }
}
