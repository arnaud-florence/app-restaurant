// Aide contextuelle par page — texte concis affiché dans le drawer « ? ».
//
// Source : docs/formation/*.md (résumé). Pour relire le manuel complet,
// l'utilisateur peut toujours aller sur /formation.

export type HelpShortcut = {
  label: string
  href: string
  emoji?: string
}

export type HelpSection = {
  heading: string
  emoji?: string
  markdown: string
}

export type HelpEntry = {
  title: string
  intro?: string
  shortcuts?: HelpShortcut[]
  sections: HelpSection[]
}

// Lookup : pathname → aide. Match exact d'abord, sinon prefix.
const HELP: Record<string, HelpEntry> = {
  '/serveur': {
    title: 'Aide — Service en salle',
    intro: 'Tu es la main qui alimente toute la donnée du resto. Vise zéro friction au client.',
    shortcuts: [
      { emoji: '⚠️', label: 'Allergènes du jour', href: '/admin/allergenes' },
      { emoji: '📅', label: 'Réservations',       href: '/admin/reservations' },
      { emoji: '💰', label: 'Caisse',             href: '/caisse' },
    ],
    sections: [
      {
        heading: 'Prendre une commande',
        emoji: '📝',
        markdown: `**Avant** de toucher au panier : demande au client s'il y a une allergie.
- Si oui → coche l'allergène dans la commande (la cuisine voit le bandeau rouge).
- Saisis chaque ligne de commande, n'oublie pas le commentaire si modification (ex: "sans oignons").
- Une fois la commande envoyée, la cuisine la voit en temps réel sur \`/cuisine\`.`,
      },
      {
        heading: 'Servir un plat',
        emoji: '🍽️',
        markdown: `Dès que tu poses l'assiette en table → marque "**servi**" dans \`/serveur\` (onglet "À servir").
Pas avant (sinon la cuisine pense que c'est livré et ouvre le suivant) ni après (sinon retard fictif).`,
      },
      {
        heading: 'Encaisser',
        emoji: '💳',
        markdown: `Onglet "À encaisser" → table → choisis méthode (espèces / carte / TR / virement).
Le **pourboire** a son champ dédié — ne l'ajoute PAS au total.
Demande l'email pour la fidélité (rapide, le client clique 1 case).`,
      },
      {
        heading: 'Appel client (QR)',
        emoji: '🔔',
        markdown: `Si un bandeau rouge "Appel table X" apparaît : **termine ta tâche en cours**, va voir, puis clique "Pris" pour faire taire l'alerte.`,
      },
    ],
  },

  '/cuisine': {
    title: 'Aide — Service en cuisine',
    intro: 'HACCP avant tout. Allergène signalé = vérification AVANT cuisson.',
    shortcuts: [
      { emoji: '⚠️', label: 'Allergènes',     href: '/admin/allergenes' },
      { emoji: '🌡', label: 'Températures',  href: '/admin/hygiene' },
      { emoji: '📦', label: 'Stock & lots',   href: '/admin/stock' },
    ],
    sections: [
      {
        heading: 'Flux service',
        emoji: '🔥',
        markdown: `Une commande arrive → tu cliques "**🔥 Prendre**" pour passer en _en_préparation_. Quand le plat est prêt → "**✓ Prêt**". Le serveur fait "servi" lui-même.`,
      },
      {
        heading: 'Allergène signalé',
        emoji: '⚠️',
        markdown: `Bandeau rouge "🚨 ALLERGIE CLIENT" sur la commande → vérifie ta recette + ingrédients dans \`/admin/allergenes\`.
Si tu ne peux pas garantir → **refuse** le plat, le serveur prévient.`,
      },
      {
        heading: 'Relevés température',
        emoji: '🌡',
        markdown: `**2× par jour minimum** (ouverture + fermeture). Si dérive (>4°C frigo, <-18°C congel) → saisir hors-norme + transférer denrées + créer NC.`,
      },
      {
        heading: 'Lots & déchets',
        emoji: '📦',
        markdown: `À chaque livraison → nouveau lot dans \`/admin/stock\` avec DLC.
Fin de service → pesée déchets dans \`/admin/dechets\`.`,
      },
    ],
  },

  '/bar': {
    title: 'Aide — Service au bar',
    intro: 'Marge + pilotage : chaque casse, chaque cocktail raté doit être saisi.',
    shortcuts: [
      { emoji: '🍷', label: 'Boissons',  href: '/admin/boissons' },
      { emoji: '📦', label: 'Stock',     href: '/admin/stock' },
      { emoji: '🗑', label: 'Déchets',   href: '/admin/dechets' },
    ],
    sections: [
      {
        heading: 'Flux service',
        emoji: '🍹',
        markdown: `Commande arrive → "**🔥 Prendre**" → préparer → "**✓ Prêt**". Le serveur récupère et marque "servi".`,
      },
      {
        heading: 'Allergènes boissons',
        emoji: '⚠️',
        markdown: `Sulfites (vins >10 mg/L) · lait (cocktails crémeux) · œufs (sour) · fruits à coque (sirops). En cas de doute → \`/admin/boissons\` te donne la fiche allergène.`,
      },
      {
        heading: 'Cocktail raté ou casse',
        emoji: '🥲',
        markdown: `**Toujours** saisir : \`/admin/dechets\` (raté/cassé) ET \`/admin/stock\` (alcool sorti).
Sinon l'inventaire fin de soirée affichera un écart inexpliqué.`,
      },
      {
        heading: 'Inventaire fin de service',
        emoji: '📋',
        markdown: `Bouteilles ouvertes + fûts dans \`/admin/stock\`. Écart > 5% → enquête (vol / sur-service / casse non saisie).`,
      },
    ],
  },

  '/caisse': {
    title: 'Aide — Caisse & Z-report',
    intro: 'Ouverture en début de service, fermeture obligatoire en fin.',
    shortcuts: [
      { emoji: '💰', label: 'Finances',  href: '/admin/finances' },
    ],
    sections: [
      {
        heading: 'Ouverture session',
        emoji: '🌅',
        markdown: `1× par service. Saisis le **fond initial** (montant en caisse au démarrage). Si tu oublies, les Z-reports sont faux.`,
      },
      {
        heading: 'Encaisser',
        emoji: '💳',
        markdown: `Sur \`/serveur\` onglet "À encaisser" → table → méthode + pourboire séparé.
Multi-paiement possible (espèces + CB par exemple).`,
      },
      {
        heading: 'Z-report fermeture',
        emoji: '🌃',
        markdown: `Compte le fond final → saisis-le. Le système calcule **CA attendu vs réel**.
Écart < 5€ : OK. Écart > 5€ : enquête (rendu monnaie ? oubli ?).`,
      },
    ],
  },

  '/admin/pilotage': {
    title: 'Aide — Pilotage stratégique',
    intro: 'Vue 2 minutes pour décider. Si un KPI est rouge, action immédiate.',
    shortcuts: [
      { emoji: '🤖', label: 'Assistant IA',   href: '/admin/assistant' },
      { emoji: '📓', label: 'Journal de bord', href: '/admin/journal' },
    ],
    sections: [
      {
        heading: 'Lecture des couleurs',
        emoji: '🎨',
        markdown: `**Vert** = OK / **Ambre** = surveiller / **Rouge** = action immédiate.
Les seuils sont sur les KPIs critiques : food cost > 32%, masse sal > 35%, NC critiques non traitées.`,
      },
      {
        heading: 'Checklist équipe',
        emoji: '✅',
        markdown: `La carte "Checklists d'équipe" affiche en temps réel le % de tâches cochées par chaque employé sur \`/cuisine\`, \`/bar\`, \`/serveur\`, \`/caisse\`.`,
      },
      {
        heading: 'Objectifs & Plan d\'action',
        emoji: '🎯',
        markdown: `Définis un objectif par KPI (mensuel/annuel). Crée des actions liées avec deadline + responsable. Vues en kanban (à_faire → en_cours → fait).`,
      },
    ],
  },

  '/admin/recettes': {
    title: 'Aide — Recettes',
    intro: 'Le food cost se calcule automatiquement à partir des ingrédients.',
    sections: [
      {
        heading: 'Créer une recette',
        emoji: '🆕',
        markdown: `Choisis catégorie + tag destination (CUISINE / PIZZA / BAR).
Ajoute les ingrédients avec leur quantité → le food cost se calcule en live.
Cible : **food cost ≤ 30%**, marge ≥ 70%.`,
      },
      {
        heading: 'Engineering recettes',
        emoji: '📊',
        markdown: `Onglet \`/admin/recettes/engineering\` classe les plats en :
- **STAR** : forte vente + forte marge → mettre en avant
- **PLOWHORSE** : forte vente, faible marge → reprice
- **PUZZLE** : faible vente, forte marge → promotion
- **DOG** : faible vente, faible marge → désactiver`,
      },
    ],
  },

  '/admin/hygiene': {
    title: 'Aide — Hygiène / HACCP',
    intro: 'Tout doit être tracé. Un contrôle DDPP demande les relevés à la minute.',
    shortcuts: [
      { emoji: '🗑', label: 'Déchets',  href: '/admin/dechets' },
      { emoji: '📦', label: 'Stock',    href: '/admin/stock' },
    ],
    sections: [
      {
        heading: 'Relevés température',
        emoji: '🌡',
        markdown: `2× par jour minimum. Toute valeur hors norme déclenche automatiquement une **NC critique** à traiter.`,
      },
      {
        heading: 'Checklists nettoyage',
        emoji: '🧴',
        markdown: `Coche **au fur et à mesure**, pas en bloc. Une checklist cochée en bloc = présomption de fraude en contrôle.`,
      },
      {
        heading: 'Lots produits',
        emoji: '📦',
        markdown: `Chaque lot a sa DLC. Filtre "DLC < 3j" → priorité utilisation.
Fin de service : statuer chaque lot (consommé / en_stock / jeté).`,
      },
      {
        heading: 'Non-conformités',
        emoji: '⚠️',
        markdown: `**Critique** = sécurité alimentaire (chaîne du froid, allergène contaminé). Traiter immédiatement.
**Mineure** = écart documentaire. Traiter sous 7 jours.`,
      },
    ],
  },

  '/admin/dechets': {
    title: 'Aide — Pesée déchets',
    intro: 'Loi AGEC : restos > 10 t/an doivent peser. KPI gérant pour réduire le coût matière.',
    sections: [
      {
        heading: 'Quand peser',
        emoji: '⏰',
        markdown: `**Fin de chaque service** (midi + soir). Catégories :
- Bio (épluchures, restes alimentaires)
- Verre (bouteilles cassées au bar)
- Carton / plastique
- Mixte`,
      },
      {
        heading: 'Cocktails ratés / lots jetés',
        emoji: '🥲',
        markdown: `Saisir aussi ici. Permet de tracer le coût matière exact.`,
      },
    ],
  },

  '/admin/finances': {
    title: 'Aide — Finances',
    intro: 'Vue mensuelle CA + dépenses + masse salariale + Z-reports.',
    sections: [
      {
        heading: 'Z-reports',
        emoji: '🧾',
        markdown: `Sessions caisse fermées listées avec écart théorique/réel.
Écart répété > 5€ sur le même employé → enquête.`,
      },
      {
        heading: 'Masse salariale',
        emoji: '💼',
        markdown: `Ratio masse sal / CA mensuel. Cible : **≤ 30%**. Au-delà de 35%, revoir le planning ou augmenter le CA (prix, capacité, événements).`,
      },
    ],
  },

  '/admin/reservations': {
    title: 'Aide — Réservations',
    intro: 'Statuts à jour = pilotage juste.',
    sections: [
      {
        heading: 'Statuts',
        emoji: '📅',
        markdown: `- **proposee** : demande client, pas encore validée
- **confirmee** : acompte reçu (si demandé) ou résa simple validée
- **annulee** : annulation explicite (neutre pour stats)
- **no_show** : client absent sans prévenir (pénalise le CRM client)
- **terminee** : client venu et parti`,
      },
      {
        heading: 'Acomptes',
        emoji: '💰',
        markdown: `Pour les groupes / événements : encaisse l'acompte AVANT de passer en \`confirmee\`. Sans acompte, ça reste \`proposee\`.`,
      },
      {
        heading: 'Allergènes client',
        emoji: '⚠️',
        markdown: `Saisis dans le **champ structuré** de la fiche client (pas en commentaire libre). L'allergène se reportera sur toutes ses futures commandes.`,
      },
    ],
  },

  '/admin/stock': {
    title: 'Aide — Stock & lots',
    intro: 'Inventaire mensuel = base du calcul food cost réel.',
    sections: [
      {
        heading: 'Lots',
        emoji: '📦',
        markdown: `Chaque livraison fournisseur = nouveau lot avec DLC, prix achat, quantité reçue.
La déduction stock se fait automatiquement à chaque vente.`,
      },
      {
        heading: 'Inventaire physique',
        emoji: '📋',
        markdown: `1ère semaine du mois : compte tout. Compare au stock théorique. Écart > 5% sur une référence → enquête (vol / sur-service / casse non saisie).`,
      },
    ],
  },

  '/admin/journal': {
    title: 'Aide — Journal de bord',
    intro: 'Trace quotidienne du gérant. À remplir en clôture du service.',
    sections: [
      {
        heading: 'Quoi saisir',
        emoji: '✍️',
        markdown: `- **Humeur du jour** (ressenti général)
- **Faits marquants** (incident, succès)
- **CA réalisé vs prévu** (commentaire)
- **Décisions prises** pour le lendemain`,
      },
      {
        heading: 'À quoi ça sert',
        emoji: '🎯',
        markdown: `Permet d'identifier des patterns sur 30/90 jours (ex : "le jeudi soir on a souvent des problèmes en cuisine").
Surcouche **assistant IA** qui peut analyser l'historique pour suggérer des actions.`,
      },
    ],
  },

  '/formation': {
    title: 'Aide — Formation',
    intro: 'Tu apprends à utiliser le logiciel pour ton poste, étape par étape.',
    sections: [
      {
        heading: 'Lecture du manuel',
        emoji: '📖',
        markdown: `Clique sur "Commencer" → tu défiles les étapes une par une.
À chaque étape, clique "Suivant" pour la marquer comme **vue**.`,
      },
      {
        heading: 'Quiz',
        emoji: '🏆',
        markdown: `Une fois toutes les étapes vues, le bouton "Passer le quiz" apparaît.
5 questions à choix multiple. Seuil : **80% pour réussir**.
Si tu rates → 1 retry possible après 24h.`,
      },
      {
        heading: 'Onboarding terminé',
        emoji: '✅',
        markdown: `Une fois le quiz réussi, retourne sur \`/formation/onboarding\` pour cliquer **"Terminer mon onboarding"** et accéder à tes modules de travail.`,
      },
    ],
  },

  '/equipes': {
    title: 'Aide — Communication interne',
    intro: 'Chat équipe + briefings + comptes rendus + matériel attribué.',
    sections: [
      {
        heading: 'Canaux de chat',
        emoji: '💬',
        markdown: `Choisis ton canal :
- **Général** : tout le monde
- **Cuisine** / **Salle** / **Bar** : équipe métier
- **Manager** : direction uniquement`,
      },
      {
        heading: 'Briefing matin',
        emoji: '🌅',
        markdown: `Le réceptionniste / gérant poste un message pinned au canal général :
- Météo
- Réservations du jour (chambres + tables)
- Événements
- Allergies importantes
- Anniversaires clients`,
      },
      {
        heading: 'Matériel',
        emoji: '📱',
        markdown: `Chaque tablette / téléphone pro est attribué à un employé. Le matériel suit l'employé : si il rend, on met à jour ici.`,
      },
    ],
  },
}

export function getHelpFor(pathname: string): HelpEntry | null {
  // Strip query string
  const cleanPath = pathname.split('?')[0]
  // Match exact
  if (HELP[cleanPath]) return HELP[cleanPath]
  // Match prefix le plus long
  const matchingKeys = Object.keys(HELP)
    .filter(k => cleanPath.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)
  return matchingKeys[0] ? HELP[matchingKeys[0]] : null
}
