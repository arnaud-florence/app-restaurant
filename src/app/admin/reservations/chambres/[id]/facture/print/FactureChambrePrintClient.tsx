'use client'

import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

const fmtPrix = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDate = (iso: string) => format(parseISO(iso), 'd MMMM yyyy', { locale: fr })

export default function FactureChambrePrintClient({
  resa, chambre, etablissement, numero_facture,
}: {
  resa: { id: string; client_nom: string; client_email: string | null; client_telephone: string | null; date_arrivee: string; date_depart: string; nb_personnes: number; montant_total: number; acompte_verse: number; notes: string | null }
  chambre: { nom: string; numero: string; prix_nuit_ht: number } | null
  etablissement: Record<string, string>
  numero_facture: string
}) {
  const nuits = Math.max(1, differenceInDays(parseISO(resa.date_depart), parseISO(resa.date_arrivee)))
  const ht = resa.montant_total / 1.10
  const tva = resa.montant_total - ht
  const reste = resa.montant_total - resa.acompte_verse

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white text-zinc-900 py-6 px-4 print:p-0">
      <style>{`@media print { @page { size: A4; margin: 1.5cm } body { background: white } .no-print { display: none !important } }`}</style>
      <div className="max-w-3xl mx-auto bg-white shadow-lg p-8 print:shadow-none">
        <div className="no-print flex justify-between mb-4 gap-2">
          <button onClick={() => window.history.back()} className="h-10 px-4 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold">← Retour</button>
          <button onClick={() => window.print()} className="h-10 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold">🖨 Imprimer / PDF</button>
        </div>

        <header className="grid grid-cols-2 gap-6 pb-6 border-b-2 border-zinc-900">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Émetteur</p>
            <p className="font-bold text-base">{etablissement.etablissement_nom || 'Établissement'}</p>
            {etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{etablissement.etablissement_adresse}</p>}
            {etablissement.etablissement_telephone && <p className="text-xs">📞 {etablissement.etablissement_telephone}</p>}
            {etablissement.etablissement_siret && <p className="text-[11px] text-zinc-500 mt-1">SIRET : {etablissement.etablissement_siret}</p>}
            {etablissement.etablissement_tva_intra && <p className="text-[11px] text-zinc-500">TVA : {etablissement.etablissement_tva_intra}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Facture séjour n°</p>
            <p className="font-mono font-bold text-lg">{numero_facture}</p>
            <p className="text-sm text-zinc-600 mt-2">Émise le {format(new Date(), 'd MMMM yyyy', { locale: fr })}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 my-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Client</p>
            <p className="font-bold">{resa.client_nom}</p>
            {resa.client_email && <p className="text-xs">{resa.client_email}</p>}
            {resa.client_telephone && <p className="text-xs">{resa.client_telephone}</p>}
          </div>
          <div className="text-right text-sm">
            <p>Arrivée : <b>{fmtDate(resa.date_arrivee)}</b></p>
            <p>Départ : <b>{fmtDate(resa.date_depart)}</b></p>
            <p>{resa.nb_personnes} personne{resa.nb_personnes > 1 ? 's' : ''}</p>
          </div>
        </section>

        <section className="mb-6">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="text-[11px] uppercase tracking-wider text-zinc-500 border-b-2 border-zinc-900">
              <th className="text-left py-2 pr-2">Désignation</th>
              <th className="text-right py-2 pr-2 w-16">Qté</th>
              <th className="text-right py-2 pr-2 w-24">P.U. TTC</th>
              <th className="text-right py-2 w-24">Total TTC</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-zinc-200">
                <td className="py-2 pr-2">
                  <p className="font-bold">Séjour {chambre ? `Chambre N°${chambre.numero} ${chambre.nom}` : 'Chambre'}</p>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{nuits} nuit{nuits > 1 ? 's' : ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtPrix(chambre ? chambre.prix_nuit_ht : 0)}</td>
                <td className="py-2 text-right tabular-nums font-bold">{fmtPrix(resa.montant_total)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="flex justify-end mb-6">
          <table className="w-72 text-sm">
            <tbody>
              <tr><td className="py-1 text-zinc-600">Total HT</td><td className="py-1 text-right tabular-nums">{fmtPrix(ht)}</td></tr>
              <tr><td className="py-1 text-zinc-600">TVA 10%</td><td className="py-1 text-right tabular-nums">{fmtPrix(tva)}</td></tr>
              <tr className="border-t-2 border-zinc-900 font-bold"><td className="py-2">TOTAL TTC</td><td className="py-2 text-right tabular-nums">{fmtPrix(resa.montant_total)}</td></tr>
              {resa.acompte_verse > 0 && (
                <>
                  <tr><td className="py-1 text-emerald-700">− Acompte versé</td><td className="py-1 text-right tabular-nums text-emerald-700">{fmtPrix(resa.acompte_verse)}</td></tr>
                  <tr className="border-t border-zinc-300 font-bold"><td className="py-1.5">{reste > 0 ? 'Reste à payer' : 'Solde'}</td><td className={`py-1.5 text-right tabular-nums ${reste > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmtPrix(reste)}</td></tr>
                </>
              )}
            </tbody>
          </table>
        </section>

        {resa.notes && (
          <section className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Notes</h3>
            <p className="text-sm bg-zinc-50 border border-zinc-200 rounded p-3 whitespace-pre-line">{resa.notes}</p>
          </section>
        )}

        <footer className="grid grid-cols-2 gap-6 mt-10 pt-4 border-t border-zinc-300 text-[10px] text-zinc-500">
          <div>
            <p>Règlement à réception. Tout retard entraîne pénalités.</p>
            <p>TVA acquittée sur les encaissements.</p>
          </div>
          <div className="text-right">
            <p>Cachet et signature</p>
            <div className="mt-10 border-b border-zinc-400 w-40 ml-auto" />
          </div>
        </footer>
      </div>
    </div>
  )
}
