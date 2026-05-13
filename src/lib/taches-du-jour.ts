// Matrice des tâches quotidiennes par poste × moment.
// Source : fiches de poste validées par le gérant + docs/formation/*.md.
// Quand une fiche évolue, mettre à jour cette matrice (les valeurs saisies
// vivent dans la table valeurs_saisies_taches via tache_id).

export type Moment = 'matin' | 'service' | 'fin'
export type PosteWidget =
  | 'gerant' | 'serveur' | 'cuisinier' | 'snacking' | 'caisse_snacking'
  | 'pizzaiolo' | 'barman' | 'caisse' | 'livreur'
  | 'receptionniste' | 'second' | 'plonge'

// Saisie obligatoire : tâche qui demande une valeur avant validation.
// Stockée dans la table `valeurs_saisies_taches`.
export type Saisie = {
  type: 'temperature' | 'montant' | 'nombre' | 'texte'
  label: string             // libellé du champ ("Température frigo principal")
  unite?: string            // '°C', '€', 'km', 'L', 'kg'…
  min?: number              // bornes pour validation (ex: -30 pour congélateur)
  max?: number
  placeholder?: string
}

export type Tache = {
  id: string                    // identifiant stable (utilisé en localStorage + DB)
  label: string
  obligatoire?: boolean         // marquée d'un ⚠️ en UI ; si true → bloque les suivantes en mode séquentiel
  module?: string               // route /admin/X qui aide à faire la tâche
  saisie?: Saisie               // si présent : champ d'entrée affiché avant le bouton "Fait"
}

type Matrice = Record<PosteWidget, Record<Moment, Tache[]>>

export const POSTE_INFO: Record<PosteWidget, { label: string; emoji: string }> = {
  gerant:          { label: 'Gérant',                emoji: '🧑‍💼' },
  serveur:         { label: 'Serveur',               emoji: '🍽️' },
  cuisinier:       { label: 'Cuisinier',             emoji: '👨‍🍳' },
  snacking:        { label: 'Cuisinier snacking',    emoji: '🥪' },
  caisse_snacking: { label: 'Caisse snacking',       emoji: '🛒' },
  pizzaiolo:       { label: 'Pizzaiolo',             emoji: '🍕' },
  barman:          { label: 'Barman',                emoji: '🍺' },
  caisse:          { label: 'Caisse',                emoji: '💰' },
  livreur:         { label: 'Livreur',               emoji: '🛵' },
  receptionniste:  { label: 'Réceptionniste',        emoji: '🛎️' },
  second:          { label: 'Second',                emoji: '👨‍🍳' },
  plonge:          { label: 'Plonge / Extra',        emoji: '🧽' },
}

export const MOMENT_INFO: Record<Moment, { label: string; emoji: string }> = {
  matin:   { label: "Avant l'ouverture", emoji: '🌅' },
  service: { label: 'Pendant le service', emoji: '🍴' },
  fin:     { label: 'Fin de service',     emoji: '🌃' },
}

// ─── Helpers de saisie pré-définis (DRY) ─────────────────────────────
const tempFrigo: Saisie    = { type: 'temperature', label: 'Température (°C)', unite: '°C', min: -5, max: 12, placeholder: 'ex: 4' }
const tempCongel: Saisie   = { type: 'temperature', label: 'Température (°C)', unite: '°C', min: -30, max: -10, placeholder: 'ex: -18' }
const tempChambre: Saisie  = { type: 'temperature', label: 'Température (°C)', unite: '°C', min: 0, max: 8, placeholder: 'ex: 4' }
const tempFour: Saisie     = { type: 'temperature', label: 'Température four (°C)', unite: '°C', min: 100, max: 550, placeholder: 'ex: 450' }
const fondCaisse: Saisie   = { type: 'montant', label: 'Fond de caisse (€)', unite: '€', min: 0, placeholder: 'ex: 100.00' }
const cloture: Saisie      = { type: 'montant', label: 'Total caisse (€)', unite: '€', min: 0, placeholder: 'ex: 850.00' }
const kilometrage: Saisie  = { type: 'nombre', label: 'Kilométrage (km)', unite: 'km', min: 0, placeholder: 'ex: 47' }
const remiseFond: Saisie   = { type: 'montant', label: 'Montant rendu (€)', unite: '€', min: 0, placeholder: 'ex: 250.00' }
const invendus: Saisie     = { type: 'texte', label: 'Liste des invendus', placeholder: 'ex: 3 burgers, 5 pains, 1L de soupe' }

