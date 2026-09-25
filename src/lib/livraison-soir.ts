// ─── La tournée du SOIR : les pizzas livrées ─────────────────────────────
//
// La tournée du matin porte du pain : un seul départ, 10 h, tout le monde
// partage le même créneau. Le soir, c'est l'inverse — les pizzas se livrent
// au fil de l'eau, chaude par chaude, et chaque commande a SON horaire.
//
// Règles PURES : aucun réseau, aucune base. Testables sans compte.
//
// ⚠️⚠️ LE PIÈGE CENTRAL : `creneau_retrait` PORTE L'HEURE DE LIVRAISON.
//
// C'est l'heure que le client choisit, lit dans son mail et attend sur son
// pas de porte. En faire l'heure d'ENFOURNEMENT rendrait le chiffre
// incompréhensible pour tout le monde sauf le pizzaiolo.
//
// Mais alors le KDS, qui range ses colonnes sur `creneau_retrait`, ferait
// enfourner à l'heure où la pizza devrait déjà être arrivée : elle partirait
// avec un quart d'heure de retard et arriverait froide, **sans qu'aucune
// erreur ne se produise**. C'est exactement le genre de faute que cette base
// de code paie cher — le CA juste et le stock aveugle d'`expand[]=items`.
//
// La règle est donc : une seule heure stockée (la livraison), et c'est
// l'AFFICHAGE du KDS qui recule d'un `DELAI_TRAJET_MIN`. Une seule source,
// deux lectures — jamais deux champs qui finiraient par se contredire.

/** Minutes entre le départ du livreur et l'arrivée chez le client.
 *
 *  ⚠️ Le village fait deux kilomètres de bout en bout : 15 minutes couvrent
 *  le trajet ET la remise en main propre, qui prend plus de temps qu'on ne
 *  croit (le client cherche sa monnaie). À revoir si la zone s'étend —
 *  c'est LE chiffre qui décide si les pizzas arrivent chaudes. */
export const DELAI_TRAJET_MIN = 15

/** Pas entre deux créneaux, aligné sur celui du four. */
export const PAS_MINUTES = 15

export type ConfigLivraisonSoir = {
  /** Communes livrées. Liste fermée : pas de hors-zone possible. */
  communes: string[]
  /** Première livraison possible. */
  debut: string            // 'HH:MM'
  /** Dernière livraison possible. */
  fin: string              // 'HH:MM'
  /** Nombre de livraisons qu'un livreur tient dans un même quart d'heure. */
  capaciteParCreneau: number
  minimumTtc: number
  fraisTtc: number
}

/** ⚠️ Ces valeurs sont un POINT DE DÉPART, pas une décision : le gérant les
 *  arbitre dans /admin/etablissements. Elles sont calées sur le service
 *  pizzeria (19 h – 22 h) et sur la zone déjà livrée le matin. */
export const LIVRAISON_SOIR_DEFAUT: ConfigLivraisonSoir = {
  communes: ['Sainte-Anastasie-sur-Issole'],
  debut: '19:00',
  fin: '22:00',
  // ⚠️ DEUX par quart d'heure, pas quatre. La contrainte n'est pas le four
  // (8 pizzas / 15 min) mais LA ROUTE : un livreur ne fait pas quatre
  // adresses en un quart d'heure. Caler la livraison sur la capacité du four
  // ferait accepter des commandes que personne ne peut porter, et c'est le
  // client qui l'apprendrait.
  capaciteParCreneau: 2,
  minimumTtc: 0,
  fraisTtc: 0,
}

const mn = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/**
 * Les heures de livraison possibles, du début à la fin incluse.
 *
 * ⚠️ La borne de fin est INCLUSE, contrairement aux créneaux de retrait : une
 * livraison à 22 h pile est la dernière, et l'exclure supprimerait sans raison
 * le créneau le plus demandé d'un vendredi soir.
 */
export function creneauxLivraisonSoir(
  cfg: ConfigLivraisonSoir = LIVRAISON_SOIR_DEFAUT,
): string[] {
  const out: string[] = []
  for (let t = mn(cfg.debut); t <= mn(cfg.fin); t += PAS_MINUTES) out.push(hhmm(t))
  return out
}

