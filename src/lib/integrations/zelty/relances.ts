// Webhook = SIGNAL. GET = VÉRITÉ.
//
// Les 22 événements Zelty sont déclarés depuis le 25/09/2026, mais on ne
// traite PAS leur charge utile pour mettre la base à jour : on s'en sert
// comme d'une sonnette, puis on relit l'endpoint qui fait autorité.
//
// ⚠️ Ce choix n'est pas de la prudence excessive, c'est la leçon de cette
// API. Chaque fois qu'on a supposé la forme d'une charge utile, ça a coûté :
// `expand[]=items` oublié (CA juste, stock aveugle, aucune erreur),
// la TVA en MILLIÈMES, les `null` refusés par zod (84 plats sur 84 rejetés
// en silence), `contents` au lieu d'`items`, `event_name` au lieu d'`event`.
// Aucun de ces pièges ne se devine. Une relecture, elle, passe par du code
// déjà éprouvé en production.
//
// ⚠️⚠️ LE VRAI DANGER EST LA TEMPÊTE, PAS LA PANNE.
// Nos PROPRES écritures déclenchent ces webhooks. Pousser la carte (84 plats
// en un POST) fait revenir 84 `dish.update`, donc 84 relectures complètes du
// catalogue en quelques secondes — chacune rappelant Zelty, qui plafonne son
// débit et répond 429 à partir du cinquième appel. On se serait mis nous-mêmes
// en panne, en croyant gagner du temps réel.
//
// D'où le REGROUPEMENT : une même relance ne repart pas si elle a déjà tourné
// dans les dernières secondes. Le compteur vit dans `integration_evenements`
// — pas en mémoire : Vercel est sans état, chaque webhook peut tomber sur une
// instance différente, et une variable de module n'y compterait rien.

import { createClient } from '@/lib/supabase/server'

/** Route à rappeler quand un événement sonne, et délai de regroupement. */
type Relance = { route: string; fenetreSecondes: number; motif: string }

/**
 * ⚠️ Un événement ABSENT de cette table est TRACÉ, jamais ignoré : sa charge
 * brute s'accumule dans le journal, et c'est elle qui permettra de le brancher
 * un jour sur des données réelles plutôt que sur une hypothèse.
 */
export const RELANCES: Record<string, Relance> = {
  // ─── La carte ────────────────────────────────────────────────────────
  // Le miroir tournait à 03:10 : un prix corrigé sur la caisse à 9 h restait
  // faux sur casatasia.fr toute la journée. C'est le client qui voyait l'écart.
  //
  // ⚠️ Fenêtre LARGE (2 min) justement à cause de nos propres poussées.
  'dish.update':          { route: '/api/cron/caisse/zelty/catalogue', fenetreSecondes: 120, motif: 'plat modifié' },
  'dish.delete':          { route: '/api/cron/caisse/zelty/catalogue', fenetreSecondes: 120, motif: 'plat supprimé' },
  'dish_override.update': { route: '/api/cron/caisse/zelty/catalogue', fenetreSecondes: 120, motif: 'surcharge plat' },
  'tag.update':           { route: '/api/cron/caisse/zelty/catalogue', fenetreSecondes: 120, motif: 'famille modifiée' },
  'tag.delete':           { route: '/api/cron/caisse/zelty/catalogue', fenetreSecondes: 120, motif: 'famille supprimée' },
  'catalog.push':         { route: '/api/cron/caisse/zelty/catalogue', fenetreSecondes: 120, motif: 'catalogue publié' },

  // ─── Les ruptures déclarées SUR LA CAISSE ────────────────────────────
  // Le geste naturel quand on s'en aperçoit en servant. Sans ce retour,
  // casatasia.fr continuait de vendre le produit.
  //
  // ⚠️ Fenêtre COURTE (30 s) : on vend en ligne pendant ce temps-là.
  //
  // ⚠️ Pas de boucle avec le sens sortant — ce sont DEUX drapeaux distincts.
  // On écrit `disable_takeaway` / `disable_delivery` ; on lit `outofstock`.
  'dish.availability_update': { route: '/api/cron/caisse/zelty/disponibilites/entrantes', fenetreSecondes: 30, motif: 'disponibilité plat' },

  // ─── Les réservations ────────────────────────────────────────────────
  // Le sondage passe au quart d'heure et coûte 14 appels (un par jour de la
  // fenêtre, `GET /bookings` n'acceptant aucune période). Le webhook rend la
  // réservation immédiate ET supprime l'essentiel de ces appels.
  //
  // ⚠️ Fenêtre COURTE (20 s) : le soir de l'inauguration, deux réservations
  // prises à une minute d'intervalle doivent toutes les deux se voir. On
  // groupe juste assez pour absorber une rafale, pas assez pour retarder.
  'booking.update': { route: '/api/cron/caisse/zelty/reservations?jours=14', fenetreSecondes: 20, motif: 'réservation modifiée' },

  // ─── Le fichier client ───────────────────────────────────────────────
  // ⚠️ `customer.delete` mérite une fenêtre courte : c'est le chemin d'une
  // demande d'effacement RGPD, et la traiter le lendemain matin n'est pas une
  // réponse. Le pont ne transporte AUCUN consentement, dans aucun sens —
  // cf. zelty/clients.ts.
  'customer.update': { route: '/api/cron/caisse/zelty/clients', fenetreSecondes: 300, motif: 'client modifié' },
  'customer.delete': { route: '/api/cron/caisse/zelty/clients', fenetreSecondes: 30,  motif: 'client supprimé' },
}

