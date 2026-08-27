// ─── Santé du pont caisse ↔ outil ────────────────────────────────────────
//
// Le journal (0137) et le rapprochement (0139) ne servent à rien s'ils ne
// sont lus par personne. Cette page est leur seule raison d'exister : elle
// répond à une question, « est-ce que ce qui vient de la caisse arrive
// entier ? », et elle doit y répondre en trois secondes.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fmtPrix } from '@/lib/foodCost'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pont caisse ↔ outil' }

type Rappr = {
  date_jour: string; source_caisse: string
  tickets_recus: number; montant_recu: number
  commandes_liees: number; montant_commandes: number
  lignes_posees: number; ecart_montant: number; ecart_tickets: number
  statut: 'ok' | 'ecart' | 'incomplet'
  detail: {
    tickets_sans_commande?: string[]
    commandes_sans_ligne?: string[]
    ecarts_tva?: Array<{ taux: string; recu: number; commande: number }>
  } | null
}

type Evenement = {
  id: string; sens: string; systeme: string; type: string
  reference: string | null; statut: string; erreur: string | null
  duree_ms: number | null; created_at: string
}

const STATUT = {
  ok:        { label: 'Complet',   cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  incomplet: { label: 'Incomplet', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  ecart:     { label: 'Écart',     cls: 'bg-red-100 text-red-900 border-red-300' },
} as const

export default async function IntegrationsPage() {
  const sb = await createClient()
  const [rapprRes, evRes, corrRes] = await Promise.all([
    sb.from('rapprochements_caisse').select('*').order('date_jour', { ascending: false }).limit(30),
    sb.from('integration_evenements')
      .select('id, sens, systeme, type, reference, statut, erreur, duree_ms, created_at')
      .order('created_at', { ascending: false }).limit(25),
    sb.from('correspondances_catalogue').select('systeme, libelle_externe, vu_le')
      .order('vu_le', { ascending: false }).limit(500),
  ])

  const rapprochements = (rapprRes.data ?? []) as Rappr[]
  const evenements = (evRes.data ?? []) as Evenement[]
  const correspondances = corrRes.data ?? []

  const aVoir = rapprochements.filter(r => r.statut !== 'ok')
  const echecs = evenements.filter(e => e.statut !== 'succes')

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest font-bold text-zinc-400">Intégrations</p>
        <h1 className="text-2xl font-black text-zinc-900">Pont caisse ↔ outil</h1>
        <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
          Ce que la caisse a poussé, et ce que l&apos;outil en a fait. Un écart
          signifie qu&apos;un ticket s&apos;est perdu en route ou qu&apos;une ligne n&apos;a pas
          trouvé son produit — le chiffre d&apos;affaires resterait juste, seules
          les marges dériveraient.
        </p>
      </header>

      {/* Verdict en une ligne */}
      <section className={`rounded-2xl p-4 ring-1 ${
        aVoir.length === 0 && echecs.length === 0
          ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-300'}`}>
        {aVoir.length === 0 && echecs.length === 0 ? (
          <p className="font-bold text-emerald-900">
            ✓ Tout ce que la caisse a envoyé est arrivé entier
            {rapprochements.length > 0 && <> — {rapprochements.length} journée(s) contrôlée(s)</>}
          </p>
        ) : (
          <p className="font-bold text-amber-900">
            {aVoir.length > 0 && <>{aVoir.length} journée(s) à regarder</>}
            {aVoir.length > 0 && echecs.length > 0 && ' · '}
            {echecs.length > 0 && <>{echecs.length} échange(s) en échec</>}
          </p>
        )}
        <p className="text-xs text-zinc-600 mt-1">
          {correspondances.length} correspondance(s) de catalogue enregistrée(s) —
          c&apos;est ce qui empêche un produit renommé en caisse de devenir un doublon ici.
        </p>
      </section>

      {/* Rapprochement quotidien */}
      <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5">
        <h2 className="font-black text-zinc-900">Rapprochement quotidien</h2>
        <p className="text-xs text-zinc-500 mt-0.5 mb-3">
          Une ligne par jour et par caisse. Recalculable à tout moment.
        </p>
        {rapprochements.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Aucun rapprochement calculé. Lancez <code className="text-xs">/api/cron/caisse/rapprochement</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-200">
                  <th className="text-left py-2 font-bold">Jour</th>
                  <th className="text-left py-2 font-bold">Caisse</th>
                  <th className="text-right py-2 font-bold">Tickets</th>
                  <th className="text-right py-2 font-bold">Reçu</th>
                  <th className="text-right py-2 font-bold">Lignes</th>
                  <th className="text-right py-2 font-bold">Écart</th>
                  <th className="text-left py-2 font-bold pl-3">État</th>
                </tr>
              </thead>
              <tbody>
                {rapprochements.map(r => {
                  const s = STATUT[r.statut]
                  const sansLigne = r.detail?.commandes_sans_ligne?.length ?? 0
                  return (
                    <tr key={`${r.date_jour}-${r.source_caisse}`} className="border-b border-zinc-100 last:border-0">
                      <td className="py-2 font-medium tabular-nums">
                        {new Date(r.date_jour + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td className="py-2 text-zinc-500">{r.source_caisse}</td>
                      <td className="py-2 text-right tabular-nums">{r.tickets_recus}</td>
                      <td className="py-2 text-right tabular-nums">{fmtPrix(Number(r.montant_recu))}</td>
                      <td className="py-2 text-right tabular-nums">{r.lignes_posees}</td>
                      <td className={`py-2 text-right tabular-nums font-bold ${
                        Math.abs(Number(r.ecart_montant)) > 0.05 ? 'text-red-600' : 'text-zinc-400'}`}>
                        {fmtPrix(Number(r.ecart_montant))}
                      </td>
                      <td className="py-2 pl-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${s.cls}`}>{s.label}</span>
                        {sansLigne > 0 && (
                          <span className="block text-[11px] text-zinc-500 mt-0.5">
                            {sansLigne} ticket(s) sans détail produit
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-zinc-400 mt-3">
          « Incomplet » = le montant est juste, mais on ignore ce qui a été vendu :
          stock, food cost et marges resteront aveugles sur ces tickets.
        </p>
      </section>

      {/* Journal */}
      <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5">
        <h2 className="font-black text-zinc-900">Derniers échanges</h2>
        <p className="text-xs text-zinc-500 mt-0.5 mb-3">
          Chaque échange conserve sa charge brute, ce qui permet de rejouer un import raté.
        </p>
        {evenements.length === 0 ? (
          <p className="text-sm text-zinc-400">Aucun échange enregistré pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {evenements.map(e => (
              <li key={e.id} className="py-2 flex items-baseline gap-3 text-sm">
                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  e.statut === 'succes'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'}`}>
                  {e.sens === 'entrant' ? '↓' : '↑'} {e.statut === 'succes' ? 'OK' : 'échec'}
                </span>
                <span className="font-medium">{e.systeme}</span>
                <span className="text-zinc-500">{e.type}</span>
                <span className="text-zinc-400 text-xs truncate flex-1">{e.reference}</span>
                <span className="text-zinc-400 text-xs tabular-nums shrink-0">
                  {e.duree_ms != null && <>{e.duree_ms} ms · </>}
                  {new Date(e.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
        {echecs.length > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm font-bold text-red-900 mb-1">Erreurs relevées</p>
            <ul className="space-y-1">
              {echecs.slice(0, 5).map(e => (
                <li key={e.id} className="text-xs text-red-800 font-mono break-all">{e.erreur}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-400">
        <Link href="/admin/ventes" className="underline">Statistiques de vente</Link>
        {' · '}
        <Link href="/admin/ventes-pdv" className="underline">Ventes par activité</Link>
      </p>
    </main>
  )
}
