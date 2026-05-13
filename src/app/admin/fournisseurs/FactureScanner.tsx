'use client'

// Composant UI pour l'Agent 8 Scanner : drag&drop d'une photo de facture,
// envoi à /api/agents/scanner, affichage du résultat extrait par Claude Vision,
// puis bouton "Créer la facture" qui pré-remplit le formulaire d'édition.

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type FactureExtraite = {
  type: 'facture' | 'bon_livraison' | 'ticket' | 'inconnu'
  fournisseur_nom: string | null
  numero: string | null
  date_emission: string | null
  date_echeance: string | null
  montant_ht: number | null
  montant_ttc: number | null
  montant_tva: number | null
  lignes: Array<{
    description: string
    quantite: number | null
    unite: string | null
    prix_unitaire_ht: number | null
    total_ht: number | null
  }>
  confiance: number
  notes: string | null
}

type HausseDetectee = {
  description: string
  prix_actuel: number
  prix_historique_moyen: number
  haussePct: number
}

export default function FactureScanner({
  onExtractionComplete,
  onClose,
}: {
  /** Appelé quand l'utilisateur valide → ouvre le form facture pré-rempli */
  onExtractionComplete: (data: FactureExtraite) => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<FactureExtraite | null>(null)
  const [hausses, setHausses] = useState<HausseDetectee[]>([])
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const [dragging, setDragging] = useState(false)

  function reset() {
    setPreview(null); setExtracted(null); setHausses([]); setErreur('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setErreur('Sélectionne une image (JPG, PNG, WEBP).')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setErreur('Image trop volumineuse (> 6 Mo). Réduis la résolution.')
      return
    }
    setErreur('')
    setExtracted(null)
    setHausses([])

    // Lecture pour preview + base64
    const reader = new FileReader()
    reader.onloadend = async () => {
      const dataUrl = reader.result as string
      setPreview(dataUrl)

      // Extrait base64 + media_type
      const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)
      if (!match) { setErreur('Format image non reconnu.'); return }
      const mediaType = match[1]
      const base64 = match[2]

      setLoading(true)
      try {
        const r = await fetch('/api/agents/scanner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: base64, media_type: mediaType }),
        })
        const json = await r.json()
        if (!r.ok || !json.ok) {
          throw new Error(json.error ?? `HTTP ${r.status}`)
        }
        if (json.extracted) {
          setExtracted(json.extracted as FactureExtraite)
          setHausses((json.haussesDetectees ?? []) as HausseDetectee[])
        } else {
          setErreur('Scan effectué mais Claude n\'a pas renvoyé de données structurées.')
        }
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur scan')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl bg-background max-h-[90vh] overflow-y-auto">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">📷 Scanner une facture</h2>
              <p className="text-xs text-zinc-500">Claude Vision lit ta facture et pré-remplit le formulaire en 5 sec.</p>
            </div>
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full hover:bg-zinc-100 text-2xl leading-none">×</button>
          </header>

          {/* Zone drop / upload */}
          {!preview && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault(); setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                dragging ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-300 hover:border-emerald-400',
              )}
              onClick={() => fileRef.current?.click()}
            >
              <p className="text-4xl mb-2">📄</p>
              <p className="font-semibold mb-1">Glisse une photo ici</p>
              <p className="text-xs text-zinc-500 mb-3">… ou clique pour ouvrir l'appareil photo / les fichiers</p>
              <Button type="button" variant="outline" size="sm">Choisir une image</Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </div>
          )}

          {/* Preview + résultat */}
          {preview && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="rounded-md border bg-zinc-50 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Aperçu facture" className="w-full max-h-[500px] object-contain" />
                </div>
                <Button onClick={reset} variant="outline" size="sm" className="w-full">↺ Choisir une autre image</Button>
              </div>

              <div className="space-y-3">
                {loading && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">
                    <p className="font-semibold">⏳ Claude Vision analyse l'image…</p>
                    <p className="text-xs text-zinc-600 mt-1">Coût ~$0.005 par scan · Durée 3-8 sec</p>
                  </div>
                )}

                {erreur && (
                  <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-900">
                    ⚠️ {erreur}
                  </div>
                )}

                {extracted && (
                  <>
                    <div className="rounded-md border p-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant={extracted.confiance >= 0.7 ? 'success' : 'warning'}>
                          {extracted.type} · confiance {(extracted.confiance * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <span className="text-zinc-500">Fournisseur</span>
                        <span className="font-medium">{extracted.fournisseur_nom ?? '—'}</span>
                        <span className="text-zinc-500">N°</span>
                        <span className="font-medium">{extracted.numero ?? '—'}</span>
                        <span className="text-zinc-500">Date</span>
                        <span className="font-medium">{extracted.date_emission ?? '—'}</span>
                        <span className="text-zinc-500">Échéance</span>
                        <span className="font-medium">{extracted.date_echeance ?? '—'}</span>
                        <span className="text-zinc-500">HT</span>
                        <span className="font-medium tabular-nums">{extracted.montant_ht?.toFixed(2) ?? '—'} €</span>
                        <span className="text-zinc-500">TVA</span>
                        <span className="font-medium tabular-nums">{extracted.montant_tva?.toFixed(2) ?? '—'} €</span>
                        <span className="text-zinc-500">TTC</span>
                        <span className="font-bold tabular-nums">{extracted.montant_ttc?.toFixed(2) ?? '—'} €</span>
                      </div>
                      {extracted.lignes.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-zinc-600 cursor-pointer">📋 {extracted.lignes.length} ligne(s)</summary>
                          <ul className="mt-1 space-y-0.5 text-xs">
                            {extracted.lignes.map((l, i) => (
                              <li key={i} className="flex justify-between gap-2 border-t pt-1">
                                <span className="truncate">{l.quantite ?? '?'} {l.unite ?? ''} {l.description}</span>
                                <span className="tabular-nums shrink-0">{l.total_ht?.toFixed(2) ?? '—'} €</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>

                    {hausses.length > 0 && (
                      <div className="rounded-md bg-amber-50 border border-amber-300 p-3 text-xs">
                        <p className="font-bold text-amber-900 mb-1">⚠️ {hausses.length} hausse(s) prix détectée(s) vs 90j</p>
                        <ul className="space-y-0.5">
                          {hausses.map((h, i) => (
                            <li key={i}>
                              {h.description} : <b>+{h.haussePct.toFixed(0)}%</b> ({h.prix_historique_moyen.toFixed(2)}€ → {h.prix_actuel.toFixed(2)}€)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Button onClick={() => onExtractionComplete(extracted)} className="w-full">
                      ✓ Pré-remplir la facture
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
