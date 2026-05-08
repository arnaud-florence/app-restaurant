// Matrice des tâches quotidiennes par poste × moment.
// Source : docs/formation/*.md. Quand un manuel est mis à jour, mettre
// à jour aussi cette matrice (ou idéalement extraire automatiquement
// les checklists d'un parser markdown).

export type Moment = 'matin' | 'service' | 'fin'
export type PosteWidget =
  | 'gerant' | 'serveur' | 'cuisinier' | 'pizzaiolo' | 'barman' | 'caisse'
  | 'receptionniste' | 'second' | 'plonge'

export type Tache = {
  id: string                    // identifiant stable (utilisé en localStorage)
  label: string
  obligatoire?: boolean         // marquée d'un ⚠️ en UI
  module?: string               // route /admin/X qui aide à faire la tâche
}

type Matrice = Record<PosteWidget, Record<Moment, Tache[]>>

export const POSTE_INFO: Record<PosteWidget, { label: string; emoji: string }> = {
  gerant:         { label: 'Gérant',         emoji: '🧑‍💼' },
  serveur:        { label: 'Serveur',        emoji: '🍽️' },
  cuisinier:      { label: 'Cuisinier',      emoji: '👨‍🍳' },
  pizzaiolo:      { label: 'Pizzaiolo',      emoji: '🍕' },
  barman:         { label: 'Barman',         emoji: '🍺' },
  caisse:         { label: 'Caisse',         emoji: '💰' },
  receptionniste: { label: 'Réceptionniste', emoji: '🛎️' },
  second:         { label: 'Second',         emoji: '👨‍🍳' },
  plonge:         { label: 'Plonge / Extra', emoji: '🧽' },
}

export const MOMENT_INFO: Record<Moment, { label: string; emoji: string }> = {
  matin:   { label: "Avant l'ouverture", emoji: '🌅' },
  service: { label: 'Pendant le service', emoji: '🍴' },
  fin:     { label: 'Fin de service',     emoji: '🌃' },
}

