'use client'

// Composant réutilisable : bouton "Poser une question" + modal avec saisie
// libre. À l'envoi, appelle /api/formation/ask-ai (Claude haiku-4-5).
// Affiche la réponse formatée + historique de la session courante.

import { useState, useTransition } from 'react'
import { marked } from 'marked'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

marked.setOptions({ gfm: true, breaks: true })

type Echange = { q: string; r: string; ts: number }

export default function PoserQuestion({
  guideId, etapeId, employeId, contexte,
}: {
  guideId?: string
  etapeId?: string
  employeId?: string
  /** Petit texte indicatif sous le bouton (ex: "Pose ta question sur cette étape") */
  contexte?: string
}) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [isPending, startTransition] = useTransition()
  const [historique, setHistorique] = useState<Echange[]>([])
  const [erreur, setErreur] = useState('')

  function envoyer() {
    const q = question.trim()
    if (!q) return
    setErreur('')
    startTransition(async () => {
      try {
        const r = await fetch('/api/formation/ask-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, guide_id: guideId, etape_id: etapeId, employe_id: employeId }),
        })
        const json = await r.json()
        if (!r.ok || !json.ok) throw new Error(json.error ?? `HTTP ${r.status}`)
        setHistorique(prev => [{ q, r: json.reponse as string, ts: Date.now() }, ...prev])
        setQuestion('')
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur IA')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-100 text-violet-900 border border-violet-300 hover:bg-violet-200 text-xs font-bold transition-colors"
        title="Pose une question à l'IA — réponse immédiate"
      >
        💬 Poser une question
      </button>
      {contexte && <p className="text-[10px] text-zinc-500 mt-1">{contexte}</p>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-2xl bg-white rounded-t-xl sm:rounded-xl shadow-xl max-h-[90vh] flex flex-col">
            <header className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-zinc-900">💬 Poser une question à l'IA</h3>
                <p className="text-xs text-zinc-500">Réponse en français, immédiate, pédagogique.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-900 text-2xl leading-none w-9 h-9 rounded-full hover:bg-zinc-100"
                aria-label="Fermer"
              >×</button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Historique session */}
              {historique.length === 0 ? (
                <p className="text-sm text-zinc-500 italic text-center py-4">
                  Aucune question encore. Pose celle qui te bloque !
                </p>
              ) : (
                historique.map(e => (
                  <div key={e.ts} className="space-y-2">
                    <div className="rounded-md bg-zinc-100 px-3 py-2">
                      <p className="text-xs text-zinc-500 font-bold mb-1">🙋 Toi</p>
                      <p className="text-sm text-zinc-900">{e.q}</p>
                    </div>
                    <div className="rounded-md bg-violet-50 border border-violet-200 px-3 py-2">
                      <p className="text-xs text-violet-600 font-bold mb-1">🤖 Formateur IA</p>
                      <div
                        className="prose prose-sm prose-zinc max-w-none text-sm"
                        dangerouslySetInnerHTML={{ __html: marked.parse(e.r) as string }}
                      />
                    </div>
                  </div>
                ))
              )}
              {erreur && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-900">⚠️ {erreur}</div>
              )}
            </div>

            <footer className="p-4 border-t bg-zinc-50 space-y-2">
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) envoyer() }}
                placeholder="Ex: Comment faire un relevé de température correct ?"
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                disabled={isPending}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-zinc-500">Cmd/Ctrl + Entrée pour envoyer</p>
                <Button
                  onClick={envoyer}
                  disabled={isPending || !question.trim()}
                  className={cn('min-h-[40px]', isPending && 'opacity-60')}
                >
                  {isPending ? '⏳ Réfléchit…' : 'Envoyer'}
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
