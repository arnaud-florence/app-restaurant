'use client'

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { TYPE_DECHET_INFO, fmtPoids, fmtPrix, fmtDate } from '@/lib/dechets'
import type { RapportAnnuelData } from './page'

export default function RapportAnnuelPrintClient({ data }: { data: RapportAnnuelData }) {
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
          <p className="text-xs uppercase tracking-wider text-zinc-500">Rapport annuel obligatoire — Gestion des déchets</p>
          <h1 className="text-xl font-bold mt-1">Année {data.annee}</h1>
          <p className="text-sm font-bold mt-2">{data.etablissement.etablissement_nom || 'Établissement'}</p>
          {data.etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{data.etablissement.etablissement_adresse}</p>}
          {data.etablissement.etablissement_siret && <p className="text-xs">SIRET : {data.etablissement.etablissement_siret}</p>}
          <p className="text-[10px] text-zinc-500 mt-2">Édité le {format(new Date(), 'd MMMM yyyy à HH:mm', { locale: fr })}</p>
        </header>

        {/* Synthèse */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">📊 Synthèse {data.annee}</h2>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p className="text-xs text-zinc-500">Tonnage total</p>
              <p className="text-2xl font-bold tabular-nums">{fmtPoids(data.total_poids)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Coût gaspillage</p>
              <p className="text-2xl font-bold tabular-nums text-red-700">{fmtPrix(data.total_cout)}</p>
            </div>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
              <th className="text-left py-1.5 pr-2">Type de déchet</th>
              <th className="text-right py-1.5 pr-2">Poids (kg)</th>
              <th className="text-right py-1.5 pr-2">% du total</th>
              <th className="text-right py-1.5">Coût (€)</th>
            </tr></thead>
            <tbody>
              {data.agg.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-4 text-zinc-400 italic">Aucune donnée pour {data.annee}</td></tr>
              ) : data.agg.map(a => {
                const info = TYPE_DECHET_INFO[a.type]
                const pct = data.total_poids > 0 ? (a.poids_kg / data.total_poids) * 100 : 0
                return (
                  <tr key={a.type} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2">{info.emoji} {info.label}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums font-bold">{a.poids_kg.toFixed(1)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-zinc-500">{pct.toFixed(1)}%</td>
                    <td className="py-1.5 text-right tabular-nums">{a.cout > 0 ? fmtPrix(a.cout) : '—'}</td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-zinc-900 font-bold">
                <td className="py-2 pr-2">TOTAL</td>
                <td className="py-2 pr-2 text-right tabular-nums">{data.total_poids.toFixed(1)} kg</td>
                <td></td>
                <td className="py-2 text-right tabular-nums">{fmtPrix(data.total_cout)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Collectes BSD */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">🚛 Collectes prestataires & BSD</h2>
          {data.collectes.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucune collecte enregistrée.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Date</th>
                <th className="text-left py-1.5 pr-2">Type</th>
                <th className="text-left py-1.5 pr-2">Prestataire</th>
                <th className="text-right py-1.5 pr-2">Poids</th>
                <th className="text-left py-1.5 pr-2">N° BSD</th>
                <th className="text-right py-1.5">Coût</th>
              </tr></thead>
              <tbody>
                {data.collectes.map(c => {
                  const info = TYPE_DECHET_INFO[c.type_dechet]
                  return (
                    <tr key={c.id} className="border-b border-zinc-100">
                      <td className="py-1.5 pr-2 tabular-nums">{fmtDate(c.date_collecte)}</td>
                      <td className="py-1.5 pr-2">{info.emoji} {info.label}</td>
                      <td className="py-1.5 pr-2">{c.prestataire}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.poids_total_kg ? c.poids_total_kg.toFixed(1) + ' kg' : '—'}</td>
                      <td className="py-1.5 pr-2 font-mono text-[10px]">{c.num_bsd ?? '—'}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.cout_collecte != null ? fmtPrix(c.cout_collecte) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <footer className="mt-8 pt-4 border-t border-zinc-300 grid grid-cols-2 gap-6 text-[10px] text-zinc-500">
          <div>
            <p>Document à conserver 5 ans (Code de l&apos;environnement).</p>
            <p>Bordereaux de Suivi des Déchets (BSD) à présenter à toute demande des autorités.</p>
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
