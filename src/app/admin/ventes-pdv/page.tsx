// Dashboard « Ventes — 2 activités · vision consolidée ».
//
// Architecture validée par le comptable (juin 2026) : UNE entité CASATASIA, même
// comptabilité, mais DEUX activités/fonds suivis séparément :
//   🍽 Restaurant : Restauration, Bar, Snack (+ chambres, événementiel)
//   🥖 Fournil    : Boulangerie + Tabac, Relais colis, FDJ (commissions/marge)
//
// On ventile le CA par activité PUIS par point de vente, avec un bandeau consolidé.
// « Ventes » = commandes hors statut 'annule' ; les ventes comptoir restent
// en_attente/servi (encaissées sur la caisse agréée) → split encaissé / à encaisser.
// Tabac/Colis/FDJ = commissions (prestation, TVA 20 %), affichées sous le Fournil.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fmtPrix } from '@/lib/foodCost'
import { ACTIVITES, activiteDe, type Activite } from '@/lib/activites'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ventes — 2 activités' }

type Periode = 'jour' | '7j' | '30j' | 'mois'
const PERIODES: { cle: Periode; label: string }[] = [
  { cle: 'jour', label: "Aujourd'hui" },
  { cle: '7j', label: '7 jours' },
  { cle: '30j', label: '30 jours' },
  { cle: 'mois', label: 'Ce mois' },
]

function bornePeriode(p: Periode): { startIso: string; label: string } {
  const now = new Date()
  const d = (x: Date) => x.toISOString()
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  switch (p) {
    case 'jour': return { startIso: d(midnight(now)), label: "aujourd'hui" }
    case '7j': return { startIso: d(midnight(new Date(now.getTime() - 6 * 86_400_000))), label: '7 derniers jours' }
    case 'mois': return { startIso: d(new Date(now.getFullYear(), now.getMonth(), 1)), label: 'mois en cours' }
    case '30j':
    default: return { startIso: d(midnight(new Date(now.getTime() - 29 * 86_400_000))), label: '30 derniers jours' }
  }
}

