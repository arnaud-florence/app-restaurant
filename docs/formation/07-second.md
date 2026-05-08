# Formation interne — Poste SECOND / CHEF DE CUISINE

> Vue métier — comment le second utilise l'app au quotidien.
> À lire en ~25 min · base pour Module 27 et widgets.
> ⚠️ Complète **03-cuisinier.md** (HACCP, températures, lots, déchets — applique tout pareil). Ici on couvre uniquement la dimension **gestion + management** propre au second.

---

## 1. Ta mission

Tu es **le bras droit du chef et le gérant côté cuisine**. Tu fais moins d'opérationnel pur que le cuisinier (tu prépares moins de plats au quotidien) mais beaucoup plus de **pilotage** :

1. **Tu crées et maintiens les recettes** — c'est toi qui maîtrises le food cost
2. **Tu pilotes les achats** — bons de commande, négociation fournisseurs, alertes de hausse
3. **Tu encadres l'équipe cuisine** — formation, répartition, rappels conformité
4. **Tu fais le pont avec le gérant** sur les décisions menu, prix, marges

L'app te donne **l'écriture complète sur 13 modules** — quasi-gérant côté production. Tu n'as pas accès aux finances ni aux RH (paie), mais tu vois les KPIs cuisine via le prévisionnel et le journal.

**Tu es le garde-fou de la rentabilité cuisine.**

---

## 2. Tes accès dans l'app

| Page | Mode | Ce que tu fais |
|---|---|---|
| **`/cuisine`** | ÉCRITURE | Tu peux remonter en cuisine pendant un service chargé |
| **`/admin/recettes`** | ÉCRITURE | Création + modif + activation recettes |
| **`/admin/recettes/engineering`** | ÉCRITURE | Analyse star/dog/puzzle/pony (Module 5) |
| **`/admin/ingredients`** | ÉCRITURE | Maintenance prix achat, allergènes, stock min |
| **`/admin/stock`** | ÉCRITURE | Inventaire, mouvements, alertes |
| **`/admin/fournisseurs`** | ÉCRITURE | Bons commande, factures, scoring |
| **`/admin/boissons`** | ÉCRITURE | Carte (en collaboration avec le barman) |
| **`/admin/hygiene`** | ÉCRITURE | Tu pilotes le HACCP — NC, contrôles, plan |
| **`/admin/allergenes`** | ÉCRITURE | Catalogue + procédures urgence |
| **`/admin/dechets`** | ÉCRITURE | Tu valides les pesées + analyse mensuelle |
| **`/admin/previsionnel`** | ÉCRITURE | Tu lis la météo, ajuste les prep |
| **`/admin/journal`** | ÉCRITURE | Entrées du chef cuisine |
| **`/equipes`** | ÉCRITURE | Tu pilotes le canal Cuisine |
| **`/admin/formation`** | ÉCRITURE | Suivi équipe |

**Tu n'as PAS accès à** : finances, RH (sauf pointage), réservations, sécurité, configuration. Si besoin, vois avec le gérant.

Page d'accueil par défaut : **`/cuisine`** (tu commences par là pour voir le service en cours).

---

## 3. Routine quotidienne — par moment

### 🌅 Prise de poste (20-30 min — plus que le cuisinier)

#### a) Pointage + briefings

`/admin/rh` ou tablette. `/equipes` canal Cuisine + canal général.

#### b) Lecture du prévisionnel

`/admin/previsionnel` → météo du jour + CA prévisionnel. Si tempête / canicule prévue ou jour férié à venir → adapter les commandes fournisseurs et la mise en place.

#### c) Check des KPIs du jour précédent

Si tu as accès au prévisionnel et au journal, tu peux voir :
- Le CA du jour précédent
- L'humeur du service (entrée journal du gérant)
- Les NC restées ouvertes

Adapte ta journée en conséquence (priorité à clôturer une NC, par exemple).

#### d) Tour des équipements (HACCP responsabilité)

Tu fais **toi-même** les premiers relevés température le matin OU tu vérifies que le cuisinier les a faits.

`/admin/hygiene` → onglet Relevés → check de la liste du jour. Si manquant, sollicite l'employé responsable.

⚠️ **En tant que second, tu portes la responsabilité globale HACCP côté cuisine.** Tu signes les éventuels rapports en cas de contrôle.

#### e) Briefing équipe cuisine

`/equipes` canal Cuisine → message structuré :

