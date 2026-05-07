'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { RegistreEntry } from './page'

const fmtDate = (iso: string | null) => iso ? format(parseISO(iso), 'd MMM yyyy', { locale: fr }) : '—'

export default function RegistrePrintClient({
  entries, etablissement,
}: {
  entries: RegistreEntry[]
  etablissement: Record<string, string>
}) {
  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white text-zinc-900 py-6 px-4 print:p-0">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1.2cm; }
          body { background: white; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto bg-white shadow-lg p-8 print:shadow-none print:max-w-none">
        <div className="no-print flex justify-between mb-4 gap-2">
          <button onClick={() => window.history.back()} className="h-10 px-4 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold">← Retour</button>
          <button onClick={() => window.print()} className="h-10 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold">🖨 Imprimer / PDF</button>
        </div>

        <header className="border-b-2 border-zinc-900 pb-3 mb-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Registre unique du personnel — Art. L1221-13 du Code du travail</p>
          <h1 className="text-xl font-bold mt-1">{etablissement.etablissement_nom || 'Établissement'}</h1>
          {etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{etablissement.etablissement_adresse}</p>}
          {etablissement.etablissement_siret && <p className="text-xs">SIRET : {etablissement.etablissement_siret}</p>}
          <p className="text-[11px] text-zinc-500 mt-2">Édité le {format(new Date(), 'd MMM yyyy à HH:mm', { locale: fr })} · {entries.length} entrée{entries.length > 1 ? 's' : ''}</p>
        </header>

        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-100 text-[10px] uppercase tracking-wider border-b-2 border-zinc-900">
              <th className="text-left p-1.5 border border-zinc-300">N°</th>
              <th className="text-left p-1.5 border border-zinc-300">Nom Prénom</th>
              <th className="text-left p-1.5 border border-zinc-300">Emploi occupé</th>
              <th className="text-left p-1.5 border border-zinc-300">Type contrat</th>
              <th className="text-left p-1.5 border border-zinc-300">Date entrée</th>
              <th className="text-left p-1.5 border border-zinc-300">Date sortie</th>
              <th className="text-right p-1.5 border border-zinc-300">H/sem</th>
              <th className="text-left p-1.5 border border-zinc-300">Coordonnées</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-6 text-zinc-400 italic border border-zinc-300">Aucun employé enregistré.</td></tr>
            ) : entries.map(e => (
              <tr key={e.numero} className="border-b border-zinc-200">
                <td className="p-1.5 border border-zinc-200 tabular-nums">{e.numero}</td>
                <td className="p-1.5 border border-zinc-200 font-bold">{e.nom.toUpperCase()} {e.prenom}</td>
                <td className="p-1.5 border border-zinc-200 capitalize">{e.poste}</td>
                <td className="p-1.5 border border-zinc-200">{e.type_contrat}</td>
                <td className="p-1.5 border border-zinc-200 tabular-nums">{fmtDate(e.date_embauche)}</td>
                <td className="p-1.5 border border-zinc-200 tabular-nums">{fmtDate(e.date_sortie)}</td>
                <td className="p-1.5 border border-zinc-200 text-right tabular-nums">{e.heures_contrat}</td>
                <td className="p-1.5 border border-zinc-200 text-[10px]">
                  {e.email && <p>{e.email}</p>}
                  {e.telephone && <p>{e.telephone}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="grid grid-cols-2 gap-6 mt-8 pt-4 border-t border-zinc-300 text-[10px] text-zinc-500">
          <div>
            <p>Document tenu en ordre chronologique des embauches.</p>
            <p>À conserver pendant 5 ans après le départ du dernier salarié.</p>
            <p>Doit être présenté à toute demande de l&apos;inspection du travail.</p>
          </div>
          <div className="text-right">
            <p>Signature de l&apos;employeur</p>
            <div className="mt-10 border-b border-zinc-400 w-48 ml-auto" />
          </div>
        </footer>
      </div>
    </div>
  )
}
