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
  // ── Ajout du 28/08/2026 ────────────────────────────────────────────
  // L'aide couvrait 14 écrans sur 49 : sur les 41 autres, le bouton « ? »
  // ne s'affichait même pas. Un module livré, jamais nourri — le même
  // schéma que le registre légal.
  //
  // Ces entrées visent les écrans qu'une manageuse ouvre le plus, et
  // disent le POURQUOI, pas le comment : le comment se devine en regardant
  // l'écran, le pourquoi ne se devine jamais. Chacune nomme le piège de
  // l'écran, parce qu'un avertissement lu devant le bouton concerné se
  // retient, alors que le même lu dans un manuel s'oublie.

  '/admin/cat': {
    title: 'Aide — Le Centre de contrôle',
    intro: "La carte de tout ce que l'outil contient, avec son état en direct. Quand tu ne sais pas où aller, c'est ici que tu reviens.",
    shortcuts: [
      { emoji: '📈', label: 'Ventes & marges', href: '/admin/ventes' },
      { emoji: '🎓', label: 'Mes formations', href: '/formation' },
    ],
    sections: [
      {
        heading: 'Ce que tu vois n\'est pas ce que voit ton voisin',
        emoji: '🔍',
        markdown: `La carte est **filtrée par tes droits** : chacun ne voit que ses propres écrans. Si un module te manque, ce n'est pas un bug — c'est qu'il ne t'est pas encore ouvert. Demande.`,
      },
      {
        heading: 'Le Pouls',
        emoji: '💓',
        markdown: `L'état de santé en direct : agents qui tournent, alertes non traitées, activités allumées. Un point rouge veut dire qu'un écran attend quelqu'un — pas qu'il est cassé.`,
      },
      {
        heading: 'Pourquoi 49 modules',
        emoji: '🧩',
        markdown: `La maison abrite **sept activités** sous un même toit. Chacune a ses écrans, et beaucoup sont éteints tant que l'activité n'a pas ouvert. Tu n'as pas à tout connaître : commence par les six que tu utilises chaque jour.`,
      },
    ],
  },

  '/admin/ventes': {
    title: 'Aide — Ventes & marges',
    intro: "Ce qui est vendu, ce que ça rapporte vraiment, et par quelle activité. La page la plus importante de l'outil.",
    shortcuts: [
      { emoji: '💎', label: 'Ce que vaut l\'affaire', href: '/admin/patrimoine' },
      { emoji: '📦', label: 'Commande conseillée', href: '/admin/commande-fournil' },
    ],
    sections: [
      {
        heading: '⚠️ Le food cost se lit avec sa COUVERTURE',
        emoji: '⚠️',
        markdown: `Le food cost se divise par le chiffre d'affaires **dont on connaît le coût d'achat**, pas par le total. Sinon il est dilué par les produits sans coût et paraît bien meilleur qu'il n'est.

Mesuré en août 2026 : **26,2 % affichés valaient 39,8 % réels**. Un taux sans sa couverture ne veut rien dire — regarde toujours les deux ensemble.`,
      },
      {
        heading: 'La ventilation se fait sur la LIGNE',
        emoji: '🧾',
        markdown: `Un même ticket mélange les activités : un café du Fournil et une pizza sur la même addition. Chaque **ligne** est donc rattachée à son activité, jamais l'en-tête du ticket.

C'est ce qui permet de tenir sept activités sur **un seul abonnement caisse** au lieu de deux comptes complets.`,
      },
      {
        heading: 'Encaissé n\'est pas chiffre d\'affaires',
        emoji: '🚬',
        markdown: `Tabac, presse, FDJ, colis : un paquet à 12 € encaissé laisse quelques dizaines de centimes. Compté comme du CA, il gonfle le chiffre et écrase tous les taux. Ces lignes sont comptées à part, et sortent aussi du food cost — le prix est imposé, il n'y a rien à optimiser.`,
      },
      {
        heading: 'Les produits dormants',
        emoji: '😴',
        markdown: `Un produit actif qui ne s'est pas vendu depuis longtemps. Soit il ne sert à rien sur la carte, soit personne ne le propose. Les deux se corrigent, mais pas de la même façon.`,
      },
    ],
  },

  '/admin/patrimoine': {
    title: 'Aide — Ce que l\'affaire vaut',
    intro: "Tout le reste de l'outil mesure ce qui entre en caisse. Cette page mesure ce qui se construit.",
    shortcuts: [
      { emoji: '📈', label: 'Ventes & marges', href: '/admin/ventes' },
      { emoji: '💶', label: 'Structure de coûts', href: '/admin/economie' },
    ],
    sections: [
      {
        heading: 'Le chiffre qui change les décisions',
        emoji: '💎',
        markdown: `**1 000 € de résultat mensuel récurrent valent 30 000 à 48 000 € de valeur de fonds** (2,5 à 4 fois l'EBE annuel).

Un euro qui reste et se répète vaut trente fois un euro sorti une seule fois. Et sorti, il coûte environ 1 420 € à la société pour qu'il en reste 700.`,
      },
      {
        heading: 'L\'EBE se calcule AVANT le financement',
        emoji: '🏦',
        markdown: `Le remboursement du crédit du fonds n'est pas une charge d'exploitation : c'est le prix d'acquisition étalé. Le laisser dedans ferait payer deux fois le même fonds — une fois à l'achat, une fois dans sa propre valorisation.

D'où deux chiffres distincts : on se partage le **résultat disponible**, on valorise sur l'**EBE**.`,
      },
      {
        heading: '⚠️ Pourquoi la page refuse parfois de répondre',
        emoji: '⚠️',
        markdown: `Sous **30 jours de vente**, aucune valorisation n'est affichée. Annualiser huit jours d'ouverture — avec leur effet de nouveauté — produirait un chiffre faux affiché en gros caractères.

Et ce sont les jours **avec vente** qui comptent, pas les jours du calendrier : une fermeture pour travaux ne doit pas diviser l'EBE par sa durée.`,
      },
    ],
  },

  '/admin/economie': {
    title: 'Aide — Structure de coûts',
    intro: "Ce que la maison coûte chaque mois avant d'avoir vendu quoi que ce soit. C'est ce chiffre qui fixe le seuil de rentabilité.",
    shortcuts: [
      { emoji: '💎', label: 'Valeur du fonds', href: '/admin/patrimoine' },
      { emoji: '👥', label: 'Équipe & paie', href: '/admin/rh' },
    ],
    sections: [
      {
        heading: 'Fixe ou variable : la distinction qui compte',
        emoji: '⚖️',
        markdown: `Une charge **fixe** tombe que la maison vende ou non — loyer, assurances, abonnements. Une charge **variable** suit le chiffre d'affaires — la marchandise, principalement.

Le seuil de rentabilité, c'est le CA qui couvre exactement les fixes une fois les variables déduites. En dessous, chaque jour ouvert coûte de l'argent.`,
      },
      {
        heading: 'La masse salariale et son seuil',
        emoji: '👥',
        markdown: `L'alerte se déclenche au-delà de **35 % du chiffre d'affaires**. Ce n'est pas une loi, c'est un repère de restauration — mais un dépassement durable ne se rattrape pas par le volume.

Le coût d'un salarié n'est pas son salaire : il faut y ajouter les charges patronales.`,
      },
      {
        heading: '⚠️ Un crédit n\'est pas une charge d\'exploitation',
        emoji: '⚠️',
        markdown: `Le remboursement d'un emprunt pour acheter le fonds est du **financement**, pas de l'exploitation. Le ranger dans les charges fixes fausse l'EBE et sous-estime la valeur de l'affaire de plusieurs dizaines de milliers d'euros.`,
      },
    ],
  },

  '/admin/fournisseurs': {
    title: 'Aide — Fournisseurs & factures',
    intro: "Scanner une facture alimente les prix d'achat, donc les marges. C'est aussi l'écran le plus délicat de l'outil.",
    shortcuts: [
      { emoji: '🔗', label: 'Lignes non reconnues', href: '/admin/correspondances' },
      { emoji: '📦', label: 'Commande conseillée', href: '/admin/commande-fournil' },
    ],
    sections: [
      {
        heading: '⚠️ Le croissant à 40 €',
        emoji: '⚠️',
        markdown: `Une ligne **« CROISSANT … C=96 » à 28,84 €**, c'est le prix du **carton**, pas de la pièce. Écrit tel quel, ça donne un croissant à 40 € de coût.

C'est arrivé le 22 août 2026 : quatre produits corrompus par un seul scan, des marges fausses pendant des jours, et **aucune erreur affichée**. L'outil divise maintenant par le conditionnement et refuse tout coût dépassant 95 % du prix de vente — mais il ne peut pas tout attraper.

**Après un scan, relis les prix propagés.**`,
      },
      {
        heading: 'Comment scanner',
        emoji: '📷',
        markdown: `Jusqu'à **8 pages en un seul envoi** — pas une par une, sinon les totaux seraient comptés plusieurs fois. Les photos sont réduites automatiquement avant l'envoi.

Un avoir se scanne comme une facture : c'est le type de document qui change, et les montants sont stockés en négatif.`,
      },
      {
        heading: 'Un numéro déjà vu est refusé',
        emoji: '🛑',
        markdown: `Deux scans de la même facture avaient gonflé les achats de 447 € en silence. Le doublon est maintenant refusé, et la case pour passer outre n'apparaît **qu'après** le refus — toujours visible, elle finirait cochée par habitude.`,
      },
    ],
  },

  '/admin/allergenes': {
    title: 'Aide — Allergènes',
    intro: "Ce que tu déclares ici est publié sur le QR code de la salle, et lu par des clients allergiques.",
    shortcuts: [
      { emoji: '🍽️', label: 'Fiches produits', href: '/admin/recettes' },
      { emoji: '🧼', label: 'Hygiène & traçabilité', href: '/admin/hygiene' },
    ],
    sections: [
      {
        heading: '⚠️ Valider, c\'est signer',
        emoji: '⚠️',
        markdown: `Enregistrer **vaut validation**, et la validation porte **ton nom**.

Surtout : valider affirme que la liste est **COMPLÈTE**, pas seulement que ce qui est coché est exact. Signer la famille « Viennoiserie » telle qu'elle est proposée déclarerait qu'un croissant **ne contient pas de lait**.`,
      },
      {
        heading: 'Pourquoi « rien déclaré » n\'est pas « aucun allergène »',
        emoji: '❓',
        markdown: `Tant que personne n'a vérifié un produit, le public lit « information non disponible, demandez-nous ». Une fois validé, une liste vide veut alors vraiment dire « aucun des 14 ».

Une coche verte rassurante sur un croissant non vérifié serait une affirmation fausse — et c'est le cas dangereux.`,
      },
      {
        heading: 'Scanner l\'emballage plutôt que deviner',
        emoji: '📷',
        markdown: `La composition d'un surgelé n'est écrite qu'au dos du carton. L'onglet **📷 Scanner un emballage** photographie la liste d'ingrédients et en tire les allergènes.

Une étiquette illisible rend une liste **vide** et ne peut pas être appliquée : une liste vide signée se lirait « aucun allergène ».`,
      },
      {
        heading: '« Contient » ≠ « peut contenir des traces »',
        emoji: '〰️',
        markdown: `Se tromper est fautif dans les deux sens : déclarer une trace comme un ingrédient fait fuir un client sans motif, taire une trace expose un allergique sévère. Les traces sont marquées **~** et ne sont jamais pré-cochées.`,
      },
    ],
  },

  '/admin/legal': {
    title: 'Aide — Obligations légales',
    intro: "La liste de ce qui doit être en règle, avec ses échéances. Ce n'est pas de la paperasse : plusieurs de ces lignes conditionnent le droit d'ouvrir.",
    shortcuts: [
      { emoji: '🧯', label: 'Équipements & contrôles', href: '/admin/maintenance' },
      { emoji: '🧼', label: 'Hygiène', href: '/admin/hygiene' },
    ],
    sections: [
      {
        heading: '⚠️ « Bloquant » sans date ne veut pas dire « rien à faire »',
        emoji: '⚠️',
        markdown: `Ça veut dire **« personne ne l'a encore engagée »**.

Les obligations qui peuvent empêcher d'ouvrir sont justement celles sans date : licence, visite de la commission de sécurité, assurance. Elles sont affichées en rouge et en tête de liste pour cette raison.`,
      },
      {
        heading: 'Aucune date n\'est inventée',
        emoji: '📅',
        markdown: `Une échéance fausse dans un registre légal est **pire** que pas d'échéance : elle rassure. Toutes les lignes arrivent sans date. C'est le gérant qui les pose à mesure qu'il obtient les documents — et c'est à partir de là que l'alerte à J-30 fonctionne.`,
      },
      {
        heading: 'Une reprise n\'est pas une création',
        emoji: '🔁',
        markdown: `On **mute** une licence au lieu de l'ouvrir, on **retrouve** un dossier d'accessibilité au lieu de le constituer. Beaucoup de ces démarches ont pu être faites par le notaire à la cession — d'où des lignes qui disent « vérifier dans l'acte ».

Le piège d'une reprise n'est pas ce qu'on oublie de créer : c'est ce qu'on croit hérité et qui ne l'est pas.`,
      },
    ],
  },

  '/admin/commande-fournil': {
    title: 'Aide — Commande conseillée',
    intro: "Ce qu'il faut recommander, calculé sur les ventes réelles plutôt que sur l'impression du matin.",
    shortcuts: [
      { emoji: '📦', label: 'Inventaire', href: '/inventaire' },
      { emoji: '🗑', label: 'Invendus', href: '/invendus' },
    ],
    sections: [
      {
        heading: 'Le calcul',
        emoji: '🧮',
        markdown: `Ventes des **14 derniers jours** × la couverture souhaitée, moins ce qui reste en stock. Allonger la couverture commande plus large — et jette plus.`,
      },
      {
        heading: 'On commande des MATIÈRES, pas des produits',
        emoji: '🧺',
        markdown: `Le congélateur contient des **pâtons**, pas « Pizza Reine » + « Panuozzi ». La réserve contient une boîte de capsules, pas quatre cafés.

Les produits qui partagent une même matière sont donc repliés en une seule ligne, et leurs ventes s'additionnent.`,
      },
      {
        heading: 'Le colisage vient des factures',
        emoji: '📄',
        markdown: `Le **C=N** lu sur les lignes de facture dit combien de pièces contient un carton. C'est lui qui traduit « il me faut 200 croissants » en « deux cartons ». Si un produit n'a jamais été scanné, sa quantité est indicative.`,
      },
    ],
  },

  '/admin/correspondances': {
    title: 'Aide — Lignes de facture non reconnues',
    intro: "Chaque ligne orpheline est un prix d'achat perdu — donc une marge qu'on ignore.",
    shortcuts: [
      { emoji: '🧾', label: 'Factures', href: '/admin/fournisseurs' },
      { emoji: '📈', label: 'Marges', href: '/admin/ventes' },
    ],
    sections: [
      {
        heading: 'Pourquoi ça compte',
        emoji: '💸',
        markdown: `Une ligne que rien ne reconnaît ne nourrit ni le stock théorique, ni la démarque, ni la commande conseillée, ni la marge du produit. Elle existe, elle a été payée, et l'outil l'ignore.`,
      },
      {
        heading: 'Rattacher apprend pour la fois suivante',
        emoji: '🧠',
        markdown: `Quand tu désignes le bon produit, l'outil enregistre la **référence fournisseur** et le **libellé d'achat**. Le scan suivant se rattache tout seul : le geste ne se refait pas.`,
      },
      {
        heading: 'Ce qui n\'a pas de cible s\'écarte',
        emoji: '🚫',
        markdown: `Port, consigne, remise de fin de mois : rien de vendable. Écarte-les définitivement, sinon elles reviennent à chaque ouverture et rendent l'écran illisible — donc inutilisé.

**Un format qui ne concorde pas n'est pas une correspondance** : un jus 33 cl n'est pas un jus 20 cl. C'est un produit à créer, pas un lien à forcer.`,
      },
    ],
  },

  '/inventaire': {
    title: 'Aide — Inventaire',
    intro: "Compter ce qu'il y a vraiment. C'est le seul moyen de voir ce qui part sans être vendu.",
    shortcuts: [
      { emoji: '🗑', label: 'Invendus', href: '/invendus' },
      { emoji: '📦', label: 'Commande conseillée', href: '/admin/commande-fournil' },
    ],
    sections: [
      {
        heading: 'La démarque, c\'est l\'écart',
        emoji: '📉',
        markdown: `L'outil calcule un **attendu** : dernier comptage + les factures scannées − les ventes de la caisse. L'écart avec ce que tu comptes, c'est la **démarque** — ce qui est parti sans être vendu.

Rien n'est stocké : tout est recalculé à chaque ouverture. Une facture scannée en retard corrige donc le chiffre toute seule.`,
      },
      {
        heading: 'Pas de théorique sur une matière première',
        emoji: '🥓',
        markdown: `La caisse sait combien de croissants sont partis. Elle ne sait pas combien de tranches de jambon sont entrées dans les sandwichs. Pour ces matières, on affiche les entrées seules et **aucun attendu** : mieux vaut pas de chiffre qu'un chiffre faux.`,
      },
      {
        heading: 'Chaque poste se compte séparément',
        emoji: '🍷',
        markdown: `Le bar et le Fournil ne se comptent ni au même moment, ni dans la même pièce, ni par la même personne. Mélanger leurs lignes rallongerait le comptage du matin pour rien — et **un inventaire qu'on abrège est un inventaire faux**.`,
      },
    ],
  },

  '/invendus': {
    title: 'Aide — Invendus du soir',
    intro: "La casse qui manquait au food cost. Deux minutes à la fermeture.",
    shortcuts: [
      { emoji: '📦', label: 'Commande conseillée', href: '/admin/commande-fournil' },
    ],
    sections: [
      {
        heading: 'Le coût est figé à la saisie',
        emoji: '🔒',
        markdown: `La casse d'un jour reste valorisée au tarif de ce jour-là. Repasser sur un produit corrige la quantité ; une quantité à **zéro** efface la ligne au lieu d'enregistrer un zéro.`,
      },
      {
        heading: 'À quoi ça sert vraiment',
        emoji: '🎯',
        markdown: `La synthèse des **7 derniers jours**, en haut de page, dit ce qu'on jette le plus. C'est l'outil de réglage des commandes : jeter dix croissants chaque soir, c'est commander dix de trop chaque matin.`,
      },
    ],
  },

  '/ruptures': {
    title: 'Aide — Ruptures',
    intro: "Un appui, et le produit sort immédiatement de la vente en ligne.",
    shortcuts: [
      { emoji: '📦', label: 'Inventaire', href: '/inventaire' },
    ],
    sections: [
      {
        heading: 'À faire au moment où tu le constates',
        emoji: '⏱️',
        markdown: `Pas le soir, pas « quand j'aurai deux minutes ». Si le geste attend, on continue de vendre en ligne ce qu'on n'a plus — et il faut ensuite l'expliquer au client sur le pas de la porte.

L'écran est pensé pour ça : une liste, un appui, la couleur change tout de suite.`,
      },
      {
        heading: 'Une rupture se périme toute seule',
        emoji: '📅',
        markdown: `Elle est **datée** : c'est une décision du jour. Personne n'a à penser à la lever le lendemain — sans ça, le produit resterait invisible pour toujours.`,
      },
      {
        heading: 'Ce qui reste vendable au comptoir',
        emoji: '🏪',
        markdown: `Marquer une rupture coupe la vente **en ligne**, pas la vente au comptoir. S'il te reste trois paninis, tu peux encore les vendre à qui se présente — c'est le bon comportement.`,
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
