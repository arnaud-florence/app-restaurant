// Connecteur « caisse agréée » — statut de synchro + documentation d'intégration.
// La caisse agréée pousse ses encaissements vers /api/integrations/caisse/encaissements.
// Cette page montre l'état du miroir local + le contrat d'intégration (POS-agnostique).

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fmtPrix } from '@/lib/foodCost'
import SyncSumUpClient from './SyncSumUpClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connecteur caisse agréée' }

const ENDPOINT = '/api/integrations/caisse/encaissements'
const PAYLOAD_EXEMPLE = `{
  "source_caisse": "tiller",
  "encaissements": [
    {
      "ticket_externe": "T-123",
      "etablissement_slug": "bar",
      "commande_numero": "BAR-260609-AB12",
      "montant_ttc": 12.00,
      "montant_ht": 10.00,
      "tva_total": 2.00,
      "ventilation_tva": { "20": 2.00 },
      "mode_paiement": "cb",
      "encaisse_at": "2026-06-09T18:00:00Z"
    }
  ]
}`

type Enc = {
  id: string; source_caisse: string; ticket_externe: string; montant_ttc: number | null
  mode_paiement: string | null; encaisse_at: string | null; statut_rapprochement: string
}

export default async function CaisseAgreeePage() {
  const sb = await createClient()
  const res = await sb.from('encaissements_externes')
    .select('id, source_caisse, ticket_externe, montant_ttc, mode_paiement, encaisse_at, statut_rapprochement')
    .order('encaisse_at', { ascending: false, nullsFirst: false })
    .limit(50)

  // Table absente → migration pas encore exécutée
  const tableManquante = !!res.error && /relation .*encaissements_externes.* does not exist|encaissements_externes/i.test(res.error.message ?? '') && res.status === 404
  const rows = (res.data ?? []) as Enc[]
  const total = rows.reduce((s, r) => s + Number(r.montant_ttc ?? 0), 0)
  const sources = Array.from(new Set(rows.map(r => r.source_caisse)))
  const rapproches = rows.filter(r => r.statut_rapprochement === 'rapproche').length
  const connecte = rows.length > 0

  const badge = (s: string) => {
    if (s === 'rapproche') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">rapproché</span>
    if (s === 'sans_commande') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">sans commande</span>
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">—</span>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin/cat/systeme" className="text-xs text-zinc-400 hover:text-zinc-600">← Système</Link>
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 mt-1">🔌 Connecteur caisse agréée</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Modèle hybride NF525 : notre app prend la commande, la caisse agréée encaisse et nous pousse ses tickets.</p>
      </div>

      {/* Statut */}
      {tableManquante ? (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4 mb-6">
          <p className="font-bold text-amber-800">⚠️ Migration à exécuter</p>
          <p className="text-sm text-amber-700 mt-1">
            Lance <code className="bg-amber-100 px-1.5 py-0.5 rounded">0108_encaissements_externes.sql</code> dans Supabase → SQL Editor, puis recharge cette page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className={`rounded-2xl p-4 ${connecte ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-white'}`}>
            <p className="text-[11px] uppercase tracking-wider font-bold opacity-80">Statut</p>
            <p className="text-lg font-black mt-1">{connecte ? '🟢 Connecté' : '⚪ En attente'}</p>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">Tickets reçus</p>
            <p className="text-2xl font-black tabular-nums mt-1 text-zinc-900">{rows.length}</p>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">Total TTC</p>
            <p className="text-2xl font-black tabular-nums mt-1 text-zinc-900">{fmtPrix(total)}</p>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">Rapprochés</p>
            <p className="text-2xl font-black tabular-nums mt-1 text-zinc-900">{rapproches}<span className="text-sm text-zinc-400">/{rows.length}</span></p>
          </div>
        </div>
      )}

      {!tableManquante && (
        <div className="mb-6">
          <SyncSumUpClient />
        </div>
      )}

      {/* Contrat d'intégration */}
      <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5 mb-6">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500 mb-3">Contrat d&apos;intégration</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="font-bold text-zinc-600 w-28">Endpoint</dt>
            <dd className="font-mono text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded">POST {ENDPOINT}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="font-bold text-zinc-600 w-28">Auth</dt>
            <dd className="font-mono text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded">Authorization: Bearer &lt;CRON_SECRET&gt;</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="font-bold text-zinc-600 w-28">Idempotence</dt>
            <dd className="text-zinc-700">clé <code className="bg-zinc-100 px-1 rounded">(source_caisse, ticket_externe)</code> — un ticket n&apos;est ingéré qu&apos;une fois.</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="font-bold text-zinc-600 w-28">Rapprochement</dt>
            <dd className="text-zinc-700">si <code className="bg-zinc-100 px-1 rounded">commande_numero</code> correspond → la commande passe à <strong>encaissée</strong>.</dd>
          </div>
        </dl>
        <p className="text-xs font-bold text-zinc-500 mt-4 mb-1">Exemple de payload</p>
        <pre className="text-[11px] leading-relaxed bg-zinc-900 text-zinc-100 rounded-xl p-3 overflow-x-auto"><code>{PAYLOAD_EXEMPLE}</code></pre>
        <p className="text-[11px] text-zinc-400 mt-2">
          POS-agnostique : quand la caisse sera choisie, un fin adaptateur mappera son export vers ce format. Slugs des points de vente : <code className="bg-zinc-100 px-1 rounded">le-relais-des-saveurs · bar · snack-emporter · fournil</code>.
        </p>
      </section>

      {/* Derniers tickets */}
      {!tableManquante && (
        <section>
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500 mb-3">Derniers tickets synchronisés</h2>
          {rows.length === 0 ? (
            <p className="text-zinc-400 italic py-8 text-center bg-zinc-50 rounded-2xl">Aucun ticket reçu pour l&apos;instant. Dès que la caisse agréée poussera ses encaissements, ils apparaîtront ici.</p>
          ) : (
            <div className="rounded-2xl bg-white ring-1 ring-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-bold px-3 py-2">Ticket</th>
                    <th className="text-left font-bold px-3 py-2">Source</th>
                    <th className="text-right font-bold px-3 py-2">Montant</th>
                    <th className="text-left font-bold px-3 py-2">Paiement</th>
                    <th className="text-left font-bold px-3 py-2">Rapprochement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono text-zinc-800">{r.ticket_externe}</td>
                      <td className="px-3 py-2 text-zinc-600">{r.source_caisse}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-zinc-900">{fmtPrix(Number(r.montant_ttc ?? 0))}</td>
                      <td className="px-3 py-2 text-zinc-600">{r.mode_paiement ?? '—'}</td>
                      <td className="px-3 py-2">{badge(r.statut_rapprochement)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sources.length > 0 && <p className="text-[11px] text-zinc-400 mt-2">Source(s) : {sources.join(', ')}</p>}
        </section>
      )}
    </div>
  )
}
