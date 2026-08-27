// ════════════════════════════════════════════════════════════════════
// La frontière entre les caisses et l'outil
// ════════════════════════════════════════════════════════════════════
//
// DÉCISION D'ARCHITECTURE (24 août 2026, réouverture du site complet).
//
// Chaque activité encaisse sur SA caisse — Fournil aujourd'hui, bar /
// restaurant / pizzeria à la réouverture. L'outil ne prend PLUS de commande
// et n'encaisse PLUS : il reçoit tout des caisses et s'en sert pour piloter.
//
// Pourquoi cette frontière est nette et non poreuse :
//
//   · Deux systèmes qui prennent des commandes en parallèle divergent
//     toujours. Une table ouverte dans l'outil et payée sur la caisse, et
//     plus personne ne sait quel chiffre est vrai.
//   · La caisse agréée est la source LÉGALE (NF525). Un second encaissement
//     dans l'outil ne serait pas seulement redondant : il produirait un
//     chiffre d'affaires parallèle sans valeur fiscale.
//   · L'équipe apprend UN outil pour vendre. Le personnel de service ne
//     devrait jamais avoir à se demander « je saisis où ? ».
//
// Ce que l'outil garde, et qui n'a pas d'équivalent en caisse :
//
//   · les commandes du SITE WEB — la caisse ne les connaît pas ;
//   · les écrans de préparation, quand la caisse ne pousse pas en cuisine ;
//   · la tournée de livraison ;
//   · et tout le pilotage : marges, stock, hygiène, RH, fournisseurs.
//
// ── Comment ce fichier s'utilise ────────────────────────────────────
// `VENTE_EN_CAISSE` est un interrupteur d'architecture, pas un réglage de
// confort. Le repasser à `false` ferait réapparaître des écrans de vente qui
// entreraient en conflit avec les caisses : ne le faire que si la décision
// ci-dessus est explicitement revue.
// ════════════════════════════════════════════════════════════════════

/** La prise de commande et l'encaissement se font sur les caisses externes. */
export const VENTE_EN_CAISSE = true

/**
 * Écrans de vente retirés de l'outil, avec ce qui les remplace.
 * Sert à la navigation (on ne les propose plus) et aux redirections
 * (quelqu'un qui a gardé un lien en favori doit comprendre, pas tomber
 * sur un 404).
 */
export const ECRANS_REMPLACES: Record<string, { titre: string; remplacePar: string }> = {
  '/serveur': {
    titre: 'Salle / Serveur',
    remplacePar: 'La prise de commande en salle se fait sur le pad de la caisse. '
      + 'Les tickets remontent ensuite dans l\'outil pour le pilotage.',
  },
  '/caisse': {
    titre: 'Caisse',
    remplacePar: 'L\'encaissement, la session et le rapport Z se font sur la caisse '
      + 'agréée — elle seule a la valeur légale (NF525). Le chiffre d\'affaires '
      + 'remonte automatiquement dans Ventes.',
  },
  '/emporter': {
    titre: 'Snack / Emporter',
    remplacePar: 'Les commandes du site web sont sur l\'écran Préparation. '
      + 'Les ventes à emporter au comptoir passent par la caisse.',
  },
}

/** Un écran de vente a-t-il été retiré au profit des caisses ? */
export function estRemplaceParCaisse(chemin: string): boolean {
  if (!VENTE_EN_CAISSE) return false
  return Object.keys(ECRANS_REMPLACES).some(
    r => chemin === r || chemin.startsWith(r + '/'),
  )
}

/** L'entrée de remplacement correspondant à un chemin, si elle existe. */
export function infoRemplacement(chemin: string) {
  const cle = Object.keys(ECRANS_REMPLACES).find(
    r => chemin === r || chemin.startsWith(r + '/'),
  )
  return cle ? { chemin: cle, ...ECRANS_REMPLACES[cle] } : null
}
