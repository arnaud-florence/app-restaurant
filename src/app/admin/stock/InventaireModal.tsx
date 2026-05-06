'use client'

import { useMemo, useState, useTransition } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type Ingredient, fmtPrix, fmtQte } from '@/lib/stock'
import { ajusterInventaire } from './actions'
import { cn } from '@/lib/utils'

export default function InventaireModal({
  ingredients, onClose, onSaved,
}: {
  ingredients: Ingredient[]
  onClose: () => void
  onSaved: () => void
}) {
  const actives = useMemo(() => ingredients.filter(i => i.actif), [ingredients])
  const [reels, setReels] = useState<Record<string, string>>(
    () => Object.fromEntries(actives.map(i => [i.id, String(i.stock_actuel)]))
  )
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function set(id: string, v: string) {
    setReels(prev => ({ ...prev, [id]: v }))
  }

  // Pré-calc des écarts
  const ecarts = useMemo(() => {
    return actives.map(i => {
      const reel = parseFloat(reels[i.id]?.replace(',', '.') ?? String(i.stock_actuel))
      const ecart = reel - i.stock_actuel
      return { i, reel, ecart, valeurEcart: ecart * i.prix_achat_ht }
    })
  }, [actives, reels])

  const ecartsNonNuls = ecarts.filter(e => Math.abs(e.ecart) > 0.0001)
  const totalValeur = ecartsNonNuls.reduce((s, e) => s + e.valeurEcart, 0)

  function valider() {
    if (ecartsNonNuls.length === 0) {
      setErreur('Aucun écart détecté — l\'inventaire est déjà à jour.')
      return
    }
    setErreur('')
    startTransition(async () => {
      try {
        for (const e of ecartsNonNuls) {
          await ajusterInventaire({ ingredient_id: e.i.id, stock_reel: e.reel })
        }
        onSaved()
      } catch (err) { setErreur(err instanceof Error ? err.message : 'Erreur') }
    })
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-3xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>📊 Inventaire physique</DialogTitle>
        <DialogDescription>
          Saisis le stock réel pour chaque ingrédient. Les écarts seront enregistrés en mouvements « inventaire » et le stock théorique sera aligné sur le réel.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3">Ingrédient</th>
                <th className="text-right py-2 px-2">Théorique</th>
                <th className="text-right py-2 px-2">Réel saisi</th>
                <th className="text-right py-2 px-2">Écart</th>
                <th className="text-right py-2 px-3">Valeur écart</th>
              </tr>
            </thead>
            <tbody>
              {ecarts.map(({ i, ecart, valeurEcart }) => {
                const couleur =
                  Math.abs(ecart) < 0.0001 ? 'text-muted-foreground' :
                  ecart < 0 ? 'text-red-700 font-semibold' :
                  'text-emerald-700 font-semibold'
                return (
                  <tr key={i.id} className="border-t">
                    <td className="py-2 px-3">
                      <p className="font-semibold">{i.nom}</p>
                      <p className="text-xs text-muted-foreground">{i.categorie} · {i.unite}</p>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {fmtQte(i.stock_actuel)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Input
                        type="number"
                        step="0.001"
                        min={0}
                        value={reels[i.id] ?? ''}
                        onChange={e => set(i.id, e.target.value)}
                        className="w-24 ml-auto h-9 text-right tabular-nums"
                      />
                    </td>
                    <td className={cn('py-2 px-2 text-right tabular-nums', couleur)}>
                      {ecart === 0 ? '0' : (ecart > 0 ? '+' : '') + fmtQte(ecart)}
                    </td>
                    <td className={cn('py-2 px-3 text-right tabular-nums', couleur)}>
                      {Math.abs(valeurEcart) < 0.005 ? '—' : fmtPrix(valeurEcart)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span>Ingrédients avec écart</span>
            <span className="font-bold tabular-nums">{ecartsNonNuls.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Valeur totale des écarts</span>
            <span className={cn('font-bold tabular-nums', totalValeur < 0 ? 'text-red-700' : totalValeur > 0 ? 'text-emerald-700' : '')}>
              {Math.abs(totalValeur) < 0.005 ? '—' : fmtPrix(totalValeur)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Un écart négatif = manque non comptabilisé (= perte cachée).
            Un écart positif = surplus (probable erreur de saisie initiale).
          </p>
        </div>

        {erreur && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {erreur}</p>}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
        <Button onClick={valider} disabled={isPending || ecartsNonNuls.length === 0}>
          {isPending ? 'Sauvegarde…' : `✓ Valider ${ecartsNonNuls.length} ajustement${ecartsNonNuls.length > 1 ? 's' : ''}`}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
