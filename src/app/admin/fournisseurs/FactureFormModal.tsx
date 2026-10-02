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
    type_document?: 'facture' | 'avoir' | 'bon_livraison'
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
  const [typeDocument, setTypeDocument] = useState<'facture' | 'avoir' | 'bon_livraison'>(initial?.type_document ?? 'facture')
  const [factureLieeId, setFactureLieeId] = useState('')
  // Apparaît UNIQUEMENT quand le serveur a détecté un doublon : une case
  // toujours visible finirait cochée par habitude, et le garde-fou ne
  // servirait plus à rien.
  const [doublonDetecte, setDoublonDetecte] = useState(false)
  const [forcerDoublon, setForcerDoublon] = useState(false)
  const estAvoir = typeDocument === 'avoir'
  // ⚠️ Le BL dit ce qui est ARRIVÉ, la facture ce qu'on DOIT. Il ne porte
  // aucun montant : ses totaux sont forcés à zéro à l'enregistrement, parce
  // que le P&L, l'agent Financier, le pilotage et l'assistant somment les
  // factures sans regarder leur type (0166).
  const estBL = typeDocument === 'bon_livraison'
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
        const res = await createFacture({
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
          forcer_doublon: forcerDoublon,
        })
        // ⚠️ UN PRIX REFUSÉ QU'ON NE DIT PAS LAISSE CROIRE QUE TOUT EST PASSÉ.
        // Le document est bien enregistré — on ferme donc — mais le gérant doit
        // savoir qu'un coût d'achat n'a PAS été écrit, et pourquoi.
        if (res?.prix_refuses?.length) {
          setErreur('')
          alert(
            `Document enregistré.\n\n⚠️ ${res.prix_refuses.length} prix d'achat NON mis à jour, `
            + `parce que le calcul donnait un chiffre invraisemblable :\n\n`
            + res.prix_refuses.map(x => '• ' + x).join('\n\n')
            + `\n\nÀ corriger à la main dans la fiche produit si le tarif a vraiment changé.`)
        }
        onSaved()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur'
        setErreur(msg)
        if (/d[ée]j[àa] enregistr/i.test(msg)) setDoublonDetecte(true)
      }
    })
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-lg">
      <DialogHeader onClose={onClose}>
        <DialogTitle>{estAvoir ? '↩️ Nouvel avoir fournisseur' : estBL ? '🚚 Bon de livraison' : '➕ Nouvelle facture fournisseur'}</DialogTitle>
        <DialogDescription>
          {estBL
            ? 'Ce qui est arrivé : les quantités, pas les montants. Rattache-le à sa commande pour vérifier la livraison.'
            : 'Date d’échéance et statut servent aux alertes de paiement automatiques.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="space-y-1.5">
          <Label>Type de document</Label>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setTypeDocument('facture')}
              className={`min-h-[48px] rounded-md border font-bold text-sm transition-colors ${typeDocument === 'facture' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 hover:border-zinc-500'}`}>
              📄 Facture
            </button>
            <button type="button" onClick={() => setTypeDocument('bon_livraison')}
              className={`min-h-[48px] rounded-md border font-bold text-sm transition-colors ${estBL ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 hover:border-blue-500'}`}>
              🚚 Bon de livraison
            </button>
            <button type="button" onClick={() => setTypeDocument('avoir')}
              className={`min-h-[48px] rounded-md border font-bold text-sm transition-colors ${estAvoir ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300 hover:border-emerald-500'}`}>
              ↩️ Avoir
            </button>
          </div>
          {estBL && (
            <p className="text-xs text-blue-700">
              Ce qui est <strong>arrivé</strong>, pas ce qu&apos;on doit. Les montants sont ignorés — seules les
              lignes comptent, pour vérifier la livraison contre la commande et faire entrer la marchandise
              en stock. La facture se scanne séparément quand elle arrive, et se rattache à ce bon.
            </p>
          )}
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
            <Label>{estBL ? 'Commande à vérifier — recommandé' : 'Lié à un bon de commande (optionnel)'}</Label>
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
            <Label>{estBL ? 'N° du bon de livraison *' : 'N° facture *'}</Label>
            <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder={estBL ? 'BL-…' : 'FA-2024-001'} />
          </div>
          {/* ⚠️ Un BL ne se paie pas : ni statut, ni échéance, ni montant. Les
              demander, c'est faire saisir des chiffres qui n'existent pas sur
              le document — et c'est ce qui a bloqué le premier scan. */}
          <div className={`space-y-1.5${estBL ? ' hidden' : ''}`}>
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
          <div className={`space-y-1.5${estBL ? ' hidden' : ''}`}>
            <Label>Date échéance</Label>
            <Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} />
          </div>
        </div>

        {!estBL && (
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
        )}

        {initial?.lignes && initial.lignes.length > 0 && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900">
            📋 <b>{initial.lignes.length} ligne(s)</b> extraite(s)
            {(initial.nb_pages ?? 1) > 1 ? ` sur ${initial.nb_pages} pages` : ''} seront enregistrées.
            {estBL
              ? ' Elles font entrer la marchandise en stock et servent à vérifier la livraison contre la commande. Aucun prix d’achat ne sera modifié : ça, c’est le rôle de la facture.'
              : ' Les prix reconnus mettront à jour le prix d’achat des ingrédients correspondants — c’est ce qui alimente le calcul des marges.'}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>

        {erreur && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {erreur}</p>}
        {doublonDetecte && (
          <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm cursor-pointer">
            <input type="checkbox" checked={forcerDoublon}
              onChange={e => setForcerDoublon(e.target.checked)}
              className="mt-0.5 w-5 h-5 shrink-0" />
            <span className="text-amber-900">
              <b>Enregistrer quand même.</b> À ne cocher que si le fournisseur a
              réellement émis deux documents portant ce numéro — sinon tu comptes
              deux fois le même achat.
            </span>
          </label>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
        <Button onClick={valider} disabled={isPending}>{isPending ? 'Sauvegarde…' : estBL ? '✓ Enregistrer la livraison' : '✓ Créer'}</Button>
      </DialogFooter>
    </Dialog>
  )
}
