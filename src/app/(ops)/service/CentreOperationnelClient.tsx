'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { fmtPrix } from '@/lib/service'
import type { CentreOperationnel, CartePoste, GroupePoste } from '@/lib/centre-operationnel'

const URGENCE_STYLE: Record<CartePoste['urgence'], { ring: string; bg: string; valeur: string; dot: string }> = {
  vert:   { ring: 'ring-emerald-500/30', bg: 'from-emerald-500/10', valeur: 'text-emerald-300', dot: 'bg-emerald-400' },
  orange: { ring: 'ring-amber-500/40',   bg: 'from-amber-500/10',   valeur: 'text-amber-300',   dot: 'bg-amber-400' },
  rouge:  { ring: 'ring-red-500/50',     bg: 'from-red-500/15',     valeur: 'text-red-300',     dot: 'bg-red-400' },
}

const ZONES: { key: GroupePoste; label: string; emoji: string }[] = [
  { key: 'production', label: 'Production',          emoji: '🔥' },
  { key: 'salle',      label: 'Salle & encaissement', emoji: '🪑' },
  { key: 'hotel',      label: 'Hôtel & réservations', emoji: '🛎' },
]

function depuis(iso: string | null): string {
  if (!iso) return 'service pas encore démarré'
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `ouvert depuis ${h}h${m}`
}

