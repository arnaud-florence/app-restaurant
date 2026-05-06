'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type LigneCourse, listeCoursesEnTexte, fmtPrix, fmtQte, totalListeCourses } from '@/lib/stock'

export default function ListeCoursesModal({
  items, onClose,
}: {
  items: LigneCourse[]
  onClose: () => void
}) {
  const [copyMsg, setCopyMsg] = useState('')
  const txt = useMemo(() => listeCoursesEnTexte(items), [items])
  const total = useMemo(() => totalListeCourses(items), [items])

  // Groupage par fournisseur
  const groupes = useMemo(() => {
    const m = new Map<string, LigneCourse[]>()
    for (const l of items) {
      const k = l.fournisseur ?? '— fournisseur non défini —'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(l)
    }
    return Array.from(m.entries())
  }, [items])

  function copier() {
    navigator.clipboard.writeText(txt).then(
      () => { setCopyMsg('Copié dans le presse-papiers !'); setTimeout(() => setCopyMsg(''), 2000) },
      () => { setCopyMsg('Impossible de copier — copie manuellement.') }
    )
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-2xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>🛒 Liste de courses auto-générée</DialogTitle>
        <DialogDescription>
          {items.length === 0
            ? 'Aucun ingrédient sous le seuil minimum.'
            : `${items.length} ingrédient${items.length > 1 ? 's' : ''} sous le seuil minimum, regroupés par fournisseur.`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-5xl mb-2">✅</p>
            <p className="font-semibold">Tous les stocks sont au-dessus du seuil minimum.</p>
            <p className="text-sm text-muted-foreground mt-1">Rien à commander pour l&apos;instant.</p>
          </div>
        ) : (
          <>
            {groupes.map(([fournisseur, lignes]) => (
              <div key={fournisseur} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{fournisseur}</p>
                  <Badge variant="outline">
                    {fmtPrix(lignes.reduce((s, l) => s + l.cout_estime, 0))}
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {lignes.map(l => (
                    <li key={l.ingredient_id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{l.nom}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Stock {fmtQte(l.stock_actuel)} {l.unite} · min {fmtQte(l.stock_minimum)} {l.unite}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold tabular-nums">{fmtQte(l.qte_a_commander)} {l.unite}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">{fmtPrix(l.cout_estime)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="rounded-md bg-muted/40 px-3 py-2 flex justify-between items-center">
              <span className="text-sm font-semibold">Total estimé</span>
              <span className="font-bold text-lg tabular-nums">{fmtPrix(total)}</span>
            </div>

            <details className="rounded-md border">
              <summary className="px-3 py-2 cursor-pointer text-sm font-semibold flex items-center justify-between">
                <span>📋 Format texte (copiable)</span>
                <span className="text-xs text-muted-foreground">{copyMsg || 'Cliquer pour afficher'}</span>
              </summary>
              <pre className="px-3 py-2 text-xs bg-muted/30 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">{txt}</pre>
            </details>
          </>
        )}
      </DialogBody>

      <DialogFooter>
        {items.length > 0 && (
          <Button variant="outline" onClick={copier}>
            📋 Copier
          </Button>
        )}
        <Button onClick={onClose}>Fermer</Button>
      </DialogFooter>
    </Dialog>
  )
}
