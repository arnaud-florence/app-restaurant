'use client'

import { useMemo, useState, useTransition } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { type Ingredient } from '@/lib/stock'
import { fmtPrix } from '@/lib/stock'
import { entreeStock } from './actions'

export default function EntreeModal({
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
  const [prixUnitaire, setPrixUnitaire] = useState<string>(
    String(ingredientPreselectionne?.prix_achat_ht ?? ingredients[0]?.prix_achat_ht ?? 0)
  )
  const [fournisseur, setFournisseur] = useState<string>(
    ingredientPreselectionne?.fournisseur_principal ?? ''
  )
  const [datePeremption, setDatePeremption] = useState<string>('')
  const [motif, setMotif] = useState<string>('')
  const [resetPrixRef, setResetPrixRef] = useState<boolean>(true)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  const ingredient = useMemo(
    () => ingredients.find(i => i.id === ingredientId),
    [ingredientId, ingredients]
  )

  // Quand on change d'ingrédient, pré-remplir le prix de référence
  function changerIngredient(id: string) {
    setIngredientId(id)
    const i = ingredients.find(x => x.id === id)
    if (i) {
      setPrixUnitaire(String(i.prix_achat_ht))
      setFournisseur(i.fournisseur_principal ?? '')
      // DLC suggérée selon dlc_moyenne_jours
      if (i.dlc_moyenne_jours > 0) {
        const d = new Date()
        d.setDate(d.getDate() + i.dlc_moyenne_jours)
        setDatePeremption(d.toISOString().slice(0, 10))
      } else {
        setDatePeremption('')
      }
    }
  }

  const qte = parseFloat(quantite.replace(',', '.')) || 0
  const px  = parseFloat(prixUnitaire.replace(',', '.')) || 0
  const cout = qte * px

  function valider() {
    if (!ingredientId) { setErreur('Choisis un ingrédient'); return }
    if (qte <= 0)     { setErreur('Quantité > 0'); return }

    setErreur('')
    startTransition(async () => {
      try {
        await entreeStock({
          ingredient_id: ingredientId,
          quantite: qte,
          prix_unitaire_ht: px,
          fournisseur: fournisseur || null,
          date_peremption: datePeremption || null,
          motif: motif || null,
          reset_prix_reference: resetPrixRef,
        })
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-lg">
      <DialogHeader onClose={onClose}>
        <DialogTitle>📥 Livraison fournisseur</DialogTitle>
        <DialogDescription>
          Le stock est augmenté et un mouvement « entrée » est tracé. Si le prix change, le prix de référence est mis à jour (logge l&apos;historique).
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="space-y-1.5">
          <Label>Ingrédient *</Label>
          <Select value={ingredientId} onChange={e => changerIngredient(e.target.value)}>
            {ingredients.filter(i => i.actif).map(i => (
              <option key={i.id} value={i.id}>{i.nom} ({i.categorie}) — {fmtPrix(i.prix_achat_ht)}/{i.unite}</option>
            ))}
          </Select>
          {ingredient && (
            <p className="text-xs text-muted-foreground">
              Stock actuel : {ingredient.stock_actuel} {ingredient.unite} · Min : {ingredient.stock_minimum}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Quantité reçue *</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.001"
                min={0}
                value={quantite}
                onChange={e => setQuantite(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground self-center w-10">{ingredient?.unite}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Prix unitaire HT (€)</Label>
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={prixUnitaire}
              onChange={e => setPrixUnitaire(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm flex justify-between">
          <span className="text-muted-foreground">Coût total</span>
          <span className="font-bold tabular-nums">{fmtPrix(cout)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>DLC (date de péremption)</Label>
            <Input
              type="date"
              value={datePeremption}
              onChange={e => setDatePeremption(e.target.value)}
            />
            {ingredient && ingredient.dlc_moyenne_jours > 0 && !datePeremption && (
              <p className="text-[10px] text-muted-foreground">
                ≈ {ingredient.dlc_moyenne_jours}j (moyenne ingrédient)
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Fournisseur</Label>
            <Input
              type="text"
              value={fournisseur}
              onChange={e => setFournisseur(e.target.value)}
              placeholder="Optionnel"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Motif / référence livraison</Label>
          <Textarea
            rows={2}
            value={motif}
            onChange={e => setMotif(e.target.value)}
            placeholder="Bon de livraison BL-2024-XXX"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3 bg-muted/40">
          <div className="min-w-0">
            <Label htmlFor="reset-prix" className="cursor-pointer">Mettre à jour le prix de référence</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Si le prix livré diffère, le nouveau devient la référence (et logge l&apos;historique).
            </p>
          </div>
          <Switch id="reset-prix" checked={resetPrixRef} onCheckedChange={setResetPrixRef} />
        </div>

        {erreur && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {erreur}</p>}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
        <Button onClick={valider} disabled={isPending}>
          {isPending ? 'Sauvegarde…' : '✓ Valider la livraison'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
