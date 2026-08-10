'use client'

// « Demande à Arnaud » — l'assistant métier du salarié (allergènes, recettes,
// accords, fiches de poste, urgences). Cloisonné : jamais de prix/coûts.

import { useState } from 'react'
import { Loader2, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
import { demanderAArnaudAction } from './assistant-actions'

type Msg = { role: 'user' | 'assistant'; content: string }

const CHIPS = [
  "Je fais quoi à l'ouverture ?",
  'Je fais quoi à la fermeture ?',
  'Réaction allergique : que faire ?',
  'Les allergènes d\'un plat',
  'Quel vin avec un plat ?',
]

export default function AssistantSalarieChat() {
  const [chat, setChat] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function envoyer(texteArg?: string) {
    const texte = (texteArg ?? input).trim()
    if (!texte || loading) return
    const next: Msg[] = [...chat, { role: 'user', content: texte }]
    setChat(next); setInput(''); setLoading(true)
    try {
      const r = await demanderAArnaudAction(next)
      setChat([...next, { role: 'assistant', content: r.reponse }])
    } catch (e) {
      setChat([...next, { role: 'assistant', content: 'Oups : ' + (e instanceof Error ? e.message : 'erreur') }])
    } finally { setLoading(false) }
  }

  return (
    <section className="rounded-3xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <MessageCircleQuestion className="h-5 w-5 text-emerald-600" />
        <h2 className="font-black text-zinc-900">Demande à Arnaud</h2>
      </div>
      {chat.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-3">Une question sur un plat, les allergènes, un accord, ton poste, une urgence ? Arnaud te répond. (Il ne donne pas les prix/coûts — ça, c'est le gérant.)</p>
      ) : (
        <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
          {chat.map((m, i) => (
            <div key={i} className={cn('text-sm rounded-2xl px-3 py-2 max-w-[88%] whitespace-pre-line', m.role === 'user' ? 'bg-emerald-600 text-white ml-auto' : 'bg-zinc-100 text-zinc-800')}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="text-sm rounded-2xl px-3 py-2 bg-zinc-100 text-zinc-500 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Arnaud cherche…
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {CHIPS.map(c => (
          <button key={c} onClick={() => envoyer(c)} disabled={loading}
            className="h-8 px-2.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold active:scale-95 transition disabled:opacity-50">{c}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') envoyer() }}
          placeholder="Pose ta question à Arnaud…"
          className="flex-1 h-11 px-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 focus:ring-2 focus:ring-emerald-500/30 outline-none text-base" />
        <button onClick={() => envoyer()} disabled={loading}
          className="h-11 px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold active:scale-95 transition disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Demander'}
        </button>
      </div>
    </section>
  )
}
