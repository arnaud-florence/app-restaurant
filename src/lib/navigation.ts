// Catalogue de navigation centralisé — utilisé par TopActionBar (chips bottom)
// et par les pages /admin/cat/[slug] qui affichent les sous-modules d'une catégorie.

export type CategoryTone = 'emerald' | 'amber' | 'violet' | 'blue' | 'red' | 'zinc' | 'rose'

export type SubModule = {
  href: string
  emoji: string
  label: string
  /** Description courte affichée sous le label dans la page catégorie. */
  description: string
}

export type Category = {
  slug: string
  emoji: string
  label: string
  /** Sous-titre / pitch affiché dans la page catégorie. */
  pitch: string
  tone: CategoryTone
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
    items: [
      { href: '/mon-espace',         emoji: '🏠', label: 'Mon espace',       description: 'Tableau de bord personnel : pointage, paie, planning, challenges.' },
      { href: '/admin',              emoji: '📊', label: 'Tableau de bord',  description: 'Vue manager : alertes urgentes, KPIs flash, accès rapide.' },
      { href: '/admin/pilotage',     emoji: '🎯', label: 'Pilotage',         description: '10 KPIs, objectifs, plan d\'action mensuel, saisonnalité.' },
      { href: '/admin/assistant',    emoji: '🤖', label: 'Assistant IA',     description: 'Chat Claude connecté à toutes tes données live.' },
      { href: '/admin/journal',      emoji: '📓', label: 'Journal de bord',  description: 'Notes humeurs + photos + analyse IA sur 6 mois.' },
      { href: '/admin/previsionnel', emoji: '🌤', label: 'Prévisionnel',     description: 'Météo + prévision CA 7j + suggestions IA.' },
    ],
  },
  {
    slug: 'service',
    emoji: '🍽',
    label: 'Service',
    pitch: 'Tous les écrans temps réel de service.',
    tone: 'blue',
    items: [
      { href: '/serveur',         emoji: '🍽',   label: 'Salle / Serveur',  description: 'Plan de salle + prise de commande + encaissement.' },
      { href: '/caisse',          emoji: '💰',   label: 'Caisse',           description: 'Dashboard live, ouverture/clôture session, rapport Z.' },
      { href: '/cuisine',         emoji: '👨‍🍳', label: 'Cuisine',          description: 'Bons de prep cuisine + pizza, minuteur, ding sonore.' },
      { href: '/pizza',           emoji: '🍕',   label: 'Pizza',            description: 'KDS pizza dédié (filtre tag PIZZA).' },
      { href: '/bar',             emoji: '🍷',   label: 'Bar',              description: 'KDS bar pour boissons en attente.' },
      { href: '/emporter',        emoji: '🛒',   label: 'Snack / Emporter', description: 'Service ONLINE différencié (créneaux multi-zones).' },
      { href: '/livreur',         emoji: '🛵',   label: 'Livreur',          description: 'Tournée du jour, Maps multi-points, retards par mail.' },
      { href: '/reception',       emoji: '🛎',   label: 'Réception',        description: 'Arrivées/départs jour, demandes résa, acomptes.' },
      { href: '/admin/affichage', emoji: '📺',   label: 'Affichage TV',     description: 'Menu du jour + promos rotatives en salle (Module 26).' },
    ],
  },
  {
    slug: 'cuisine-stock',
    emoji: '🥬',
    label: 'Cuisine & stock',
    pitch: 'Fiches techniques, achats et inventaires.',
    tone: 'amber',
    items: [
      { href: '/admin/recettes',         emoji: '👨‍🍳', label: 'Recettes',         description: 'Food cost, allergènes, fiches techniques.' },
      { href: '/admin/plats-du-jour',    emoji: '✨',  label: 'Plats du jour',    description: 'Carte du jour, suggestions IA selon stock.' },
      { href: '/admin/capacite-cuisine', emoji: '⚙️',  label: 'Capacité cuisine', description: 'Limites de prod par poste et par créneau.' },
      { href: '/admin/ingredients',      emoji: '🥬',  label: 'Ingrédients',      description: 'Catalogue, prix historique, allergènes, lots.' },
      { href: '/admin/stock',            emoji: '📦',  label: 'Stock',            description: 'Niveaux temps réel, alertes rupture, mouvements.' },
      { href: '/admin/fournisseurs',     emoji: '🚚',  label: 'Fournisseurs',     description: 'Bons de commande, factures, réceptions, prix.' },
      { href: '/admin/boissons',         emoji: '🍷',  label: 'Boissons',         description: 'Multi-format, accords mets-vins, food cost.' },
      { href: '/admin/allergenes',       emoji: '⚠️',  label: 'Allergènes',       description: '14 allergènes EU, QR salle, alerte cuisine.' },
    ],
  },
  {
    slug: 'clientele',
    emoji: '👥',
    label: 'Clientèle',
    pitch: 'CRM, fidélité, réservations, marketing.',
    tone: 'rose',
    items: [
      { href: '/admin/reservations',     emoji: '📅', label: 'Réservations',    description: 'Tables, terrasse, chambres, événementiel.' },
      { href: '/admin/chambres',         emoji: '🛏',  label: 'Chambres',        description: 'Calendrier multi-chambres, check-in, facture PDF.' },
      { href: '/admin/groupes',          emoji: '👥', label: 'Groupes',         description: 'Tours-opérateurs, menus négociés, arrhes/solde.' },
      { href: '/admin/clients',          emoji: '🧑', label: 'Clients / CRM',   description: 'Historique, allergies, segmentation, WiFi.' },
      { href: '/admin/clients/fidelite', emoji: '⭐', label: 'Programme fidélité', description: 'Points, niveaux, parrainage, campagnes.' },
      { href: '/admin/promotions',       emoji: '🎁', label: 'Promotions',      description: 'Codes promo, happy hours, offres temporaires.' },
      { href: '/admin/codes-promo',      emoji: '🏷',  label: 'Codes promo',     description: 'Création + suivi performance par code.' },
      { href: '/admin/cartes-cadeaux',   emoji: '🎫', label: 'Cartes cadeaux',  description: 'Émission, suivi solde, conformité (Phase 1).' },
      { href: '/admin/reputation',       emoji: '🏆', label: 'Réputation / Avis', description: 'Collecte avis post-commande J+1, alertes notes basses.' },
      { href: '/admin/marketing',        emoji: '📢', label: 'Marketing IA',    description: 'Génération posts Claude, calendrier éditorial.' },
    ],
  },
  {
    slug: 'equipe',
    emoji: '👨‍🍳',
    label: 'Équipe & formation',
    pitch: 'RH, formation, communication, challenges.',
    tone: 'violet',
    items: [
      { href: '/admin/rh',         emoji: '👥', label: 'Ressources humaines', description: 'Fiches, planning, paie, pourboires, congés.' },
      { href: '/equipes',          emoji: '💬', label: 'Chat équipe',         description: 'Messagerie interne 5 canaux, CR, matériel.' },
      { href: '/formation',        emoji: '📖', label: 'Mes manuels',         description: 'Guides poste, quiz validation, fiche poste PDF.' },
      { href: '/admin/formation',  emoji: '🎓', label: 'Gérer guides',        description: 'Étapes, quiz QCM, simulations, certifications.' },
      { href: '/admin/challenges', emoji: '🏆', label: 'Challenges',          description: 'Objectifs équipe/individuel, primes, leaderboard.' },
    ],
  },
  {
    slug: 'finances',
    emoji: '💰',
    label: 'Finances',
    pitch: 'P&L, trésorerie, énergie, simulations.',
    tone: 'emerald',
    items: [
      { href: '/admin/finances', emoji: '💰', label: 'Finances / TVA',    description: 'P&L live, trésorerie 30/60/90j, simulateurs.' },
      { href: '/admin/economie', emoji: '🧮', label: 'Centre économique', description: 'Point mort, marges, surplus, redistribution.' },
      { href: '/admin/energie',  emoji: '⚡', label: 'Énergie',           description: 'Élec/gaz/eau, comparaison N-1, alertes +20%.' },
    ],
  },
  {
    slug: 'conformite',
    emoji: '🛡',
    label: 'Conformité',
    pitch: 'Hygiène, légal, sécurité, environnement.',
    tone: 'red',
    items: [
      { href: '/admin/hygiene',     emoji: '🧴', label: 'Hygiène / HACCP', description: 'CCP, températures, lots/DLC, checklists, NC.' },
      { href: '/admin/dechets',     emoji: '🗑',  label: 'Déchets (AGEC)',  description: 'Pesées, gaspillage €, BSD, rapport annuel.' },
      { href: '/admin/legal',       emoji: '📑', label: 'Légal',           description: 'Licences, affichages, assurances, échéances 1 mois.' },
      { href: '/admin/maintenance', emoji: '🔧', label: 'Maintenance',     description: 'Équipements, plannings, contrôles obligatoires.' },
    ],
  },
  {
    slug: 'systeme',
    emoji: '⚙️',
    label: 'Système',
    pitch: 'Configuration, sécurité, accès, sauvegardes.',
    tone: 'zinc',
    items: [
      { href: '/admin/setup',    emoji: '⚙️', label: 'Configuration', description: 'Setup wizard, info établissement, intégrations.' },
      { href: '/admin/securite', emoji: '🔐', label: 'Sécurité',      description: 'RBAC, 2FA, audit, connexions, sauvegardes.' },
    ],
  },
]

/** Retourne la catégorie qui contient un href donné, ou null. */
export function findCategoryByHref(href: string): Category | null {
  for (const c of CATEGORIES) {
    if (c.items.some(it => it.href === href || href.startsWith(it.href + '/'))) return c
  }
  return null
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
