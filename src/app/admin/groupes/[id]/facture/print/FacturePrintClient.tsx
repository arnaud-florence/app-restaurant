'use client'

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  TYPE_PAIEMENT_LABEL,
  totalGroupeHT, totalGroupeTTC, totalPaye, resteAPayer,
  fmtPrix, fmtDate,
} from '@/lib/groupes'
import type { FactureData } from './page'

export default function FacturePrintClient({ data }: { data: FactureData }) {
  const { groupe: g, menus, paiements, etablissement, numero_facture } = data
  const ht = totalGroupeHT(g)
  const ttc = totalGroupeTTC(g)
  const tva = ttc - ht
  const paye = totalPaye(paiements)
  const reste = resteAPayer(g, paiements)

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white text-zinc-900 py-6 px-4 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          body { background: white; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto bg-white shadow-lg p-8 print:shadow-none print:max-w-none">
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
            {etablissement.etablissement_email && <p className="text-xs">📧 {etablissement.etablissement_email}</p>}
            {etablissement.etablissement_siret && <p className="text-[11px] text-zinc-500 mt-1">SIRET : {etablissement.etablissement_siret}</p>}
            {etablissement.etablissement_tva_intra && <p className="text-[11px] text-zinc-500">TVA intra : {etablissement.etablissement_tva_intra}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Facture n°</p>
            <p className="font-mono font-bold text-lg">{numero_facture}</p>
            <p className="text-sm text-zinc-600 mt-2">Émise le {format(new Date(), 'd MMMM yyyy', { locale: fr })}</p>
            <p className="text-xs text-zinc-500 mt-1">Visite du {fmtDate(g.date_visite)}</p>
          </div>
        </header>

        {/* Destinataire */}
        <section className="grid grid-cols-2 gap-6 my-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Destinataire</p>
            <p className="font-bold">{g.facturation_via_to && g.tour_operateur ? g.tour_operateur : g.nom}</p>
            {g.contact_nom && <p className="text-xs">À l&apos;attention de {g.contact_nom}</p>}
            {g.contact_email && <p className="text-xs">{g.contact_email}</p>}
            {g.contact_telephone && <p className="text-xs">{g.contact_telephone}</p>}
            {g.facturation_via_to && g.tour_operateur && <p className="text-[11px] text-zinc-500 mt-1 italic">Pour le compte du groupe : {g.nom}</p>}
          </div>
          <div className="text-right text-xs">
            <p>Visite : <b>{fmtDate(g.date_visite)}</b></p>
            {g.heure_arrivee && <p>Arrivée : <b>{g.heure_arrivee.slice(0, 5)}</b></p>}
            {g.heure_depart && <p>Départ : <b>{g.heure_depart.slice(0, 5)}</b></p>}
            <p>Nombre de personnes : <b>{g.nb_personnes}</b></p>
            {g.zone_assignee && <p>Zone : <b>{g.zone_assignee}</b></p>}
          </div>
        </section>

        {/* Détail */}
        <section className="mb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-zinc-500 border-b-2 border-zinc-900">
                <th className="text-left py-2 pr-2">Désignation</th>
                <th className="text-right py-2 pr-2 w-20">Quantité</th>
                <th className="text-right py-2 pr-2 w-24">P.U. HT</th>
                <th className="text-right py-2 w-24">Total HT</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-200">
                <td className="py-2 pr-2">
                  <p className="font-bold">Prestation groupe — {g.nom}</p>
                  {menus.length > 0 && (
                    <p className="text-[11px] text-zinc-600 mt-1">
                      Menu inclus : {menus.map(m => m.recette_nom).join(', ')}
                    </p>
                  )}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{g.nb_personnes} pers.</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtPrix(g.prix_par_personne_ht)}</td>
                <td className="py-2 text-right tabular-nums font-bold">{fmtPrix(ht)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Totaux */}
        <section className="flex justify-end mb-6">
          <table className="w-72 text-sm">
            <tbody>
              <tr><td className="py-1 text-zinc-600">Total HT</td><td className="py-1 text-right tabular-nums">{fmtPrix(ht)}</td></tr>
              <tr><td className="py-1 text-zinc-600">TVA {g.taux_tva} %</td><td className="py-1 text-right tabular-nums">{fmtPrix(tva)}</td></tr>
              <tr className="border-t-2 border-zinc-900 font-bold text-base"><td className="py-2">TOTAL TTC</td><td className="py-2 text-right tabular-nums">{fmtPrix(ttc)}</td></tr>
            </tbody>
          </table>
        </section>

        {/* Paiements reçus */}
        {paiements.length > 0 && (
          <section className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-300 pb-1 mb-2">Paiements reçus</h3>
            <table className="w-full text-xs">
              <tbody>
                {paiements.map(p => {
                  const info = TYPE_PAIEMENT_LABEL[p.type]
                  return (
                    <tr key={p.id} className="border-b border-zinc-100">
                      <td className="py-1.5">{info.emoji} {info.label} <span className="text-zinc-500">({p.methode})</span></td>
                      <td className="py-1.5 text-zinc-500">{fmtDate(p.date_paiement)}{p.reference && ` · ${p.reference}`}</td>
                      <td className={`py-1.5 text-right tabular-nums ${p.type === 'remboursement' ? 'text-red-700' : 'text-emerald-700'}`}>{p.type === 'remboursement' ? '−' : ''}{fmtPrix(p.montant)}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-zinc-900 font-bold">
                  <td colSpan={2} className="py-2">Total payé</td>
                  <td className="py-2 text-right tabular-nums text-emerald-700">{fmtPrix(paye)}</td>
                </tr>
                <tr className={`font-bold ${reste > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>
                  <td colSpan={2} className="py-1">{reste > 0.01 ? 'Reste à payer' : 'Solde'}</td>
                  <td className="py-1 text-right tabular-nums">{fmtPrix(reste)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {g.notes && (
          <section className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Notes</h3>
            <p className="text-sm whitespace-pre-line bg-zinc-50 border border-zinc-200 rounded p-3">{g.notes}</p>
          </section>
        )}

        <footer className="grid grid-cols-2 gap-6 mt-10 pt-4 border-t border-zinc-300 text-[10px] text-zinc-500">
          <div>
            <p>Règlement : virement, chèque ou carte. À 30 jours fin de mois sauf accord particulier.</p>
            <p>En cas de retard, pénalités au taux légal + indemnité forfaitaire 40€ (Art. L441-10 Code commerce).</p>
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
