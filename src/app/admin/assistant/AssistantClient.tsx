'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Send, Trash2, RefreshCw, Pencil, Loader2, Sparkles, AlertTriangle, AlertCircle, Info, Menu, X, ChevronDown, ChevronUp } from 'lucide-react'
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
import { askConfirm } from '@/lib/confirm'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [bandeauOpen, setBandeauOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const conversationActive = conversations.find(c => c.id === conversationActiveId) ?? null

  // Auto-scroll
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages.length, streamText])

  async function nouvelleConv() {
    const { id } = await creerConversation({ titre: `Conversation du ${format(new Date(), 'd MMM HH:mm', { locale: fr })}` })
    router.push(`/admin/assistant?c=${id}`)
  }

  async function supprimer(id: string) {
    if (!(await askConfirm('Supprimer cette conversation ?'))) return
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
    // h-[100dvh] sur mobile (s'adapte à la barre URL iOS qui se rétracte) ;
    // h-screen sur desktop. Bottom nav admin = 5rem en mobile (compensé par
    // pb-mobile-nav du layout — on retire la même hauteur ici pour ne pas
    // déborder).
    <div className="flex h-[calc(100dvh-3rem-5rem)] md:h-screen relative bg-stone-50">
      {/* Overlay mobile pour fermer la sidebar conversations */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar conversations — drawer mobile, fixe desktop */}
      <aside className={cn(
        'fixed md:static inset-y-0 left-0 w-72 max-w-[85vw] bg-white border-r flex flex-col gap-2 p-3 shrink-0 z-50 transition-transform overflow-hidden',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        <div className="flex items-center justify-between gap-2">
          <Button onClick={() => { nouvelleConv(); setSidebarOpen(false) }} className="flex-1 gap-2">
            <Plus className="h-4 w-4" /> Nouvelle
          </Button>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
          {conversations.length === 0 && (
            <p className="text-sm text-zinc-500 italic px-2 py-4">Aucune conversation. Lancez-en une pour commencer.</p>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-2 text-sm border',
                c.id === conversationActiveId ? 'bg-emerald-50 border-emerald-300' : 'border-transparent hover:bg-zinc-50',
              )}
            >
              <Link href={`/admin/assistant?c=${c.id}`} className="flex-1 truncate min-h-[40px] flex flex-col justify-center" onClick={() => setSidebarOpen(false)}>
                <div className="font-medium truncate">{c.titre}</div>
                <div className="text-xs text-zinc-500">{format(parseISO(c.last_message_at), 'd MMM HH:mm', { locale: fr })}</div>
              </Link>
              <button onClick={() => renommer(c)} className="p-2 hover:bg-zinc-200 rounded" title="Renommer">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => supprimer(c.id)} className="p-2 hover:bg-red-100 rounded" title="Supprimer">
                <Trash2 className="h-4 w-4 text-red-600" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Zone principale */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top bar mobile : sidebar + titre conv courante */}
        <div className="md:hidden flex items-center gap-2 px-2 py-2 border-b bg-white shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-1" aria-label="Conversations">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 truncate font-semibold text-sm">
            {conversationActive?.titre ?? 'Assistant IA'}
          </div>
          {conversationActiveId && (
            <button onClick={rafraichir} disabled={isPending} className="p-2 -mr-1" aria-label="Rafraîchir contexte">
              <RefreshCw className={cn('h-5 w-5', isPending && 'animate-spin')} />
            </button>
          )}
        </div>

        {/* Bandeau actions prioritaires — repliable sur mobile */}
        <div className="border-b bg-white shrink-0">
          <button
            type="button"
            onClick={() => setBandeauOpen(o => !o)}
            className="md:hidden w-full flex items-center justify-between px-3 py-2 text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Actions prioritaires
              {top3.length > 0 && <Badge className="bg-red-500 text-white">{top3.length}</Badge>}
            </span>
            {bandeauOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <div className={cn('md:block px-3 pb-3', bandeauOpen ? 'block' : 'hidden')}>
            <div className="hidden md:flex items-center justify-between gap-2 mb-2 pt-3">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Actions prioritaires du jour
              </div>
            </div>
            <div className="text-xs text-zinc-600 grid grid-cols-2 md:flex md:gap-3 gap-1 mb-2">
              <span>CA : <strong>{fmtEuro(kpiResume.ca_mois)}</strong></span>
              <span>Food cost : <strong>{kpiResume.food_cost.toFixed(1)}%</strong></span>
              <span>Masse/CA : <strong>{kpiResume.ratio_masse.toFixed(1)}%</strong></span>
              <span>NC ouv. : <strong>{kpiResume.nc_ouvertes}</strong></span>
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
          </div>
        </div>

        {/* Chat — flex-1 prend tout le reste, scroll interne */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
            {messages.length === 0 && !streaming && (
              <div className="text-center text-zinc-500 mt-8 px-4">
                <Sparkles className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                <p className="font-medium">Posez une question à votre assistant</p>
                <p className="text-sm mt-1">Ex : « Comment va mon food cost ? »<br/>« Quelles sont mes priorités cette semaine ? »</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'rounded-2xl px-3 py-2 max-w-[88%] sm:max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed',
                  m.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-zinc-100 text-zinc-900 rounded-bl-sm',
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
                <div className="rounded-2xl rounded-bl-sm px-3 py-2 max-w-[88%] sm:max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed bg-zinc-100 text-zinc-900">
                  {streamText || <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </div>
            )}
            {usage && !streaming && (
              <div className="text-[10px] text-zinc-400 text-center">
                ↓{usage.input_tokens} ↑{usage.output_tokens}
                {usage.cache_read > 0 && ` · cache ${usage.cache_read}`}
              </div>
            )}
            {error && <div className="text-sm text-red-600 text-center">⚠️ {error}</div>}
          </div>

          {/* Zone saisie sticky bas — toujours visible */}
          <form
            className="border-t p-2 sm:p-3 flex gap-2 items-end bg-white shrink-0"
            onSubmit={e => { e.preventDefault(); envoyer() }}
          >
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Posez votre question…"
              disabled={streaming}
              maxLength={8000}
              autoComplete="off"
              enterKeyHint="send"
              className="flex-1"
            />
            <Button type="submit" disabled={streaming || !input.trim()} aria-label="Envoyer" className="px-3">
              {streaming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
            {conversationActiveId && (
              <Button type="button" variant="outline" onClick={rafraichir} disabled={isPending}
                aria-label="Rafraîchir contexte" className="hidden md:inline-flex px-3">
                <RefreshCw className={cn('h-5 w-5', isPending && 'animate-spin')} />
              </Button>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