// Classes Tailwind statiques par couleur.
const COULEUR: Record<string, { bar: string; dot: string; text: string }> = {
  emerald: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  violet: { bar: 'bg-violet-500', dot: 'bg-violet-500', text: 'text-violet-600' },
  blue: { bar: 'bg-blue-500', dot: 'bg-blue-500', text: 'text-blue-600' },
  amber: { bar: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-600' },
  red: { bar: 'bg-red-500', dot: 'bg-red-500', text: 'text-red-600' },
  orange: { bar: 'bg-orange-500', dot: 'bg-orange-500', text: 'text-orange-600' },
  zinc: { bar: 'bg-zinc-400', dot: 'bg-zinc-400', text: 'text-zinc-600' },
}
const EMOJI_CAT: Record<string, string> = {
  restauration: '🍽', boulangerie: '🥖', service_tiers: '🎰', tabac_presse: '🚬',
}

type Etab = {
  id: string; nom: string; slug: string; categorie: string; couleur: string
  ordre: number; inclus_ca_principal: boolean
}
type Agg = { ca: number; caEncaisse: number; nb: number }
type LigneCa = { etab: Etab; ca: number; caEncaisse: number; nb: number }
type LigneComm = { etab: Etab; commission: number; brut: number; ops: number }

export default async function VentesPdvPage({ searchParams }: { searchParams: { periode?: string } }) {
  const periode = (PERIODES.find(p => p.cle === searchParams.periode)?.cle ?? '30j') as Periode
  const { startIso, label } = bornePeriode(periode)
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)
  const startDate = startIso.slice(0, 10)

  const [etabRes, cmdRes, commRes] = await Promise.all([
    supabase.from('etablissements').select('id, nom, slug, categorie, couleur, ordre, inclus_ca_principal').eq('actif', true).order('ordre'),
    supabase.from('commandes').select('etablissement_id, montant_total_ttc, statut').neq('statut', 'annule').gte('created_at', startIso),
    supabase.from('commissions_tiers').select('etablissement_id, montant_commission, montant_brut_transite, nb_operations, periode_debut, periode_fin')
      .gte('periode_fin', startDate).lte('periode_debut', today),
  ])

  const etabs = (etabRes.data ?? []) as Etab[]
  const cmds = (cmdRes.data ?? []) as { etablissement_id: string | null; montant_total_ttc: number | null; statut: string | null }[]
  const comms = (commRes.data ?? []) as { etablissement_id: string; montant_commission: number | null; montant_brut_transite: number | null; nb_operations: number | null }[]

  // Agrégation CA par établissement (+ bucket null = non attribué)
  const agg = new Map<string, Agg>()
  let nonAttr: Agg = { ca: 0, caEncaisse: 0, nb: 0 }
  for (const c of cmds) {
    const m = Number(c.montant_total_ttc ?? 0)
    const target = c.etablissement_id ? (agg.get(c.etablissement_id) ?? { ca: 0, caEncaisse: 0, nb: 0 }) : nonAttr
    target.ca += m; target.nb += 1
    if (c.statut === 'encaisse') target.caEncaisse += m
    if (c.etablissement_id) agg.set(c.etablissement_id, target)
  }
  const commAgg = new Map<string, { commission: number; brut: number; ops: number }>()
  for (const c of comms) {
    const a = commAgg.get(c.etablissement_id) ?? { commission: 0, brut: 0, ops: 0 }
    a.commission += Number(c.montant_commission ?? 0)
    a.brut += Number(c.montant_brut_transite ?? 0)
    a.ops += Number(c.nb_operations ?? 0)
    commAgg.set(c.etablissement_id, a)
  }

  // Regroupement par ACTIVITÉ
  const parActivite = (act: Activite) => {
    const liste = etabs.filter(e => activiteDe(e.slug) === act)
    const caLignes: LigneCa[] = liste.filter(e => e.inclus_ca_principal)
      .map(e => ({ etab: e, ...(agg.get(e.id) ?? { ca: 0, caEncaisse: 0, nb: 0 }) }))
      .sort((a, b) => b.ca - a.ca)
    const commLignes: LigneComm[] = liste.filter(e => !e.inclus_ca_principal)
      .map(e => ({ etab: e, ...(commAgg.get(e.id) ?? { commission: 0, brut: 0, ops: 0 }) }))
    const caTotal = caLignes.reduce((s, l) => s + l.ca, 0)
    const commTotal = commLignes.reduce((s, l) => s + l.commission, 0)
    return { caLignes, commLignes, caTotal, commTotal }
  }
  const resto = parActivite('restaurant')
  const fournil = parActivite('fournil')

  const totalCa = resto.caTotal + fournil.caTotal + nonAttr.ca
  const totalComm = resto.commTotal + fournil.commTotal
  const maxCa = Math.max(1, ...resto.caLignes.map(l => l.ca), ...fournil.caLignes.map(l => l.ca), nonAttr.ca)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <Link href="/admin/cat/finances" className="text-xs text-zinc-400 hover:text-zinc-600">← Finances</Link>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 mt-1">📊 Ventes — 2 activités</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Vision consolidée · comptabilités séparées · {label}</p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1">
          {PERIODES.map(p => (
            <Link key={p.cle} href={`/admin/ventes-pdv?periode=${p.cle}`}
              className={`px-3 h-9 inline-flex items-center rounded-lg text-sm font-bold transition ${periode === p.cle ? 'bg-white shadow text-zinc-900' : 'text-zinc-500 hover:text-zinc-800'}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Bandeau consolidé : les 2 activités côte à côte */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <div className="rounded-2xl bg-emerald-600 text-white p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold opacity-80">🍽 Restaurant</p>
          <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1">{fmtPrix(resto.caTotal)}</p>
        </div>
        <div className="rounded-2xl bg-amber-600 text-white p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold opacity-80">🥖 Fournil</p>
          <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1">{fmtPrix(fournil.caTotal)}</p>
        </div>
        <div className="rounded-2xl bg-zinc-900 text-white p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold opacity-80">Total consolidé</p>
          <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1">{fmtPrix(totalCa)}</p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">Commissions tiers</p>
          <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-zinc-900">{fmtPrix(totalComm)}</p>
          <p className="text-[10px] text-zinc-400">TVA 20 % · prestation</p>
        </div>
      </div>
      {nonAttr.ca > 0 && (
        <p className="text-[11px] text-zinc-400 mt-2">
          Dont <strong>{fmtPrix(nonAttr.ca)}</strong> non attribué (commandes créées avant l&apos;attribution par point de vente — les nouvelles sont rattachées automatiquement).
        </p>
      )}

      {/* Section ACTIVITÉ 1 — Restaurant */}
      <ActiviteSection
        cle="restaurant" caLignes={resto.caLignes} commLignes={resto.commLignes}
        caTotal={resto.caTotal} commTotal={resto.commTotal} maxCa={maxCa}
      />

      {/* Section ACTIVITÉ 2 — Fournil */}
      <ActiviteSection
        cle="fournil" caLignes={fournil.caLignes} commLignes={fournil.commLignes}
        caTotal={fournil.caTotal} commTotal={fournil.commTotal} maxCa={maxCa}
      />

      <p className="text-[11px] text-zinc-400 mt-8 border-t border-zinc-100 pt-3">
        Modèle hybride NF525 : notre app prend la commande, la <Link href="/admin/caisse-agreee" className="underline hover:text-zinc-600">caisse agréée</Link> encaisse (1 caisse par activité recommandée). Commissions/tabac à saisir dans <Link href="/admin/commissions" className="underline hover:text-zinc-600">Commissions tiers</Link>.
      </p>
    </div>
  )
}

function ActiviteSection({ cle, caLignes, commLignes, caTotal, commTotal, maxCa }: {
  cle: Activite; caLignes: LigneCa[]; commLignes: LigneComm[]; caTotal: number; commTotal: number; maxCa: number
}) {
  const def = ACTIVITES.find(a => a.cle === cle)!
  const accent = COULEUR[def.couleur] ?? COULEUR.zinc
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{def.emoji}</span>
        <h2 className="text-lg font-black text-zinc-900">{def.nom}</h2>
        <span className={`text-sm font-black tabular-nums ${accent.text}`}>{fmtPrix(caTotal + commTotal)}</span>
      </div>
      <p className="text-[11px] text-zinc-400 mb-3">{def.description}</p>

      {/* Points de vente (CA principal) */}
      {caLignes.length > 0 && (
        <div className="space-y-2.5">
          {caLignes.map(l => {
            const col = COULEUR[l.etab.couleur] ?? COULEUR.zinc
            const part = caTotal > 0 ? (l.ca / caTotal) * 100 : 0
            const width = (l.ca / maxCa) * 100
            const emoji = EMOJI_CAT[l.etab.categorie] ?? '•'
            const ticket = l.nb > 0 ? l.ca / l.nb : 0
            const aEncaisser = l.ca - l.caEncaisse
            return (
              <div key={l.etab.id} className="rounded-2xl bg-white ring-1 ring-zinc-200 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{emoji}</span>
                    <span className="font-bold text-zinc-900 truncate">{l.etab.nom}</span>
                    <span className={`text-xs font-bold ${col.text}`}>{part.toFixed(0)} %</span>
                  </div>
                  <span className="font-black tabular-nums text-zinc-900 shrink-0">{fmtPrix(l.ca)}</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-zinc-100 overflow-hidden">
                  <div className={`h-full rounded-full ${col.bar}`} style={{ width: `${Math.max(2, width)}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-zinc-500 tabular-nums">
                  <span>{l.nb} cmde{l.nb > 1 ? 's' : ''} · ticket {fmtPrix(ticket)}</span>
                  <span>
                    {l.caEncaisse > 0 && <span className="text-emerald-600 font-semibold">encaissé {fmtPrix(l.caEncaisse)}</span>}
                    {aEncaisser > 0.005 && <span className="text-amber-600 font-semibold">{l.caEncaisse > 0 ? ' · ' : ''}à encaisser {fmtPrix(aEncaisser)}</span>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Services tiers (commissions) de l'activité */}
      {commLignes.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Services tiers · commission (TVA 20 %)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {commLignes.map(l => {
              const col = COULEUR[l.etab.couleur] ?? COULEUR.zinc
              const emoji = EMOJI_CAT[l.etab.categorie] ?? '🎰'
              return (
                <div key={l.etab.id} className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <span className="text-lg">{emoji}</span>
                    <span className="font-bold text-zinc-900">{l.etab.nom}</span>
                  </div>
                  <p className="text-2xl font-black tabular-nums text-zinc-900 mt-2">{fmtPrix(l.commission)}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">commission · {l.ops} opération{l.ops > 1 ? 's' : ''}</p>
                  {l.brut > 0 && <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">brut transité {fmtPrix(l.brut)}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {caLignes.length === 0 && commLignes.length === 0 && (
        <p className="text-zinc-400 italic py-6 text-center bg-zinc-50 rounded-2xl">Aucune vente sur la période.</p>
      )}
    </section>
  )
}