/**
 * Cette relance a-t-elle déjà tourné dans sa fenêtre ?
 *
 * ⚠️ En cas de doute — base injoignable, requête en erreur — on RELANCE.
 * Se tromper en relançant coûte un appel de trop ; se tromper en s'abstenant
 * laisse la carte fausse sur le site sans que rien ne le signale.
 */
async function dejaGroupee(route: string, fenetreSecondes: number): Promise<boolean> {
  try {
    const sb = await createClient()
    const depuis = new Date(Date.now() - fenetreSecondes * 1000).toISOString()
    const { data, error } = await sb
      .from('integration_evenements')
      .select('id')
      .eq('systeme', 'zelty')
      .eq('type', 'relance')
      .eq('reference', route)
      .gte('created_at', depuis)
      .limit(1)
    if (error) return false
    return (data?.length ?? 0) > 0
  } catch {
    return false
  }
}

export type ResultatRelance =
  | { relance: false; raison: 'aucune' | 'groupee' }
  | { relance: true; route: string; statut: number; bilan: unknown }

/**
 * Déclenche la relecture correspondant à un événement, si elle n'a pas déjà
 * eu lieu. Ne lève jamais : un webhook doit répondre 200 quoi qu'il arrive,
 * sinon Zelty réessaie indéfiniment.
 */
export async function relancerPour(
  evenement: string,
  base: string,
  journaliser: (ev: {
    sens: 'entrant' | 'sortant'; systeme: string; type: string
    reference?: string | null; payload?: unknown; resultat?: unknown
    statut?: 'succes' | 'echec' | 'en_attente'; erreur?: string | null
  }) => Promise<void>,
): Promise<ResultatRelance> {
  const r = RELANCES[evenement]
  if (!r) return { relance: false, raison: 'aucune' }
  if (await dejaGroupee(r.route, r.fenetreSecondes)) return { relance: false, raison: 'groupee' }

  // La trace est écrite AVANT l'appel, et c'est volontaire : c'est elle qui
  // sert de verrou. Écrite après, deux webhooks arrivés dans la même seconde
  // ne se verraient pas l'un l'autre et partiraient tous les deux.
  await journaliser({
    sens: 'sortant', systeme: 'zelty', type: 'relance',
    reference: r.route, payload: { evenement, motif: r.motif }, statut: 'en_attente',
  })

  try {
    const rep = await fetch(new URL(r.route, base), {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const bilan = await rep.json().catch(() => null)
    await journaliser({
      sens: 'sortant', systeme: 'zelty', type: 'relance',
      reference: r.route, payload: { evenement, motif: r.motif }, resultat: bilan,
      statut: rep.ok ? 'succes' : 'echec',
      erreur: rep.ok ? null : `HTTP ${rep.status}`,
    })
    return { relance: true, route: r.route, statut: rep.status, bilan }
  } catch (e) {
    await journaliser({
      sens: 'sortant', systeme: 'zelty', type: 'relance',
      reference: r.route, payload: { evenement, motif: r.motif },
      statut: 'echec', erreur: e instanceof Error ? e.message : String(e),
    })
    return { relance: true, route: r.route, statut: 0, bilan: null }
  }
}
