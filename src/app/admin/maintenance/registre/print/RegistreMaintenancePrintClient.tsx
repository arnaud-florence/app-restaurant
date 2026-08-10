'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { RegistreMaintenanceData } from './page'

const fmtDate = (d: string | null) => { if (!d) return '—'; try { return format(parseISO(d), 'd MMM yyyy', { locale: fr }) } catch { return d } }
const TYPE_LABEL: Record<string, string> = { preventive: 'Préventive', curative: 'Curative', controle_obligatoire: 'Contrôle obligatoire' }
const fmtEur = (n: number) => n > 0 ? `${n.toFixed(2)} €` : '—'

export default function RegistreMaintenancePrintClient({ data }: { data: RegistreMaintenanceData }) {
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
          <p className="text-xs uppercase tracking-wider text-zinc-500">Registre de maintenance & contrôles techniques</p>
          <h1 className="text-xl font-bold mt-1">{data.etablissement.etablissement_nom || 'Établissement'}</h1>
          {data.etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{data.etablissement.etablissement_adresse}</p>}
          {data.etablissement.etablissement_siret && <p className="text-xs">SIRET : {data.etablissement.etablissement_siret}</p>}
          <p className="text-[10px] text-zinc-500 mt-2">Édité le {format(new Date(), 'd MMMM yyyy à HH:mm', { locale: fr })}</p>
          <p className="text-[10px] text-zinc-500 italic mt-1">Contrôles obligatoires (gaz, électricité, extincteurs, hotte…) à présenter en cas de contrôle.</p>
        </header>

        {/* Contrôles obligatoires */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">🛡️ Contrôles obligatoires ({data.controles.length})</h2>
          {data.controles.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucun équipement marqué comme soumis à contrôle obligatoire.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Équipement</th>
                <th className="text-left py-1.5 pr-2">Type contrôle</th>
                <th className="text-left py-1.5 pr-2">Dernier</th>
                <th className="text-left py-1.5 pr-2">Prochain</th>
                <th className="text-left py-1.5">Organisme</th>
              </tr></thead>
              <tbody>
                {data.controles.map((c, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2 font-bold">{c.equipement}</td>
                    <td className="py-1.5 pr-2 capitalize">{c.type}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(c.derniere)}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(c.prochaine)}</td>
                    <td className="py-1.5">{c.organisme ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Parc équipements */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">🔧 Parc d&apos;équipements ({data.equipements.length})</h2>
          {data.equipements.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucun équipement enregistré.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Équipement</th>
                <th className="text-left py-1.5 pr-2">Marque / modèle</th>
                <th className="text-left py-1.5 pr-2">Prestataire</th>
                <th className="text-left py-1.5 pr-2">Proch. entretien</th>
                <th className="text-left py-1.5">Garantie</th>
              </tr></thead>
              <tbody>
                {data.equipements.map((e, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2 font-bold">{e.nom}</td>
                    <td className="py-1.5 pr-2">{e.marque ?? '—'}</td>
                    <td className="py-1.5 pr-2">{e.prestataire ?? '—'}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(e.prochaine)}</td>
                    <td className="py-1.5 tabular-nums">{fmtDate(e.garantie)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Interventions */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">📋 Interventions (12 derniers mois — {data.interventions.length})</h2>
          {data.interventions.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucune intervention sur la période.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Date</th>
                <th className="text-left py-1.5 pr-2">Équipement</th>
                <th className="text-left py-1.5 pr-2">Type</th>
                <th className="text-left py-1.5 pr-2">Description</th>
                <th className="text-right py-1.5">Coût</th>
              </tr></thead>
              <tbody>
                {data.interventions.map((it, i) => (
                  <tr key={i} className="border-b border-zinc-100 align-top">
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(it.date)}</td>
                    <td className="py-1.5 pr-2 font-bold">{it.equipement ?? '—'}</td>
                    <td className="py-1.5 pr-2">{it.type ? (TYPE_LABEL[it.type] ?? it.type) : '—'}</td>
                    <td className="py-1.5 pr-2">{it.description ?? '—'}{it.prestataire ? <span className="text-zinc-500"> — {it.prestataire}</span> : ''}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtEur(it.cout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="grid grid-cols-2 gap-6 mt-10 pt-4 border-t border-zinc-300 text-xs text-zinc-500">
          <div>
            <p>Document de travail — à valider par le responsable.</p>
            <p>Imprimé le {format(new Date(), 'd MMM yyyy à HH:mm', { locale: fr })}.</p>
          </div>
          <div className="text-right">
            <p>Signature responsable</p>
            <div className="mt-8 border-b border-zinc-400 w-40 ml-auto" />
          </div>
        </div>
      </div>
    </div>
  )
}