export const TACHES: Matrice = {
  // ═══ GÉRANT ═══════════════════════════════════════════════════════
  gerant: {
    matin: [
      { id: 'g-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'g-m-pilotage', label: 'Consulter les 10 indicateurs du dashboard', obligatoire: true, module: '/admin/pilotage' },
      { id: 'g-m-stock-alertes', label: 'Vérifier les alertes stock en cours', module: '/admin/stock' },
      { id: 'g-m-checklists', label: 'Vérifier les checklists validées par les équipes', module: '/admin/hygiene' },
      { id: 'g-m-resa', label: 'Voir les réservations + événements du jour', module: '/admin/reservations' },
      { id: 'g-m-planning', label: 'Valider le planning RH du jour', module: '/admin/rh' },
      { id: 'g-m-tresorerie', label: 'Consulter la trésorerie disponible', module: '/admin/finances' },
      { id: 'g-m-assistant', label: 'Lire les 3 actions prioritaires de l\'assistant IA', module: '/admin/assistant' },
      { id: 'g-m-previsionnel', label: 'Consulter prévisionnel + météo du jour', module: '/admin/previsionnel' },
      { id: 'g-m-briefing', label: 'Briefing équipe via /equipes ou en personne', module: '/equipes' },
    ],
    service: [
      { id: 'g-s-supervise', label: 'Surveiller le pilotage (NC critique, food cost, masse sal)', module: '/admin/pilotage' },
      { id: 'g-s-zmidi', label: 'Vérifier le Z-report midi (CA + écart caisse)', module: '/caisse' },
    ],
    fin: [
      { id: 'g-f-ca', label: 'Consulter le CA du jour', obligatoire: true, module: '/admin/finances' },
      { id: 'g-f-non-encaisse', label: 'Vérifier les commandes non encaissées', obligatoire: true, module: '/caisse' },
      { id: 'g-f-zfinal', label: 'Validation Z-report final + dépôt caisse', obligatoire: true, module: '/caisse' },
      { id: 'g-f-avis', label: 'Consulter les avis clients du jour', module: '/admin/clients' },
      { id: 'g-f-journal', label: 'Saisir l\'entrée journal de bord (humeur + faits marquants)', obligatoire: true, module: '/admin/journal' },
      { id: 'g-f-pointage', label: 'Pointer fin de journée', obligatoire: true },
    ],
  },

  // ═══ SERVEUR ══════════════════════════════════════════════════════
  serveur: {
    matin: [
      { id: 's-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 's-m-nom', label: 'Sélectionner ton nom dans /serveur', obligatoire: true, module: '/serveur' },
      { id: 's-m-resa', label: 'Consulter les réservations du jour', module: '/admin/reservations' },
      { id: 's-m-allergenes', label: 'Vérifier allergènes et plats du jour avec la cuisine', module: '/admin/allergenes' },
      { id: 's-m-mep-tables', label: 'Mettre en place tables et couverts', obligatoire: true },
      { id: 's-m-proprete-salle', label: 'Vérifier propreté salle et terrasse', obligatoire: true },
      { id: 's-m-menus', label: 'Mettre en place les menus et supports' },
      { id: 's-m-briefing', label: 'Lire le briefing équipe (canal général)', module: '/equipes' },
      { id: 's-m-checklist', label: 'Checklist hygiène salle ouverture', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 's-s-cmd', label: 'Saisir chaque commande (avec allergènes signalés)', obligatoire: true, module: '/serveur' },
      { id: 's-s-servi', label: 'Marquer "servi" à chaque plat apporté', obligatoire: true, module: '/serveur' },
      { id: 's-s-appels', label: 'Répondre aux appels QR serveur (banner /serveur)', module: '/serveur' },
      { id: 's-s-encaisse', label: 'Encaisser proprement chaque table (méthode + pourboire)', obligatoire: true, module: '/caisse' },
      { id: 's-s-suivi-encaisse', label: 'Vérifier régulièrement les tables en attente d\'encaissement (max 2h)', obligatoire: true, module: '/serveur' },
      { id: 's-s-email', label: 'Demander l\'email à l\'encaissement', module: '/caisse' },
    ],
    fin: [
      { id: 's-f-tables', label: 'Vérifier qu\'aucune table n\'est ouverte', obligatoire: true, module: '/serveur' },
      { id: 's-f-debarras', label: 'Débarrasser et nettoyer toutes les tables', obligatoire: true },
      { id: 's-f-menus', label: 'Ranger les menus et supports' },
      { id: 's-f-nettoyage-salle', label: 'Nettoyer la salle et la terrasse', obligatoire: true },
      { id: 's-f-rapport', label: 'Faire un rapport de fin de service', saisie: { type: 'texte', label: 'Rapport (incidents, faits notables)', placeholder: 'RAS / ...' } },
      { id: 's-f-checklist', label: 'Checklist hygiène salle fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 's-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ CUISINIER ════════════════════════════════════════════════════
  cuisinier: {
    matin: [
      { id: 'c-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'c-m-temp-frigo-principal', label: 'Relever température frigo principal', obligatoire: true, saisie: tempFrigo },
      { id: 'c-m-temp-congelateur', label: 'Relever température congélateur', obligatoire: true, saisie: tempCongel },
      { id: 'c-m-temp-chambre', label: 'Relever température chambre froide', obligatoire: true, saisie: tempChambre },
      { id: 'c-m-dlc', label: 'Contrôler les DLC de tous les produits en cours', obligatoire: true, module: '/admin/hygiene' },
      { id: 'c-m-stocks-critiques', label: 'Vérifier stocks critiques + signaler manques', module: '/admin/stock' },
      { id: 'c-m-equipements-on', label: 'Allumer et préchauffer les équipements', obligatoire: true },
      { id: 'c-m-nettoyage-pdt', label: 'Nettoyer et désinfecter plans de travail', obligatoire: true },
      { id: 'c-m-mep', label: 'Mettre en place les ingrédients du service', obligatoire: true },
      { id: 'c-m-briefing', label: 'Lire le briefing canal Cuisine', module: '/equipes' },
      { id: 'c-m-checklist', label: 'Checklist hygiène cuisine ouverture', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 'c-s-cmd', label: 'Marquer chaque plat "en préparation" puis "prêt"', obligatoire: true, module: '/cuisine' },
      { id: 'c-s-allergenes', label: 'Vérifier allergènes signalés AVANT de cuisiner', obligatoire: true, module: '/admin/allergenes' },
      { id: 'c-s-temp-2h', label: 'Vérifier les températures de conservation (toutes les 2h)', module: '/admin/hygiene' },
      { id: 'c-s-rupture', label: 'Signaler immédiatement toute rupture de stock', module: '/admin/stock' },
      { id: 'c-s-pertes', label: 'Enregistrer chaque perte ou casse', module: '/admin/dechets' },
      { id: 'c-s-lots', label: 'Saisir tout nouveau lot reçu fournisseur', module: '/admin/hygiene' },
    ],
    fin: [
      { id: 'c-f-temp-frigo-principal', label: 'Relever température frigo principal (soir)', obligatoire: true, saisie: tempFrigo },
      { id: 'c-f-temp-congelateur', label: 'Relever température congélateur (soir)', obligatoire: true, saisie: tempCongel },
      { id: 'c-f-filmage', label: 'Filmer et ranger tous les produits ouverts', obligatoire: true },
      { id: 'c-f-invendus', label: 'Saisir les invendus et pertes du service', obligatoire: true, saisie: invendus, module: '/admin/dechets' },
      { id: 'c-f-nettoyage-pdt', label: 'Nettoyer et désinfecter plans de travail', obligatoire: true },
      { id: 'c-f-nettoyage-four', label: 'Nettoyer le four et les équipements', obligatoire: true },
      { id: 'c-f-nettoyage-sol', label: 'Nettoyer le sol cuisine', obligatoire: true },
      { id: 'c-f-extinction', label: 'Vérifier extinction de tous les équipements', obligatoire: true },
      { id: 'c-f-dechets', label: 'Pesée des déchets toutes catégories', obligatoire: true, module: '/admin/dechets' },
      { id: 'c-f-checklist', label: 'Checklist hygiène cuisine fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 'c-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ CUISINIER SNACKING ═══════════════════════════════════════════
  snacking: {
    matin: [
      { id: 'sn-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'sn-m-temp-frigo', label: 'Relever température frigo snacking', obligatoire: true, saisie: tempFrigo },
      { id: 'sn-m-dlc', label: 'Contrôler les DLC de tous les produits snacking', obligatoire: true, module: '/admin/hygiene' },
      { id: 'sn-m-stock-pains', label: 'Vérifier stock pains burger, galettes tacos, paninis, viandes, sauces, frites', obligatoire: true, module: '/admin/stock' },
      { id: 'sn-m-signaler', label: 'Signaler immédiatement les manques au gérant' },
      { id: 'sn-m-friteuse-grill', label: 'Allumer et préchauffer friteuse + grill', obligatoire: true },
      { id: 'sn-m-four-panini', label: 'Allumer et préchauffer le four panini', obligatoire: true },
      { id: 'sn-m-mep', label: 'Préparer et mettre en place tous les ingrédients', obligatoire: true },
      { id: 'sn-m-sauces', label: 'Vérifier les sauces et les garnir si nécessaire' },
    ],
    service: [
      { id: 'sn-s-rupture', label: 'Signaler immédiatement toute rupture snacking', module: '/admin/stock' },
      { id: 'sn-s-pertes', label: 'Enregistrer chaque perte ou casse', module: '/admin/dechets' },
      { id: 'sn-s-temp-cuisson', label: 'Surveiller les températures de cuisson' },
      { id: 'sn-s-haccp', label: 'Respecter les procédures HACCP snacking', module: '/admin/hygiene' },
    ],
    fin: [
      { id: 'sn-f-temp-frigo', label: 'Relever température frigo snacking (soir)', obligatoire: true, saisie: tempFrigo },
      { id: 'sn-f-filmage', label: 'Filmer et ranger tous les produits ouverts', obligatoire: true },
      { id: 'sn-f-invendus', label: 'Saisir les invendus snacking du service', obligatoire: true, saisie: invendus, module: '/admin/dechets' },
      { id: 'sn-f-nettoyage-friteuse', label: 'Nettoyer et désinfecter la friteuse', obligatoire: true },
      { id: 'sn-f-nettoyage-grill', label: 'Nettoyer et désinfecter le grill', obligatoire: true },
      { id: 'sn-f-nettoyage-four', label: 'Nettoyer le four panini', obligatoire: true },
      { id: 'sn-f-nettoyage-pdt', label: 'Nettoyer et désinfecter les plans de travail snacking', obligatoire: true },
      { id: 'sn-f-nettoyage-sol', label: 'Nettoyer le sol du poste snacking', obligatoire: true },
      { id: 'sn-f-extinction', label: 'Vérifier extinction de tous les équipements snacking', obligatoire: true },
      { id: 'sn-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ CAISSE SNACKING (encaissement + prise commande) ══════════════
  caisse_snacking: {
    matin: [
      { id: 'cs-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'cs-m-caisse-ok', label: 'Vérifier que la caisse est opérationnelle', obligatoire: true, module: '/caisse' },
      { id: 'cs-m-fond', label: 'Vérifier le fond de caisse', obligatoire: true, saisie: fondCaisse, module: '/caisse' },
      { id: 'cs-m-carte-jour', label: 'Consulter la carte du jour et ruptures signalées', module: '/admin/stock' },
      { id: 'cs-m-allergenes', label: 'Vérifier allergènes du jour avec le cuisinier snacking', module: '/admin/allergenes' },
      { id: 'cs-m-mep-accueil', label: 'Mettre en place le poste d\'accueil', obligatoire: true },
    ],
    service: [
      { id: 'cs-s-accueil', label: 'Accueillir chaque client + prendre la commande complète', obligatoire: true, module: '/emporter' },
      { id: 'cs-s-tacos', label: 'Tacos : noter précisément viandes + sauces choisies', obligatoire: true, module: '/emporter' },
      { id: 'cs-s-envoi-cuisine', label: 'Envoyer chaque commande immédiatement en cuisine snacking', obligatoire: true, module: '/emporter' },
      { id: 'cs-s-num-commande', label: 'Annoncer le numéro de commande au client', obligatoire: true },
      { id: 'cs-s-encaisse', label: 'Encaisser avant ou à la remise selon le flux', obligatoire: true, module: '/caisse' },
      { id: 'cs-s-verif-remise', label: 'Vérifier que chaque commande correspond avant remise', obligatoire: true },
      { id: 'cs-s-allergie', label: 'Signaler immédiatement au cuisinier toute allergie mentionnée', obligatoire: true },
      { id: 'cs-s-emporter', label: 'Gérer les commandes à emporter avec les bons emballages' },
      { id: 'cs-s-online', label: 'Gérer les commandes en ligne avec badge ONLINE', module: '/emporter' },
    ],
    fin: [
      { id: 'cs-f-cmd-ouvertes', label: 'Vérifier qu\'aucune commande n\'est encore ouverte', obligatoire: true, module: '/emporter' },
      { id: 'cs-f-cloture', label: 'Faire la clôture de caisse snacking', obligatoire: true, saisie: cloture, module: '/caisse' },
      { id: 'cs-f-ca-corresp', label: 'Vérifier que le CA snacking correspond aux commandes encaissées', obligatoire: true, module: '/caisse' },
      { id: 'cs-f-nettoyage-accueil', label: 'Nettoyer et désinfecter le poste d\'accueil', obligatoire: true },
      { id: 'cs-f-rangement', label: 'Ranger le matériel d\'emballage' },
      { id: 'cs-f-rapport', label: 'Faire un rapport des ruptures du service au gérant', saisie: { type: 'texte', label: 'Ruptures rencontrées', placeholder: 'RAS / liste...' } },
      { id: 'cs-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ PIZZAIOLO ════════════════════════════════════════════════════
  pizzaiolo: {
    matin: [
      { id: 'p-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'p-m-temp-frigo', label: 'Relever température frigo ingrédients pizza', obligatoire: true, saisie: tempFrigo },
      { id: 'p-m-pate', label: 'Vérifier stock pâtons et préparer si nécessaire', obligatoire: true, module: '/admin/hygiene' },
      { id: 'p-m-stock-ingr', label: 'Vérifier stock ingrédients pizza et signaler les manques', module: '/admin/stock' },
      { id: 'p-m-four-on', label: 'Allumer et préchauffer le four à bois', obligatoire: true },
      { id: 'p-m-mep', label: 'Préparer et mettre en place tous les ingrédients pizza', obligatoire: true },
      { id: 'p-m-ingredients', label: 'Survoler ingrédients pizza (mozza, sauce, basilic)', module: '/admin/ingredients' },
      { id: 'p-m-checklist', label: 'Checklist hygiène cuisine (banc + four)', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 'p-s-cmd', label: 'Marquer chaque pizza "en préparation" puis "prêt"', obligatoire: true, module: '/pizza' },
      { id: 'p-s-allergenes', label: 'Allergène GLUTEN signalé : pâte sans gluten + outils séparés', obligatoire: true, module: '/admin/allergenes' },
      { id: 'p-s-rupture', label: 'Signaler immédiatement toute rupture ingrédient pizza', module: '/admin/stock' },
      { id: 'p-s-pertes', label: 'Enregistrer les pertes de pâte et ingrédients', module: '/admin/dechets' },
      { id: 'p-s-temp-four', label: 'Surveiller la température du four en permanence' },
      { id: 'p-s-pate-lendemain', label: 'Préparer la pâte du lendemain (saisir comme nouveau lot)', module: '/admin/hygiene' },
    ],
    fin: [
      { id: 'p-f-temp-frigo', label: 'Relever température frigo pizza (soir)', obligatoire: true, saisie: tempFrigo },
      { id: 'p-f-temp-four', label: 'Relevé température four (avant extinction)', obligatoire: true, saisie: tempFour },
      { id: 'p-f-filmage', label: 'Filmer et ranger tous les ingrédients pizza', obligatoire: true },
      { id: 'p-f-invendus', label: 'Saisir les invendus pizza', obligatoire: true, saisie: invendus, module: '/admin/dechets' },
      { id: 'p-f-nettoyage-four', label: 'Nettoyer le four à bois', obligatoire: true },
      { id: 'p-f-nettoyage-pdt', label: 'Nettoyer le plan de travail pizza', obligatoire: true },
      { id: 'p-f-extinction', label: 'Éteindre le four et vérifier extinction complète', obligatoire: true },
      { id: 'p-f-dechets', label: 'Pesée déchets pizza (pâte, cartons)', module: '/admin/dechets' },
      { id: 'p-f-checklist', label: 'Checklist hygiène cuisine fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 'p-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ BARMAN ═══════════════════════════════════════════════════════
  barman: {
    matin: [
      { id: 'b-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'b-m-temp', label: 'Relever température réfrigérateur bar', obligatoire: true, saisie: tempFrigo },
      { id: 'b-m-bouteilles', label: 'Vérifier et réapprovisionner le stock boissons', obligatoire: true, module: '/admin/stock' },
      { id: 'b-m-comptoir', label: 'Nettoyer et désinfecter le comptoir', obligatoire: true },
      { id: 'b-m-tireuse', label: 'Nettoyer la tireuse à bière', obligatoire: true },
      { id: 'b-m-cafe', label: 'Nettoyer la machine à café', obligatoire: true },
      { id: 'b-m-verres', label: 'Mettre en place verres et matériel' },
      { id: 'b-m-garnitures', label: 'Préparer les garnitures cocktails' },
      { id: 'b-m-briefing', label: 'Lire le briefing canal Bar', module: '/equipes' },
      { id: 'b-m-checklist', label: 'Checklist hygiène bar ouverture', obligatoire: true, module: '/admin/hygiene' },
    ],
    service: [
      { id: 'b-s-cmd', label: 'Marquer chaque boisson "en préparation" puis "prêt"', obligatoire: true, module: '/bar' },
      { id: 'b-s-rupture', label: 'Signaler immédiatement toute rupture de stock boisson', module: '/admin/stock' },
      { id: 'b-s-temp-2h', label: 'Surveiller la température du réfrigérateur bar (toutes les 2h)' },
      { id: 'b-s-allergenes', label: 'Vérifier sulfites/lait/œufs/fruits coque sur boissons', module: '/admin/boissons' },
      { id: 'b-s-encaisse', label: 'Encaissements comptoir bar (pourboire dans bon champ)', module: '/caisse' },
    ],
    fin: [
      { id: 'b-f-temp', label: 'Relever température réfrigérateur bar (soir)', obligatoire: true, saisie: tempFrigo },
      { id: 'b-f-tireuse', label: 'Nettoyer la tireuse à bière', obligatoire: true },
      { id: 'b-f-cafe', label: 'Nettoyer la machine à café', obligatoire: true },
      { id: 'b-f-comptoir', label: 'Nettoyer et désinfecter le comptoir', obligatoire: true },
      { id: 'b-f-inventaire', label: 'Ranger et compter les boissons', obligatoire: true, saisie: { type: 'texte', label: 'Comptage (bouteilles ouvertes, fûts)', placeholder: 'ex: 3 vins ouverts, fût bière 30%' }, module: '/admin/stock' },
      { id: 'b-f-sol', label: 'Nettoyer le sol du bar', obligatoire: true },
      { id: 'b-f-fermeture', label: 'Vérifier fermeture robinets et équipements', obligatoire: true },
      { id: 'b-f-casses', label: 'Saisir les casses + cocktails ratés', module: '/admin/dechets' },
      { id: 'b-f-dechets', label: 'Pesée déchets bar (verre + bio)', module: '/admin/dechets' },
      { id: 'b-f-checklist', label: 'Checklist hygiène bar fermeture', obligatoire: true, module: '/admin/hygiene' },
      { id: 'b-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ CAISSE (TPV principale) ══════════════════════════════════════
  caisse: {
    matin: [
      { id: 'k-m-ouverture', label: 'Ouvrir la session caisse (fond initial)', obligatoire: true, saisie: fondCaisse, module: '/caisse' },
    ],
    service: [
      { id: 'k-s-encaisse', label: 'Encaisser proprement (méthode + pourboire séparé)', obligatoire: true, module: '/caisse' },
    ],
    fin: [
      { id: 'k-f-zreport', label: 'Z-report fin de session (vérifier écart théorique/réel)', obligatoire: true, saisie: cloture, module: '/caisse' },
      { id: 'k-f-fermeture', label: 'Fermer la session caisse', obligatoire: true, module: '/caisse' },
    ],
  },

  // ═══ LIVREUR ══════════════════════════════════════════════════════
  livreur: {
    matin: [
      { id: 'lv-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'lv-m-vehicule', label: 'Vérifier l\'état du véhicule de livraison', obligatoire: true },
      { id: 'lv-m-carburant', label: 'Vérifier le carburant', obligatoire: true },
      { id: 'lv-m-materiel', label: 'Vérifier matériel : sacs isothermes, pochettes, monnaie', obligatoire: true },
      { id: 'lv-m-cmd-online', label: 'Consulter les commandes en ligne en attente de livraison', module: '/emporter' },
      { id: 'lv-m-tel', label: 'Vérifier que le téléphone est chargé et connecté', obligatoire: true },
      { id: 'lv-m-zones', label: 'Vérifier les zones de livraison du jour' },
    ],
    service: [
      { id: 'lv-s-recup-cmd', label: 'Récupérer chaque commande prête + vérifier le contenu', obligatoire: true, module: '/emporter' },
      { id: 'lv-s-bon-livraison', label: 'Vérifier que la commande correspond au bon de livraison', obligatoire: true },
      { id: 'lv-s-contact-client', label: 'Contacter le client si adresse introuvable ou problème' },
      { id: 'lv-s-encaisser-livraison', label: 'Encaisser si paiement à la livraison prévu' },
      { id: 'lv-s-marquer-livre', label: 'Marquer chaque commande comme livrée dès la remise', obligatoire: true, module: '/emporter' },
      { id: 'lv-s-incident', label: 'Signaler immédiatement tout incident au gérant' },
      { id: 'lv-s-retard', label: 'En cas de retard prévenir client + gérant' },
    ],
    fin: [
      { id: 'lv-f-livraisons-ok', label: 'Vérifier qu\'aucune livraison n\'est en attente', obligatoire: true, module: '/emporter' },
      { id: 'lv-f-fond-rendu', label: 'Rendre fond de monnaie + encaissements au gérant', obligatoire: true, saisie: remiseFond },
      { id: 'lv-f-sacs', label: 'Vérifier et nettoyer les sacs isothermes', obligatoire: true },
      { id: 'lv-f-pb-vehicule', label: 'Signaler tout problème véhicule au gérant' },
      { id: 'lv-f-km', label: 'Saisir le kilométrage du jour', obligatoire: true, saisie: kilometrage },
      { id: 'lv-f-rapport', label: 'Faire un rapport des livraisons du service', saisie: { type: 'texte', label: 'Rapport livraisons', placeholder: 'Nb livraisons, incidents, …' } },
      { id: 'lv-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ RÉCEPTIONNISTE ═══════════════════════════════════════════════
  receptionniste: {
    matin: [
      { id: 'r-m-pointage', label: 'Pointer arrivée', obligatoire: true },
      { id: 'r-m-arrivees', label: 'Consulter arrivées + départs du jour', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-m-prep-chambres', label: 'Préparer les chambres pour les arrivées', obligatoire: true, module: '/admin/chambres' },
      { id: 'r-m-resa-semaine', label: 'Vérifier les réservations à venir cette semaine', module: '/admin/reservations' },
      { id: 'r-m-events', label: 'Consulter les demandes d\'événements en attente', module: '/admin/reservations' },
      { id: 'r-m-acomptes', label: 'Vérifier les acomptes à encaisser', module: '/admin/reservations' },
      { id: 'r-m-tables', label: 'Liste résas tables midi + soir', module: '/admin/reservations' },
      { id: 'r-m-briefing', label: 'Poster briefing équipe (chambres + tables + events)', obligatoire: true, module: '/equipes' },
    ],
    service: [
      { id: 'r-s-traiter-resa', label: 'Traiter chaque demande de réservation dans les 2h', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-s-maj-cal', label: 'Mettre à jour le calendrier après chaque check-in/out', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-s-event', label: 'Signaler au gérant toute demande d\'événement' },
      { id: 'r-s-resas', label: 'Saisir réservations entrantes (téléphone, mail, walk-in)', module: '/admin/reservations' },
      { id: 'r-s-acompte', label: 'Encaisser acomptes à réception', module: '/admin/reservations' },
      { id: 'r-s-checkin', label: 'Check-in / check-out chambres', module: '/admin/reservations' },
      { id: 'r-s-clients', label: 'Mettre à jour fiches clients (allergies, préférences)', module: '/admin/clients' },
      { id: 'r-s-reclamations', label: 'Répondre aux réclamations <48h', module: '/admin/clients' },
    ],
    fin: [
      { id: 'r-f-checkin-ok', label: 'Vérifier que tous les check-in et check-out du jour sont traités', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-f-planning-lendemain', label: 'Préparer le planning des arrivées du lendemain', obligatoire: true, module: '/admin/reservations' },
      { id: 'r-f-confirmations', label: 'Envoyer les confirmations en attente', module: '/admin/reservations' },
      { id: 'r-f-statuts', label: 'Vérifier statuts en suspens (no_show, check-out manqué)', module: '/admin/reservations' },
      { id: 'r-f-pointage', label: 'Pointer sortie', obligatoire: true },
    ],
  },

  // ═══ SECOND DE CUISINE ════════════════════════════════════════════
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

  // ═══ PLONGE / EXTRA ═══════════════════════════════════════════════
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

/** Renvoie toutes les tâches du jour d'un poste (matin + service + fin). */
export function getToutesTachesDuJour(poste: PosteWidget): Tache[] {
  const t = TACHES[poste]
  if (!t) return []
  return [...t.matin, ...t.service, ...t.fin]
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
