'use client'

// Composant UI pour l'Agent 8 Scanner : photos des pages d'une facture
// (une ou plusieurs), envoi groupé à /api/agents/scanner, affichage du
// résultat extrait par Claude Vision, puis bouton "Créer la facture" qui
// pré-remplit le formulaire d'édition.
//
// Multi-pages : les factures Metro/Transgourmet font souvent 2-4 pages.
// On accumule les photos et on les envoie dans UN SEUL appel — c'est la
// route qui demande à Claude un JSON unique couvrant toutes les pages.
//
// Chaque photo est réduite côté client (max 1600 px, JPEG q0.82) AVANT
// l'envoi : 3 photos d'iPhone en base64 dépasseraient la limite de corps de
// requête de Vercel (~4,5 Mo) — et Claude lit très bien une facture à
// 1600 px.

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type LigneExtraite = {
  description: string
  quantite: number | null
  unite: string | null
  prix_unitaire_ht: number | null
  total_ht: number | null
}

export type FactureExtraite = {
  type: 'facture' | 'avoir' | 'bon_livraison' | 'ticket' | 'inconnu'
  fournisseur_nom: string | null
  numero: string | null
  date_emission: string | null
  date_echeance: string | null
  montant_ht: number | null
  montant_ttc: number | null
  montant_tva: number | null
  lignes: LigneExtraite[]
  confiance: number
  notes: string | null
  /** Renseigné par ce composant, pas par Claude */
  nb_pages?: number
}

type HausseDetectee = {
  description: string
  prix_actuel: number
  prix_historique_moyen: number
  haussePct: number
}

