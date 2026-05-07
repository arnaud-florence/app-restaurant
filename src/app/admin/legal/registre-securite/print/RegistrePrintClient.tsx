'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { RegistreData } from './page'

const fmtDate = (iso: string | null) => iso ? format(parseISO(iso), 'd MMM yyyy', { locale: fr }) : '—'

export default function RegistrePrintClient({ data }: { data: RegistreData }) {
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
          <p className="text-xs uppercase tracking-wider text-zinc-500">Registre de sécurité</p>
          <h1 className="text-xl font-bold mt-1">{data.etablissement.etablissement_nom || 'Établissement'}</h1>
          {data.etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{data.etablissement.etablissement_adresse}</p>}
          {data.etablissement.etablissement_siret && <p className="text-xs">SIRET : {data.etablissement.etablissement_siret}</p>}
          <p className="text-[10px] text-zinc-500 mt-2">Édité le {format(new Date(), 'd MMMM yyyy à HH:mm', { locale: fr })}</p>
          <p className="text-[10px] text-zinc-500 italic mt-1">Conformément à l&apos;Art. R4227-37 du Code du travail. Conservation 5 ans.</p>
        </header>

        {/* Contrôles obligatoires */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">🛡️ Contrôles techniques obligatoires</h2>
          {data.controles.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucun équipement marqué comme soumis à contrôle.</p>
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

        {/* Accidents */}
        <section className="mb-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">🩹 Accidents du travail</h2>
          {data.accidents.length === 0 ? (
            <p className="text-sm italic text-emerald-700">✓ Aucun accident enregistré.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                <th className="text-left py-1.5 pr-2">Date</th>
                <th className="text-left py-1.5 pr-2">Personne</th>
                <th className="text-left py-1.5 pr-2">Gravité</th>
                <th className="text-left py-1.5 pr-2">Description</th>
                <th className="text-right py-1.5 pr-2">Arrêt</th>
                <th className="text-left py-1.5">CPAM</th>
              </tr></thead>
              <tbody>
                {data.accidents.map((a, i) => (
                  <tr key={i} className="border-b border-zinc-100 align-top">
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(a.date)}</td>
                    <td className="py-1.5 pr-2 font-bold">{a.employe ?? '—'}</td>
                    <td className="py-1.5 pr-2 capitalize">{a.gravite}</td>
                    <td className="py-1.5 pr-2">{a.description}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{a.jours_arret} j</td>
                    <td className="py-1.5">{a.declaration_cpam ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Obligations actives */}
        {data.obligations_actives.length > 0 && (
          <section className="mb-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 border-b border-zinc-300 pb-1 mb-2">📋 Obligations en cours</h2>
            <table className="w-full text-xs">
              <tbody>
                {data.obligations_actives.map((o, i) => (
                  <tr key={i} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-2 font-bold">{o.titre}</td>
                    <td className="py-1.5 pr-2 capitalize text-zinc-600">{o.categorie.replace('_', ' ')}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtDate(o.date_echeance)}</td>
                    <td className="py-1.5 capitalize">{o.statut.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Affichages manquants */}
        {data.affichages_manquants.length > 0 && (
          <section className="mb-5 border-2 border-red-300 bg-red-50 p-3 rounded">
            <h2 className="text-sm font-bold uppercase tracking-wider text-red-900 mb-2">⚠ Affichages obligatoires manquants</h2>
            <ul className="text-xs space-y-0.5">
              {data.affichages_manquants.map((a, i) => (
                <li key={i}>· {a.titre} {a.reference && <span className="text-[10px] text-red-700">({a.reference})</span>}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 pt-4 border-t border-zinc-300 grid grid-cols-2 gap-6 text-[10px] text-zinc-500">
          <div>
            <p>Document à présenter à toute demande de l&apos;inspection du travail.</p>
            <p>Conservation : 5 ans après le départ du dernier salarié concerné.</p>
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
