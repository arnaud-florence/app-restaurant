'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { creerAppelClient } from './actions'
import { type MotifAppel, MOTIF_INFO } from '@/lib/affichage'

export default function AppelClient({
  table, nomResto,
}: {
  table: { id: string; numero: string; zone: string; capacite: number }
  nomResto: string
}) {
  const [motif, setMotif] = useState<MotifAppel | null>(null)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function envoyer(m: MotifAppel) {
    setMotif(m)
    setPending(true)
    setError(null)
    try {
      await creerAppelClient({
        table_id: table.id,
        table_numero: table.numero,
        motif: m,
        message: message.trim() || null,
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
        <div className="text-center mb-6">
          <p className="text-sm text-zinc-500">{nomResto}</p>
          <h1 className="text-3xl font-bold mt-1">Table {table.numero}</h1>
          <p className="text-zinc-600 mt-2">Comment pouvons-nous vous aider ?</p>
        </div>

        {done ? (
          <div className="text-center py-8">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Merci !</h2>
            <p className="text-zinc-600">Un serveur va vous rejoindre rapidement.</p>
            <Button variant="outline" className="mt-6" onClick={() => { setDone(false); setMotif(null); setMessage('') }}>
              Faire un autre appel
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(['eau', 'addition', 'aide', 'autre'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => envoyer(m)}
                  disabled={pending}
                  className="border-2 rounded-xl p-4 text-center hover:bg-emerald-50 hover:border-emerald-400 transition-colors disabled:opacity-50"
                >
                  <div className="text-4xl mb-2">{MOTIF_INFO[m].emoji}</div>
                  <div className="font-semibold">{MOTIF_INFO[m].label}</div>
                </button>
              ))}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-600 hover:text-zinc-900 select-none">
                Ajouter un message (optionnel)
              </summary>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Précisez votre demande…"
                maxLength={500}
                className="w-full mt-2 border rounded-md px-3 py-2 text-sm min-h-[80px]"
              />
            </details>

            {pending && motif && (
              <div className="mt-4 text-center text-sm text-zinc-600">
                <Loader2 className="h-4 w-4 inline animate-spin mr-1" /> Envoi…
              </div>
            )}
            {error && <div className="mt-4 text-center text-sm text-red-600">⚠️ {error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