function ilYA(iso: string, now: number): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}h${d.getMinutes().toString().padStart(2, '0')}`
}

/** Formate un pourcentage signé en français : +12,3 % / -4,0 %. */
function fmtDelta(pct: number): string {
  const signe = pct > 0 ? '+' : ''
  return `${signe}${pct.toFixed(1).replace('.', ',')} %`
}

export default function CentreOperationnelClient({ initial }: { initial: CentreOperationnel }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Horloge (pour les "il y a X min" du fil)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Realtime : tout événement de service rafraîchit le hub (debounce 700 ms)
  useEffect(() => {
    const sb = createClient()
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => router.refresh(), 700)
    }
    const ch = sb.channel('centre-operationnel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables_restaurant' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions_caisse' }, scheduleRefresh)
      .subscribe()
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); sb.removeChannel(ch) }
  }, [router])

  const d = initial
  const mixTotal = d.mixCanaux.table + d.mixCanaux.online + d.mixCanaux.comptoir

  return (
    <div className="min-h-screen pb-mobile-nav" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* ═══ POULS DU SERVICE ═══ */}
      <header className="sticky top-0 z-20 bg-gradient-to-b from-zinc-950 to-[#0D0D0D]/95 backdrop-blur border-b border-zinc-800 px-3 sm:px-5 pt-3 pb-2.5">
        {/* Ligne titre */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display italic text-xl sm:text-2xl font-medium text-white tracking-tight leading-none">Centre opérationnel</h1>
            <p className="text-[10px] sm:text-[11px] text-emerald-400 font-bold uppercase tracking-wider mt-1 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
              {depuis(d.ouvertDepuis)}
            </p>
          </div>
          {d.alertesRouges > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 text-red-200 ring-1 ring-red-500/40 animate-pulse text-sm font-black tabular-nums">
              🚨 {d.alertesRouges} <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">alerte{d.alertesRouges > 1 ? 's' : ''}</span>
            </span>
          )}
        </div>

        {/* Bandeau KPI (scroll horizontal sur mobile) */}
        <div className="mt-2.5 flex items-stretch gap-2 sm:gap-2.5 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Carte héros — CA du jour */}
          <div className="shrink-0 min-w-[176px] sm:min-w-[200px] rounded-2xl bg-gradient-to-br from-emerald-500/15 to-zinc-900 ring-1 ring-emerald-500/30 px-3.5 py-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-300/80">CA du jour</span>
              <DeltaBadge delta={d.deltaS1Pct} />
            </div>
            <p className="text-[32px] sm:text-4xl font-black tabular-nums leading-none text-emerald-200 mt-0.5">{fmtPrix(d.caJour)}</p>
            <ObjectifBar pct={d.objectifPct} cible={d.objectifJour} />
          </div>

          <KpiTile label="Ticket moyen" value={fmtPrix(d.ticketMoyen)} sub={`${d.nbTickets} ticket${d.nbTickets > 1 ? 's' : ''}`} />
          <KpiTile label="En cours" value={`${d.commandesEnCours}`} sub="commandes" accent={d.commandesEnCours > 0 ? 'amber' : undefined} />
          <KpiTile label="En salle" value={fmtPrix(d.caEnCours)} sub="non encaissé" />
          <SparkTile data={d.caParHeure} />
        </div>

        {/* Mix canaux */}
        {mixTotal > 0 && (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <div className="flex h-1.5 flex-1 min-w-[140px] overflow-hidden rounded-full bg-zinc-800">
              <span className="bg-blue-400"    style={{ width: `${(d.mixCanaux.table    / mixTotal) * 100}%` }} />
              <span className="bg-emerald-400" style={{ width: `${(d.mixCanaux.online   / mixTotal) * 100}%` }} />
              <span className="bg-violet-400"  style={{ width: `${(d.mixCanaux.comptoir / mixTotal) * 100}%` }} />
            </div>
            <div className="flex items-center gap-2.5 text-[10px] tabular-nums text-zinc-400">
              <LegendeCanal couleur="bg-blue-400"    label="Sur place" val={d.mixCanaux.table} />
              <LegendeCanal couleur="bg-emerald-400" label="Online"    val={d.mixCanaux.online} />
              <LegendeCanal couleur="bg-violet-400"  label="Comptoir"  val={d.mixCanaux.comptoir} />
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 sm:gap-4 p-3 sm:p-5">
        {/* ═══ ZONES DE POSTES ═══ */}
        <div className="flex flex-col gap-4 sm:gap-5">
          {ZONES.map(zone => {
            const cartes = d.cartes.filter(c => c.groupe === zone.key)
            if (cartes.length === 0) return null
            const nbRouge = cartes.filter(c => c.urgence === 'rouge').length
            return (
              <section key={zone.key}>
                <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2 px-0.5">
                  <span className="text-sm not-italic">{zone.emoji}</span>
                  {zone.label}
                  {nbRouge > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 auto-rows-fr">
                  {cartes.map(c => <Carte key={c.cle} c={c} />)}
                </div>
              </section>
            )
          })}
        </div>

        {/* ═══ FIL D'ACTUALITÉ ═══ */}
        <aside className="rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 p-3 sm:p-4 lg:max-h-[calc(100vh-200px)] lg:sticky lg:top-[180px] flex flex-col">
          {/* ── Top plats du jour (à pousser) ── */}
          {d.topPlats.length > 0 && (
            <div className="mb-3 pb-3 border-b border-zinc-800">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-1.5">🔥 Top plats du jour</p>
              <ol className="space-y-1">
                {d.topPlats.map((p, i) => (
                  <li key={p.nom} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-zinc-200"><span className="text-zinc-500 mr-1.5 tabular-nums">{i + 1}.</span>{p.nom}</span>
                    <span className="text-emerald-300 font-black tabular-nums shrink-0">×{p.qte}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" /><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" /></span>
            Fil d&apos;actualité
          </p>
          {d.activite.length === 0 ? (
            <p className="text-sm text-zinc-500 italic py-6 text-center">Rien pour l&apos;instant. Les événements du service s&apos;afficheront ici.</p>
          ) : (
            <ul className="space-y-1.5 overflow-y-auto flex-1 -mr-1 pr-1">
              {d.activite.map(ev => (
                <li key={ev.id} className="flex items-start gap-2 text-sm">
                  <span className="text-base leading-tight shrink-0">{ev.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-200 leading-tight truncate">{ev.texte}</p>
                    <p className="text-[10px] text-zinc-500 tabular-nums">{ilYA(ev.created_at, now)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}

/** Carte d'un poste — chiffre principal + feu tricolore + détails. */
function Carte({ c }: { c: CartePoste }) {
  const st = URGENCE_STYLE[c.urgence]
  return (
    <Link
      href={c.href}
      className={cn(
        'group relative flex flex-col rounded-2xl bg-gradient-to-br to-zinc-900 bg-zinc-900 ring-1 p-3 sm:p-4 min-h-[120px] sm:min-h-[148px]',
        'active:scale-[0.97] transition-transform',
        st.bg, st.ring,
        c.urgence === 'rouge' && 'ring-2',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl sm:text-3xl leading-none">{c.emoji}</span>
        <span className={cn('h-2.5 w-2.5 rounded-full mt-1.5 shrink-0', st.dot, c.urgence === 'rouge' && 'animate-pulse')} />
      </div>
      <p className="text-xs sm:text-sm font-black text-zinc-100 mt-2 leading-tight">{c.titre}</p>
      <div className="mt-auto pt-1">
        <p className={cn('text-3xl sm:text-4xl font-black tabular-nums leading-none', st.valeur)}>{c.valeur}</p>
        <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5 leading-tight">{c.legende}</p>
        {c.details.map((det, i) => (
          <p key={i} className="text-[10px] sm:text-[11px] text-zinc-500 leading-tight truncate">{det}</p>
        ))}
      </div>
    </Link>
  )
}

/** Tuile KPI compacte du bandeau. */
function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'amber' }) {
  return (
    <div className={cn(
      'shrink-0 min-w-[104px] rounded-2xl bg-zinc-900 ring-1 px-3 py-2.5 flex flex-col justify-between',
      accent === 'amber' ? 'ring-amber-500/30' : 'ring-zinc-800',
    )}>
      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{label}</span>
      <p className={cn('text-xl sm:text-2xl font-black tabular-nums leading-none mt-1', accent === 'amber' ? 'text-amber-200' : 'text-zinc-100')}>{value}</p>
      {sub && <span className="text-[10px] text-zinc-500 leading-tight mt-0.5">{sub}</span>}
    </div>
  )
}

/** Sparkline du CA encaissé par heure (cadence du service). */
function SparkTile({ data }: { data: number[] }) {
  const nowH = new Date().getHours()
  const firstActive = data.findIndex(v => v > 0)
  if (firstActive === -1) return null
  const to = Math.max(nowH, firstActive)
  const slice: { h: number; v: number }[] = []
  for (let h = firstActive; h <= to; h++) slice.push({ h, v: data[h] ?? 0 })
  const max = Math.max(...slice.map(s => s.v), 1)
  const peak = slice.reduce((a, b) => (b.v > a.v ? b : a), slice[0])
  return (
    <div className="shrink-0 min-w-[120px] rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 px-3 py-2.5 flex flex-col justify-between">
      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">CA / heure</span>
      <div className="flex items-end gap-[3px] h-8 my-1">
        {slice.map(s => (
          <span
            key={s.h}
            title={`${s.h}h — ${fmtPrix(s.v)}`}
            className={cn('w-1.5 rounded-sm', s.h === nowH ? 'bg-emerald-400' : 'bg-zinc-600')}
            style={{ height: `${Math.max(8, (s.v / max) * 100)}%` }}
          />
        ))}
      </div>
      <span className="text-[10px] text-zinc-500 leading-tight tabular-nums">pic {peak.h}h · {fmtPrix(peak.v)}</span>
    </div>
  )
}

/** Badge de variation vs même jour la semaine dernière. */
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">1ʳᵉ réf.</span>
  }
  const positif = delta >= 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums rounded-md px-1.5 py-0.5',
      positif ? 'text-emerald-300 bg-emerald-500/15' : 'text-red-300 bg-red-500/15',
    )}>
      {positif ? '▲' : '▼'} {fmtDelta(delta)}
      <span className="text-[8px] font-bold opacity-70">/S-1</span>
    </span>
  )
}

/** Barre de progression vers l'objectif du jour (dérivé de l'objectif mensuel). */
function ObjectifBar({ pct, cible }: { pct: number | null; cible: number | null }) {
  if (pct == null || cible == null) {
    return (
      <Link href="/admin/pilotage" className="mt-1.5 block text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors">
        objectif non défini →
      </Link>
    )
  }
  const atteint = pct >= 100
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[9px] tabular-nums mb-0.5">
        <span className={cn('font-black', atteint ? 'text-emerald-300' : 'text-zinc-400')}>
          {atteint ? '✓ ' : ''}{pct} % de l&apos;objectif
        </span>
        <span className="text-zinc-600">obj. {fmtPrix(cible)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <span className={cn('block h-full rounded-full', atteint ? 'bg-emerald-400' : 'bg-emerald-500/70')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

/** Élément de légende du mix canaux. */
function LegendeCanal({ couleur, label, val }: { couleur: string; label: string; val: number }) {
  if (val <= 0) return null
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('h-2 w-2 rounded-full', couleur)} />
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-bold">{fmtPrix(val)}</span>
    </span>
  )
}