/**
 * L'heure à laquelle la commande doit être PRÊTE, donc la colonne du KDS.
 *
 * ⚠️ C'est la seule fonction qui doit reculer une heure de livraison. Si un
 * autre écran se met à faire le calcul dans son coin, les deux divergeront le
 * jour où le délai change.
 */
export function heurePreparation(heureLivraison: string): string {
  return hhmm(mn(heureLivraison) - DELAI_TRAJET_MIN)
}

/** Idem, sur un instant ISO complet. Rend null sur une entrée illisible —
 *  jamais une date approximative, qui placerait le ticket au mauvais endroit
 *  de l'agenda sans rien dire. */
export function instantPreparation(creneauISO: string | null): string | null {
  if (!creneauISO) return null
  const d = new Date(creneauISO)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getTime() - DELAI_TRAJET_MIN * 60_000).toISOString()
}

export type RefusLivraisonSoir =
  | 'module_ferme' | 'hors_zone' | 'hors_horaires' | 'sous_minimum'
  | 'creneau_passe' | 'complet'

/**
 * Une livraison du soir est-elle acceptable ?
 *
 * ⚠️ Le contrôle qui COMPTE est celui-ci, côté serveur. Le site masque déjà
 * ce qui n'est pas proposable, mais une interface ne protège de rien : un
 * onglet resté ouvert enverra toujours les anciennes valeurs.
 */
export function verifierLivraisonSoir(input: {
  ouvert: boolean
  heureLivraison: string          // 'HH:MM'
  commune: string
  totalTtc: number
  /** Minutes avant la livraison, calculées par l'appelant (heure de Paris). */
  minutesAvant: number
  /** Livraisons DÉJÀ prises sur ce créneau. */
  dejaPrises: number
  cfg?: ConfigLivraisonSoir
}): { ok: true } | { ok: false; raison: RefusLivraisonSoir; message: string } {
  const cfg = input.cfg ?? LIVRAISON_SOIR_DEFAUT

  if (!input.ouvert) {
    return { ok: false, raison: 'module_ferme',
      message: 'La livraison du soir n’est pas encore ouverte.' }
  }

  // ⚠️ Comparaison sur la commune NORMALISÉE : « sainte anastasie sur issole »
  // et « Sainte-Anastasie-sur-Issole » sont la même adresse, et refuser la
  // première ferait perdre une commande pour un tiret.
  const norm = (s: string) => s.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
  if (!cfg.communes.some(c => norm(c) === norm(input.commune))) {
    return { ok: false, raison: 'hors_zone',
      message: `Nous livrons ${cfg.communes.join(', ')}. Votre commande reste disponible à emporter.` }
  }

  const t = mn(input.heureLivraison)
  if (t < mn(cfg.debut) || t > mn(cfg.fin)) {
    return { ok: false, raison: 'hors_horaires',
      message: `Les livraisons du soir vont de ${cfg.debut} à ${cfg.fin}.` }
  }

  if (cfg.minimumTtc > 0 && input.totalTtc < cfg.minimumTtc) {
    return { ok: false, raison: 'sous_minimum',
      message: `Commande minimum de ${cfg.minimumTtc.toFixed(2).replace('.', ',')} € pour la livraison.` }
  }

  // ⚠️ Il faut le temps de CUIRE puis de ROULER. Accepter une livraison pour
  // dans dix minutes, c'est promettre ce qu'on ne peut pas tenir — et le
  // client attend derrière sa porte.
  if (input.minutesAvant < DELAI_TRAJET_MIN + PAS_MINUTES) {
    return { ok: false, raison: 'creneau_passe',
      message: 'Ce créneau est trop proche. Choisissez l’horaire suivant.' }
  }

  if (input.dejaPrises >= cfg.capaciteParCreneau) {
    return { ok: false, raison: 'complet',
      message: 'Ce créneau de livraison est complet. Choisissez l’horaire suivant.' }
  }

  return { ok: true }
}
