// Couche « ACTIVITÉ / FONDS DE COMMERCE » au-dessus des points de vente.
//
// Décision comptable (juin 2026) : UNE seule entité juridique CASATASIA, même
// comptabilité, mais DEUX activités/fonds à suivre séparément (en vue d'une
// éventuelle mise en location-gérance future) :
//   1. Restaurant — bar brasserie, pizzeria, snacking, chambres, événementiel
//   2. Fournil    — boulangerie/viennoiseries/sandwiches/café + tabac, colis, FDJ
//
// Le comptable rattache tabac / relais colis / FDJ au FOURNIL (activité 2),
// pas en autonome. D'où le mapping ci-dessous (par slug d'établissement).

export type Activite = 'restaurant' | 'fournil'

export type ActiviteDef = {
  cle: Activite
  nom: string
  emoji: string
  couleur: string
  description: string
}

export const ACTIVITES: ActiviteDef[] = [
  {
    cle: 'restaurant', nom: 'Restaurant CASATASIA', emoji: '🍽', couleur: 'emerald',
    description: 'Bar brasserie · pizzeria · snacking · chambres · événementiel',
  },
  {
    cle: 'fournil', nom: 'Fournil', emoji: '🥖', couleur: 'amber',
    description: 'Boulangerie · viennoiseries · sandwiches · café + tabac · colis · FDJ',
  },
]

// Rattachement point de vente (slug etablissements) → activité.
export const ACTIVITE_PAR_SLUG: Record<string, Activite> = {
  'le-relais-des-saveurs': 'restaurant',
  'bar': 'restaurant',
  'snack-emporter': 'restaurant',
  'fournil': 'fournil',
  'fdj': 'fournil',
  'tabac': 'fournil',
  'relais-colis': 'fournil',
}

/** Activité d'un point de vente. Priorité au champ persisté `activite` si fourni,
 *  sinon mapping par slug, sinon 'restaurant' par défaut. */
export function activiteDe(slug: string | null | undefined, persiste?: string | null): Activite {
  if (persiste === 'restaurant' || persiste === 'fournil') return persiste
  if (slug && ACTIVITE_PAR_SLUG[slug]) return ACTIVITE_PAR_SLUG[slug]
  return 'restaurant'
}

export function activiteDef(cle: Activite): ActiviteDef {
  return ACTIVITES.find(a => a.cle === cle) ?? ACTIVITES[0]
}
