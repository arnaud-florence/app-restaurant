'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { fmtPrix } from '@/lib/service'
import { type ResumeSession } from '../../../actions'

const METHODES_LABEL: Record<string, { label: string; emoji: string }> = {
  especes:      { label: 'Espèces',      emoji: '💵' },
  carte:        { label: 'Carte bancaire',emoji: '💳' },
  ticket_resto: { label: 'Ticket resto', emoji: '🎫' },
  virement:     { label: 'Virement',     emoji: '🏦' },
  autre:        { label: 'Autre',        emoji: '•'  },
}

export default function ZReportPrintClient({
  resume, etablissement,
}: {
  resume: ResumeSession
  etablissement: Record<string, string>
}) {
  const s = resume.session
  const isFermee = !!s.fermee_at

  return (
    <div className="min-h-screen bg-zinc-100 py-8 px-4 print:bg-white print:p-0 text-zinc-900">
      <style>{`
        @media print {
          @page { size: A4; margin: 1cm; }
          body { background: white; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto bg-white shadow-lg p-8 print:shadow-none print:max-w-none">
        {/* Actions */}
        <div className="no-print flex justify-between mb-6 gap-2">
          <button
            onClick={() => window.history.back()}
            className="h-10 px-4 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold"
          >
            ← Retour
          </button>
          <button
            onClick={() => window.print()}
            className="h-10 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold"
          >
            🖨 Imprimer / PDF
          </button>
        </div>

        {/* En-tête */}
        <div className="grid grid-cols-2 gap-6 pb-6 border-b-2 border-zinc-900">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Établissement</p>
            <p className="font-bold text-lg">{etablissement.etablissement_nom || 'CASATASIA'}</p>
            {etablissement.etablissement_adresse && <p className="text-sm whitespace-pre-line">{etablissement.etablissement_adresse}</p>}
            {etablissement.etablissement_telephone && <p className="text-sm">📞 {etablissement.etablissement_telephone}</p>}
            {etablissement.etablissement_siret && <p className="text-xs text-zinc-500 mt-1">SIRET : {etablissement.etablissement_siret}</p>}
            {etablissement.etablissement_tva_intra && <p className="text-xs text-zinc-500">TVA : {etablissement.etablissement_tva_intra}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Rapport Z n°</p>
            <p className="font-mono font-bold text-lg">{s.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-sm text-zinc-600 mt-2">
              {format(parseISO(s.date_session), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
            <p className={`mt-1 text-xs font-bold uppercase tracking-wider ${isFermee ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isFermee ? '✓ Session clôturée' : '🟢 Session en cours'}
            </p>
          </div>
        </div>

        {/* Horaires */}
        <div className="grid grid-cols-2 gap-6 my-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Ouverture</p>
            <p className="font-semibold">{format(parseISO(s.ouverte_at), 'd MMM yyyy à HH:mm', { locale: fr })}</p>
            {s.ouverte_par_nom && <p className="text-zinc-600">par {s.ouverte_par_nom}</p>}
          </div>
          {s.fermee_at && (
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Clôture</p>
              <p className="font-semibold">{format(parseISO(s.fermee_at), 'd MMM yyyy à HH:mm', { locale: fr })}</p>
              {s.fermee_par_nom && <p className="text-zinc-600">par {s.fermee_par_nom}</p>}
            </div>
          )}
        </div>

        {/* Récap global */}
        <div className="grid grid-cols-3 gap-3 my-6">
          <div className="border-2 border-zinc-900 rounded-md p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Chiffre d&apos;affaires</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{fmtPrix(resume.ca_total_ttc)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">TTC</p>
          </div>
          <div className="border border-zinc-300 rounded-md p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Commandes</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{resume.nb_commandes_encaissees}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              ticket moyen {resume.nb_commandes_encaissees > 0 ? fmtPrix(resume.ca_total_ttc / resume.nb_commandes_encaissees) : '—'}
            </p>
          </div>
          <div className="border border-zinc-300 rounded-md p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Pourboires</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-700">{fmtPrix(resume.pourboires_total)}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{resume.tips_par_serveur.length} serveur(s)</p>
          </div>
        </div>

        {/* Détail méthodes */}
        <section className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 border-b border-zinc-300 pb-1">Encaissements par méthode</h3>
          {resume.paiements_par_methode.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucun encaissement.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                  <th className="text-left py-1.5 pr-2">Méthode</th>
                  <th className="text-right py-1.5 px-2 w-16">Nb</th>
                  <th className="text-right py-1.5 px-2 w-28">Montant</th>
                  <th className="text-right py-1.5 pl-2 w-28">Pourboires</th>
                </tr>
              </thead>
              <tbody>
                {resume.paiements_par_methode.map(p => {
                  const m = METHODES_LABEL[p.methode] ?? { label: p.methode, emoji: '•' }
                  return (
                    <tr key={p.methode} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 font-semibold">{m.emoji} {m.label}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{p.nb}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold">{fmtPrix(p.montant)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-emerald-700">{p.pourboire > 0 ? fmtPrix(p.pourboire) : '—'}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-zinc-900 font-bold">
                  <td className="py-2 pr-2">TOTAL</td>
                  <td className="py-2 px-2 text-right tabular-nums">{resume.paiements_par_methode.reduce((s, p) => s + p.nb, 0)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtPrix(resume.ca_total_ttc)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums text-emerald-700">{fmtPrix(resume.pourboires_total)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* Ventilation TVA (multi-taux : 5,5 / 10 / 20) */}
        <section className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 border-b border-zinc-300 pb-1">Ventilation TVA</h3>
          {resume.ventilation_tva.length === 0 ? (
            <p className="text-sm italic text-zinc-500">Aucune TVA sur cette session.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                  <th className="text-left py-1.5 pr-2">Taux</th>
                  <th className="text-right py-1.5 px-2 w-28">Base HT</th>
                  <th className="text-right py-1.5 px-2 w-28">TVA</th>
                  <th className="text-right py-1.5 pl-2 w-28">TTC</th>
                </tr>
              </thead>
              <tbody>
                {resume.ventilation_tva.map(v => (
                  <tr key={v.taux} className="border-b border-zinc-100">
                    <td className="py-2 pr-2 font-semibold">{String(v.taux).replace('.', ',')} %</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtPrix(v.ht)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmtPrix(v.tva)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold">{fmtPrix(v.ttc)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-zinc-900 font-bold">
                  <td className="py-2 pr-2">TOTAL</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtPrix(resume.ventilation_tva.reduce((s, v) => s + v.ht, 0))}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtPrix(resume.ventilation_tva.reduce((s, v) => s + v.tva, 0))}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">{fmtPrix(resume.ventilation_tva.reduce((s, v) => s + v.ttc, 0))}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-zinc-400 mt-1">5,5 % à emporter · 10 % sur place · 20 % alcool. Calculée sur les commandes encaissées.</p>
        </section>

        {/* Tips par serveur */}
        {resume.tips_par_serveur.length > 0 && (
          <section className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 border-b border-zinc-300 pb-1">Pourboires par serveur</h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-300">
                  <th className="text-left py-1.5 pr-2">Serveur</th>
                  <th className="text-right py-1.5 px-2 w-24">Encaissements</th>
                  <th className="text-right py-1.5 pl-2 w-28">Total tips</th>
                </tr>
              </thead>
              <tbody>
                {resume.tips_par_serveur.map(t => (
                  <tr key={t.serveur_id ?? '__none__'} className="border-b border-zinc-100">
                    <td className="py-2 pr-2 font-semibold">{t.serveur_nom}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{t.nb}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-bold text-emerald-700">{fmtPrix(t.pourboire)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Bilan caisse */}
        <section className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 border-b border-zinc-300 pb-1">Bilan caisse (espèces)</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-1 pr-2 text-zinc-600">Fond initial</td><td className="py-1 text-right tabular-nums">{fmtPrix(s.fond_initial)}</td></tr>
              <tr><td className="py-1 pr-2 text-zinc-600">+ Espèces encaissées</td><td className="py-1 text-right tabular-nums text-emerald-700">{fmtPrix(resume.paiements_par_methode.find(p => p.methode === 'especes')?.montant ?? 0)}</td></tr>
              {resume.sorties_total > 0 && (
                <tr><td className="py-1 pr-2 text-zinc-600">− Sorties espèces</td><td className="py-1 text-right tabular-nums text-amber-700">−{fmtPrix(resume.sorties_total)}</td></tr>
              )}
              {resume.entrees_total > 0 && (
                <tr><td className="py-1 pr-2 text-zinc-600">+ Apports espèces</td><td className="py-1 text-right tabular-nums text-emerald-700">{fmtPrix(resume.entrees_total)}</td></tr>
              )}
              <tr className="border-t border-zinc-300 font-bold"><td className="py-1.5 pr-2">= Caisse attendue</td><td className="py-1.5 text-right tabular-nums">{fmtPrix(resume.caisse_attendue)}</td></tr>
              {s.ca_compte !== null && (
                <>
                  <tr><td className="py-1 pr-2 text-zinc-600">Espèces comptées</td><td className="py-1 text-right tabular-nums font-bold">{fmtPrix(s.ca_compte)}</td></tr>
                  <tr className={`border-t border-zinc-300 font-bold ${
                    s.ecart === null || Math.abs(s.ecart) < 0.01 ? 'text-emerald-700'
                    : (s.ecart ?? 0) > 0 ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    <td className="py-1.5 pr-2">Écart</td>
                    <td className="py-1.5 text-right tabular-nums">{s.ecart === null ? '—' : ((s.ecart > 0 ? '+' : '') + fmtPrix(s.ecart))}</td>
                  </tr>
                </>
              )}
              {s.fond_final !== null && (
                <tr><td className="pt-3 pr-2 text-zinc-600">Fond conservé pour la prochaine session</td><td className="pt-3 text-right tabular-nums">{fmtPrix(s.fond_final)}</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {s.notes && (
          <section className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Notes</h3>
            <p className="text-sm whitespace-pre-line bg-zinc-50 border border-zinc-200 rounded p-3">{s.notes}</p>
          </section>
        )}

        {/* Pied */}
        <div className="grid grid-cols-2 gap-6 mt-10 pt-4 border-t border-zinc-300 text-xs text-zinc-500">
          <div>
            <p>Document non fiscal.</p>
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
