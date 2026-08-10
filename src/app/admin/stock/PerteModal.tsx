'use client'

import { useMemo, useState, useTransition } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { type Ingredient, fmtPrix } from '@/lib/stock'
import { perteStock } from './actions'

const MOTIFS_RAPIDES = [
  'DLC dépassée',
  'Cassé en livraison',
  'Périmé',
  'Mal conservé',
  'Vol / disparition',
  'Erreur cuisine',
]

export default function PerteModal({
  ingredients, ingredientPreselectionne, onClose, onSaved,
}: {
  ingredients: Ingredient[]
  ingredientPreselectionne: Ingredient | null
  onClose: () => void
  onSaved: () => void
}) {
  const [ingredientId, setIngredientId] = useState<string>(
    ingredientPreselectionne?.id ?? ingredients[0]?.id ?? ''
  )
  const [quantite, setQuantite] = useState<string>('1')
  const [motif, setMotif] = useState<string>('')
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  const ingredient = useMemo(
    () => ingredients.find(i => i.id === ingredientId),
    [ingredientId, ingredients]
  )

  const qte = parseFloat(quantite.replace(',', '.')) || 0
  const cout = qte * (ingredient?.prix_achat_ht ?? 0)

  function valider() {
    if (!ingredientId) { setErreur('Choisis un ingrédient'); return }
    if (qte <= 0)     { setErreur('Quantité > 0'); return }
    if (!motif.trim()) { setErreur('Motif obligatoire'); return }

    setErreur('')
    startTransition(async () => {
      try {
        await perteStock({ ingredient_id: ingredientId, quantite: qte, motif: motif.trim() })
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-lg">
      <DialogHeader onClose={onClose}>
        <DialogTitle>⚠️ Perte / casse</DialogTitle>
        <DialogDescription>
          Le stock est diminué et la perte est valorisée au prix d&apos;achat actuel. Le motif est obligatoire pour le bilan invendus.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="space-y-1.5">
          <Label>Ingrédient *</Label>
          <Select value={ingredientId} onChange={e => setIngredientId(e.target.value)}>
            {ingredients.filter(i => i.actif).map(i => (
              <option key={i.id} value={i.id}>
                {i.nom} ({i.categorie}) — stock {i.stock_actuel} {i.unite}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Quantité perdue *</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.001"
              min={0}
              max={ingredient?.stock_actuel}
              value={quantite}
              onChange={e => setQuantite(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground self-center w-10">{ingredient?.unite}</span>
          </div>
          {ingredient && qte > ingredient.stock_actuel && (
            <p className="text-xs text-amber-700">
              ⚠ Cela mettra le stock en négatif (théorique {ingredient.stock_actuel} {ingredient.unite}).
            </p>
          )}
        </div>

        <div className="rounded-md border bg-red-50 border-red-200 px-3 py-2 text-sm flex justify-between">
          <span className="text-red-800">Coût de la perte</span>
          <span className="font-bold tabular-nums text-red-900">{fmtPrix(cout)}</span>
        </div>

        <div className="space-y-1.5">
          <Label>Motif * <span className="text-xs font-normal text-muted-foreground">(obligatoire)</span></Label>
          <Textarea
            rows={2}
            value={motif}
            onChange={e => setMotif(e.target.value)}
            placeholder="Ex. : DLC dépassée — bottes flétries"
          />
          <div className="flex flex-wrap gap-1">
            {MOTIFS_RAPIDES.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMotif(m)}
                className="text-xs min-h-[40px] px-3 py-1 rounded-full border hover:bg-muted"
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {erreur && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {erreur}</p>}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
        <Button variant="destructive" onClick={valider} disabled={isPending}>
          {isPending ? 'Sauvegarde…' : '⚠ Enregistrer la perte'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
