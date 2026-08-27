// ─── Ce que l'affaire VAUT ───────────────────────────────────────────────
//
// Le reste de l'outil mesure ce qui entre en caisse. Cette page mesure ce qui
// se construit : l'EBE récurrent, et la valeur de fonds qu'il porte.
//
// Un euro de résultat MENSUEL récurrent vaut trente à quarante-huit fois un
// euro sorti une fois — et sorti, il est taxé deux fois. C'est cet écart que
// la page rend visible, parce qu'il ne se voit nulle part ailleurs.

import Link from 'next/link'
import { getPatrimoine, type Fiabilite } from '@/lib/patrimoine'
import { fmtPrix } from '@/lib/foodCost'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Valeur de l\'affaire' }

const FIABILITE: Record<Fiabilite, { label: string; cls: string; dit: string }> = {
  insuffisant: {
    label: 'Base trop mince',
    cls: 'bg-red-50 ring-red-200 text-red-900',
    dit: "Moins de 30 jours de vente observés. Annualiser une telle période — a fortiori une ouverture, avec son effet de nouveauté — produirait un chiffre faux. Le mécanisme est montré, la valeur ne l'est pas.",
  },
  indicatif: {
    label: 'Indicatif',
    cls: 'bg-amber-50 ring-amber-300 text-amber-900',
    dit: "Entre 30 et 90 jours de vente. L'ordre de grandeur est bon, le chiffre exact ne l'est pas encore.",
  },
  solide: {
    label: 'Solide',
    cls: 'bg-emerald-50 ring-emerald-200 text-emerald-900',
    dit: 'Plus de 90 jours de vente observés. La tendance est exploitable.',
  },
}

