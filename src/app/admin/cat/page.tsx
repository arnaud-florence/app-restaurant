// /admin/cat — « Le Centre de contrôle » : la page d'accueil qui montre, d'un
// seul coup d'œil, TOUT ce que l'app contient et son état en direct.
//   ① Le Pouls (santé live)  ② La Carte complète (49 modules + recherche)
//   ③ À traiter (alertes gérant)  + lien vers le Plan imprimable.
// Filtré par rôle : le gérant voit tout, chaque employé voit sa carte réduite.

import Link from 'next/link'
import { CATEGORIES, filtrerCategories } from '@/lib/navigation'
import { getActivation } from '@/lib/activation/server'
import { getProfile } from '@/lib/auth'
import PullToRefresh from '@/components/PullToRefresh'
import { canAccess } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { ArrowRight, AlertTriangle, Printer, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import AppMap, { type MapCategory, type Badge } from '@/components/control/AppMap'
import PulseStrip, { type PulseTile } from '@/components/control/PulseStrip'
import { lireBriefDuJour } from '@/lib/co-gerant/brief'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Centre de contrôle' }

const URG_RANK: Record<string, number> = { rouge: 0, orange: 1, jaune: 2, info: 3 }

function bonjourSelonHeure(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Bonjour'
  if (h < 14) return 'Bon midi'
  if (h < 18) return 'Bel après-midi'
  if (h < 23) return 'Bonsoir'
  return 'Bonne fin de soirée'
}

export default async function CatIndexPage() {
  const profil = await getProfile()
  // Mode « aperçu employé » : on filtre les modules comme les verrait le salarié.
  const ap = profil?.apercu ?? null
  const isManager = !ap && profil?.role === 'manager'
  const posteNav = ap ? ap.ciblePoste : (profil?.poste ?? null)
  const permsNav = ap ? ap.ciblePerms : (profil?.custom_permissions ?? null)
  const peutVoir = (href: string) => isManager || canAccess(posteNav, href, permsNav)

  // Univers visibles : d'abord les activités ouvertes (migration 0110), puis
  // les permissions du poste. Un module d'activité fermée n'apparaît pour
  // personne, manager compris — c'est le sens de la mise en veille.
  const etatActivation = await getActivation()
  const categoriesVisibles = filtrerCategories(etatActivation)
    .map(c => ({ ...c, items: c.items.filter(it => peutVoir(it.href)) }))
    .filter(c => c.items.length > 0)

  const mapCategories: MapCategory[] = categoriesVisibles.map(c => ({
    slug: c.slug, label: c.label, emoji: c.emoji, tone: c.tone, pitch: c.pitch,
    items: c.items.map(i => ({ href: i.href, emoji: i.emoji, label: i.label, description: i.description })),
  }))
  const totalModules = mapCategories.reduce((s, c) => s + c.items.length, 0)
  const moduleHrefs = mapCategories.flatMap(c => c.items.map(i => i.href))

  // ─── Données live ───────────────────────────────────────────────
  const sb = await createClient()
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)

  const [caJourRes, enCoursRes, tablesRes, findingsRes, stockRes, equipeRes] = await Promise.all([
    sb.from('commandes').select('montant_total_ttc').eq('statut', 'encaisse').gte('created_at', dayStart.toISOString()),
    sb.from('commandes').select('id', { count: 'exact', head: true }).in('statut', ['en_attente', 'en_preparation', 'pret', 'servi']),
    sb.from('tables_restaurant').select('statut'),
    sb.from('agent_findings').select('urgence, titre, message, action_label, action_url').eq('resolu', false),
    sb.from('ingredients').select('stock_actuel, stock_minimum'),
    sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true),
  ])

  const caJour = (caJourRes.data ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const nbEnCours = enCoursRes.count ?? 0
  const tablesData = tablesRes.data ?? []
  const nbTables = tablesData.length
  const nbOccupees = tablesData.filter(t => t.statut && t.statut !== 'libre').length
  const nbEquipe = equipeRes.count ?? 0

  const findings = findingsRes.data ?? []
  const nbATraiter = findings.length
  const nbRouges = findings.filter(f => f.urgence === 'rouge').length

  const stock = stockRes.data ?? []
  const nbRuptures = stock.filter(i => Number(i.stock_actuel) <= 0).length
  const nbStockBas = stock.filter(i => Number(i.stock_actuel) > 0 && Number(i.stock_actuel) <= Number(i.stock_minimum)).length

  // Badges live par module : on rattache chaque signalement au module le plus
  // spécifique que vise son action_url.
  const badges: Record<string, Badge> = {}
  const bestModule = (url: string): string | null => {
    let best: string | null = null
    for (const href of moduleHrefs) {
      if (url === href || url.startsWith(href + '/')) {
        if (!best || href.length > best.length) best = href
      }
    }
    return best
  }
  for (const f of findings) {
    if (!f.action_url) continue
    const href = bestModule(f.action_url)
    if (!href) continue
    const u = (f.urgence in URG_RANK ? f.urgence : 'info') as Badge['urg']
    const cur = badges[href] ?? { count: 0, urg: 'info' as Badge['urg'] }
    cur.count += 1
    if (URG_RANK[u] < URG_RANK[cur.urg]) cur.urg = u
    badges[href] = cur
  }

  // À traiter (manager) : top alertes triées par gravité
  const alertesFeed = [...findings]
    .sort((a, b) => (URG_RANK[a.urgence] ?? 9) - (URG_RANK[b.urgence] ?? 9))
    .slice(0, 4)

  // ─── Pouls (tuiles) ─────────────────────────────────────────────
  const tiles: PulseTile[] = []
  if (isManager) {
    tiles.push({ label: 'CA du jour', value: caJour.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €', sub: 'encaissé', tone: 'emerald', href: '/admin/finances' })
  }
  tiles.push({ label: 'En cours', value: String(nbEnCours), sub: nbEnCours > 1 ? 'commandes' : 'commande', tone: 'amber', href: '/admin/cat/service' })
  tiles.push({ label: 'Tables', value: nbTables > 0 ? `${nbOccupees}/${nbTables}` : '—', sub: 'occupées', tone: 'blue', href: '/serveur' })
  if (isManager) {
    tiles.push({ label: 'À traiter', value: String(nbATraiter), sub: nbRouges > 0 ? `${nbRouges} urgent${nbRouges > 1 ? 's' : ''}` : 'signalements', tone: nbRouges > 0 ? 'red' : nbATraiter > 0 ? 'amber' : 'emerald', href: '/admin/pilotage' })
    tiles.push({ label: 'Stock', value: nbRuptures > 0 ? `${nbRuptures}` : nbStockBas > 0 ? `${nbStockBas}` : 'OK', sub: nbRuptures > 0 ? 'rupture' + (nbRuptures > 1 ? 's' : '') : nbStockBas > 0 ? 'bas' : 'tout est là', tone: nbRuptures > 0 ? 'red' : nbStockBas > 0 ? 'amber' : 'emerald', href: '/admin/stock' })
    tiles.push({ label: 'Équipe', value: String(nbEquipe), sub: 'actifs', tone: 'violet', href: '/admin/rh' })
  }

  const prenom = ap ? ap.ciblePrenom : (profil?.email ? profil.email.split('@')[0] : '')

  // Le mot d'Arnaud (co-gérant) — surfacé sur l'accueil pour le gérant.
  const briefBrut = isManager ? await lireBriefDuJour() : null
  const todayISO = new Date().toISOString().slice(0, 10)
  const briefArnaud = briefBrut && briefBrut.date === todayISO ? briefBrut : null

  return (
    <div className="min-h-screen bg-zinc-50">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        aria-hidden
      />

      <PullToRefresh>
      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        {/* ─── HERO compact ──────────────────────────────────────── */}
        <header className="relative overflow-hidden rounded-3xl bg-zinc-900 shadow-xl ring-1 ring-zinc-200 min-h-[160px] sm:min-h-[240px]">
          <video autoPlay loop muted playsInline preload="metadata"
            poster="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=75"
            className="absolute inset-0 w-full h-full object-cover" aria-hidden>
            <source src="/videos/hero.mp4.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" aria-hidden />
          <div className="relative z-10 h-full min-h-[160px] sm:min-h-[240px] flex flex-col justify-between p-5 sm:p-7 text-white">
            <div className="flex items-start justify-between gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/videos/logo%20casatasia.png" alt="Logo CASATASIA" className="h-10 sm:h-14 w-auto drop-shadow-2xl" />
              <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-white/15 backdrop-blur-md text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] ring-1 ring-white/30">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-white/80">
                {bonjourSelonHeure()}{prenom ? ` · ${prenom}` : ''}
              </p>
              <h1 className="font-display text-4xl sm:text-6xl font-medium tracking-[-0.03em] leading-[0.9] drop-shadow-2xl italic">
                Centre de<br className="sm:hidden" /> contrôle
              </h1>
              <p className="text-xs sm:text-sm text-white/90 max-w-xl">
                {isManager
                  ? `${categoriesVisibles.length} univers · ${totalModules} modules · 15 agents IA qui veillent — tout est ici.`
                  : 'Ton espace : tes outils du jour, réunis au même endroit.'}
              </p>
            </div>
          </div>
        </header>

        {/* ─── 🧑‍💼 ARNAUD — ton co-gérant (gérant) ──────────────── */}
        {isManager && (
          <Link href="/admin/co-gerant" className="block rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white p-5 ring-1 ring-zinc-200 active:scale-[0.99] transition">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center h-10 w-10 rounded-2xl bg-white/10 text-xl shrink-0">🧑‍💼</span>
              <div className="min-w-0 flex-1">
                <p className="font-black">Arnaud — ton co-gérant</p>
                <p className="text-xs text-white/70">Il bâtit, complète, audite. Parle-lui, il agit.</p>
              </div>
              <ArrowRight className="h-5 w-5 text-white/60 shrink-0" strokeWidth={2} />
            </div>
            {briefArnaud && (
              <div className="mt-3 rounded-2xl bg-white/10 p-3 space-y-1.5">
                <p className="text-[11px] font-black uppercase tracking-wide text-amber-300">☀️ Le mot d'Arnaud</p>
                <p className="text-sm text-white/95"><span className="font-bold">Hier :</span> {briefArnaud.hier}</p>
                {briefArnaud.priorites.length > 0 && (
                  <ol className="space-y-0.5">
                    {briefArnaud.priorites.slice(0, 3).map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-white/90">
                        <span className="text-amber-300 font-black">{i + 1}.</span><span>{p}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </Link>
        )}

        {/* ─── ① LE POULS ────────────────────────────────────────── */}
        <PulseStrip tiles={tiles} />

        {/* ─── ③ À TRAITER (manager) ─────────────────────────────── */}
        {isManager && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black uppercase tracking-[0.15em] text-zinc-500 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} /> À traiter
              </h2>
              {alertesFeed.length > 0 && (
                <Link href="/admin/pilotage" className="text-[11px] font-bold text-zinc-500 inline-flex items-center gap-0.5 active:scale-95 transition">
                  Tout voir <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                </Link>
              )}
            </div>
            {alertesFeed.length === 0 ? (
              <div className="rounded-3xl bg-white ring-1 ring-zinc-200 p-5 text-center">
                <div className="text-3xl mb-1">✅</div>
                <p className="text-sm font-bold text-zinc-800">Tout est sous contrôle</p>
                <p className="text-xs text-zinc-500 mt-0.5">Aucune alerte à traiter pour l'instant.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {alertesFeed.map((a, i) => <AlerteCard key={i} a={a} />)}
              </div>
            )}
          </section>
        )}

        {/* ─── ② LA CARTE COMPLÈTE + ③ RECHERCHE ─────────────────── */}
        <AppMap categories={mapCategories} badges={badges} totalModules={totalModules} />

        {/* Pied : agents + plan imprimable */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-3xl bg-zinc-900 text-white p-4 sm:p-5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/10 shrink-0"><Bot className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="font-black text-sm">15 agents IA veillent en continu</p>
              <p className="text-xs text-white/70 truncate">Sécurité · stock · HACCP · finances · RH… — {nbATraiter} signalement{nbATraiter > 1 ? 's' : ''} en attente</p>
            </div>
          </div>
          {isManager && (
            <Link href="/print/plan" target="_blank" className="shrink-0 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full bg-white text-zinc-900 text-sm font-bold active:scale-95 transition">
              <Printer className="h-4 w-4" strokeWidth={2.5} /> Plan de l'app
            </Link>
          )}
        </section>
      </main>
      </PullToRefresh>
    </div>
  )
}

// ─── Carte d'alerte « à traiter » ───────────────────────────────
function AlerteCard({
  a,
}: {
  a: { urgence: string; titre: string; message: string | null; action_label: string | null; action_url: string | null }
}) {
  const dot = a.urgence === 'rouge' ? 'bg-red-500' : a.urgence === 'orange' ? 'bg-amber-500' : a.urgence === 'jaune' ? 'bg-yellow-500' : 'bg-blue-500'
  return (
    <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-900 leading-snug">{a.titre}</p>
          {a.message && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-snug">{a.message}</p>}
          {a.action_url && (
            <Link href={a.action_url} className="inline-flex items-center gap-1 mt-2.5 h-9 px-3.5 rounded-full bg-zinc-900 text-white text-xs font-bold active:scale-95 transition">
              {a.action_label || 'Voir'} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
