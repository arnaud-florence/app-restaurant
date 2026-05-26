'use client'

import { useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { type BonCommande, type Fournisseur, fmtPrix } from '@/lib/fournisseurs'

export default function BonCommandePrintClient({
  bon, fournisseur, etablissement,
}: {
  bon: BonCommande
  fournisseur: Fournisseur | null
  etablissement: Record<string, string>
}) {
  // Auto-print si ?auto-print=1 dans l'URL (option future)
  useEffect(() => {
    // Pas d'auto-print pour ne pas surprendre, l'utilisateur clique le bouton.
  }, [])

  const total = bon.lignes.reduce((s, l) => s + l.quantite_commandee * l.prix_unitaire_ht, 0)

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 1cm; }
          body { background: white; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto bg-white shadow-lg p-8 print:shadow-none print:max-w-none">
        {/* Actions (cachées à l'impression) */}
        <div className="no-print flex justify-between mb-6 gap-2">
          <Button variant="outline" onClick={() => window.history.back()}>← Retour</Button>
          <Button onClick={() => window.print()}>🖨 Imprimer / PDF</Button>
        </div>

        {/* En-tête */}
        <div className="grid grid-cols-2 gap-6 pb-6 border-b-2 border-zinc-900">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">De</p>
            <p className="font-bold text-lg">{etablissement.etablissement_nom || 'CASATASIA'}</p>
            {etablissement.etablissement_adresse && <p className="text-sm whitespace-pre-line">{etablissement.etablissement_adresse}</p>}
            {etablissement.etablissement_telephone && <p className="text-sm">📞 {etablissement.etablissement_telephone}</p>}
            {etablissement.etablissement_email && <p className="text-sm">✉️ {etablissement.etablissement_email}</p>}
            {etablissement.etablissement_siret && <p className="text-xs text-zinc-500 mt-1">SIRET : {etablissement.etablissement_siret}</p>}
            {etablissement.etablissement_tva_intra && <p className="text-xs text-zinc-500">TVA : {etablissement.etablissement_tva_intra}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Bon de commande n°</p>
            <p className="font-mono font-bold text-lg">{bon.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-sm text-zinc-600 mt-2">Émis le {format(parseISO(bon.date_commande), 'd MMMM yyyy', { locale: fr })}</p>
            {bon.date_livraison_prevue && (
              <p className="text-sm text-zinc-600">Livraison souhaitée : <b>{format(parseISO(bon.date_livraison_prevue), 'd MMMM yyyy', { locale: fr })}</b></p>
            )}
          </div>
        </div>

        {/* Fournisseur */}
        <div className="my-6">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Pour</p>
          <p className="font-bold">{fournisseur?.nom ?? bon.fournisseur_nom ?? '—'}</p>
          {fournisseur?.contact && <p className="text-sm">À l&apos;attention de : {fournisseur.contact}</p>}
          {fournisseur?.adresse && <p className="text-sm whitespace-pre-line text-zinc-700">{fournisseur.adresse}</p>}
          {fournisseur?.email && <p className="text-sm text-zinc-700">✉️ {fournisseur.email}</p>}
          {fournisseur?.telephone && <p className="text-sm text-zinc-700">📞 {fournisseur.telephone}</p>}
        </div>

        {/* Lignes */}
        <table className="w-full text-sm border-collapse mt-6">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-xs font-bold uppercase tracking-wider">
              <th className="text-left  py-2 pr-2">Désignation</th>
              <th className="text-right py-2 px-2 w-24">Qté</th>
              <th className="text-right py-2 px-2 w-28">PU HT</th>
              <th className="text-right py-2 pl-2 w-32">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {bon.lignes.map(l => (
              <tr key={l.id} className="border-b border-zinc-200">
                <td className="py-2 pr-2">{l.ingredient_nom ?? '—'}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {l.quantite_commandee} {l.ingredient_unite}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtPrix(l.prix_unitaire_ht)}</td>
                <td className="py-2 pl-2 text-right tabular-nums font-semibold">
                  {fmtPrix(l.quantite_commandee * l.prix_unitaire_ht)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-900 font-bold">
              <td colSpan={3} className="py-3 pr-2 text-right">Total HT</td>
              <td className="py-3 pl-2 text-right tabular-nums text-lg">{fmtPrix(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Conditions */}
        {fournisseur?.conditions_tarifaires && (
          <div className="mt-6 pt-4 border-t border-zinc-300">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Conditions de paiement</p>
            <p className="text-sm">{fournisseur.conditions_tarifaires}</p>
          </div>
        )}

        {bon.notes && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Notes</p>
            <p className="text-sm whitespace-pre-line">{bon.notes}</p>
          </div>
        )}

        {/* Pied de page */}
        <div className="mt-12 pt-6 border-t border-zinc-300 text-xs text-zinc-500 text-center">
          <p>Merci de confirmer la prise en compte de cette commande par retour.</p>
          <p className="mt-1">Document généré le {format(new Date(), 'd MMMM yyyy à HH:mm', { locale: fr })}.</p>
        </div>
      </div>
    </div>
  )
}