export const TACHES: Matrice = {
  gerant: {
    matin: [
      { id: 'g-m-pilotage', label: 'Check 5 min sur /admin/pilotage (4 KPIs clés)', obligatoire: true, module: '/admin/pilotage' },
      { id: 'g-m-assistant', label: 'Lire les 3 actions prioritaires de l\'assistant IA', module: '/admin/assistant' },
      { id: 'g-m-previsionnel', label: 'Consulter prévisionnel + météo du jour', module: '/admin/previsionnel' },
      { id: 'g-m-resa', label: 'Voir les réservations + événements du jour', module: '/admin/reservations' },
      { id: 'g-m-briefing', label: 'Briefing équipe via /equipes ou en personne', module: '/equipes' },
    ],
    service: [
      { id: 'g-s-supervise', label: 'Surveiller le pilotage (NC critique, food cost, masse sal)', module: '/admin/pilotage' },
      { id: 'g-s-zmidi', label: 'Vérifier le Z-report midi (CA + écart caisse)', module: '/caisse' },
    ],
    fin: [
      { id: 'g-f-zfinal', label: 'Validation Z-report final + dépôt caisse', obligatoire: true, module: '/caisse' },
      { id: 'g-f-journal', label: 'Saisir l\'entrée journal de bord (humeur + faits marquants)', obligatoire: true, module: '/admin/journal' },
      { id: 'g-f-pilotage', label: 'Vérifier les 4 saisies obligatoires du jour (T°, journal, Z, pointage)', module: '/admin/pilotage' },
    ],
  },

  serveur: {
    matin: [
      { id: 's-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 's-m-nom', label: 'Sélectionner ton nom dans /serveur', obligatoire: true, module: '/serveur' },
      { id: 's-m-briefing', label: 'Lire le briefing équipe (canal général)', module: '/equipes' },
      { id: 's-m-resa', label: 'Vérifier les réservations du jour', module: '/admin/reservations' },
      { id: 's-m-allergenes', label: 'Survoler les allergènes du menu', module: '/admin/allergenes' },
      { id: 's-m-checklist', label: 'Checklist hygiène salle ouverture', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 's-s-cmd', label: 'Saisir chaque commande (avec allergènes signalés)', obligatoire: true, module: '/serveur' },
      { id: 's-s-servi', label: 'Marquer "servi" à chaque plat apporté', obligatoire: true, module: '/serveur' },
      { id: 's-s-appels', label: 'Répondre aux appels QR serveur (banner /serveur)', module: '/serveur' },
      { id: 's-s-encaisse', label: 'Encaisser proprement chaque table (méthode + pourboire)', obligatoire: true, module: '/caisse' },
      { id: 's-s-email', label: 'Demander l\'email à l\'encaissement', module: '/caisse' },
    ],
    fin: [
      { id: 's-f-tables', label: 'Vérifier qu\'aucune table n\'est ouverte', obligatoire: true, module: '/serveur' },
      { id: 's-f-checklist', label: 'Checklist hygiène salle fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 's-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  cuisinier: {
    matin: [
      { id: 'c-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'c-m-briefing', label: 'Lire le briefing canal Cuisine', module: '/equipes' },
      { id: 'c-m-temp', label: 'Relevés température équipements (HACCP)', obligatoire: true, module: '/admin/hygiene' },
      { id: 'c-m-dlc', label: 'Vérifier lots à DLC <24h ou <3j', obligatoire: true, module: '/admin/hygiene' },
      { id: 'c-m-checklist', label: 'Checklist hygiène cuisine ouverture', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 'c-s-cmd', label: 'Marquer chaque plat "en préparation" puis "prêt"', obligatoire: true, module: '/cuisine' },
      { id: 'c-s-allergenes', label: 'Vérifier allergènes signalés AVANT de cuisiner', obligatoire: true, module: '/admin/allergenes' },
      { id: 'c-s-lots', label: 'Saisir tout nouveau lot reçu fournisseur', module: '/admin/hygiene' },
    ],
    fin: [
      { id: 'c-f-temp', label: 'Relevés température soir (HACCP)', obligatoire: true, module: '/admin/hygiene' },
      { id: 'c-f-dechets', label: 'Pesée des déchets toutes catégories', obligatoire: true, module: '/admin/dechets' },
      { id: 'c-f-lots', label: 'Statuer les lots utilisés (consommé / jeté)', module: '/admin/hygiene' },
      { id: 'c-f-checklist', label: 'Checklist hygiène cuisine fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 'c-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  pizzaiolo: {
    matin: [
      { id: 'p-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'p-m-pate', label: 'Vérifier DLC pâte (24-48h max)', obligatoire: true, module: '/admin/hygiene' },
      { id: 'p-m-four', label: 'Allumage four + relevé température (430-480°C)', obligatoire: true, module: '/admin/hygiene' },
      { id: 'p-m-ingredients', label: 'Survoler ingrédients pizza (mozza, sauce, basilic)', module: '/admin/ingredients' },
      { id: 'p-m-checklist', label: 'Checklist hygiène cuisine (banc + four)', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 'p-s-cmd', label: 'Marquer chaque pizza "en préparation" puis "prêt"', obligatoire: true, module: '/cuisine?role=pizzaiolo' },
      { id: 'p-s-allergenes', label: 'Allergène GLUTEN signalé : pâte sans gluten + outils séparés', obligatoire: true, module: '/admin/allergenes' },
      { id: 'p-s-pate', label: 'Préparer la pâte du lendemain (saisir comme nouveau lot)', module: '/admin/hygiene' },
    ],
    fin: [
      { id: 'p-f-four', label: 'Relevé température four (avant extinction)', obligatoire: true, module: '/admin/hygiene' },
      { id: 'p-f-pate', label: 'Statuer la pâte restante (consommé / en_stock / jeté)', module: '/admin/hygiene' },
      { id: 'p-f-dechets', label: 'Pesée déchets pizza (pâte, cartons)', obligatoire: true, module: '/admin/dechets' },
      { id: 'p-f-checklist', label: 'Checklist hygiène cuisine fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 'p-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  barman: {
    matin: [
      { id: 'b-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'b-m-briefing', label: 'Lire le briefing canal Bar', module: '/equipes' },
      { id: 'b-m-temp', label: 'Relevés température frigos bar / cave / tireuse', obligatoire: true, module: '/admin/hygiene' },
      { id: 'b-m-bouteilles', label: 'Vérifier les bouteilles ouvertes (durée vie, jeter si fin)', obligatoire: true, module: '/admin/stock' },
      { id: 'b-m-checklist', label: 'Checklist hygiène bar ouverture', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 'b-s-cmd', label: 'Marquer chaque boisson "en préparation" puis "prêt"', obligatoire: true, module: '/bar' },
      { id: 'b-s-allergenes', label: 'Vérifier sulfites/lait/œufs/fruits coque sur boissons', module: '/admin/boissons' },
      { id: 'b-s-encaisse', label: 'Encaissements comptoir bar (pourboire dans bon champ)', module: '/caisse' },
    ],
    fin: [
      { id: 'b-f-inventaire', label: 'INVENTAIRE bouteilles ouvertes + fûts (écart >5% = enquête)', obligatoire: true, module: '/admin/stock' },
      { id: 'b-f-casses', label: 'Saisir les casses + cocktails ratés', obligatoire: true, module: '/admin/dechets' },
      { id: 'b-f-temp', label: 'Relevé température frigo bar (soir)', obligatoire: true, module: '/admin/hygiene' },
      { id: 'b-f-dechets', label: 'Pesée déchets bar (verre + bio)', obligatoire: true, module: '/admin/dechets' },
      { id: 'b-f-checklist', label: 'Checklist hygiène bar fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 'b-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  caisse: {
    matin: [
      { id: 'k-m-ouverture', label: 'Ouvrir la session caisse (fond initial)', obligatoire: true, module: '/caisse' },
    ],
    service: [
      { id: 'k-s-encaisse', label: 'Encaisser proprement (méthode + pourboire séparé)', obligatoire: true, module: '/caisse' },
    ],
    fin: [
      { id: 'k-f-zreport', label: 'Z-report fin de session (vérifier écart théorique/réel)', obligatoire: true, module: '/caisse' },
      { id: 'k-f-fermeture', label: 'Fermer la session caisse', obligatoire: true, module: '/caisse' },
    ],
  },

  receptionniste: {
    matin: [
      { id: 'r-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'r-m-arrivees', label: 'Liste arrivées chambres du jour', module: '/admin/reservations' },
      { id: 'r-m-tables', label: 'Liste résas tables midi + soir', module: '/admin/reservations' },
      { id: 'r-m-events', label: 'Vérifier événements en cours / à venir', module: '/admin/reservations' },
      { id: 'r-m-briefing', label: 'Poster briefing équipe (chambres + tables + events)', obligatoire: true, module: '/equipes' },
    ],
    service: [
      { id: 'r-s-resas', label: 'Saisir réservations entrantes (téléphone, mail, walk-in)', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-s-acompte', label: 'Encaisser acomptes à réception', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-s-checkin', label: 'Check-in / check-out chambres', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-s-clients', label: 'Mettre à jour fiches clients (allergies, préférences)', module: '/admin/clients' },
      { id: 'r-s-reclamations', label: 'Répondre aux réclamations <48h', module: '/admin/clients' },
    ],
    fin: [
      { id: 'r-f-statuts', label: 'Vérifier statuts en suspens (no_show, check-out manqué)', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-f-briefing', label: 'Préparer briefing du lendemain', module: '/equipes' },
      { id: 'r-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  second: {
    matin: [
      { id: 'sd-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'sd-m-previsionnel', label: 'Lecture météo + prévisionnel CA', module: '/admin/previsionnel' },
      { id: 'sd-m-temp', label: 'Vérifier que les relevés température sont saisis', obligatoire: true, module: '/admin/hygiene' },
      { id: 'sd-m-briefing', label: 'Briefing équipe cuisine (canal Cuisine)', obligatoire: true, module: '/equipes' },
      { id: 'sd-m-dlc', label: 'Identifier les lots à priorité (DLC critique)', module: '/admin/hygiene' },
    ],
    service: [
      { id: 'sd-s-supervise', label: 'Superviser /cuisine, intervenir si besoin', module: '/cuisine' },
      { id: 'sd-s-allergenes', label: 'Sécuriser les commandes allergènes (vérification)', module: '/admin/allergenes' },
    ],
    fin: [
      { id: 'sd-f-validation', label: 'Valider la pesée déchets (cohérence)', module: '/admin/dechets' },
      { id: 'sd-f-lots', label: 'Vérifier statuts lots à jour (consommé/jeté/en_stock)', module: '/admin/hygiene' },
      { id: 'sd-f-journal', label: 'Saisir entrée journal cuisine si fait marquant', module: '/admin/journal' },
      { id: 'sd-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  plonge: {
    matin: [
      { id: 'pl-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'pl-m-equipe', label: 'Lire chat équipe (consignes)', module: '/equipes' },
    ],
    service: [
      { id: 'pl-s-plonge', label: 'Plonge en continu (couverts, casseroles)', obligatoire: true },
      { id: 'pl-s-rangement', label: 'Aide rangement et tri si besoin' },
    ],
    fin: [
      { id: 'pl-f-checklist', label: 'Cocher checklist nettoyage cuisine (au fur et à mesure)', obligatoire: true, module: '/admin/hygiene' },
      { id: 'pl-f-dechets', label: 'Pesée déchets (toutes catégories)', obligatoire: true, module: '/admin/dechets' },
      { id: 'pl-f-poubelles', label: 'Sortir les poubelles aux containers extérieurs', obligatoire: true },
      { id: 'pl-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },
}

/** Renvoie les tâches d'un poste pour un moment donné. */
export function getTaches(poste: PosteWidget, moment: Moment): Tache[] {
  return TACHES[poste]?.[moment] ?? []
}

/** Détermine le moment de la journée actuel pour pré-ouvrir la bonne section. */
export function momentActuel(now: Date = new Date()): Moment {
  const h = now.getHours()
  if (h < 11) return 'matin'
  if (h < 22) return 'service'
  return 'fin'
}

/** Clé localStorage pour la persistance par poste + date. */
export function clefLocalStorage(poste: PosteWidget, date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10)
  return `taches_${poste}_${iso}`
}
