'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { type BonCommande, type BonCommandeLigne, ETAT_EMBALLAGE_LABEL } from '@/lib/fournisseurs'
import { enregistrerReception } from './actions'
import { cn } from '@/lib/utils'

type LigneEdit = {
  ligne_id: string
  quantite_recue: number
  temperature_reception: string
  dlc_observee: string
  etat_emballage: BonCommandeLigne['etat_emballage'] | ''
  note_qualite_ligne: number | null
  commentaire: string
  ingredient_nom: string
  ingredient_unite: string
  quantite_commandee: number
}

export default function ReceptionModal({
  bon, onClose, onSaved,
}: {
  bon: BonCommande
  onClose: () => void
  onSaved: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [erreur, setErreur] = useState('')

  const [lignes, setLignes] = useState<LigneEdit[]>(
    bon.lignes.map(l => ({
      ligne_id: l.id,
      quantite_recue: l.quantite_recue || l.quantite_commandee,
      temperature_reception: l.temperature_reception != null ? String(l.temperature_reception) : '',
      dlc_observee: l.dlc_observee ?? '',
      etat_emballage: l.etat_emballage ?? '',
      note_qualite_ligne: l.note_qualite_ligne ?? 5,
      commentaire: l.commentaire ?? '',
      ingredient_nom: l.ingredient_nom ?? '—',
      ingredient_unite: l.ingredient_unite ?? '',
      quantite_commandee: l.quantite_commandee,
    }))
  )

  function set(idx: number, patch: Partial<LigneEdit>) {
    setLignes(lignes.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function valider() {
    setErreur('')
    startTransition(async () => {
      try {
        await enregistrerReception(bon.id, lignes.map(l => ({
          ligne_id: l.ligne_id,
          quantite_recue: l.quantite_recue,
          temperature_reception: l.temperature_reception ? parseFloat(l.temperature_reception) : null,
          dlc_observee: l.dlc_observee || null,
          etat_emballage: l.etat_emballage || null,
          note_qualite_ligne: l.note_qualite_ligne,
          commentaire: l.commentaire || null,
        })))
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-3xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>📥 Réception marchandises</DialogTitle>
        <DialogDescription>
          Bon de {bon.fournisseur_nom} · {bon.lignes.length} ligne{bon.lignes.length > 1 ? 's' : ''}.
          Renseigne quantité reçue, température, DLC, état de l&apos;emballage et qualité pour chaque ligne.
          La validation injecte les entrées en stock et passe le bon au statut « Reçu ».
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        {lignes.map((l, idx) => {
          const ecart = l.quantite_recue - l.quantite_commandee
          return (
            <div key={l.ligne_id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="font-bold text-sm truncate">{l.ingredient_nom}</p>
                <p className="text-[11px] text-muted-foreground">
                  Commandé : <b>{l.quantite_commandee} {l.ingredient_unite}</b>
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Reçue *</Label>
                  <Input
                    type="number" step="0.001" min={0}
                    value={l.quantite_recue}
                    onChange={e => set(idx, { quantite_recue: parseFloat(e.target.value) || 0 })}
                    className="h-9 text-right tabular-nums"
                  />
                  {Math.abs(ecart) > 0.0001 && (
                    <p className={cn('text-[10px] tabular-nums', ecart < 0 ? 'text-red-700' : 'text-amber-700')}>
                      {ecart > 0 ? '+' : ''}{ecart.toFixed(2)} {l.ingredient_unite}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Temp. (°C)</Label>
                  <Input
                    type="number" step="0.1"
                    value={l.temperature_reception}
                    onChange={e => set(idx, { temperature_reception: e.target.value })}
                    placeholder="4"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">DLC observée</Label>
                  <Input
                    type="date"
                    value={l.dlc_observee}
                    onChange={e => set(idx, { dlc_observee: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">État emballage</Label>
                  <Select
                    value={l.etat_emballage ?? ''}
                    onChange={e => set(idx, { etat_emballage: (e.target.value || '') as BonCommandeLigne['etat_emballage'] | '' })}
                    className="h-9"
                  >
                    <option value="">—</option>
                    {(Object.keys(ETAT_EMBALLAGE_LABEL) as Array<keyof typeof ETAT_EMBALLAGE_LABEL>).map(k => (
                      <option key={k} value={k}>{ETAT_EMBALLAGE_LABEL[k].label}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Qualité — {l.note_qualite_ligne ?? '—'}/5</Label>
                  <input
                    type="range" min={0} max={5} step={1}
                    value={l.note_qualite_ligne ?? 0}
                    onChange={e => set(idx, { note_qualite_ligne: parseInt(e.target.value, 10) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Commentaire</Label>
                  <Input
                    value={l.commentaire}
                    onChange={e => set(idx, { commentaire: e.target.value })}
                    placeholder="Optionnel"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          )
        })}

        {lignes.some(l => l.etat_emballage === 'rejete') && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            ⚠ Au moins une ligne est marquée <b>Rejeté</b> — la quantité reçue ne sera pas mise en stock.
          </p>
        )}

        {erreur && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {erreur}</p>}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
        <Button variant="success" onClick={valider} disabled={isPending}>
          {isPending ? 'Sauvegarde…' : '✓ Valider la réception'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
