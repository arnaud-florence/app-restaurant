// Types partagés pour les 10 agents permanents.
// Voir migration 0082_agents_permanents.sql.

export type AgentId =
  | 'veilleur'      // 1. Veilleur de nuit (02h00) : clôture, backup, recap
  | 'meteo'         // 2. Météorologue (06h00) : prévision CA + brief matin
  | 'stock'         // 3. Stock (toutes les 2h) : ruptures, bons commande, DLC
  | 'financier'     // 4. Contrôleur financier (toutes les heures)
  | 'rh'            // 5. Manager RH (22h00) : productivité, planning
  | 'haccp'         // 6. Responsable HACCP (toutes les heures)
  | 'commercial'    // 7. Commercial client (20h00) : SMS, relances, avis
  | 'scanner'       // 8. Scanner documents (temps réel)
  | 'strategique'   // 9. Conseiller stratégique (lundi matin)
  | 'securite'      // 10. Vigile sécurité (permanent)
  // ─── Agents temps réel par poste (cron */15min) ────────────────
  | 'cuisine_rt'    // 11. Cuisine temps réel : retards prép, food cost live
  | 'serveur_rt'    // 12. Serveur temps réel : table sans cmd, plat prêt non servi, addition >2h
  | 'bar_rt'        // 13. Bar temps réel : cmd boisson en attente >5min
  | 'snack_rt'      // 14. Snack temps réel : cmd online non prise en charge >5min
  | 'formateur'     // 15. Formateur (09h00) : suit progression équipe, encouragements, badges

export type Urgence = 'rouge' | 'jaune' | 'vert'

export type AgentStatus = 'running' | 'success' | 'error'

export type AgentDefinition = {
  id: AgentId
  nom: string                 // "Veilleur de nuit"
  emoji: string               // "🌙"
  description: string         // 1 ligne
  schedule: string            // expression cron lisible "0 2 * * *"
  scheduleHuman: string       // "Chaque nuit à 02h00"
  /** Module d'activation dont dépend l'agent (migration 0110).
   *  Absent = agent transverse, tourne quelle que soit l'activité ouverte.
   *  Un agent dont le module est éteint est mis en veille : sa route cron
   *  répond 200 { skipped: true } — surtout pas une erreur, qui polluerait le
   *  monitoring `net._http_response` (cf. CLAUDE.md §8). */
  module?: ModuleActivationCle
}

/** Sous-ensemble des clés de `activites_modules` utilisées par les agents.
 *  Typé en local pour éviter une dépendance circulaire avec lib/activation. */
export type ModuleActivationCle =
  | 'restaurant_salle' | 'pizzeria' | 'bar' | 'snack_emporter'
  | 'chambres' | 'evenementiel' | 'fournil' | 'fournil_livraison'

