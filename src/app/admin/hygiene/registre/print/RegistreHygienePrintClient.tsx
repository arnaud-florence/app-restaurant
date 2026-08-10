'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { RegistreHygieneData } from './page'

const fmtDateTime = (iso: string) => { try { return format(parseISO(iso), 'd MMM yyyy HH:mm', { locale: fr }) } catch { return iso } }
const fmtDate = (d: string) => { try { return format(parseISO(d), 'd MMM yyyy', { locale: fr }) } catch { return d } }

const GRAVITE_LABEL: Record<string, string> = { mineure: 'Mineure', majeure: 'Majeure', critique: 'Critique' }
const STATUT_LABEL: Record<string, string> = { ouverte: 'Ouverte', en_cours: 'En cours', resolue: 'Résolue' }

export default function RegistreHygienePrintClient({ data }: { data: RegistreHygieneData }) {
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
          <p className="text-xs uppercase tracking-wider text-zinc-500">Registre HACCP — Hygiène & sécurité alimentaire</p>
          <h1 className="text-xl font-bold mt-1">{data.etablissement.etablissement_nom || 'Établissement'}</h1>
          {data.etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{data.etablissement.etablissement_adresse}</p>}
          {data.etablissement.etablissement_siret && <p className="text-xs">SIRET : {data.etablissement.etablissement_siret}</p>}
          <p className="text-[10px] text-zinc-500 mt-2">Période : depuis le {fmtDate(data.periodeDebut)} · Édité le {format(new Date(), 'd MMMM yyyy à HH:mm', { locale: fr })}</p>
          <p className="text-[10px] text-zinc-500 italic mt-1">Paquet Hygiène (Règl. CE 852/2004). Tenue et conservation des relevés obligatoires en cas de contrôle.</p>
        </header>

        {/* Relevés de température */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">🌡️ Relevés de température ({data.temperatures.length})</h2>
          {data.temperatures.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucun relevé sur la période.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Date / heure</th>
                <th className="text-left py-1.5 pr-2">Équipement</th>
                <th className="text-left py-1.5 pr-2">Type</th>
                <th className="text-right py-1.5 pr-2">Temp.</th>
                <th className="text-left py-1.5 pr-2">Conf.</th>
                <th className="text-left py-1.5">Par</th>
              </tr></thead>
              <tbody>
                {data.temperatures.map((t, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDateTime(t.date)}</td>
                    <td className="py-1.5 pr-2 font-bold">{t.equipement}</td>
                    <td className="py-1.5 pr-2 capitalize">{(t.type ?? '—').replace('_', ' ')}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{t.temperature.toFixed(1)} °C</td>
                    <td className="py-1.5 pr-2">{t.conforme === null ? '—' : t.conforme ? '✓' : '✗ NOK'}</td>
                    <td className="py-1.5">{t.employe ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Checklists */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">✅ Checklists hygiène ({data.checklists.length})</h2>
          {data.checklists.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucune checklist sur la période.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Date</th>
                <th className="text-left py-1.5 pr-2">Procédure</th>
                <th className="text-left py-1.5 pr-2">Validée</th>
                <th className="text-left py-1.5">Par</th>
              </tr></thead>
              <tbody>
                {data.checklists.map((c, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(c.date)}{c.heure ? ` ${c.heure.slice(0, 5)}` : ''}</td>
                    <td className="py-1.5 pr-2 font-bold">{c.procedure}</td>
                    <td className="py-1.5 pr-2">{c.valide ? '✓ Oui' : '— Non'}</td>
                    <td className="py-1.5">{c.employe ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Non-conformités */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">⚠️ Non-conformités ({data.nonConformites.length})</h2>
          {data.nonConformites.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucune non-conformité sur la période.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Date</th>
                <th className="text-left py-1.5 pr-2">Type</th>
                <th className="text-left py-1.5 pr-2">Gravité</th>
                <th className="text-left py-1.5 pr-2">Description / action</th>
                <th className="text-left py-1.5">Statut</th>
              </tr></thead>
              <tbody>
                {data.nonConformites.map((n, i) => (
                  <tr key={i} className="border-b border-zinc-100 align-top">
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(n.date)}</td>
                    <td className="py-1.5 pr-2 capitalize">{n.type}</td>
                    <td className="py-1.5 pr-2">{GRAVITE_LABEL[n.gravite] ?? n.gravite}</td>
                    <td className="py-1.5 pr-2">{n.description}{n.action ? <span className="text-zinc-500"> — Action : {n.action}</span> : ''}</td>
                    <td className="py-1.5">{STATUT_LABEL[n.statut] ?? n.statut}</td>
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
