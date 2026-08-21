'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { type Fournisseur, type BonCommande, type Facture } from '@/lib/fournisseurs'
import { createFacture } from './actions'

export default function FactureFormModal({
  fournisseurs, bons, factures = [], onClose, onSaved, initial,
}: {
  fournisseurs: Fournisseur[]
  bons: BonCommande[]
  /** Factures existantes — pour lier un avoir à sa facture d'origine */
  factures?: Facture[]
  onClose: () => void
  onSaved: () => void
  /** Données pré-remplies (ex: depuis le Scanner OCR) */
  initial?: {
    fournisseur_nom?: string | null
    numero?: string | null
    date_emission?: string | null
    date_echeance?: string | null
    montant_ht?: number | null
    montant_ttc?: number | null
    notes?: string | null
    lignes?: Array<{
      description: string
      quantite: number | null
      unite: string | null
      prix_unitaire_ht: number | null
      total_ht: number | null
    }>
    nb_pages?: number
    type_document?: 'facture' | 'avoir'
  }
}) {
  const [isPending, startTransition] = useTransition()
  const [erreur, setErreur] = useState('')

  // Si un nom de fournisseur est fourni (scan OCR), tente de matcher dans la liste
  const fournisseurInitId = (() => {
    if (initial?.fournisseur_nom) {
      const cible = initial.fournisseur_nom.toLowerCase().trim()
      const match = fournisseurs.find(f =>
        f.nom.toLowerCase().includes(cible) || cible.includes(f.nom.toLowerCase()),
      )
      if (match) return match.id
    }
    return fournisseurs[0]?.id ?? ''
  })()

  const [fournisseurId, setFournisseurId] = useState(fournisseurInitId)
  const [bonId, setBonId] = useState<string>('')
  const [numero, setNumero] = useState(initial?.numero ?? '')
  const [dateEmission, setDateEmission] = useState(initial?.date_emission ?? new Date().toISOString().slice(0, 10))
  const [dateEcheance, setDateEcheance] = useState(() => {
    if (initial?.date_echeance) return initial.date_echeance
    const d = new Date(); d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [montantHT, setMontantHT] = useState(initial?.montant_ht != null ? String(initial.montant_ht) : '0')
  const [montantTTC, setMontantTTC] = useState(initial?.montant_ttc != null ? String(initial.montant_ttc) : '0')
  const [statut, setStatut] = useState<Facture['statut']>('a_payer')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [typeDocument, setTypeDocument] = useState<'facture' | 'avoir'>(initial?.type_document ?? 'facture')
  const [factureLieeId, setFactureLieeId] = useState('')
  const estAvoir = typeDocument === 'avoir'
  const facturesDuFournisseur = factures.filter(f =>
    f.fournisseur_id === fournisseurId && f.type_document !== 'avoir')

  const bonsDuFournisseur = bons.filter(b => b.fournisseur_id === fournisseurId)

  function selectBon(id: string) {
    setBonId(id)
    if (!id) return
    const bon = bons.find(b => b.id === id)
    if (bon) {
      setMontantHT(String(bon.montant_total_ht))
      // TVA présumée à 20% (alcool/produits frais standards) — l'utilisateur ajustera
      setMontantTTC((bon.montant_total_ht * 1.2).toFixed(2))
      if (!numero) setNumero('FA-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase())
    }
  }

  function valider() {
    if (!fournisseurId) { setErreur('Choisis un fournisseur'); return }
    if (!numero.trim()) { setErreur('Numéro de facture obligatoire'); return }
    setErreur('')
    startTransition(async () => {
      try {
        await createFacture({
          fournisseur_id: fournisseurId,
          bon_commande_id: bonId || null,
          numero: numero.trim(),
          date_emission: dateEmission,
          date_echeance: dateEcheance || null,
          montant_ht: parseFloat(montantHT) || 0,
          montant_ttc: parseFloat(montantTTC) || 0,
          statut,
          notes: notes || null,
          lignes: initial?.lignes ?? [],
          nb_pages: initial?.nb_pages ?? 1,
          type_document: typeDocument,
          facture_liee_id: factureLieeId || null,
        })
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-lg">
      <DialogHeader onClose={onClose}>
        <DialogTitle>{estAvoir ? '↩️ Nouvel avoir fournisseur' : '➕ Nouvelle facture fournisseur'}</DialogTitle>
        <DialogDescription>
          Date d&apos;échéance et statut servent aux alertes de paiement automatiques.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="space-y-1.5">
          <Label>Type de document</Label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTypeDocument('facture')}
              className={`min-h-[48px] rounded-md border font-bold text-sm transition-colors ${!estAvoir ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 hover:border-zinc-500'}`}>
              📄 Facture
            </button>
            <button type="button" onClick={() => setTypeDocument('avoir')}
              className={`min-h-[48px] rounded-md border font-bold text-sm transition-colors ${estAvoir ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300 hover:border-emerald-500'}`}>
              ↩️ Avoir (le fournisseur nous doit)
            </button>
          </div>
          {estAvoir && (
            <p className="text-xs text-emerald-700">
              Saisis les montants en positif — l&apos;avoir viendra automatiquement en déduction des dettes fournisseur.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Fournisseur *</Label>
          <Select value={fournisseurId} onChange={e => { setFournisseurId(e.target.value); setBonId('') }}>
            {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </Select>
        </div>

        {estAvoir && facturesDuFournisseur.length > 0 && (
          <div className="space-y-1.5">
            <Label>Facture d&apos;origine (optionnel)</Label>
            <Select value={factureLieeId} onChange={e => setFactureLieeId(e.target.value)}>
              <option value="">— Aucune (geste commercial…) —</option>
              {facturesDuFournisseur.map(f => (
                <option key={f.id} value={f.id}>
                  {f.numero} · {f.date_emission} · {f.montant_ttc.toFixed(2)} €
                </option>
              ))}
            </Select>
          </div>
        )}

        {!estAvoir && bonsDuFournisseur.length > 0 && (
          <div className="space-y-1.5">
            <Label>Lié à un bon de commande (optionnel)</Label>
            <Select value={bonId} onChange={e => selectBon(e.target.value)}>
              <option value="">— Aucun —</option>
              {bonsDuFournisseur.map(b => (
                <option key={b.id} value={b.id}>
                  {b.statut} · {b.date_commande} · {b.montant_total_ht.toFixed(2)} €
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>N° facture *</Label>
            <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="FA-2024-001" />
          </div>
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <Select value={statut} onChange={e => setStatut(e.target.value as Facture['statut'])}>
              <option value="a_payer">À payer</option>
              <option value="paye">Payée</option>
              <option value="en_retard">En retard</option>
              <option value="litige">Litige</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Date émission</Label>
            <Input type="date" value={dateEmission} onChange={e => setDateEmission(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date échéance</Label>
            <Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Montant HT (€)</Label>
            <Input type="number" step="0.01" min={0} value={montantHT} onChange={e => setMontantHT(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Montant TTC (€)</Label>
            <Input type="number" step="0.01" min={0} value={montantTTC} onChange={e => setMontantTTC(e.target.value)} />
          </div>
        </div>

        {initial?.lignes && initial.lignes.length > 0 && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900">
            📋 <b>{initial.lignes.length} ligne(s)</b> extraite(s)
            {(initial.nb_pages ?? 1) > 1 ? ` sur ${initial.nb_pages} pages` : ''} seront enregistrées
            avec la facture. Les prix reconnus mettront à jour le prix d&apos;achat des ingrédients
            correspondants — c&apos;est ce qui alimente le calcul des marges.
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>

        {erreur && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {erreur}</p>}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
        <Button onClick={valider} disabled={isPending}>{isPending ? 'Sauvegarde…' : '✓ Créer'}</Button>
      </DialogFooter>
    </Dialog>
  )
}
