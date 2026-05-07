'use client'

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { type CompteResultat, type TvaSummary, fmtPrix, fmtPct } from '@/lib/finances'

const FREQ_LABEL: Record<string, string> = {
  mensuel: 'mensuel', bimestriel: '2 mois', trimestriel: 'trim.', semestriel: 'sem.', annuel: 'annuel',
}

export default function RapportPrintClient({
  cr, tva, libelleMois, moisIso, etablissement, charges,
}: {
  cr: CompteResultat
  tva: TvaSummary
  libelleMois: string
  moisIso: string
  etablissement: Record<string, string>
  charges: { libelle: string; categorie: string; montant_ttc: number; frequence: string }[]
}) {
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

        <header className="border-b-2 border-zinc-900 pb-3 mb-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Rapport mensuel — Compte de résultat</p>
          <h1 className="text-xl font-bold mt-1 capitalize">{libelleMois}</h1>
          <p className="text-sm font-bold mt-2">{etablissement.etablissement_nom || 'Établissement'}</p>
          {etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{etablissement.etablissement_adresse}</p>}
          {etablissement.etablissement_siret && <p className="text-xs">SIRET : {etablissement.etablissement_siret}</p>}
          {etablissement.etablissement_tva_intra && <p className="text-xs">TVA intra : {etablissement.etablissement_tva_intra}</p>}
          <p className="text-[10px] text-zinc-500 mt-2">Édité le {format(new Date(), 'd MMMM yyyy à HH:mm', { locale: fr })} · Mois {moisIso}</p>
        </header>

        {/* P&L */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">📊 Compte de résultat</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-zinc-200">
                <td className="py-1.5 font-bold">Chiffre d&apos;affaires HT</td>
                <td className="py-1.5 text-right tabular-nums font-bold text-emerald-700">+ {fmtPrix(cr.ca_ht)}</td>
              </tr>
              <tr><td className="py-1 pl-4 text-xs text-zinc-500">Dont CA TTC : {fmtPrix(cr.ca_ttc)}</td><td></td></tr>
              <tr className="border-b border-zinc-200 bg-red-50">
                <td className="py-1.5 font-bold">Charges totales</td>
                <td className="py-1.5 text-right tabular-nums font-bold text-red-700">− {fmtPrix(cr.total_charges)}</td>
              </tr>
              <tr><td className="py-1 pl-4 text-xs text-zinc-600">Food cost (entrées matières)</td><td className="py-1 text-right tabular-nums">{fmtPrix(cr.food_cost)} ({fmtPct(cr.food_cost_pct)})</td></tr>
              <tr><td className="py-1 pl-4 text-xs text-zinc-600">Masse salariale</td><td className="py-1 text-right tabular-nums">{fmtPrix(cr.masse_salariale)} ({fmtPct(cr.masse_salariale_pct)})</td></tr>
              <tr><td className="py-1 pl-4 text-xs text-zinc-600">Charges fixes mensualisées</td><td className="py-1 text-right tabular-nums">{fmtPrix(cr.charges_fixes_mensuelles)} ({fmtPct(cr.charges_fixes_pct)})</td></tr>
              <tr><td className="py-1 pl-4 text-xs text-zinc-600">Notes de frais remboursées</td><td className="py-1 text-right tabular-nums">{fmtPrix(cr.notes_de_frais_mois)}</td></tr>
              <tr className={`border-t-2 border-zinc-900 font-bold text-base ${cr.resultat_net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                <td className="py-2">RÉSULTAT NET</td>
                <td className="py-2 text-right tabular-nums">{fmtPrix(cr.resultat_net)}</td>
              </tr>
              <tr><td className="py-1 pl-4 text-xs text-zinc-500">Marge nette : {fmtPct(cr.marge_nette_pct)}</td><td></td></tr>
            </tbody>
          </table>
        </section>

        {/* TVA */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">🧾 TVA</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-1">TVA collectée (vente, taux 10%)</td><td className="py-1 text-right tabular-nums">{fmtPrix(tva.tva_collectee)}</td></tr>
              <tr><td className="py-1">− TVA déductible (achat)</td><td className="py-1 text-right tabular-nums text-emerald-700">−{fmtPrix(tva.tva_deductible)}</td></tr>
              <tr className="border-t border-zinc-300 font-bold"><td className="py-1.5">= TVA à reverser</td><td className="py-1.5 text-right tabular-nums">{fmtPrix(tva.tva_a_reverser)}</td></tr>
            </tbody>
          </table>
        </section>

        {/* Charges fixes */}
        {charges.length > 0 && (
          <section className="mb-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">💸 Détail charges fixes actives</h2>
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                <th className="text-left py-1">Libellé</th>
                <th className="text-left py-1">Catégorie</th>
                <th className="text-left py-1">Fréq.</th>
                <th className="text-right py-1">Montant TTC</th>
              </tr></thead>
              <tbody>
                {charges.map((c, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1">{c.libelle}</td>
                    <td className="py-1 capitalize text-zinc-500">{c.categorie}</td>
                    <td className="py-1 text-zinc-500">{FREQ_LABEL[c.frequence] ?? c.frequence}</td>
                    <td className="py-1 text-right tabular-nums">{fmtPrix(c.montant_ttc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-8 pt-4 border-t border-zinc-300 grid grid-cols-2 gap-6 text-[10px] text-zinc-500">
          <div>
            <p>Document interne non fiscal.</p>
            <p>Ce rapport agrège les données de la base au moment de l&apos;édition.</p>
          </div>
          <div className="text-right">
            <p>Visa du gérant</p>
            <div className="mt-10 border-b border-zinc-400 w-40 ml-auto" />
          </div>
        </footer>
      </div>
    </div>
  )
}