export default async function PatrimoinePage() {
  const p = await getPatrimoine(180)
  const f = FIABILITE[p.fiabilite]
  const assez = p.fiabilite !== 'insuffisant'

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest font-bold text-zinc-400">Patrimoine</p>
        <h1 className="text-2xl font-black text-zinc-900">Ce que l&apos;affaire vaut</h1>
        <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
          Le chiffre d&apos;affaires dit ce qui entre. L&apos;EBE récurrent dit ce que
          l&apos;affaire <em>vaut</em> — parce que c&apos;est lui qu&apos;on multiplie pour
          valoriser un fonds de commerce.
        </p>
      </header>

      <section className={`rounded-2xl p-4 ring-1 ${f.cls}`}>
        <p className="font-bold">{f.label} — {p.periode.joursAvecVente} jour(s) de vente observés</p>
        <p className="text-xs mt-1 opacity-90">{f.dit}</p>
      </section>

      {/* ── Le levier : le chiffre qui résume la thèse ── */}
      <section className="rounded-2xl bg-zinc-900 text-zinc-100 p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-widest font-bold text-amber-300">L&apos;effet de levier</p>
        <p className="text-3xl sm:text-4xl font-black mt-2 leading-tight">
          1 000 € de résultat mensuel de plus<br />
          <span className="text-amber-300">
            = {fmtPrix(1000 * p.levierEuroRecurrent.bas)} à {fmtPrix(1000 * p.levierEuroRecurrent.haut)} de valeur de fonds
          </span>
        </p>
        <p className="text-sm text-zinc-400 mt-3 max-w-2xl">
          Un euro de résultat <b className="text-zinc-200">récurrent</b> vaut {p.levierEuroRecurrent.bas} à{' '}
          {p.levierEuroRecurrent.haut} fois un euro sorti une seule fois. Et sorti en prime,
          il est taxé deux fois : la société dépense 1 420 € pour qu&apos;il en reste environ 700.
        </p>
      </section>

      {/* ── D'où vient l'EBE ── */}
      <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5">
        <h2 className="font-black text-zinc-900">Comment on arrive au résultat</h2>
        <p className="text-xs text-zinc-500 mt-0.5 mb-3">
          Sur {p.periode.joursAvecVente} jour(s) de vente, ramené au mois.
        </p>
        <dl className="divide-y divide-zinc-100">
          {[
            ['Chiffre d\'affaires TTC', p.caTtcMensuel, null],
            ['Chiffre d\'affaires HT', p.caHtMensuel, null],
            [`Achats de marchandises (${Math.round(p.tauxChargesVariables * 100)} %)`,
              -(p.caHtMensuel * p.tauxChargesVariables),
              `mesuré sur ${p.couverturePct} % du CA, extrapolé au reste`],
            ['Charges fixes d\'exploitation', -p.chargesFixes, 'hors remboursement du crédit'],
            ['Salaires chargés', -p.masseSalariale, null],
          ].map(([label, val, note]) => (
            <div key={String(label)} className="py-2 flex items-baseline justify-between gap-3">
              <div>
                <span className="text-sm text-zinc-800">{label as string}</span>
                {note && <span className="block text-[11px] text-zinc-400">{note as string}</span>}
              </div>
              <span className={`tabular-nums font-medium shrink-0 ${Number(val) < 0 ? 'text-zinc-500' : 'text-zinc-900'}`}>
                {fmtPrix(Number(val))}
              </span>
            </div>
          ))}
          <div className="pt-3 flex items-baseline justify-between gap-3">
            <span className="font-black text-zinc-900">EBE mensuel</span>
            <span className={`tabular-nums font-black text-xl ${p.ebeMensuel < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {fmtPrix(p.ebeMensuel)}
            </span>
          </div>
          <div className="pt-2 flex items-baseline justify-between gap-3">
            <span className="text-sm text-zinc-600">soit sur douze mois</span>
            <span className={`tabular-nums font-bold ${p.ebeAnnuel < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {fmtPrix(p.ebeAnnuel)}
            </span>
          </div>
          {p.chargesFinancieres > 0 && (
            <div className="pt-3 mt-1 border-t border-dashed border-zinc-200">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-sm text-zinc-800">Remboursement du crédit</span>
                  <span className="block text-[11px] text-zinc-400">
                    hors EBE — c\'est le prix d\'achat étalé, pas une charge d\'exploitation
                  </span>
                </div>
                <span className="tabular-nums font-medium shrink-0 text-zinc-500">
                  {fmtPrix(-p.chargesFinancieres)}
                </span>
              </div>
              <div className="pt-2 flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-zinc-900">Ce qui reste en caisse</span>
                <span className={`tabular-nums font-bold ${p.resultatDisponibleMensuel < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {fmtPrix(p.resultatDisponibleMensuel)}
                </span>
              </div>
            </div>
          )}
        </dl>
      </section>

      {/* ── Valorisation ── */}
      <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5">
        <h2 className="font-black text-zinc-900">Valeur du fonds</h2>
        <p className="text-xs text-zinc-500 mt-0.5 mb-3">
          Deux méthodes, parce qu&apos;aucune ne fait autorité seule. L&apos;écart entre
          elles est une information : il dit si la valeur tient au résultat ou au volume.
        </p>
        {assez ? (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-400">En multiple d&apos;EBE</p>
                <p className="text-xl font-black tabular-nums text-zinc-900">
                  {fmtPrix(p.valorisation.parEbeBas)} – {fmtPrix(p.valorisation.parEbeHaut)}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-400">En part du chiffre annuel</p>
                <p className="text-xl font-black tabular-nums text-zinc-900">
                  {fmtPrix(p.valorisation.parCaBas)} – {fmtPrix(p.valorisation.parCaHaut)}
                </p>
              </div>
            </div>
            {p.prixAchat != null && p.plusValueLatente && (
              <div className="mt-4 rounded-xl bg-zinc-900 text-zinc-100 p-4">
                <p className="text-[11px] uppercase tracking-wider font-bold text-amber-300">Plus-value latente</p>
                <p className="text-2xl font-black tabular-nums mt-1">
                  {fmtPrix(p.plusValueLatente.basse)} à {fmtPrix(p.plusValueLatente.haute)}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Écart entre la valeur estimée et le prix d&apos;achat ({fmtPrix(p.prixAchat)}).
                  {p.creditRestantDu != null && <> Reste dû sur le crédit : {fmtPrix(p.creditRestantDu)}.</>}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500 bg-zinc-50 rounded-lg p-3">
            Pas assez de jours de vente pour afficher une valeur. Le tableau
            ci-dessous montre ce que <em>produirait</em> chaque niveau de chiffre
            d&apos;affaires — c&apos;est une projection, pas une mesure.
          </p>
        )}
      </section>

      {/* ── Paliers ── */}
      <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5">
        <h2 className="font-black text-zinc-900">Ce que vaut chaque palier</h2>
        <p className="text-xs text-zinc-500 mt-0.5 mb-3">
          À charges constantes et {Math.round(p.tauxChargesVariables * 100)} % d&apos;achats.
          C&apos;est la carte du chemin : chaque marche franchie déplace le patrimoine, pas seulement la caisse.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-200">
                <th className="text-left py-2 font-bold">CA mensuel TTC</th>
                <th className="text-right py-2 font-bold">Par jour</th>
                <th className="text-right py-2 font-bold">EBE annuel</th>
                <th className="text-right py-2 font-bold">Valeur du fonds</th>
              </tr>
            </thead>
            <tbody>
              {p.paliers.map(x => {
                const atteint = p.caTtcMensuel >= x.caTtcMensuel && assez
                return (
                  <tr key={x.caTtcMensuel} className={`border-b border-zinc-100 last:border-0 ${atteint ? 'bg-emerald-50/60' : ''}`}>
                    <td className="py-2 font-medium tabular-nums">
                      {fmtPrix(x.caTtcMensuel)}
                      {atteint && <span className="ml-2 text-[10px] font-bold text-emerald-700">atteint</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-zinc-500">{fmtPrix(x.caTtcMensuel / 30)}</td>
                    <td className={`py-2 text-right tabular-nums ${x.ebeAnnuel < 0 ? 'text-red-600' : 'text-zinc-800'}`}>
                      {fmtPrix(x.ebeAnnuel)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-bold">
                      {x.valeurHaute <= 0 ? '—' : `${fmtPrix(x.valeurBasse)} – ${fmtPrix(x.valeurHaute)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-zinc-400">
        Multiples et pourcentages réglables dans <code>config_patrimoine</code> — ils
        varient selon l&apos;emplacement, le bail et l&apos;époque, et c&apos;est au comptable
        de les arbitrer. Ces montants sont une aide au pilotage, pas une expertise.
        {' · '}
        <Link href="/admin/ventes" className="underline">Statistiques de vente</Link>
      </p>
    </main>
  )
}
