import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminPageHeader from '@/components/admin/AdminPageHeader'

export const metadata = { title: 'Borne kiosk — Activité' }
export const dynamic = 'force-dynamic'

const HEURE_INACTIVITE_MIN = 30

export default async function BorneAdminPage() {
  const profil = await getProfile()
  if (!profil || profil.role !== 'manager') redirect('/login')

  const supabase = await createClient()
  const debutJour = new Date()
  debutJour.setHours(0, 0, 0, 0)
  const debutJourIso = debutJour.toISOString()

  // ─── Sessions actives (heartbeat dans les 30 dernières min) ────────
  const seuilInactif = new Date(Date.now() - HEURE_INACTIVITE_MIN * 60_000).toISOString()
  const { data: sessionsData } = await supabase
    .from('borne_sessions')
    .select('borne_id, derniere_action, derniere_cmd_at, user_agent')
    .order('derniere_action', { ascending: false })
  const sessions = (sessionsData ?? []).map(s => {
    const last = new Date(s.derniere_action as string).getTime()
    const activeMin = Math.round((Date.now() - last) / 60_000)
    return {
      borne_id: s.borne_id as string,
      derniere_action: s.derniere_action as string,
      derniere_cmd_at: (s.derniere_cmd_at as string) ?? null,
      user_agent: (s.user_agent as string) ?? null,
      active: last >= new Date(seuilInactif).getTime(),
      inactif_min: activeMin,
    }
  })

  // ─── Commandes du jour ─────────────────────────────────────────────
  const { data: cmdsData } = await supabase
    .from('commandes')
    .select('id, numero, statut, montant_total_ttc, borne_payment_method, created_at, borne_remise_eur, borne_points_utilises, client_id')
    .eq('source', 'BORNE')
    .gte('created_at', debutJourIso)
    .order('created_at', { ascending: false })
  const cmds = cmdsData ?? []
  const nbNfc = cmds.filter(c => c.borne_payment_method === 'nfc' && c.statut !== 'annule').length
  const nbComptoir = cmds.filter(c => c.borne_payment_method === 'comptoir' && c.statut !== 'annule').length
  const nbAnnulees = cmds.filter(c => c.statut === 'annule').length
  const nbEncaissees = cmds.filter(c => c.statut !== 'annule' && c.statut !== 'en_attente_paiement_comptoir').length
  const caJour = cmds.filter(c => c.statut !== 'annule').reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const remisesJour = cmds.reduce((s, c) => s + Number(c.borne_remise_eur ?? 0), 0)
  const nbFidelite = cmds.filter(c => c.client_id !== null).length

  // ─── Top 10 produits ────────────────────────────────────────────────
  const cmdIds = cmds.map(c => c.id as string)
  type TopRow = { recette_id: string | null; recette_nom: string; total_qty: number }
  let topProduits: TopRow[] = []
  if (cmdIds.length > 0) {
    const { data: articlesData } = await supabase
      .from('commande_articles')
      .select('recette_id, quantite, recette:recettes(nom)')
      .in('commande_id', cmdIds)
    const map = new Map<string, { nom: string; qty: number }>()
    for (const a of articlesData ?? []) {
      const rid = (a.recette_id as string) ?? '—'
      const rec = a.recette as { nom?: string } | { nom?: string }[] | null
      const nom = Array.isArray(rec) ? rec[0]?.nom ?? '—' : rec?.nom ?? '—'
      const exist = map.get(rid)
      if (exist) exist.qty += Number(a.quantite ?? 1)
      else map.set(rid, { nom, qty: Number(a.quantite ?? 1) })
    }
    topProduits = Array.from(map.entries())
      .map(([rid, v]) => ({ recette_id: rid, recette_nom: v.nom, total_qty: v.qty }))
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, 10)
  }

  // ─── Échecs NFC 7 derniers jours ───────────────────────────────────
  const debut7j = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
  const { count: nbEchecsNFC7j } = await supabase
    .from('borne_evenements')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'nfc_echec')
    .gte('created_at', debut7j)

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <AdminPageHeader
        accent="red"
        subtitle="Borne kiosk"
        title="Activité borne"
        description={`${sessions.filter(s => s.active).length} borne(s) active(s) · ${cmds.length} commande(s) aujourd'hui`}
        actions={
          <Link href="/admin/borne-pin" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-zinc-900 text-white text-sm font-black border border-zinc-800 hover:bg-zinc-800">
            🔒 PIN manager
          </Link>
        }
      />

      {/* KPIs du jour */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 4 KPI principaux visibles sur mobile */}
        <Kpi label="CA borne aujourd'hui" value={`${caJour.toFixed(2)} €`} emoji="💰" accent="emerald" />
        <Kpi label="Paiement NFC" value={String(nbNfc)} emoji="📡" accent="blue" />
        <Kpi label="Paiement comptoir" value={String(nbComptoir)} emoji="🏪" accent="violet" />
        <Kpi label="Échecs NFC (7j)" value={String(nbEchecsNFC7j ?? 0)} emoji="⚠" accent="red" />
        {/* 4 KPI secondaires masqués sur mobile (économise 2 écrans) */}
        <div className="hidden sm:contents">
          <Kpi label="Commandes encaissées" value={String(nbEncaissees)} emoji="✓" accent="emerald" />
          <Kpi label="Avec fidélité" value={String(nbFidelite)} emoji="🎁" accent="amber" />
          <Kpi label="Remises fidélité" value={`${remisesJour.toFixed(2)} €`} emoji="−" accent="amber" />
          <Kpi label="Annulées / expirées" value={String(nbAnnulees)} emoji="✗" accent="red" />
        </div>
      </section>

      {/* Sessions actives */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-display italic text-2xl text-zinc-900 mb-3">Bornes</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Aucune borne enregistrée. Une borne s'enregistre dès la première visite sur /borne.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-zinc-500 font-black border-b">
                <th className="py-2">Borne</th>
                <th className="py-2">Statut</th>
                <th className="py-2">Dernière action</th>
                <th className="py-2 hidden md:table-cell">Dernière commande</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.borne_id} className="border-b border-zinc-100">
                  <td className="py-2 font-mono text-xs"><span className="truncate inline-block max-w-[120px] sm:max-w-none align-middle" title={s.borne_id}>{s.borne_id}</span></td>
                  <td className="py-2">
                    {s.active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                        💤 Inactive ({s.inactif_min} min)
                      </span>
                    )}
                  </td>
                  <td className="py-2 tabular-nums text-xs text-zinc-600">
                    il y a {s.inactif_min} min
                  </td>
                  <td className="py-2 tabular-nums text-xs text-zinc-600 hidden md:table-cell">
                    {s.derniere_cmd_at
                      ? new Date(s.derniere_cmd_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Top produits du jour */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-display italic text-2xl text-zinc-900 mb-3">Top 10 produits du jour</h2>
        {topProduits.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Aucune vente borne aujourd'hui.</p>
        ) : (
          <ol className="space-y-1.5">
            {topProduits.map((p, i) => (
              <li key={p.recette_id ?? i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-zinc-50">
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${
                  i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-zinc-400 text-white' : i === 2 ? 'bg-orange-700 text-white' : 'bg-zinc-200 text-zinc-600'
                }`}>{i + 1}</span>
                <p className="flex-1 text-sm text-zinc-800 font-medium">{p.recette_nom}</p>
                <span className="text-sm font-black tabular-nums text-emerald-600">×{p.total_qty}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Liens utiles */}
      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
        <h2 className="font-display italic text-lg text-zinc-900 mb-3">Liens utiles</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/borne" target="_blank" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-zinc-200 text-sm font-medium hover:bg-zinc-100">
            🛍 Ouvrir la borne
          </Link>
          <Link href="/admin/borne-pin" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-zinc-200 text-sm font-medium hover:bg-zinc-100">
            🔒 PIN manager
          </Link>
          <Link href="/emporter" target="_blank" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-zinc-200 text-sm font-medium hover:bg-zinc-100">
            🥪 /emporter (encaissement)
          </Link>
          <Link href="/admin/clients" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-zinc-200 text-sm font-medium hover:bg-zinc-100">
            🎁 Fidélité clients
          </Link>
        </div>
      </section>
    </main>
  )
}

function Kpi({ label, value, emoji, accent }: { label: string; value: string; emoji: string; accent: 'emerald' | 'blue' | 'violet' | 'amber' | 'red' }) {
  const cls = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    violet:  'bg-violet-50 border-violet-200 text-violet-700',
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  }[accent]
  return (
    <div className={`rounded-2xl border-2 p-3 ${cls}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
        <span className="text-lg">{emoji}</span>
      </div>
      <p className="font-display italic text-2xl font-medium tabular-nums mt-1">{value}</p>
    </div>
  )
}
