'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const fmtPrix = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDate = (iso: string) => format(parseISO(iso), 'EEEE d MMMM yyyy', { locale: fr })

export default function DevisPrintClient({
  evt, etablissement, numero_devis,
}: {
  evt: { id: string; titre: string; type: string | null; date_evenement: string; heure_debut: string | null; heure_fin: string | null; nb_personnes: number; prix_par_personne_ht: number | null; taux_tva: number; montant_devis: number; acompte_verse: number; client_nom: string | null; client_email: string | null; client_telephone: string | null; lieu: string | null; privatisation: boolean; materiel_demande: string | null; besoins_techniques: string | null }
  etablissement: Record<string, string>
  numero_devis: string
}) {
  const ttc = evt.montant_devis
  const ht = ttc / (1 + evt.taux_tva / 100)
  const tva = ttc - ht
  const acompteSuggere = Math.round(ttc * 0.30 * 100) / 100

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
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Devis n°</p>
            <p className="font-mono font-bold text-lg">{numero_devis}</p>
            <p className="text-sm text-zinc-600 mt-2">Établi le {format(new Date(), 'd MMMM yyyy', { locale: fr })}</p>
            <p className="text-[10px] text-zinc-500 italic mt-2">Valable 30 jours</p>
          </div>
        </header>

        <h1 className="text-2xl font-bold mt-6 mb-2">{evt.titre}</h1>
        {evt.type && <p className="text-sm text-zinc-600 mb-4 capitalize">{evt.type.replace('_', ' ')}{evt.privatisation && ' · 🔒 privatisation totale'}</p>}

        <section className="grid grid-cols-2 gap-6 my-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Client</p>
            <p className="font-bold">{evt.client_nom ?? '—'}</p>
            {evt.client_email && <p className="text-xs">{evt.client_email}</p>}
            {evt.client_telephone && <p className="text-xs">{evt.client_telephone}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="capitalize"><b>{fmtDate(evt.date_evenement)}</b></p>
            {evt.heure_debut && <p>{evt.heure_debut.slice(0, 5)} → {evt.heure_fin?.slice(0, 5) ?? '?'}</p>}
            <p>{evt.nb_personnes} personne{evt.nb_personnes > 1 ? 's' : ''}</p>
            {evt.lieu && <p>📍 {evt.lieu}</p>}
          </div>
        </section>

        <section className="mb-6">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="text-[11px] uppercase tracking-wider text-zinc-500 border-b-2 border-zinc-900">
              <th className="text-left py-2 pr-2">Désignation</th>
              <th className="text-right py-2 pr-2 w-20">Qté</th>
              <th className="text-right py-2 pr-2 w-24">P.U. HT</th>
              <th className="text-right py-2 w-24">Total HT</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-zinc-200">
                <td className="py-2 pr-2">
                  <p className="font-bold">Prestation événementielle</p>
                  {evt.materiel_demande && <p className="text-[11px] text-zinc-600 mt-1">Matériel inclus : {evt.materiel_demande}</p>}
                  {evt.besoins_techniques && <p className="text-[11px] text-zinc-600">Technique : {evt.besoins_techniques}</p>}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{evt.nb_personnes} pers</td>
                <td className="py-2 pr-2 text-right tabular-nums">{evt.prix_par_personne_ht ? fmtPrix(evt.prix_par_personne_ht) : '—'}</td>
                <td className="py-2 text-right tabular-nums font-bold">{fmtPrix(ht)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="flex justify-end mb-6">
          <table className="w-72 text-sm">
            <tbody>
              <tr><td className="py-1 text-zinc-600">Total HT</td><td className="py-1 text-right tabular-nums">{fmtPrix(ht)}</td></tr>
              <tr><td className="py-1 text-zinc-600">TVA {evt.taux_tva}%</td><td className="py-1 text-right tabular-nums">{fmtPrix(tva)}</td></tr>
              <tr className="border-t-2 border-zinc-900 font-bold text-base"><td className="py-2">TOTAL TTC</td><td className="py-2 text-right tabular-nums">{fmtPrix(ttc)}</td></tr>
              <tr><td className="py-1 text-zinc-500 italic" colSpan={2}>Acompte 30% à la confirmation : <b className="tabular-nums">{fmtPrix(acompteSuggere)}</b></td></tr>
            </tbody>
          </table>
        </section>

        <section className="mb-6 p-4 bg-zinc-50 border border-zinc-200 rounded text-xs">
          <h3 className="font-bold uppercase tracking-wider text-zinc-700 mb-2 text-[11px]">Conditions générales</h3>
          <ul className="space-y-1 text-zinc-700">
            <li>• Devis valable 30 jours à compter de la date d&apos;émission.</li>
            <li>• Confirmation : retour signé + versement de l&apos;acompte 30%.</li>
            <li>• Solde : à régler le jour de l&apos;événement.</li>
            <li>• Annulation : remboursement intégral si {'>'} 30 jours, 50% si 15-30j, acompte conservé si {'<'} 15j.</li>
            <li>• Modification du nombre de convives possible jusqu&apos;à 7 jours avant.</li>
          </ul>
        </section>

        <footer className="grid grid-cols-2 gap-6 mt-10 pt-4 border-t border-zinc-300 text-[10px] text-zinc-500">
          <div>
            <p className="font-bold">Bon pour accord :</p>
            <p>Date et signature précédée de la mention "Bon pour accord"</p>
            <div className="mt-12 border-b border-zinc-400 w-48" />
          </div>
          <div className="text-right">
            <p>Cachet de l&apos;établissement</p>
            <div className="mt-12 border-b border-zinc-400 w-40 ml-auto" />
          </div>
        </footer>
      </div>
    </div>
  )
}