```
🍳 BRIEFING CUISINE [date]

Plat du jour : [nom]
Allergies signalées : [liste]
Lots à priorité (DLC critique) : [liste]
Événement : [si applicable]

Préparations à faire avant 12h :
- [tâche 1]
- [tâche 2]

Personne en charge :
- Cuisson : [employé]
- Garde-manger : [employé]
- Plonge : [employé]
```

---

### 🍴 Pendant le service

**Objectif : superviser, intervenir si besoin, ne pas faire à la place.**

Pendant le service, idéalement tu **surveilles** depuis `/cuisine` (ou physiquement à la passe) sans toucher la production. Tu interviens si :

- Un cuisinier débordé → tu prends une station
- Une commande complexe (allergie, gros groupe) → tu prends en main
- Une NC se déclare (température hors plage) → tu pilotes la résolution

**Sinon, profite des moments calmes pour les tâches de gestion.**

---

### 📋 Tâches de gestion (entre services + journée calme)

#### a) Maintenance des recettes

`/admin/recettes` → tu as l'écriture complète. Tes actions courantes :

##### Créer une recette
- Nom, catégorie, tag destination (CUISINE / PIZZA / BAR)
- Prix de vente HT
- **Ingrédients** : tap **+ Ajouter** → choisir l'ingrédient, saisir quantité + unité
- L'app calcule **automatiquement** :
  - Coût matière (somme quantité × prix achat)
  - **Food cost %** (coût matière / prix vente)
  - Marge € et marge %
  - Statut couleur (vert <28% / orange 28-32% / rouge >32%)
- Saisis le **temps de préparation** estimé
- **Allergènes** dérivés automatiquement des ingrédients (sauf si tu coches manuel un complément)

##### Modifier une recette existante
- Souvent : ajustement de quantité d'un ingrédient → impact food cost
- Repricer → impact food cost et marge
- Désactiver une recette qui ne se vend plus

##### Engineering recettes (`/admin/recettes/engineering` Module 5)

C'est un outil d'analyse mensuelle clé. La matrice à 4 quadrants :

| | Marge HAUTE | Marge BASSE |
|---|---|---|
| **Vente HAUTE** | ⭐ STAR (à promouvoir) | 🐎 PLOWHORSE (à repricer) |
| **Vente BASSE** | 🧩 PUZZLE (à mieux placer carte) | 🐶 DOG (à retirer) |

Action mensuelle :
- Identifier les ⭐ STAR → mise en avant carte (gros plat, photo)
- Identifier les 🐶 DOG → désactiver ou refondre
- Identifier les 🐎 PLOWHORSE → repricer (+1€ à +3€) ou réduire le coût matière
- Identifier les 🧩 PUZZLE → meilleur placement sur la carte (haut, photo)

⚠️ **Cette analyse est ta responsabilité.** Le gérant peut la faire avec toi mais c'est toi qui as la connaissance produit.

#### b) Maintenance des ingrédients

`/admin/ingredients` → tu peux modifier :
- **Prix achat HT** : à mettre à jour à chaque facture fournisseur (ou les changements de prix significatifs)
- **Stock minimum** : pour déclencher les alertes
- **Allergènes** : si un nouveau produit en contient
- **Catégorie** : viandes / poissons / légumes / etc.

⚠️ **Modifier un prix d'achat impacte AUTOMATIQUEMENT le food cost de toutes les recettes** qui contiennent cet ingrédient. Vérifie après chaque changement les recettes en alerte (food cost > 30%).

##### Historique des prix (Module 3)

Tap sur un ingrédient → onglet **📈 Historique prix**. Tu vois les variations de prix sur 6 / 12 mois.

⚠️ **Une hausse > 5%** déclenche une alerte automatique. Le gérant te demandera des explications. Anticipe :
- Saison (asperges en mai = +30%, normal)
- Hausse du fournisseur → comparer avec un autre (`/admin/fournisseurs`)
- Inflation alimentaire générale

#### c) Bons de commande fournisseurs

`/admin/fournisseurs` → onglet **Bons de commande** → bouton **+ Nouveau bon**.

