// Catalogue de navigation centralisé — utilisé par TopActionBar (chips bottom)
// et par les pages /admin/cat/[slug] qui affichent les sous-modules d'une catégorie.

import type { EtatActivation, ModuleCle } from '@/lib/activation/config'

export type CategoryTone = 'emerald' | 'amber' | 'violet' | 'blue' | 'red' | 'zinc' | 'rose'

export type SubModule = {
  href: string
  emoji: string
  label: string
  /** Description courte affichée sous le label dans la page catégorie. */
  description: string
  /** URL Unsplash thématique (fond photo de la tuile). Fallback emoji-gradient si absent. */
  imageUrl?: string
  /** Module d'activation dont dépend la tuile (migration 0110). Absent = toujours
   *  visible. Une tuile dont le module est éteint disparaît de la navigation —
   *  et revient d'elle-même quand le gérant rallume l'activité. */
  module?: ModuleCle
}

/** Helper pour générer une URL Unsplash optimisée (format 600x600 q75). */
const u = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=75`

export type Category = {
  slug: string
  emoji: string
  label: string
  /** Sous-titre / pitch affiché dans la page catégorie. */
  pitch: string
  tone: CategoryTone
  /** URL Unsplash thématique pour la photo de fond des tuiles (mode photo).
   *  Fallback emoji + gradient si absent. */
  imageUrl?: string
  /** URL vidéo (mp4) pour le hero banner immersif de la page catégorie.
   *  Si présente, joue en autoplay loop muted en background. */
  videoUrl?: string
  items: SubModule[]
}

// La chip "Accueil" est traitée spécialement dans TopActionBar : elle pointe
// vers /admin/cat (vue d'ensemble globale, page principale de l'app).
// La catégorie 'pilotage' ci-dessous contient les sous-modules stratégiques.
export const CATEGORIES: Category[] = [
  {
    slug: 'pilotage',
    emoji: '📊',
    label: 'Pilotage',
    pitch: 'Tableau de bord stratégique et personnel.',
    tone: 'emerald',
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=75',
    items: [
      { href: '/mon-espace',         emoji: '🏠', label: 'Mon espace',       description: 'Tableau de bord personnel : pointage, paie, planning, challenges.', imageUrl: u('1554224155-6726b3ff858f') },
      { href: '/admin',              emoji: '📊', label: 'Tableau de bord',  description: 'Vue manager : alertes urgentes, KPIs flash, accès rapide.',        imageUrl: u('1551288049-bebda4e38f71') },
      { href: '/admin/supervision',  emoji: '🟢', label: 'Équipe en direct',  description: 'Qui travaille, qui est connecté, activité service temps réel + récap par employé.', imageUrl: u('1521737711867-e3b97375f902') },
      { href: '/admin/pilotage',     emoji: '🎯', label: 'Pilotage',         description: '10 KPIs, objectifs, plan d\'action mensuel, saisonnalité.',         imageUrl: u('1460925895917-afdab827c52f') },
      { href: '/admin/co-gerant',     emoji: '🧑‍💼', label: 'Arnaud — co-gérant', description: 'Ton co-gérant IA : il audite, propose, tu valides — il agit.',       imageUrl: u('1556157382-97eda2d62296') },
      { href: '/admin/journal',      emoji: '📓', label: 'Journal de bord',  description: 'Notes humeurs + photos + analyse IA sur 6 mois.',                   imageUrl: u('1517842645767-c639042777db') },
      { href: '/admin/previsionnel', emoji: '🌤', label: 'Prévisionnel',     description: 'Météo + prévision CA 7j + suggestions IA.',                         imageUrl: u('1504608524841-42fe6f032b4b') },
    ],
  },
  {
    slug: 'service',
    emoji: '🍽',
    label: 'Service',
    pitch: 'Tous les écrans temps réel de service.',
    tone: 'blue',
    imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=75',
    videoUrl: '/videos/brasserie.mp4.mp4',
    items: [
      // Le comptoir Fournil est le point de vente actif pendant la période
      // « Fournil d'abord » → il ouvre la liste.
      // ⚠️ La VENTE se fait sur les caisses (cf. src/lib/frontiere-caisse.ts).
      // Ne subsistent ici que les écrans sans équivalent en caisse : la
      // préparation, les commandes du site web et la tournée de livraison.
      { href: '/comptoir/fournil/kds', emoji: '🥖', label: 'Préparation Fournil', description: 'Commandes du site web à préparer. La vente au comptoir se fait sur la caisse.', imageUrl: u('1509440159596-0249088772ff'), module: 'fournil' },
      { href: '/cuisine',         emoji: '👨‍🍳', label: 'Cuisine',          description: 'Bons de préparation cuisine, minuteur, ding sonore.', imageUrl: u('1556909114-f6e7ad7d3136'), module: 'restaurant_salle' },
      { href: '/pizza',           emoji: '🍕',   label: 'Pizza',            description: 'Bons de préparation pizza (filtre tag PIZZA).',        imageUrl: u('1513104890138-7c749659a591'), module: 'pizzeria' },
      { href: '/bar',             emoji: '🍷',   label: 'Bar',              description: 'Boissons à préparer.',                                 imageUrl: u('1514933651103-005eec06c04b'), module: 'bar' },
      { href: '/livreur',         emoji: '🛵',   label: 'Livreur',          description: 'Tournée du jour, Maps multi-points, retards par mail.', imageUrl: u('1558981852-426c6c22a060'), module: 'fournil_livraison' },
      { href: '/reception',       emoji: '🛎',   label: 'Réception',        description: 'Arrivées/départs jour, demandes résa, acomptes.',      imageUrl: u('1551882547-ff40c63fe5fa'), module: 'chambres' },
      { href: '/admin/affichage', emoji: '📺',   label: 'Affichage TV',     description: 'Menu du jour + promos rotatives en salle (Module 26).', imageUrl: u('1593359677879-a4bb92f829d1') },
    ],
  },
  {
    slug: 'cuisine-stock',
    emoji: '🥬',
    label: 'Cuisine & stock',
    pitch: 'Fiches techniques, achats et inventaires.',
    tone: 'amber',
    imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=75',
    videoUrl: '/videos/pizza.mp4.mp4',
    items: [
      { href: '/admin/recettes',         emoji: '👨‍🍳', label: 'Recettes',         description: 'Food cost, allergènes, fiches techniques.',         imageUrl: u('1546069901-ba9599a7e63c') },
      { href: '/admin/plats-du-jour',    emoji: '✨',  label: 'Plats du jour',    description: 'Carte du jour, suggestions IA selon stock.',       imageUrl: u('1567620905732-2d1ec7ab7445') },
      { href: '/admin/capacite-cuisine', emoji: '⚙️',  label: 'Capacité cuisine', description: 'Limites de prod par poste et par créneau.',         imageUrl: u('1565299624946-b28f40a0ae38') },
      { href: '/admin/ingredients',      emoji: '🥬',  label: 'Ingrédients',      description: 'Catalogue, prix historique, allergènes, lots.',     imageUrl: u('1542838132-92c53300491e') },
      { href: '/admin/stock',            emoji: '📦',  label: 'Stock',            description: 'Niveaux temps réel, alertes rupture, mouvements.',  imageUrl: u('1604719312566-8912e9227c6a') },
      { href: '/admin/fournisseurs',     emoji: '🚚',  label: 'Fournisseurs',     description: 'Bons de commande, factures, réceptions, prix.',    imageUrl: u('1586528116311-ad8dd3c8310d') },
      { href: '/admin/boissons',         emoji: '🍷',  label: 'Boissons',         description: 'Multi-format, accords mets-vins, food cost.',      imageUrl: u('1510812431401-41d2bd2722f3') },
      { href: '/admin/allergenes',       emoji: '⚠️',  label: 'Allergènes',       description: '14 allergènes EU, QR salle, alerte cuisine.',       imageUrl: u('1599909366516-6c5c5f5c2c34') },
    ],
  },
  {
    slug: 'clientele',
    emoji: '👥',
    label: 'Clientèle',
    pitch: 'CRM, fidélité, réservations, marketing.',
    tone: 'rose',
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75',
    videoUrl: '/videos/chambre.mp4.mp4',
    items: [
      { href: '/admin/reservations',     emoji: '📅', label: 'Réservations',      description: 'Tables, terrasse, chambres, événementiel.',              imageUrl: u('1517248135467-4c7edcad34c4'), module: 'reservation_table' },
      { href: '/admin/chambres',         emoji: '🛏',  label: 'Chambres',          description: 'Calendrier multi-chambres, check-in, facture PDF.',      imageUrl: u('1582719478250-c89cae4dc85b'), module: 'chambres' },
      { href: '/admin/groupes',          emoji: '👥', label: 'Groupes',           description: 'Tours-opérateurs, menus négociés, arrhes/solde.',        imageUrl: u('1559339352-11d035aa65de'), module: 'evenementiel' },
      { href: '/admin/clients',          emoji: '🧑', label: 'Clients / CRM',     description: 'Historique, allergies, segmentation, parrainage, campagnes, WiFi.', imageUrl: u('1521737711867-e3b97375f902') },
      { href: '/admin/clients/fidelite', emoji: '⭐', label: 'Programme fidélité', description: 'Points, niveaux, paramètres, analytics, historique.',    imageUrl: u('1556742393-d5066b0a7894'), module: 'fidelite' },
      { href: '/admin/promotions',       emoji: '🎁', label: 'Promotions',        description: 'Bannières site web & happy hours (côté site public).',   imageUrl: u('1607082348824-0a96f2a4b9da') },
      { href: '/admin/codes-promo',      emoji: '🏷',  label: 'Codes réduction',   description: 'Codes de réduction à l\'encaissement : création + suivi par code.', imageUrl: u('1607082349566-187342175e2f') },
      { href: '/admin/cartes-cadeaux',   emoji: '🎫', label: 'Cartes cadeaux',    description: 'Émission, suivi solde, conformité (Phase 1).',           imageUrl: u('1549465220-1a8b9238cd48') },
      { href: '/admin/reputation',       emoji: '🏆', label: 'Réputation / Avis', description: 'Collecte avis post-commande J+1, alertes notes basses.', imageUrl: u('1530021232320-687d8e3dba54') },
      { href: '/admin/marketing',        emoji: '📢', label: 'Marketing IA',      description: 'Génération posts Claude, calendrier éditorial.',         imageUrl: u('1551434678-e076c223a692') },
    ],
  },
  {
    slug: 'equipe',
    emoji: '👨‍🍳',
    label: 'Équipe & formation',
    pitch: 'RH, formation, communication, challenges.',
    tone: 'violet',
    imageUrl: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=800&q=75',
    videoUrl: '/videos/evenement.mp4.mp4',
    items: [
      { href: '/admin/rh',         emoji: '👥', label: 'Ressources humaines', description: 'Fiches, planning, paie, pourboires, congés.',           imageUrl: u('1521737852567-6949f3f9f2b5') },
      { href: '/equipes',          emoji: '💬', label: 'Chat équipe',         description: 'Messagerie interne 5 canaux, CR, matériel.',           imageUrl: u('1573164574572-cb89e39749b4') },
      { href: '/formation',        emoji: '📖', label: 'Mes manuels',         description: 'Guides poste, quiz validation, fiche poste PDF.',      imageUrl: u('1456513080510-7bf3a84b82f8') },
      { href: '/admin/formation',  emoji: '🎓', label: 'Gérer guides',        description: 'Étapes, quiz QCM, simulations, certifications.',       imageUrl: u('1503676260728-1c00da094a0b') },
      { href: '/admin/challenges', emoji: '🏆', label: 'Challenges',          description: 'Objectifs équipe/individuel, primes, leaderboard.',    imageUrl: u('1517649763962-0c623066013b') },
    ],
  },
  {
    slug: 'finances',
    emoji: '💰',
    label: 'Finances',
    pitch: 'P&L, trésorerie, énergie, simulations.',
    tone: 'emerald',
    imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=75',
    items: [
      { href: '/admin/finances', emoji: '💰', label: 'Finances / TVA',    description: 'P&L live, trésorerie 30/60/90j, simulateurs.',  imageUrl: u('1554224155-6726b3ff858f') },
      { href: '/admin/ventes-pdv', emoji: '📊', label: 'Ventes — 2 activités', description: 'Vision consolidée Restaurant + Fournil, CA ventilé par point de vente + commissions.', imageUrl: u('1460925895917-afdab827c52f') },
      { href: '/admin/ventes', emoji: '📈', label: 'Statistiques de vente', description: 'CA, heures de pointe, meilleures ventes, comparaisons.', imageUrl: u('1543286386-713bdd548da4') },
      { href: '/admin/integrations', emoji: '🔌', label: 'Pont caisse ↔ outil', description: 'Ce que la caisse a poussé vs ce que l\'outil en a fait, échanges et écarts.', imageUrl: u('1518770660439-4636190af475') },
      { href: '/admin/economie', emoji: '🧮', label: 'Centre économique', description: 'Point mort, marges, surplus, redistribution.', imageUrl: u('1611532736597-de2d4265fba3') },
      { href: '/admin/energie',  emoji: '⚡', label: 'Énergie',           description: 'Élec/gaz/eau, comparaison N-1, alertes +20%.', imageUrl: u('1473341304170-971dccb5ac1e') },
      { href: '/admin/commissions', emoji: '🤝', label: 'Commissions tiers', description: 'FDJ, tabac, relais colis — commissions hors CA principal.', imageUrl: u('1518186285589-2f7649de83e0') },
    ],
  },
  {
    slug: 'conformite',
    emoji: '🛡',
    label: 'Conformité',
    pitch: 'Hygiène, légal, sécurité, environnement.',
    tone: 'red',
    imageUrl: 'https://images.unsplash.com/photo-1581578017093-cd30fce4eeb7?auto=format&fit=crop&w=800&q=75',
    items: [
      { href: '/admin/hygiene',     emoji: '🧴', label: 'Hygiène / HACCP', description: 'CCP, températures, lots/DLC, checklists, NC.',           imageUrl: u('1581578017093-cd30fce4eeb7') },
      { href: '/admin/dechets',     emoji: '🗑',  label: 'Déchets (AGEC)',  description: 'Pesées, gaspillage €, BSD, rapport annuel.',             imageUrl: u('1532601224476-15c79f2f7a51') },
      { href: '/admin/legal',       emoji: '📑', label: 'Légal',           description: 'Licences, affichages, assurances, échéances 1 mois.',    imageUrl: u('1450101499163-c8848c66ca85') },
      { href: '/admin/maintenance', emoji: '🔧', label: 'Maintenance',     description: 'Équipements, plannings, contrôles obligatoires.',        imageUrl: u('1530124566582-a618bc2615dc') },
    ],
  },
  {
    slug: 'systeme',
    emoji: '⚙️',
    label: 'Système',
    pitch: 'Configuration, sécurité, accès, sauvegardes.',
    tone: 'zinc',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=75',
    items: [
      { href: '/admin/etablissements', emoji: '🏪', label: 'Points de vente', description: 'Restauration, bar, fournil, snack + services tiers (FDJ, tabac, colis).', imageUrl: u('1497366216548-37526070297c') },
      { href: '/admin/caisse-agreee', emoji: '🔌', label: 'Connecteur caisse agréée', description: 'Synchro des encaissements de la caisse agréée (NF525) + contrat d\'intégration.', imageUrl: u('1556742502-ec7c0e9f34b1') },
      { href: '/admin/setup',    emoji: '⚙️', label: 'Configuration', description: 'Setup wizard, info établissement, intégrations.', imageUrl: u('1581090464777-f3220bbe1b8b') },
      { href: '/admin/securite', emoji: '🔐', label: 'Sécurité',      description: 'RBAC, 2FA, audit, connexions, sauvegardes.',     imageUrl: u('1563013544-824ae1b704d3') },
      { href: '/admin/borne',    emoji: '🛍', label: 'Borne kiosk',   description: 'Configuration des bornes self-service en salle.', imageUrl: u('1556909114-f6e7ad7d3136') },
    ],
  },
]

/** Retire les tuiles dont le module d'activation est éteint, puis les catégories
 *  devenues vides. Pendant la période « Fournil d'abord », cela fait disparaître
 *  Salle, Pizza, Bar, Snack, Réception, Chambres, Groupes et Réservations de la
 *  navigation des employés — sans rien supprimer côté code ni côté base. */
export function filtrerCategories(etat: EtatActivation, categories: Category[] = CATEGORIES): Category[] {
  return categories
    .map(c => ({ ...c, items: c.items.filter(it => !it.module || etat[it.module]) }))
    .filter(c => c.items.length > 0)
}

/** Retourne la catégorie qui contient un href donné, ou null.
 *  Quand plusieurs items matchent (cas d'items "préfixes" comme /admin qui match aussi
 *  /admin/stock), on retourne celui dont le href est le PLUS LONG (le plus spécifique).
 *  → Pour /admin/stock on retourne 'cuisine-stock' (item /admin/stock) et non 'pilotage'
 *    (item /admin qui matchait comme préfixe trop générique).
 */
export function findCategoryByHref(href: string): Category | null {
  let best: { cat: Category; itemLen: number } | null = null
  for (const c of CATEGORIES) {
    for (const it of c.items) {
      const matches = it.href === href || href.startsWith(it.href + '/')
      if (!matches) continue
      if (!best || it.href.length > best.itemLen) {
        best = { cat: c, itemLen: it.href.length }
      }
    }
  }
  return best?.cat ?? null
}

/** Retourne la catégorie active pour un pathname donné (en priorité : URL /admin/cat/<slug>). */
export function resolveActiveCategory(pathname: string): Category | null {
  const m = pathname.match(/^\/admin\/cat\/([^\/]+)/)
  if (m) return CATEGORIES.find(c => c.slug === m[1]) ?? null
  return findCategoryByHref(pathname)
}

/** Priorité d'ordre des catégories selon le poste de l'utilisateur. */
export const POSTE_PRIORITES_CATEGORIES: Record<string, string[]> = {
  manager:        ['pilotage', 'service', 'finances', 'clientele', 'equipe'],
  gerant:         ['pilotage', 'service', 'finances', 'clientele', 'equipe'],
  cuisinier:      ['service', 'cuisine-stock', 'pilotage', 'equipe'],
  cuisine:        ['service', 'cuisine-stock', 'pilotage', 'equipe'],
  pizzaiolo:      ['service', 'cuisine-stock', 'pilotage'],
  second:         ['service', 'cuisine-stock', 'pilotage', 'conformite'],
  bar:            ['service', 'cuisine-stock', 'pilotage', 'equipe'],
  barman:         ['service', 'cuisine-stock', 'pilotage', 'equipe'],
  serveur:        ['service', 'clientele', 'pilotage', 'equipe'],
  salle:          ['service', 'clientele', 'pilotage', 'equipe'],
  receptionniste: ['service', 'clientele', 'pilotage'],
  plonge:         ['service', 'conformite', 'pilotage'],
  extra:          ['service', 'pilotage'],
}
