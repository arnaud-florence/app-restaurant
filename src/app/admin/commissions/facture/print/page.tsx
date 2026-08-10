// Récapitulatif mensuel des commissions services tiers (FDJ / Tabac / Relais colis)
// à transmettre au comptable. Commissions = prestation de service, TVA 20 %.
// Imprimable (PDF via impression navigateur). Fond blanc, hérite du root layout.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fmtPrix } from '@/lib/foodCost'
import PrintButton from './PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Facture commissions — mois' }

const TVA_TAUX = 20 // commissions = prestation de service, TVA 20 %
const MOIS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function moisCourant(): string { return new Date().toISOString().slice(0, 7) }
function bornes(mois: string): { debut: string; fin: string; y: number; m: number } {
  const [y, m] = mois.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { debut: `${mois}-01`, fin: `${mois}-${String(last).padStart(2, '0')}`, y, m }
}
function decalerMois(mois: string, delta: number): string {
  const [y, m] = mois.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Etab = { id: string; nom: string; categorie: string | null }

export default async function FactureCommissionsPage({ searchParams }: { searchParams: { mois?: string } }) {
  const mois = /^\d{4}-\d{2}$/.test(searchParams.mois ?? '') ? searchParams.mois! : moisCourant()
  const { debut, fin, y, m } = bornes(mois)
  const sb = await createClient()

  const [etabRes, commRes] = await Promise.all([
    sb.from('etablissements').select('id, nom, categorie').eq('inclus_ca_principal', false).eq('actif', true).order('ordre'),
    sb.from('commissions_tiers').select('etablissement_id, montant_commission, montant_brut_transite, nb_operations, periode_debut, periode_fin')
      .gte('periode_fin', debut).lte('periode_debut', fin),
  ])
  const etabs = (etabRes.data ?? []) as Etab[]
  const comms = (commRes.data ?? []) as { etablissement_id: string; montant_commission: number | null; montant_brut_transite: number | null; nb_operations: number | null }[]

  type Agg = { base: number; brut: number; ops: number; nb: number }
  const agg = new Map<string, Agg>()
  for (const c of comms) {
    const a = agg.get(c.etablissement_id) ?? { base: 0, brut: 0, ops: 0, nb: 0 }
    a.base += Number(c.montant_commission ?? 0)
    a.brut += Number(c.montant_brut_transite ?? 0)
    a.ops += Number(c.nb_operations ?? 0)
    a.nb += 1
    agg.set(c.etablissement_id, a)
  }
  const lignes = etabs
    .map(e => ({ etab: e, ...(agg.get(e.id) ?? { base: 0, brut: 0, ops: 0, nb: 0 }) }))
    .filter(l => l.nb > 0)

  const totalBase = lignes.reduce((s, l) => s + l.base, 0)
  const totalBrut = lignes.reduce((s, l) => s + l.brut, 0)
  const totalOps = lignes.reduce((s, l) => s + l.ops, 0)
  const totalTva = Math.round(totalBase * TVA_TAUX) / 100
  const totalTtc = Math.round((totalBase + totalTva) * 100) / 100
  const numero = `COMM-${y}-${String(m).padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Barre d'actions — masquée à l'impression */}
      <div className="print:hidden border-b border-zinc-200 bg-zinc-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/commissions" className="text-sm text-zinc-500 hover:text-zinc-800">← Commissions</Link>
        <div className="flex items-center gap-2">
          <Link href={`/admin/commissions/facture/print?mois=${decalerMois(mois, -1)}`} className="px-3 h-9 inline-flex items-center rounded-md bg-white ring-1 ring-zinc-300 text-sm font-bold">← Mois préc.</Link>
          <span className="text-sm font-black tabular-nums">{MOIS_FR[m]} {y}</span>
          <Link href={`/admin/commissions/facture/print?mois=${decalerMois(mois, 1)}`} className="px-3 h-9 inline-flex items-center rounded-md bg-white ring-1 ring-zinc-300 text-sm font-bold">Mois suiv. →</Link>
          <PrintButton />
        </div>
      </div>

      {/* Document */}
      <div className="max-w-3xl mx-auto p-8 print:p-0">
        <div className="flex items-start justify-between border-b-2 border-zinc-900 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-black">CASATASIA</h1>
            <p className="text-sm text-zinc-500">Récapitulatif mensuel des commissions services tiers</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-black">{numero}</p>
            <p className="text-zinc-600 capitalize">{MOIS_FR[m]} {y}</p>
            <p className="text-zinc-500 tabular-nums">{debut} → {fin}</p>
          </div>
        </div>

        <p className="text-sm text-zinc-600 mb-4">
          Commissions perçues pour des prestations de service réalisées pour compte de tiers
          (FDJ, revente de tabac sur la marge, relais colis). Soumises à la <strong>TVA au taux normal de {TVA_TAUX} %</strong>.
          Le montant brut transité ne fait pas partie du chiffre d&apos;affaires (il est reversé / appartient au tiers).
        </p>

        {lignes.length === 0 ? (
          <p className="text-center text-zinc-400 italic py-12 border border-dashed border-zinc-200 rounded-lg">
            Aucune commission saisie pour {MOIS_FR[m]} {y}.
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-500 text-xs uppercase tracking-wider">
                <th className="text-left font-bold py-2">Service tiers</th>
                <th className="text-right font-bold py-2">Nb opé.</th>
                <th className="text-right font-bold py-2">Brut transité</th>
                <th className="text-right font-bold py-2">Commission HT</th>
                <th className="text-right font-bold py-2">TVA {TVA_TAUX} %</th>
                <th className="text-right font-bold py-2">TTC</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => {
                const tva = Math.round(l.base * TVA_TAUX) / 100
                const ttc = Math.round((l.base + tva) * 100) / 100
                return (
                  <tr key={l.etab.id} className="border-b border-zinc-100">
                    <td className="py-2 font-semibold">{l.etab.nom}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-600">{l.ops || '—'}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-500">{l.brut > 0 ? fmtPrix(l.brut) : '—'}</td>
                    <td className="py-2 text-right tabular-nums font-bold">{fmtPrix(l.base)}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-600">{fmtPrix(tva)}</td>
                    <td className="py-2 text-right tabular-nums font-black">{fmtPrix(ttc)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-900 font-black">
                <td className="py-2.5">TOTAL</td>
                <td className="py-2.5 text-right tabular-nums">{totalOps || '—'}</td>
                <td className="py-2.5 text-right tabular-nums text-zinc-500">{totalBrut > 0 ? fmtPrix(totalBrut) : '—'}</td>
                <td className="py-2.5 text-right tabular-nums">{fmtPrix(totalBase)}</td>
                <td className="py-2.5 text-right tabular-nums">{fmtPrix(totalTva)}</td>
                <td className="py-2.5 text-right tabular-nums text-base">{fmtPrix(totalTtc)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Récapitulatif TVA */}
        {lignes.length > 0 && (
          <div className="mt-6 ml-auto w-full sm:w-72 text-sm">
            <div className="flex justify-between py-1 border-b border-zinc-100"><span className="text-zinc-600">Total commissions HT</span><span className="tabular-nums font-bold">{fmtPrix(totalBase)}</span></div>
            <div className="flex justify-between py-1 border-b border-zinc-100"><span className="text-zinc-600">TVA collectée ({TVA_TAUX} %)</span><span className="tabular-nums font-bold">{fmtPrix(totalTva)}</span></div>
            <div className="flex justify-between py-2 border-t-2 border-zinc-900 mt-1"><span className="font-black">Total TTC</span><span className="tabular-nums font-black text-base">{fmtPrix(totalTtc)}</span></div>
          </div>
        )}

        <p className="text-[11px] text-zinc-400 mt-8 border-t border-zinc-100 pt-3">
          Document généré par l&apos;outil de gestion CASATASIA · à joindre à la comptabilité du mois.
          Revente de tabac : TVA 20 % sur la marge (supplément de service) — réf. BOI-TVA-BASE-10-20-70.
          Commissions saisies en base HT.
        </p>
      </div>
    </div>
  )
}