Workflow :
1. Choisir le fournisseur
2. Date de livraison souhaitée
3. **Pour chaque ingrédient** : quantité commandée, prix unitaire (récupéré auto depuis le dernier prix)
4. Total HT + TVA + TTC calculés
5. Sauvegarder (statut `brouillon`)
6. Validation : passer en `envoyé` (soit l'app envoie un email auto si configuré, soit tu copies-colles le contenu dans ton mail externe)

⚠️ **Anticipe** : commande hebdo idéalement le lundi pour livraison mercredi. Pas de commande de dernière minute (frais en plus, indisponibilités).

##### Réception des marchandises

À la livraison :
1. `/admin/fournisseurs` → bon de commande → bouton **Réception**
2. Coche les produits **reçus conformes** + saisis les **écarts** (manquant, qualité, retour)
3. **Crée les lots** dans `/admin/hygiene` Lots (cf doc 03-cuisinier §3 inter-services)
4. **Saisis la facture** dans le bon de commande (montant, échéance)
5. Si écart de prix vs commande : signale au gérant

#### d) Validation factures

Quand un fournisseur t'envoie une facture (papier ou email) :

1. Vérifie que la facture correspond au bon de commande + à la livraison
2. `/admin/fournisseurs` → tap fournisseur → onglet Factures → saisir la facture (montant, date, échéance)
3. **Le paiement reste la responsabilité du gérant** (qui a accès à `/admin/finances`). Tu prépares juste la trace.

#### e) Inventaire mensuel

1ʳᵉ semaine du mois : tu pilotes l'**inventaire physique complet** :
1. Comptage de tout le stock (ingrédients + bouteilles vins + spiritueux)
2. `/admin/stock` → onglet Inventaire → bouton **Nouvel inventaire**
3. Saisis la quantité physique pour chaque ingrédient
4. L'app calcule l'**écart** stock théorique (basé sur les ventes) vs stock réel
5. Écart > 5% → enquête (vol ? casse non saisie ? sortie manquée ?)

⚠️ **Cette saisie est OBLIGATOIRE** pour avoir un food cost réel et fiable. Sans inventaire mensuel, le food cost affiché est théorique.

#### f) Maintenance allergènes

`/admin/allergenes` → onglet Catalogue. Vérifie :
- Pour chaque plat, les allergènes calculés depuis les ingrédients sont-ils complets ?
- Y a-t-il un allergène à ajouter manuellement (override) ? Ex : un plat cuit dans la même huile qu'un poisson → traces de poisson possibles
- Procédures d'urgence (réaction allergique, brûlure) à jour ?

⚠️ **Tu as l'écriture.** Tu peux modifier le catalogue (le serveur est en lecture seule). Documente bien chaque modif.

#### g) Journal de bord cuisine

`/admin/journal` → bouton + Nouvelle entrée :
- Humeur du service (côté cuisine spécifiquement)
- Faits marquants : panne d'équipement, employé absent, plat exceptionnellement réussi/raté
- Photos : nouvelles recettes testées, équipements

⚠️ **Le gérant lit ces entrées.** C'est ton canal pour remonter ce qui se passe en cuisine sans avoir à le voir tous les jours.

---

### 🌃 Fin de service

#### a) Validation pesée déchets

Le cuisinier saisit `/admin/dechets` mais tu **valides** la cohérence (parfois les pesées sont oubliées ou inexactes). Si tu vois un trou, demande au cuisinier responsable.

#### b) Vérification lots à statut

`/admin/hygiene` Lots → vérifier que les lots du jour ont leur statut à jour (consommé / jeté / en_stock).

#### c) Préparation commande lendemain (si besoin)

Si tu as besoin de réceptionner demain → vérifier que le bon de commande est envoyé.

#### d) Pointage sortie

Tablette ou `/admin/rh`.

---

## 4. Routine hebdomadaire (typiquement le lundi)

| Tâche | Module | Durée |
|---|---|---|
| Bon de commande fournisseurs hebdo | `/admin/fournisseurs` | 30 min |
| Revue food cost recettes (recettes en alerte) | `/admin/recettes` | 20 min |
| Engineering recettes (rapide) | `/admin/recettes/engineering` | 15 min |
| Audit hygiène (NC ouvertes, contrôles à venir) | `/admin/hygiene` | 15 min |
| Briefing équipe semaine (canal Cuisine) | `/equipes` | 10 min |

---

## 5. Routine mensuelle (1ère semaine du mois)

| Tâche | Module | Durée |
|---|---|---|
| Inventaire physique complet | `/admin/stock` Inventaire | 2-3 h |
| Engineering recettes mensuel + décisions | `/admin/recettes/engineering` | 1 h |
| Revue prix achat ingrédients (mise à jour) | `/admin/ingredients` | 30 min |
| Bilan déchets / gaspillage | `/admin/dechets` | 30 min |
| Audit allergènes (mise à jour si nouveaux plats) | `/admin/allergenes` | 30 min |
| Mise à jour scoring fournisseurs | `/admin/fournisseurs` | 20 min |

**Total mensuel : ~5-6 h de gestion** en plus de l'opérationnel cuisine.

---

## 6. Données que TU saisis (ou valides)

### Saisies QUOTIDIENNES (par toi ou délégué cuisinier que tu valides)

| Saisie | Module | Qui saisit | Tu valides |
|---|---|---|---|
| Relevés température | `/admin/hygiene` | Cuisinier | ✓ |
| Lots produits reçus | `/admin/hygiene` | Toi ou cuisinier | ✓ |
| Pesée déchets | `/admin/dechets` | Cuisinier | ✓ |
| Statut commandes | `/cuisine` | Cuisinier / pizzaiolo | non |
| Briefing équipe matin | `/equipes` | Toi | — |
| Journal de bord cuisine | `/admin/journal` | Toi | — |

### Saisies HEBDOMADAIRES

| Saisie | Module |
|---|---|
| Bon de commande fournisseurs | `/admin/fournisseurs` |
| Mise à jour prix achat (si livraison) | `/admin/ingredients` |
| Modifs recettes (food cost ajustement) | `/admin/recettes` |

### Saisies MENSUELLES

| Saisie | Module |
|---|---|
| Inventaire physique stock | `/admin/stock` Inventaire |
| Engineering recettes (décisions star/dog) | `/admin/recettes/engineering` |
| Audit allergènes / procédures urgence | `/admin/allergenes` |

### Saisies que tu ne fais PAS

- Paiement des factures → gérant
- Encaissement → serveur / caisse
- Modifs RH (paie, contrats) → gérant
- Réservations → réceptionniste

---

## 7. Les 5 réflexes du second

1. **Tu valides, tu ne fais pas tout.** Délègue les saisies routinières au cuisinier (températures, déchets), garde-toi les saisies stratégiques (recettes, achats, inventaire).

2. **Le food cost est ton tableau de bord.** Toute modif d'ingrédient ou recette → tu vérifies l'impact dans `/admin/recettes` avant de valider.

3. **Inventaire mensuel non-négociable.** Sans ça, tout le pilotage food cost du gérant est théorique. Tu y consacres une demi-journée minimum.

4. **Briefing équipe = ton canal de management.** Pas de discours moralisateur — informations pratiques (qui fait quoi, quoi à priorité, allergies).

5. **Allergènes = responsabilité légale.** Quand tu crées une recette ou modifies un ingrédient, tu vérifies les allergènes calculés ET tu ajoutes les compléments manuels (huile partagée, équipement partagé).

---

## 8. Aide à la décision — second-spécifique

### Une recette passe en alerte food cost (>30%)

1. Va sur `/admin/recettes` → la recette en alerte (couleur orange)
2. Identifie l'ingrédient qui pèse le plus (l'app affiche la décomposition)
3. **Options** :
   - Modifier la quantité (réduction sans dégrader le plat)
   - Changer un ingrédient pour un équivalent moins cher
   - Repricer (proposer au gérant +1€ à +3€)
   - Désactiver la recette si invendable au prix juste