// Définitions statiques des 10 agents (utilisé par dashboard + index)
export const AGENTS: Record<AgentId, AgentDefinition> = {
  veilleur:    { id: 'veilleur',    nom: 'Veilleur de nuit',     emoji: '🌙', description: 'Clôture caisse, backup, recap CA et anomalies J-1',          schedule: '0 2 * * *',     scheduleHuman: 'Chaque nuit à 02h00' },
  meteo:       { id: 'meteo',       nom: 'Météorologue',          emoji: '🌤️',  description: 'Brief matinal : météo, prévision CA, suggestions stock/RH',  schedule: '0 6 * * *',     scheduleHuman: 'Chaque matin à 06h00' },
  stock:       { id: 'stock',       nom: 'Gestionnaire de stock', emoji: '📦', description: 'Ruptures à J+3, bons commande auto, compare prix, DLC',      schedule: '0 */2 * * *',   scheduleHuman: 'Toutes les 2 heures' },
  financier:   { id: 'financier',   nom: 'Contrôleur financier',  emoji: '💰', description: 'Food cost, masse salariale, trésorerie, dérives coûts',      schedule: '0 * * * *',     scheduleHuman: 'Chaque heure' },
  rh:          { id: 'rh',          nom: 'Manager RH',            emoji: '👥', description: 'Productivité, heures sup, planning semaine, pourboires',      schedule: '0 22 * * *',    scheduleHuman: 'Chaque soir à 22h00' },
  haccp:       { id: 'haccp',       nom: 'Responsable HACCP',     emoji: '🌡️',  description: 'Températures, checklists, DLC, échéances obligatoires',      schedule: '0 * * * *',     scheduleHuman: 'Chaque heure' },
  commercial:  { id: 'commercial',  nom: 'Commercial client',     emoji: '💬', description: 'SMS résa, relance dormants, anniversaires, réponses avis',  schedule: '0 20 * * *',    scheduleHuman: 'Chaque soir à 20h00' },
  scanner:     { id: 'scanner',     nom: 'Scanner documents',     emoji: '📄', description: 'OCR factures, BL, tickets, fiches de paie',                  schedule: 'event-driven',  scheduleHuman: 'En temps réel (upload)' },
  strategique: { id: 'strategique', nom: 'Conseiller stratégique', emoji: '🎯', description: 'Bilan hebdo, opportunités, benchmark, plan semaine',         schedule: '0 7 * * 1',     scheduleHuman: 'Chaque lundi à 07h00' },
  securite:    { id: 'securite',    nom: 'Vigile sécurité',       emoji: '🛡️', description: 'Connexions suspectes, intégrité data, perf app',             schedule: '*/15 * * * *',  scheduleHuman: 'Toutes les 15 minutes' },
  // ─── Temps réel par poste ───────────────────────────────────────
  // Ces quatre-là surveillent le service en salle : mis en veille tant que le
  // restaurant n'a pas ouvert (cf. `module`). Le fournil, lui, garde sa propre
  // surveillance via `fournil_rt` — le seul point de vente ouvert ne doit pas
  // être le seul sans agent.
  cuisine_rt:  { id: 'cuisine_rt',  nom: 'Cuisine — temps réel',  emoji: '👨‍🍳', description: 'Retards prép > 20min, alertes pendant le service',           schedule: '*/15 * * * *',  scheduleHuman: 'Toutes les 15 min pendant le service', module: 'restaurant_salle' },
  serveur_rt:  { id: 'serveur_rt',  nom: 'Serveur — temps réel',  emoji: '🍽',  description: 'Table sans cmd >10min, plat prêt non servi, addition >2h',  schedule: '*/15 * * * *',  scheduleHuman: 'Toutes les 15 min pendant le service', module: 'restaurant_salle' },
  bar_rt:      { id: 'bar_rt',      nom: 'Bar — temps réel',      emoji: '🍷', description: 'Cmd boisson en attente >5min',                              schedule: '*/15 * * * *',  scheduleHuman: 'Toutes les 15 min pendant le service', module: 'bar' },
  snack_rt:    { id: 'snack_rt',    nom: 'Snack — temps réel',    emoji: '🥪', description: 'Cmd online non prise en charge >5min',                      schedule: '*/15 * * * *',  scheduleHuman: 'Toutes les 15 min pendant le service', module: 'snack_emporter' },
  formateur:   { id: 'formateur',   nom: 'Formateur',             emoji: '🎓', description: 'Suit progression équipe, encouragements, badges, alertes J-30', schedule: '0 9 * * *',     scheduleHuman: 'Chaque matin à 09h00' },
}

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[]

// Style UI par urgence
export const URGENCE_STYLE: Record<Urgence, { emoji: string; bg: string; text: string; border: string; label: string }> = {
  rouge: { emoji: '🔴', bg: 'bg-red-100',     text: 'text-red-900',     border: 'border-red-300',     label: 'Urgent' },
  jaune: { emoji: '🟡', bg: 'bg-amber-100',   text: 'text-amber-900',   border: 'border-amber-300',   label: 'À surveiller' },
  vert:  { emoji: '🟢', bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300', label: 'OK' },
}
