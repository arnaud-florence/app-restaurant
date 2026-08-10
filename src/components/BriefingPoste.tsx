// Bandeau personnalisé "Mon briefing" affiché en haut de chaque page ops.
// Server Component : reçoit le briefing déjà calculé via lib/briefing/poste.ts.
//
// Design : thème sombre #0D0D0D cohérent avec les pages ops. Information
// hiérarchisée par urgence : allergies rouge >> alertes stock orange >>
// info verte (météo, plat du jour, KPI).

import type { Briefing } from '@/lib/briefing/poste'
import { cn } from '@/lib/utils'

const POSTE_INFO: Record<Briefing['poste'], { label: string; emoji: string }> = {
  cuisinier:       { label: 'Cuisinier',  emoji: '👨‍🍳' },
  pizzaiolo:       { label: 'Pizzaïolo',  emoji: '🍕' },
  serveur:         { label: 'Serveur',    emoji: '🍽' },
  barman:          { label: 'Barman',     emoji: '🍷' },
  caisse:          { label: 'Caisse',     emoji: '💰' },
  caisse_snacking: { label: 'Snack',       emoji: '🥪' },
}

function fmtPrix(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function bonjourSelonHeure(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Bonjour'
  if (h < 14) return 'Bon service'
  if (h < 18) return 'Bel après-midi'
  if (h < 23) return 'Bon service'
  return 'Bonne fin de service'
}

export default function BriefingPoste({ briefing }: { briefing: Briefing }) {
  // ⛔ Briefing retiré de l'opérationnel — remplacé par « Le coup de main d'Arnaud » (anti-doublon).
  const MASQUE_OPS: boolean = true
  if (MASQUE_OPS) return null

  const info = POSTE_INFO[briefing.poste]
  const allergiesAggregees = (briefing.reservations ?? [])
    .flatMap(r => r.allergies)
    .filter(Boolean)
  const allergiesUniques = [...new Set(allergiesAggregees)]

  return (
    <section className="hidden md:block bg-[#0D0D0D] text-zinc-100 border-b border-zinc-800 px-4 py-3 space-y-2.5">
      {/* En-tête : salutation + jour + poste */}
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            {info.emoji} {info.label} · {bonjourSelonHeure()}{briefing.prenom ? `, ${briefing.prenom}` : ''}
          </p>
          <h2 className="text-base font-bold">
            Voici ton service d'aujourd'hui
          </h2>
        </div>
        <p className="text-[10px] text-zinc-500 tabular-nums">
          {new Date(briefing.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </header>

      {/* ALLERGIES — IMPOSSIBLE À LOUPER (serveur uniquement) */}
      {allergiesUniques.length > 0 && (
        <div className="bg-red-600 text-white border-4 border-red-300 rounded-md px-3 py-2 animate-pulse">
          <p className="text-[10px] uppercase tracking-wider font-black opacity-90">
            🚨 ALLERGIES CLIENTS RÉSERVÉS — Vigilance maximale
          </p>
          <p className="text-sm font-bold mt-0.5">
            ⛔ À éviter : {allergiesUniques.join(' · ')}
          </p>
        </div>
      )}

      {/* RÉSERVATIONS du jour (serveur) */}
      {briefing.reservations && briefing.reservations.length > 0 && (
        <div className="rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mb-1">
            📅 {briefing.reservations.length} réservation{briefing.reservations.length > 1 ? 's' : ''}
            {' · '}{briefing.reservationsTotalCouverts} couverts
          </p>
          <ul className="text-xs space-y-0.5">
            {briefing.reservations.slice(0, 5).map(r => (
              <li key={r.id} className="flex items-center gap-2 text-zinc-300">
                <span className="font-bold tabular-nums text-white">{r.heure_arrivee}</span>
                <span className="font-medium">{r.client_nom}</span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400">{r.nb_personnes} pers.</span>
                {r.zone && <span className="text-[10px] px-1 rounded bg-zinc-800 text-zinc-300">{r.zone}</span>}
                {r.allergies.length > 0 && (
                  <span className="text-[10px] px-1 rounded bg-red-600 text-white font-bold">
                    ⚠ {r.allergies.length} allergie{r.allergies.length > 1 ? 's' : ''}
                  </span>
                )}
                {r.notes && <span className="text-[10px] text-amber-300 italic truncate">📝 {r.notes.slice(0, 30)}</span>}
              </li>
            ))}
            {briefing.reservations.length > 5 && (
              <li className="text-[10px] text-zinc-500 italic">… et {briefing.reservations.length - 5} de plus</li>
            )}
          </ul>
        </div>
      )}

      {/* Grille INFOS — météo, plats jour, KPI, T° */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {/* Météo */}
        {briefing.meteo && (
          <div className="rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 leading-tight">Météo</p>
            <p className="text-sm font-bold leading-tight">
              {briefing.meteo.emoji} {briefing.meteo.libelle}
              {briefing.meteo.temp_max !== null && <span className="text-zinc-400 ml-1">{Math.round(briefing.meteo.temp_max)}°</span>}
            </p>
            {briefing.meteo.impact_ca_pct !== 0 && (
              <p className={cn('text-[10px] font-bold', briefing.meteo.impact_ca_pct > 0 ? 'text-emerald-400' : 'text-amber-400')}>
                Impact CA estimé : {briefing.meteo.impact_ca_pct > 0 ? '+' : ''}{briefing.meteo.impact_ca_pct}%
              </p>
            )}
          </div>
        )}

        {/* CA + ticket moyen (postes vendeurs) */}
        {briefing.caJour !== undefined && (
          <div className="rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 leading-tight">CA service</p>
            <p className="text-base font-black text-emerald-400 leading-tight tabular-nums">{fmtPrix(briefing.caJour ?? 0)}</p>
            <p className="text-[10px] text-zinc-500 tabular-nums">
              {briefing.nbCommandesJour} cmd · ticket moy {fmtPrix(briefing.ticketMoyenJour ?? 0)}
            </p>
          </div>
        )}

        {/* Température frigo */}
        {briefing.temperatureFrigo && (
          <div className={cn(
            'rounded-md border px-2.5 py-1.5',
            briefing.temperatureFrigo.conforme
              ? 'bg-zinc-900 border-zinc-800'
              : 'bg-red-950/60 border-red-700 animate-pulse',
          )}>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 leading-tight">
              🌡 {briefing.temperatureFrigo.equipement}
            </p>
            <p className={cn(
              'text-base font-black leading-tight tabular-nums',
              briefing.temperatureFrigo.conforme ? 'text-emerald-400' : 'text-red-400',
            )}>
              {briefing.temperatureFrigo.temperature.toFixed(1)}°C
            </p>
            <p className="text-[10px] text-zinc-500">
              {briefing.temperatureFrigo.moment} {briefing.temperatureFrigo.heure}
              {!briefing.temperatureFrigo.conforme && ' · NON CONFORME'}
            </p>
          </div>
        )}

        {/* Plat du jour */}
        {briefing.platsDuJour.length > 0 && (
          <div className="rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 leading-tight">⭐ Plat du jour</p>
            <p className="text-sm font-bold leading-tight truncate">{briefing.platsDuJour[0].nom}</p>
            {briefing.platsDuJour[0].prix_special && (
              <p className="text-[10px] text-emerald-400 tabular-nums">{fmtPrix(briefing.platsDuJour[0].prix_special)}</p>
            )}
            {briefing.platsDuJour.length > 1 && (
              <p className="text-[10px] text-zinc-500">+{briefing.platsDuJour.length - 1} autre{briefing.platsDuJour.length > 2 ? 's' : ''}</p>
            )}
          </div>
        )}
      </div>

      {/* Alertes stock spécifiques au poste */}
      {briefing.alertesStock.length > 0 && (
        <div className="rounded-md bg-amber-950/40 border border-amber-700 px-3 py-1.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-amber-400 mb-0.5">
            ⚠ Stock à surveiller pour ton poste
          </p>
          <p className="text-xs text-amber-200">
            {briefing.alertesStock.slice(0, 5).map(a => (
              `${a.type === 'rupture' ? '🔴' : '🟡'} ${a.ingredient_nom} (${a.stock_actuel} ${a.unite})`
            )).join(' · ')}
          </p>
        </div>
      )}

      {/* DLC critiques à utiliser en priorité */}
      {briefing.dlcCritiques.length > 0 && (
        <div className="rounded-md bg-orange-950/40 border border-orange-700 px-3 py-1.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-orange-400 mb-0.5">
            ⏰ DLC à utiliser en priorité aujourd'hui
          </p>
          <p className="text-xs text-orange-200">
            {briefing.dlcCritiques.slice(0, 4).map(d => (
              `${d.nom} (${d.quantite} ${d.unite}, ${d.joursRestants <= 0 ? 'EXPIRÉ' : `J+${d.joursRestants}`})`
            )).join(' · ')}
          </p>
        </div>
      )}
    </section>
  )
}
