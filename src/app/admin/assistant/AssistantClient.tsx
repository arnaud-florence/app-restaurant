'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Send, Trash2, RefreshCw, Pencil, Loader2, Sparkles, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Conversation, Message } from './types'
import type { Anomalie } from '@/lib/assistant/anomalies'
import {
  creerConversation, supprimerConversation, renommerConversation, rafraichirContexte,
} from './actions'

const NIVEAU_ICON: Record<Anomalie['niveau'], React.ComponentType<{ className?: string }>> = {
  critique: AlertCircle,
  attention: AlertTriangle,
  info: Info,
}
const NIVEAU_CLS: Record<Anomalie['niveau'], string> = {
  critique:  'bg-red-50 border-red-300 text-red-900',
  attention: 'bg-amber-50 border-amber-300 text-amber-900',
  info:      'bg-blue-50 border-blue-300 text-blue-900',
}

const fmtEuro = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function AssistantClient({
  conversations, conversationActiveId, messages, anomaliesLive, top3, kpiResume,
}: {
  conversations: Conversation[]
  conversationActiveId: string | null
  messages: Message[]
  anomaliesLive: Anomalie[]
  top3: Anomalie[]
  kpiResume: { ca_mois: number; food_cost: number; ratio_masse: number; nc_ouvertes: number }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number; cache_read: number; cache_write: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages.length, streamText])

  async function nouvelleConv() {
    const { id } = await creerConversation({ titre: `Conversation du ${format(new Date(), 'd MMM HH:mm', { locale: fr })}` })
    router.push(`/admin/assistant?c=${id}`)
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer cette conversation ?')) return
    startTransition(async () => {
      await supprimerConversation(id)
      router.push('/admin/assistant')
    })
  }

  async function renommer(c: Conversation) {
    const titre = prompt('Nouveau titre', c.titre)
    if (!titre) return
    startTransition(() => renommerConversation({ id: c.id, titre }).then(() => router.refresh()))
  }

  async function rafraichir() {
    if (!conversationActiveId) return
    startTransition(() => rafraichirContexte(conversationActiveId).then(() => router.refresh()))
  }

  async function envoyer() {
    const msg = input.trim()
    if (!msg || streaming) return
    if (!conversationActiveId) {
      // Créer une conv puis renvoyer
      const { id } = await creerConversation({ titre: msg.slice(0, 60) })
      router.push(`/admin/assistant?c=${id}`)
      return
    }
    setInput('')
    setStreaming(true)
    setStreamText('')
    setError(null)
    setUsage(null)

    try {
      const res = await fetch('/api/assistant/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationActiveId, message: msg }),
      })
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(errBody.error ?? `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const ev of events) {
          if (!ev.startsWith('data: ')) continue
          const json = ev.slice(6).trim()
          if (!json) continue
          try {
            const obj = JSON.parse(json)
            if (obj.type === 'text') setStreamText(t => t + obj.text)
            else if (obj.type === 'done') setUsage(obj.usage)
            else if (obj.type === 'error') setError(obj.error)
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setStreaming(false)
      router.refresh()
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-3 p-3">
      {/* Sidebar conversations */}
      <aside className="w-72 flex flex-col gap-2 shrink-0">
        <Button onClick={nouvelleConv} className="gap-2"><Plus className="h-4 w-4" /> Nouvelle conversation</Button>
        <div className="overflow-y-auto flex-1 space-y-1">
          {conversations.length === 0 && (
            <p className="text-sm text-zinc-500 italic px-2 py-4">Aucune conversation. Lancez-en une pour commencer.</p>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-2 text-sm border',
                c.id === conversationActiveId ? 'bg-emerald-50 border-emerald-300' : 'border-transparent hover:bg-zinc-50',
              )}
            >
              <Link href={`/admin/assistant?c=${c.id}`} className="flex-1 truncate">
                <div className="font-medium truncate">{c.titre}</div>
                <div className="text-xs text-zinc-500">{format(parseISO(c.last_message_at), 'd MMM HH:mm', { locale: fr })}</div>
              </Link>
              <button onClick={() => renommer(c)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-200 rounded" title="Renommer">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => supprimer(c.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded" title="Supprimer">
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Zone principale */}
      <main className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Bandeau actions prioritaires + KPI */}
        <Card className="p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Actions prioritaires du jour
            </div>
            <div className="text-xs text-zinc-600 flex gap-3">
              <span>CA mois : <strong>{fmtEuro(kpiResume.ca_mois)}</strong></span>
              <span>Food cost : <strong>{kpiResume.food_cost.toFixed(1)}%</strong></span>
              <span>Masse/CA : <strong>{kpiResume.ratio_masse.toFixed(1)}%</strong></span>
              <span>NC ouvertes : <strong>{kpiResume.nc_ouvertes}</strong></span>
            </div>
          </div>
          {top3.length === 0 ? (
            <p className="text-sm text-emerald-700">✅ Aucune anomalie. Continuez comme ça !</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {top3.map((a, i) => {
                const Icon = NIVEAU_ICON[a.niveau]
                return (
                  <div key={i} className={cn('rounded-md border p-2 text-sm', NIVEAU_CLS[a.niveau])}>
                    <div className="flex items-start gap-1.5">
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium">{a.titre}</div>
                        <div className="text-xs mt-0.5 opacity-90">{a.action_suggeree}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Chat */}
        <Card className="flex-1 flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !streaming && (
              <div className="text-center text-zinc-500 mt-8">
                <Sparkles className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                <p className="font-medium">Posez une question à votre assistant</p>
                <p className="text-sm">Ex : « Comment va mon food cost ? », « Quelles sont mes priorités cette semaine ? »</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'rounded-lg px-3 py-2 max-w-[80%] whitespace-pre-wrap text-sm',
                  m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-900',
                )}>
                  {m.contenu}
                  {m.role === 'assistant' && (m.tokens_in || m.tokens_out) && (
                    <div className="text-[10px] mt-1 opacity-60 flex gap-2">
                      <span>↓{m.tokens_in} ↑{m.tokens_out}</span>
                      {(m.cache_read_tokens ?? 0) > 0 && <span>cache:{m.cache_read_tokens}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2 max-w-[80%] whitespace-pre-wrap text-sm bg-zinc-100 text-zinc-900">
                  {streamText || <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </div>
            )}
            {usage && !streaming && (
              <div className="text-[10px] text-zinc-400 text-center">
                Dernière requête : ↓{usage.input_tokens} ↑{usage.output_tokens}
                {usage.cache_read > 0 && ` · ${usage.cache_read} tokens depuis cache`}
              </div>
            )}
            {error && <div className="text-sm text-red-600 text-center">⚠️ {error}</div>}
          </div>

          <form
            className="border-t p-3 flex gap-2 items-end"
            onSubmit={e => { e.preventDefault(); envoyer() }}
          >
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Posez votre question…"
              disabled={streaming}
              maxLength={8000}
              className="flex-1"
            />
            <Button type="submit" disabled={streaming || !input.trim()} className="gap-1">
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </Button>
            {conversationActiveId && (
              <Button type="button" variant="outline" onClick={rafraichir} disabled={isPending} title="Rafraîchir le contexte KPI">
                <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
              </Button>
            )}
          </form>
        </Card>
      </main>
    </div>
  )
}
