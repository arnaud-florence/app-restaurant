// Module 24 — Route SSE pour streaming Claude.
// POST { conversation_id, message } → ReadableStream de chunks {type:'text', text}|{type:'done', usage}
//
// Architecture :
// 1. Charge conversation + historique messages depuis Supabase.
// 2. Construit le tableau system (persona stable cacheable + snapshot volatile).
// 3. Appelle Anthropic SDK avec stream + prompt caching.
// 4. Persiste user message AVANT, puis assistant message à la fin (avec usage).

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { construireSystemBlocks } from '@/lib/assistant/system-prompt'
import type { SnapshotKPI } from '@/lib/assistant/snapshot'
import type { Anomalie } from '@/lib/assistant/anomalies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ContexteSnap = { snapshot: SnapshotKPI; anomalies: Anomalie[] } | null

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY manquante côté serveur' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }

  let body: { conversation_id?: string; message?: string }
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: { 'content-type': 'application/json' } }) }

  const { conversation_id, message } = body
  if (!conversation_id || !message || typeof message !== 'string' || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'conversation_id et message requis' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }
  if (message.length > 8000) {
    return new Response(JSON.stringify({ error: 'message trop long (max 8000 car.)' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }

  const supabase = await createClient()

  // Chargement de la conversation + historique
  const { data: conv, error: convErr } = await supabase
    .from('assistant_conversations')
    .select('id, modele, contexte_snap')
    .eq('id', conversation_id).single()
  if (convErr || !conv) {
    return new Response(JSON.stringify({ error: 'Conversation introuvable' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }

  const { data: msgs } = await supabase
    .from('assistant_messages')
    .select('role, contenu')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true })

  // Persister le message utilisateur avant streaming
  const { error: insertErr } = await supabase.from('assistant_messages').insert({
    conversation_id, role: 'user', contenu: message,
  })
  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: { 'content-type': 'application/json' } })
  }

  // Construire system + messages pour Claude
  const ctx = conv.contexte_snap as ContexteSnap
  const system = ctx
    ? construireSystemBlocks(ctx.snapshot, ctx.anomalies)
    : [{ type: 'text' as const, text: 'Tu es un assistant restaurant. Le snapshot KPI est indisponible.' }]

  type ClaudeMsg = { role: 'user' | 'assistant'; content: string }
  const historique: ClaudeMsg[] = (msgs ?? [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.contenu as string }))
  historique.push({ role: 'user', content: message })

  const anthropic = new Anthropic({ apiKey })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        const response = anthropic.messages.stream({
          model: (conv.modele as string) || 'claude-haiku-4-5',
          max_tokens: 2048,
          system,
          messages: historique,
        })

        let fullText = ''
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text
            send({ type: 'text', text: event.delta.text })
          }
        }

        const final = await response.finalMessage()
        const usage = final.usage

        // Persistance du message assistant + maj last_message_at
        await supabase.from('assistant_messages').insert({
          conversation_id,
          role: 'assistant',
          contenu: fullText,
          tokens_in: usage.input_tokens,
          tokens_out: usage.output_tokens,
          cache_read_tokens: usage.cache_read_input_tokens ?? 0,
          cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
          stop_reason: final.stop_reason,
        })
        await supabase.from('assistant_conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation_id)

        send({ type: 'done', usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_read: usage.cache_read_input_tokens ?? 0,
          cache_write: usage.cache_creation_input_tokens ?? 0,
        } })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur inconnue'
        send({ type: 'error', error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    },
  })
}