4. Si décision validée par gérant : modifier dans `/admin/recettes`
5. Note dans `/admin/journal` : « Recette X reprice de 18→21€ suite à hausse [ingrédient] »

### Un fournisseur augmente son prix de >10%

1. Tu reçois une alerte automatique (app surveille les variations >5%)
2. **Vérifier** sur `/admin/fournisseurs` → onglet Factures → comparer la nouvelle facture à la précédente
3. **Comparer** avec un fournisseur alternatif (autre fournisseur sur même produit dans `/admin/fournisseurs`)
4. **Décider** :
   - Accepter et repricer les recettes concernées
   - Changer de fournisseur (créer un nouveau bon de commande)
   - Négocier (téléphone)
5. Saisir l'action dans `/admin/journal`

### Un cuisinier ne fait pas ses relevés température

1. Premier oubli : rappel verbal + chat `/equipes`
2. Deuxième oubli : entretien + ajout dans le journal de bord
3. Récidive : escalader au gérant
4. Plus globalement : créer un guide formation Module 27 pour insister sur l'importance HACCP

### Un nouveau plat à ajouter à la carte

1. Test en cuisine (sans saisir dans l'app)
2. Si validé par le gérant : `/admin/recettes` → + Nouvelle recette
3. Saisis tous les ingrédients précisément (impact food cost)
4. Vérifier le food cost calculé → si rouge, ajuster
5. Vérifier les allergènes calculés → ajouter manuellement les pièges (huile partagée, etc.)
6. Activer la recette + briefer l'équipe via `/equipes`

### L'inventaire mensuel ne tombe pas juste (écart >5%)

1. **Recompte** physiquement les ingrédients en écart
2. Vérifie les **mouvements de stock manuels** récents — y a-t-il des sorties non saisies ? casses ?
3. Vérifie les **commandes encaissées** → les ingrédients ont-ils bien été décomptés ?
4. Si écart confirmé : enquête équipe, casse non signalée, ou vol
5. Saisis quand même l'écart dans l'inventaire (l'app doit refléter le réel)
6. Note dans `/admin/journal` + remonter au gérant

### La cuisine déborde et tu dois remplacer un cuisinier

1. Sur `/cuisine` → tu prends une station
2. **Tu peux toujours marquer les plats statut `prêt`** (tu as l'écriture)
3. Une fois calmé : retour à tes tâches de gestion

---

## 9. Pièges classiques

1. **Modifier une recette sans vérifier l'impact food cost** → recette en perte sans s'en rendre compte
2. **Ne pas faire l'inventaire mensuel** → food cost théorique, pas réel, gérant pilote à l'aveugle
3. **Saisir un bon de commande sans réception détaillée** → pas de traçabilité écart commande/livraison
4. **Oublier de mettre à jour les prix d'achat** après une nouvelle facture → food cost faux
5. **Ne pas signaler une hausse fournisseur** au gérant → pertes accumulées sur plusieurs semaines
6. **Tout faire au lieu de déléguer** → tu surcharges, le cuisinier ne progresse pas
7. **Ne pas remplir le journal de bord cuisine** → le gérant ne sait pas ce qui se passe en cuisine

---

## 10. Mapping rapide second

| Je veux… | Aller sur |
|---|---|
| Voir les commandes en cours | `/cuisine` |
| Créer / modifier une recette | `/admin/recettes` |
| Engineering recettes (analyse) | `/admin/recettes/engineering` |
| Modifier un prix d'achat | `/admin/ingredients` → tap |
| Voir l'historique prix d'un ingrédient | `/admin/ingredients` → 📈 Prix |
| Faire un bon de commande | `/admin/fournisseurs` → + Bon |
| Réceptionner une livraison | `/admin/fournisseurs` → bon → Réception |
| Saisir une facture fournisseur | `/admin/fournisseurs` → fournisseur → Factures |
| Voir le scoring d'un fournisseur | `/admin/fournisseurs` |
| Inventaire physique | `/admin/stock` Inventaire |
| Mouvements stock manuels | `/admin/stock` |
| Vérifier les NC hygiène | `/admin/hygiene` |
| Modifier le catalogue allergènes | `/admin/allergenes` Catalogue |
| Modifier les procédures d'urgence | `/admin/allergenes` Procédures |
| Lire la météo + prévisionnel | `/admin/previsionnel` |
| Saisir une entrée journal cuisine | `/admin/journal` |
| Briefer l'équipe cuisine | `/equipes` |
| Pointer | tablette ou `/admin/rh` |

---

## 11. Suivi de ta formation

### Premier mois
- [ ] Tu as créé / modifié au moins 5 recettes
- [ ] Tu as fait 1 bon de commande complet (de la création à la réception)
- [ ] Tu as fait l'inventaire mensuel avec le gérant (initial puis solo)
- [ ] Tu as fait l'engineering recettes mensuel + identifier 1 STAR à pousser et 1 DOG à retirer
- [ ] Tu as mis à jour ≥3 prix d'achat suite à factures fournisseurs
- [ ] Tu as fini ton guide formation Module 27 + Module 5 (Engineering)

### Deuxième mois
- [ ] Tu signales toutes les hausses fournisseurs au gérant
- [ ] Le journal de bord cuisine est rempli ≥3 jours / semaine
- [ ] Aucune recette n'est en alerte food cost depuis >2 semaines
- [ ] Tu encadres réellement le cuisinier / pizzaiolo (briefing matin systématique)

### Troisième mois
- [ ] Le food cost moyen du resto est passé en zone verte (<28%) — ou est en route
- [ ] L'écart inventaire mensuel est <3%
- [ ] Tu proposes des optimisations carte au gérant (avec données engineering à l'appui)
- [ ] Tu participes aux décisions stratégiques cuisine (avec le gérant)

---

> **Prochain doc** : Plonge / Extra (poste minimal — checklists nettoyage + déchets uniquement).
