// ─── La route vers la gérance ────────────────────────────────────────
//
// Il manquait une TRAJECTOIRE. Les cinq guides « Manageuse » sont un parcours
// de prise en main : ils s'arrêtent là où commence le métier. Résultat, la
// personne formée n'avait aucun moyen de voir ce qui lui restait à acquérir,
// ni le gérant de constater qu'elle était prête. La promotion se serait
// décidée au feeling, alors que l'outil sait faire mieux.
//
// Trois paliers, nommés, avec pour chacun : ce qu'on sait faire, les guides
// qui le prouvent, et ce qui s'ouvre en écriture quand il est atteint. La
// progression des accès devient une conséquence LISIBLE, pas une décision
// arbitraire dont personne ne connaît les critères.
//
// ⚠️ L'état d'un palier se CALCULE à la lecture, depuis les progressions de
// formation. Rien n'est entretenu à la main : un compteur dériverait au
// premier quiz repassé, et une progression à laquelle personne ne croit ne
// sert à rien. Seule la CERTIFICATION — le fait qu'un palier a été atteint,
// et à quelle date — est enregistrée, parce que c'est une date qui compte et
// qu'elle ne se recalcule pas.
//
// Client-safe : aucune dépendance serveur.

export type Palier = {
  /** Rang, 1-indexé. Sert aussi de clé de certification (`poste`). */
  rang: 1 | 2 | 3
  cle: string
  titre: string
  /** Une phrase : ce que la personne sait faire à ce palier. */
  sait: string
  duree: string
  /** Titres EXACTS des guides qui valident ce palier. */
  guides: string[]
  /** Ce qui s'ouvre en écriture une fois le palier atteint. */
  ouvre: string[]
  /** Pourquoi ces écrans-là, et pas plus tôt. */
  pourquoi: string
}

export const PALIERS: Palier[] = [
  {
    rang: 1,
    cle: 'gerance_1',
    titre: 'Prise en main',
    sait: "Les gestes du quotidien, la caisse, et pourquoi l'outil ne prend pas les commandes.",
    duree: '≈ 2 semaines',
    guides: [
      'Manageuse 1 — Pourquoi cet outil ne prend pas les commandes',
      "Manageuse 2 — La caisse, pendant qu'elle est en mode école",
    ],
    ouvre: ['Comptoir', 'Inventaire', 'Invendus', 'Ruptures', 'Journal de bord'],
    pourquoi:
      "Ce sont les écrans où une erreur se voit tout de suite et se corrige en repassant. "
      + "On y apprend le rythme de la maison avant d'y toucher aux chiffres.",
  },
  {
    rang: 2,
    cle: 'gerance_2',
    titre: 'Lecture',
    sait: "Lire une marge, un food cost avec sa couverture, une démarque, une commande conseillée.",
    duree: '≈ 1 mois',
    guides: [
      'Manageuse 3 — Lire les chiffres avant de les modifier',
      'Manageuse 4 — Les gestes du quotidien',
      'Manageuse 5 — Les trois écrans qui se trompent en silence',
    ],
    ouvre: ['Allergènes', 'Fournisseurs & factures', 'Fiches produits'],
    pourquoi:
      "Ces trois écrans se trompent EN SILENCE — l'erreur y ressemble à une réussite. "
      + "Ils ne s'ouvrent qu'à quelqu'un qui sait déjà lire ce qu'ils produisent, "
      + "parce qu'aucune vigilance ne rattrape une erreur qui ne se signale pas.",
  },
  {
    rang: 3,
    cle: 'gerance_3',
    titre: 'Décision',
    sait: "Arbitrer : structure de coûts, valorisation du fonds, choix commerciaux.",
    duree: 'au jugé',
    guides: [],   // À écrire quand elle aura quelques semaines derrière elle.
    ouvre: ['Le co-gérant', 'Économie', 'Réservations, groupes, chambres', 'Marketing'],
    pourquoi:
      "Le dernier palier ne se valide pas par un quiz : il se constate. "
      + "Ses guides restent à écrire, et volontairement — rédigés avant qu'elle ait "
      + "rencontré les vraies situations, ils seraient théoriques.",
  },
]

export type EtatPalier = {
  palier: Palier
  /** Guides du palier déjà réussis. */
  acquis: number
  total: number
  /** Tous les guides réussis (et le palier en compte au moins un). */
  atteint: boolean
  /** Date de certification, si elle a été enregistrée. */
  certifieLe: string | null
}

/**
 * État des trois paliers, calculé depuis les guides réussis.
 *
 * ⚠️ Un palier SANS guide (le troisième) n'est jamais « atteint »
 * automatiquement : il se constate et s'accorde. Le marquer atteint parce
 * qu'il n'a rien à valider serait exactement le contraire de son intention.
 */
export function etatPaliers(
  guidesReussis: string[],
  certifications: Array<{ poste: string; obtenue_le: string }> = [],
): EtatPalier[] {
  const reussis = new Set(guidesReussis.map(g => g.trim()))
  const parCle = new Map(certifications.map(c => [c.poste, c.obtenue_le]))
  return PALIERS.map(p => {
    const acquis = p.guides.filter(g => reussis.has(g.trim())).length
    return {
      palier: p,
      acquis,
      total: p.guides.length,
      atteint: p.guides.length > 0 && acquis === p.guides.length,
      certifieLe: parCle.get(p.cle) ?? null,
    }
  })
}

/** Le palier courant : le dernier atteint, 0 si aucun. */
export function palierCourant(etats: EtatPalier[]): number {
  let n = 0
  for (const e of etats) if (e.atteint) n = e.palier.rang
  return n
}
