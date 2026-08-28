// ─── Visite guidée ───────────────────────────────────────────────────
//
// L'onboarding (/formation/onboarding) est une PORTE : lire un guide, réussir
// un quiz, l'accès s'ouvre. Après quoi on est lâché sur une application de
// vingt-huit modules sans savoir par où commencer, et on retient trois écrans
// sur trente.
//
// La visite guidée est l'autre moitié : elle emmène la personne D'ÉCRAN EN
// ÉCRAN, dit ce qu'il faut y regarder, et nomme les pièges à l'endroit exact
// où on peut tomber dedans. Un avertissement lu dans un manuel s'oublie ; le
// même avertissement lu devant le bouton concerné, non.
//
// Trois règles de conception, et elles comptent plus que le contenu :
//
//  1. ELLE NE BLOQUE JAMAIS. C'est un panneau posé dans un coin, pas une
//     fenêtre modale. On peut travailler pendant qu'elle est ouverte — sinon
//     elle sera fermée au premier client qui entre, et jamais rouverte.
//
//  2. ELLE SE REPREND. L'étape vit sur le PROFIL (0149), pas dans le
//     navigateur : commencée au bureau, reprise sur la tablette du comptoir.
//
//  3. ELLE SE PASSE. Un accompagnement qu'on ne peut pas quitter devient une
//     corvée, et une corvée se traverse sans rien lire.
//
// Client-safe : aucune dépendance serveur, importable depuis un composant
// 'use client'.

export type EtapeVisite = {
  /** Route où la personne doit se trouver pour cette étape. */
  route: string
  titre: string
  /** Ce qu'il faut regarder ICI. Deux à quatre phrases, pas plus. */
  corps: string
  /** Le piège de cet écran, s'il y en a un. Affiché en rouge. */
  piege?: string
  /** Libellé du bouton d'action, quand l'étape invite à faire un geste. */
  geste?: string
}

// ── Manager / manageuse ─────────────────────────────────────────────
// L'ordre suit celui du carnet d'arrivée : comprendre la frontière avec la
// caisse d'abord (sans quoi la moitié de l'outil paraît incohérente), puis
// les gestes quotidiens, puis la lecture, puis les écrans dangereux.
const MANAGER: EtapeVisite[] = [
  {
    route: '/mon-espace',
    titre: 'Ton espace',
    corps: "C'est ta page d'accueil. Tes heures de la semaine, tes tâches du jour, "
      + "l'avancement de tes formations. Rien d'important ne s'y décide — mais c'est "
      + "d'ici que tu repars vers tout le reste.",
  },
  {
    route: '/comptoir/fournil/kds',
    titre: 'Le comptoir — ce que l\'outil fait vraiment',
    corps: "Voilà les commandes du site web à préparer. L'outil NE PREND PAS les "
      + "commandes et N'ENCAISSE PAS : ça, c'est la caisse Zelty, qui est la source "
      + "légale. Ici on prépare, on suit, on pilote.",
    piege: "Si tu cherches un écran pour saisir une vente, il n'existe pas — et c'est "
      + "voulu. Deux systèmes qui prennent des commandes divergent toujours.",
  },
  {
    route: '/ruptures',
    titre: 'Les ruptures — le geste de deux secondes',
    corps: "Plus de paninis à 11 h ? Un appui, c'est marqué, et le produit sort "
      + "immédiatement de la vente en ligne. Pensé pour être fait au comptoir, "
      + "tablette en main, en plein service.",
    piege: "Une rupture est DATÉE : elle se périme d'elle-même le lendemain. "
      + "Personne n'a à penser à la lever.",
    geste: 'Marquer une rupture pour voir',
  },
  {
    route: '/invendus',
    titre: 'Les invendus — la casse qui manquait au food cost',
    corps: "À la fermeture, on compte ce qu'on jette. Le coût est figé au tarif du "
      + "jour. La synthèse des 7 derniers jours, en haut, dit ce qu'on jette le "
      + "plus — c'est l'outil de réglage des commandes.",
  },
  {
    route: '/inventaire',
    titre: 'L\'inventaire — on compte des matières',
    corps: "Deux onglets : Fournil et Bar, qui ne se comptent ni au même moment ni "
      + "dans la même pièce. On compte des MATIÈRES, pas des produits vendus : le "
      + "congélateur contient des pâtons, pas quatre recettes de pizza.",
    piege: "La colonne « attendu » est calculée (dernier comptage + factures − ventes). "
      + "L'écart avec ce que tu comptes, c'est la démarque : ce qui part sans être vendu.",
  },
  {
    route: '/admin/ventes',
    titre: 'Les ventes — et la ligne qu\'il faut lire à côté',
    corps: "CA, marge brute, food cost, le tout ventilé par activité. Le rattachement "
      + "se fait sur la LIGNE du ticket, jamais sur l'en-tête — un même ticket mélange "
      + "un café du Fournil et une pizza.",
    piege: "Le food cost se divise par le CA COUVERT, pas par le total. Lis toujours "
      + "le taux ET sa couverture : 26 % affichés valaient 39,8 % réels en août.",
  },
  {
    route: '/admin/patrimoine',
    titre: 'Ce que l\'affaire vaut',
    corps: "Tout le reste de l'outil mesure ce qui entre en caisse. Cette page mesure "
      + "ce qui se construit. 1 000 € de résultat mensuel récurrent valent 30 000 à "
      + "48 000 € de valeur de fonds.",
    piege: "La page REFUSE de valoriser sous 30 jours de vente. Annualiser huit jours "
      + "d'ouverture produirait un chiffre faux affiché en gros caractères.",
  },
  {
    route: '/admin/commande-fournil',
    titre: 'La commande conseillée',
    corps: "Ce qu'il faut recommander, calculé sur les ventes des 14 derniers jours et "
      + "la couverture souhaitée. Le colisage est lu sur les factures scannées, pas "
      + "saisi à la main.",
  },
  {
    route: '/admin/fournisseurs',
    titre: '⚠ Les factures — le croissant à 40 €',
    corps: "On photographie la facture, Claude lit les lignes, les prix d'achat "
      + "alimentent les marges. Jusqu'à 8 pages en un seul envoi.",
    piege: "Une ligne « CROISSANT … C=96 » à 28,84 €, c'est le prix du CARTON. Écrit "
      + "tel quel, ça fait un croissant à 40 € de coût — c'est arrivé le 22 août, "
      + "quatre produits corrompus, aucune erreur affichée. Après un scan, on RELIT "
      + "les prix propagés.",
  },
  {
    route: '/admin/allergenes',
    titre: '⚠ Les allergènes — valider, c\'est signer',
    corps: "Quatorze allergènes réglementaires, déclarés produit par produit, et "
      + "publiés sur le QR code de la salle. L'onglet « Scanner un emballage » lit la "
      + "liste d'ingrédients à ta place.",
    piege: "Valider affirme que la liste est COMPLÈTE, et la signature porte ton nom. "
      + "Signer la famille « Viennoiserie » telle qu'elle est proposée déclarerait "
      + "qu'un croissant ne contient pas de lait. C'est lu par un client allergique.",
  },
  {
    route: '/admin/legal',
    titre: 'Le registre légal',
    corps: "Vingt-quatre obligations pour l'ouverture. Les bloquantes sont en tête, en "
      + "rouge. Licence IV, permis d'exploitation et HACCP sont acquis ; la visite de "
      + "la commission de sécurité ne l'est pas.",
    piege: "Une obligation bloquante SANS date ne veut pas dire « rien à faire » : "
      + "elle veut dire « personne ne l'a encore engagée ».",
  },
  {
    route: '/admin/journal',
    titre: 'Le journal de bord — et ta lucidité qui expire',
    corps: "Écris ici ce qui te frappe, dès aujourd'hui. Ce qui est mal rangé, mal "
      + "nommé, absurde ou pénible. Dans un mois tu auras pris nos habitudes, y "
      + "compris les mauvaises — cette lucidité-là ne dure pas.",
    geste: 'Écrire ma première note',
  },
]