/** Réduit une photo à 1600 px max côté long, JPEG qualité 0.82. */
async function reduirePhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onloadend = () => res(r.result as string)
    r.onerror = () => rej(new Error('Lecture du fichier échouée'))
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('Image illisible'))
    i.src = dataUrl
  })
  const MAX = 1600
  const ratio = Math.min(1, MAX / Math.max(img.width, img.height))
  // Déjà petite : on garde l'original (re-compresser dégraderait pour rien)
  if (ratio === 1 && file.size < 1024 * 1024) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * ratio)
  canvas.height = Math.round(img.height * ratio)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export default function FactureScanner({
  onExtractionComplete,
  onClose,
}: {
  /** Appelé quand l'utilisateur valide → ouvre le form facture pré-rempli */
  onExtractionComplete: (data: FactureExtraite) => void
  onClose: () => void
}) {
  // Deux inputs distincts : `capture="environment"` ouvre directement
  // l'appareil photo sur mobile — mais sur la plupart des Android il EMPÊCHE
  // de choisir dans la bibliothèque. Un seul input ne peut pas faire les
  // deux ; chaque bouton déclenche le sien.
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerieRef = useRef<HTMLInputElement>(null)
  const [pages, setPages] = useState<string[]>([])
  const [extracted, setExtracted] = useState<FactureExtraite | null>(null)
  const [hausses, setHausses] = useState<HausseDetectee[]>([])
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const [dragging, setDragging] = useState(false)

  function reset() {
    setPages([]); setExtracted(null); setHausses([]); setErreur('')
    if (cameraRef.current) cameraRef.current.value = ''
    if (galerieRef.current) galerieRef.current.value = ''
  }

  async function ajouterFichiers(files: FileList | File[]) {
    setErreur('')
    // Ajouter une page invalide le résultat précédent : il ne couvre plus tout
    setExtracted(null); setHausses([])
    const liste = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (liste.length === 0) { setErreur('Sélectionne une image (JPG, PNG, WEBP).'); return }
    if (pages.length + liste.length > 8) { setErreur('Maximum 8 pages par facture.'); return }
    try {
      const reduites = await Promise.all(liste.map(reduirePhoto))
      setPages(p => [...p, ...reduites])
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des images échouée')
    }
    if (cameraRef.current) cameraRef.current.value = ''
    if (galerieRef.current) galerieRef.current.value = ''
  }

  async function analyser() {
    if (pages.length === 0) return
    setLoading(true)
    setErreur('')
    setExtracted(null)
    setHausses([])
    try {
      const images = pages.map(p => {
        const m = p.match(/^data:(image\/[a-z]+);base64,(.+)$/)
        if (!m) throw new Error('Format image non reconnu.')
        return { image_base64: m[2], media_type: m[1] }
      })
      const r = await fetch('/api/agents/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      const json = await r.json()
      if (!r.ok || !json.ok) throw new Error(json.error ?? `HTTP ${r.status}`)
      if (json.extracted) {
        setExtracted({ ...(json.extracted as FactureExtraite), nb_pages: pages.length })
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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl bg-background max-h-[90vh] overflow-y-auto">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">📷 Scanner une facture</h2>
              <p className="text-xs text-zinc-500">
                Photographie chaque page, puis lance l&apos;analyse : Claude Vision lit l&apos;ensemble et pré-remplit le formulaire.
              </p>
            </div>
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full hover:bg-zinc-100 text-2xl leading-none">×</button>
          </header>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { if (e.target.files?.length) ajouterFichiers(e.target.files) }}
          />
          <input
            ref={galerieRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files?.length) ajouterFichiers(e.target.files) }}
          />

          {/* Zone drop initiale */}
          {pages.length === 0 && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault(); setDragging(false)
                if (e.dataTransfer.files.length) ajouterFichiers(e.dataTransfer.files)
              }}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                dragging ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-300',
              )}
            >
              <p className="text-4xl mb-2">📄</p>
              <p className="font-semibold mb-1">Glisse la ou les pages ici</p>
              <p className="text-xs text-zinc-500 mb-3">
                Une facture de plusieurs pages ? Ajoute-les toutes avant d&apos;analyser.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button type="button" variant="outline" className="min-h-[48px]" onClick={() => cameraRef.current?.click()}>
                  📷 Prendre une photo
                </Button>
                <Button type="button" variant="outline" className="min-h-[48px]" onClick={() => galerieRef.current?.click()}>
                  🖼️ Choisir dans la bibliothèque
                </Button>
              </div>
            </div>
          )}

          {/* Liasse + résultat */}
          {pages.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {pages.map((p, i) => (
                    <div key={i} className="relative rounded-md border bg-zinc-50 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt={`Page ${i + 1}`} className="w-full h-36 object-contain" />
                      <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-black/60 text-white rounded px-1.5 py-0.5">
                        p.{i + 1}
                      </span>
                      <button
                        onClick={() => {
                          setPages(ps => ps.filter((_, j) => j !== i))
                          setExtracted(null); setHausses([])
                        }}
                        aria-label={`Retirer la page ${i + 1}`}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm leading-none hover:bg-red-600"
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => cameraRef.current?.click()} variant="outline" size="sm" className="flex-1" disabled={loading}>
                    📷 Photo
                  </Button>
                  <Button onClick={() => galerieRef.current?.click()} variant="outline" size="sm" className="flex-1" disabled={loading}>
                    🖼️ Bibliothèque
                  </Button>
                  <Button onClick={reset} variant="outline" size="sm" disabled={loading}>↺</Button>
                </div>
                {!extracted && (
                  <Button onClick={analyser} disabled={loading} className="w-full">
                    {loading ? '⏳ Analyse en cours…' : `🔍 Analyser ${pages.length > 1 ? `les ${pages.length} pages` : 'la facture'}`}
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                {loading && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">
                    <p className="font-semibold">⏳ Claude Vision lit {pages.length > 1 ? `les ${pages.length} pages` : 'la facture'}…</p>
                    <p className="text-xs text-zinc-600 mt-1">Durée 5-15 sec selon le nombre de pages</p>
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
                        {pages.length > 1 && <span className="text-[11px] text-zinc-500">{pages.length} pages fusionnées</span>}
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
                        <details className="mt-2" open={extracted.lignes.length <= 8}>
                          <summary className="text-xs text-zinc-600 cursor-pointer">📋 {extracted.lignes.length} ligne(s)</summary>
                          <ul className="mt-1 space-y-0.5 text-xs max-h-48 overflow-y-auto">
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
