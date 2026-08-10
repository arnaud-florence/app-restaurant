'use client'

import { useMemo, useState, useTransition } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { type Fournisseur, type BonCommande, fmtPrix } from '@/lib/fournisseurs'
import { type Ingredient } from '../ingredients/types'
import { createBonCommande } from './actions'
import { cn } from '@/lib/utils'

type LigneEdit = {
  key: string                 // local key
  ingredient_id: string
  quantite_commandee: number
  prix_unitaire_ht: number
}

export default function BonCommandeFormModal({
  bon, fournisseurs, ingredients, onClose, onSaved, peutVoirPrix = true,
}: {
  bon: BonCommande | null
  fournisseurs: Fournisseur[]
  ingredients: Ingredient[]
  onClose: () => void
  onSaved: () => void
  peutVoirPrix?: boolean
}) {
  const isEdit = !!bon
  const [isPending, startTransition] = useTransition()
  const [erreur, setErreur] = useState('')

  const [fournisseurId, setFournisseurId] = useState(bon?.fournisseur_id ?? fournisseurs[0]?.id ?? '')
  const [statut, setStatut] = useState<BonCommande['statut']>(bon?.statut ?? 'brouillon')
  const [dateCommande, setDateCommande] = useState(bon?.date_commande ?? new Date().toISOString().slice(0, 10))
  const [dateLivraison, setDateLivraison] = useState(bon?.date_livraison_prevue ?? '')
  const [notes, setNotes] = useState(bon?.notes ?? '')
  const [lignes, setLignes] = useState<LigneEdit[]>(
    (bon?.lignes ?? [])
      .filter(l => l.ingredient_id)
      .map(l => ({
        key: l.id,
        ingredient_id: l.ingredient_id!,
        quantite_commandee: l.quantite_commandee,
        prix_unitaire_ht: l.prix_unitaire_ht,
      }))
  )
  const [pickerId, setPickerId] = useState(ingredients[0]?.id ?? '')

  const total = useMemo(
    () => lignes.reduce((s, l) => s + l.quantite_commandee * l.prix_unitaire_ht, 0),
    [lignes]
  )

  function ajouter() {
    if (!pickerId) return
    const ing = ingredients.find(i => i.id === pickerId)
    if (!ing) return
    if (lignes.some(l => l.ingredient_id === ing.id)) return
    setLignes([...lignes, {
      key: 'new-' + Math.random().toString(36).slice(2),
      ingredient_id: ing.id,
      quantite_commandee: 1,
      prix_unitaire_ht: ing.prix_achat_ht,
    }])
  }
  function modifier(key: string, patch: Partial<LigneEdit>) {
    setLignes(lignes.map(l => l.key === key ? { ...l, ...patch } : l))
  }
  function supprimer(key: string) {
    setLignes(lignes.filter(l => l.key !== key))
  }

  function valider() {
    if (!fournisseurId) { setErreur('Choisis un fournisseur'); return }
    if (lignes.length === 0) { setErreur('Ajoute au moins une ligne'); return }
    if (lignes.some(l => l.quantite_commandee <= 0)) { setErreur('Quantités > 0'); return }
    setErreur('')
    startTransition(async () => {
      try {
        await createBonCommande({
          fournisseur_id: fournisseurId,
          statut,
          date_commande: dateCommande,
          date_livraison_prevue: dateLivraison || null,
          notes: notes || null,
          lignes: lignes.map(l => ({
            ingredient_id: l.ingredient_id,
            quantite_commandee: l.quantite_commandee,
            prix_unitaire_ht: l.prix_unitaire_ht,
          })),
        })
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  const ingMap = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients])

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-3xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>{isEdit ? `📝 Bon de commande — détails` : '➕ Nouveau bon de commande'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Détails du bon. La modification des lignes existantes sera ajoutée dans une prochaine version (utiliser Réception pour les quantités reçues).'
            : 'Sélectionne un fournisseur, ajoute les ingrédients à commander.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {!isEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fournisseur *</Label>
              <Select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={statut} onChange={e => setStatut(e.target.value as BonCommande['statut'])}>
                <option value="brouillon">📝 Brouillon</option>
                <option value="envoye">📧 Envoyé</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date de commande</Label>
              <Input type="date" value={dateCommande} onChange={e => setDateCommande(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Livraison prévue</Label>
              <Input type="date" value={dateLivraison} onChange={e => setDateLivraison(e.target.value)} />
            </div>
          </div>
        )}

        {isEdit && bon && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <p><b>Fournisseur :</b> {bon.fournisseur_nom}</p>
            <p><b>Date :</b> {bon.date_commande}{bon.date_livraison_prevue && ` · Livraison ${bon.date_livraison_prevue}`}</p>
            {peutVoirPrix && <p><b>Total HT :</b> {fmtPrix(bon.montant_total_ht)}</p>}
            {bon.notes && <p className="italic text-muted-foreground">{bon.notes}</p>}
          </div>
        )}

        <Separator />

        {/* Picker ligne */}
        {!isEdit && (
          <div className="rounded-md border p-3 bg-muted/30 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:items-end">
            <div className="space-y-1.5">
              <Label>Ajouter un ingrédient</Label>
              <Select value={pickerId} onChange={e => setPickerId(e.target.value)}>
                {ingredients.map(i => (
                  <option key={i.id} value={i.id}>{i.nom} — stock {i.stock_actuel} {i.unite}{peutVoirPrix ? ` — ${fmtPrix(i.prix_achat_ht)}/${i.unite}` : ''}</option>
                ))}
              </Select>
            </div>
            <Button type="button" onClick={ajouter}>+ Ajouter</Button>
          </div>
        )}

        {/* Liste des lignes */}
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            Aucune ligne — ajoute au moins un ingrédient.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left  py-2 px-3">Ingrédient</th>
                  <th className="text-right py-2 px-2">Quantité</th>
                  {peutVoirPrix && <th className="text-right py-2 px-2">Prix HT</th>}
                  {peutVoirPrix && <th className="text-right py-2 px-2">Total</th>}
                  {!isEdit && <th className="text-right py-2 px-3"></th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => {
                  const ing = ingMap.get(l.ingredient_id)
                  return (
                    <tr key={l.key} className="border-t">
                      <td className="py-2 px-3">
                        <p className="font-semibold text-sm truncate">{ing?.nom ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">{ing?.unite}</p>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {isEdit ? (
                          <span className="tabular-nums">{l.quantite_commandee}</span>
                        ) : (
                          <Input
                            type="number" step="0.001" min={0}
                            value={l.quantite_commandee}
                            onChange={e => modifier(l.key, { quantite_commandee: parseFloat(e.target.value) || 0 })}
                            className="h-9 w-24 ml-auto text-right tabular-nums"
                          />
                        )}
                      </td>
                      {peutVoirPrix && (
                        <td className="py-2 px-2 text-right">
                          {isEdit ? (
                            <span className="tabular-nums">{fmtPrix(l.prix_unitaire_ht)}</span>
                          ) : (
                            <Input
                              type="number" step="0.0001" min={0}
                              value={l.prix_unitaire_ht}
                              onChange={e => modifier(l.key, { prix_unitaire_ht: parseFloat(e.target.value) || 0 })}
                              className="h-9 w-24 ml-auto text-right tabular-nums"
                            />
                          )}
                        </td>
                      )}
                      {peutVoirPrix && (
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">
                          {fmtPrix(l.quantite_commandee * l.prix_unitaire_ht)}
                        </td>
                      )}
                      {!isEdit && (
                        <td className="py-2 px-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => supprimer(l.key)} className="text-destructive">×</Button>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {peutVoirPrix && (
                  <tr className="border-t bg-muted/40 font-bold">
                    <td colSpan={3} className="py-2 px-3 text-right">Total HT</td>
                    <td className={cn('py-2 px-2 text-right tabular-nums')}>{fmtPrix(total)}</td>
                    {!isEdit && <td />}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!isEdit && (
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        )}

        {erreur && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {erreur}</p>}
      </DialogBody>

      <DialogFooter>
        {isEdit ? (
          <Button onClick={onClose}>Fermer</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
            <Button onClick={valider} disabled={isPending || lignes.length === 0}>
              {isPending ? 'Sauvegarde…' : '✓ Créer le bon'}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  )
}