// ── Comptoir / polyvalent ───────────────────────────────────────────
// Volontairement courte. Quelqu'un qui prend un poste au comptoir n'a pas
// besoin de la page patrimoine le premier jour, et une visite trop longue
// est une visite qu'on abandonne au milieu.
const COMPTOIR: EtapeVisite[] = [
  {
    route: '/mon-espace',
    titre: 'Ton espace',
    corps: "Ta page d'accueil : tes heures, tes tâches du jour, tes formations. "
      + "C'est d'ici que tu repars vers tes écrans.",
  },
  {
    route: '/comptoir/fournil/kds',
    titre: 'Les commandes du site',
    corps: "Les commandes passées sur casatasia.fr arrivent ici, à préparer. Les ventes "
      + "du comptoir, elles, se font sur la caisse — l'outil ne prend pas de commande "
      + "et n'encaisse pas.",
  },
  {
    route: '/ruptures',
    titre: 'Les ruptures',
    corps: "Plus de paninis ? Un appui et c'est marqué : le produit sort tout de suite "
      + "de la vente en ligne. À faire au moment où tu le constates, pas le soir.",
    geste: 'Essayer',
  },
  {
    route: '/invendus',
    titre: 'Les invendus du soir',
    corps: "À la fermeture, compte ce qui part à la poubelle. Deux minutes, et c'est ce "
      + "qui permet d'ajuster les commandes pour ne plus en jeter autant.",
  },
  {
    route: '/inventaire',
    titre: 'L\'inventaire de la semaine',
    corps: "Une fois par semaine, on compte le stock. On compte des matières — des "
      + "pâtons, des cartons — pas les recettes qu'on en tire.",
  },
  {
    route: '/formation',
    titre: 'Tes manuels',
    corps: "Les guides de ton poste, avec un quiz à la fin. C'est là que tu retrouveras "
      + "tout ce qu'on vient de voir, en détail et à ton rythme.",
  },
]

export const VISITES: Record<string, EtapeVisite[]> = {
  manager: MANAGER,
  comptoir: COMPTOIR,
}

/** Quelle visite pour quel poste. Le repli est la visite courte : montrer trop
 *  à quelqu'un dont ce n'est pas le métier le décourage plus que ça ne l'aide. */
export function visitePourPoste(poste: string | null | undefined, role?: string | null): EtapeVisite[] {
  if (role === 'manager' || poste === 'manager') return MANAGER
  return COMPTOIR
}

/** -1 = terminée ou passée. null = jamais commencée. */
export const VISITE_TERMINEE = -1
