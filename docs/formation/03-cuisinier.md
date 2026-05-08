# Formation interne — Poste CUISINIER

> Vue métier — comment le cuisinier utilise l'app au quotidien.
> À lire en ~20 min · base pour Module 27 et le widget « Tâches du jour ».

---

## 1. Ta mission

Tu **reçois les commandes du serveur, tu produis les plats, tu garantis la traçabilité et l'hygiène**. Côté app, tu fais surtout deux choses :

1. **Tu consommes** : tu reçois les commandes en temps réel sur `/cuisine`, tu les marques au fur et à mesure
2. **Tu traces** : températures, lots produits, hygiène, déchets — tout ce qui est obligatoire HACCP

**La cuisine est le chaînon clé de la conformité légale.** Si tes relevés température ne sont pas faits, ou si la traçabilité d'un lot est cassée, le restaurant peut être fermé sur contrôle DDPP/AFSCA. L'app rend tout ça beaucoup plus simple — mais seulement si tu joues le jeu de la saisie.

---

## 2. Tes accès dans l'app

| Page | Ton mode | Ce que tu fais |
|---|---|---|
| **`/cuisine`** | ÉCRITURE | Réception commandes, marquage prêt, minuteur |
| **`/admin/hygiene`** | ÉCRITURE (checklists + températures) | Relevés, NC, lots, checklists |
| **`/admin/stock`** | ÉCRITURE (déduction tablette) | Sortir un ingrédient utilisé |
| **`/admin/dechets`** | ÉCRITURE | Pesée fin de service |
| **`/admin/recettes`** | 👁 LECTURE SEULE | Consulter une recette (sans modifier) |
| **`/admin/ingredients`** | 👁 LECTURE SEULE | Vérifier allergènes, stock, prix achat |
| **`/admin/allergenes`** | 👁 LECTURE SEULE | Catalogue plats × allergènes |
| **`/equipes`** | ÉCRITURE | Chat équipe |
| **`/admin/formation`** | ÉCRITURE (parcours guides) | Tes formations |

**Tu n'as PAS accès à** : finances, RH (sauf pointage), réservations, sécurité, configuration, fournisseurs, boissons. Si tu en as besoin, vois avec le second ou le gérant.

---

## 3. Routine quotidienne — par moment

### 🌅 Prise de poste (15 min avant l'ouverture)

**Objectif : démarrer en sachant qu'on est conforme + prêt.**

#### a) Pointer ton arrivée

Tablette dédiée à l'entrée OU `/admin/rh` → bouton « Pointer arrivée ». Sinon le manager doit corriger après — évite.

#### b) Lire les briefings

`/equipes` → canal Cuisine. Tu y trouves :
- Le **plat du jour** ou recette spéciale lancée par le second/gérant
- Les **allergies** signalées (« 1 client coeliac à 12h30 sur la T7 »)
- Les **rappels** : tel produit est arrivé hier, vérifier la DLC

#### c) Relevé température MATIN ⚠️ OBLIGATOIRE

C'est le geste **le plus important** de ta journée d'un point de vue conformité.

`/admin/hygiene` → onglet **Relevés température** → bouton **+ Nouveau relevé** :
- Choisis l'équipement (frigo cuisine, congélateur, vitrine froide, etc.)
- Note la température affichée sur le thermomètre
- Si la température est **hors plage** (ex frigo à 8°C alors que la norme est ≤4°C) :
  - L'app crée AUTOMATIQUEMENT une **non-conformité critique**
  - Tu dois agir : déplacer les denrées vers un autre frigo, appeler le frigoriste
  - Tu reçois une alerte gérant
- Si la température est OK : sauvegarde, suivante

**Faire 2× par jour minimum** : matin + après le service du soir.

⚠️ **Sans relevé, le plan HACCP saute.** En cas de contrôle, le DDPP/AFSCA demande l'historique des températures sur 1 an. L'app le génère automatiquement → tu n'as plus à tenir un cahier papier.

#### d) Vérification des lots à DLC critique

`/admin/hygiene` → onglet **Lots produits** → filtre « DLC < 24h » ou « DLC < 3j ».

- Si un lot expire **aujourd'hui** : l'utiliser en priorité dans le menu du jour, ou le jeter.
- Si un lot expire **demain** : prévenir le second/gérant pour intégrer dans la carte du jour.

⚠️ **Aucun produit hors DLC ne doit être servi.** En cas de doute, tu jettes (et tu saisis dans `/admin/dechets` fin de service).

#### e) Checklist hygiène CUISINE — ouverture

`/admin/hygiene` → onglet **Checklists** → « Ouverture cuisine ». Items typiques :
- Plans de travail désinfectés
- Frigos vérifiés (température + propreté)
- Couteaux affûtés et propres
- Hotte allumée
- Friteuse : huile claire (ou changer)
- Mise en place ingrédients

⚠️ **À cocher AVANT le début du service.** Sans elle, conformité HACCP non documentée.

---

### 🍴 Pendant le service

**Objectif : recevoir, produire, marquer.**

#### Recevoir les commandes

Sur `/cuisine`, tu vois **2 colonnes** : 👨‍🍳 **CUISINE** et 🍕 **PIZZA** (si tu es pizzaiolo, tu ne vois que pizza — voir doc 04).

Une commande arrive → **bip d'alerte** + nouvelle carte sur la colonne. Chaque carte indique :
- Numéro de table (T7) ou ID commande (à emporter)
- Plats demandés avec quantité
- **Commentaires** (cuisson, sans oignon, etc.) en italique
- ⚠️ **Allergènes à éviter** en gros, en rouge — **À LIRE ABSOLUMENT**
- Minuteur depuis l'envoi (vert <10 min · orange 10-15 · rouge >15)

#### Workflow d'un plat

Chaque plat passe par 3 statuts (à toi de les changer) :

1. **`en_attente`** (par défaut quand le serveur envoie)
2. **`en_preparation`** → tap sur le plat → bouton **« 🔥 En préparation »**
3. **`pret`** → tap sur le plat → bouton **« ✅ Prêt »** quand il sort des fourneaux

⚠️ **Marque « En préparation » dès que tu commences le plat.** Sinon le minuteur du serveur affiche un « retard » qui t'engueule à tort.

⚠️ **Marque « Prêt » dès que c'est dressé.** Le serveur reçoit une alerte sonore et vient le chercher. Si tu oublies, le plat refroidit en passe.

#### ⚠️ Cas critique : allergène à éviter signalé

Si la carte de commande affiche un allergène en rouge (ex « ⚠ ALLERGIE GLUTEN ») :

1. **Stop**. Avant de toucher au plat, vérifie le catalogue : `/admin/allergenes` (lecture) → cherche le plat → confirme les allergènes
2. **Si le plat contient l'allergène signalé** :
   - Soit tu adaptes (ex : pâtes sans gluten en remplacement) — préviens le serveur
   - Soit tu refuses ce plat → préviens le serveur en personne, propose une alternative
3. **Si le plat est OK** :
   - Utilise une planche / un ustensile / une zone séparée pour éviter la contamination croisée
   - Lave-toi les mains entre 2 préparations
4. **JAMAIS** dire « ça ira » sans vérifier. Réaction allergique grave = procès.

#### Auto-impression du bon

Si l'auto-impression est activée (toggle 🖨 en haut de `/cuisine`), les bons s'impriment automatiquement à chaque nouvelle commande. Pratique pour avoir un papier en main.

#### Sortie de stock (déduction)

Si tu utilises un ingrédient en grande quantité (cuisson d'une grosse pièce, préparation d'une sauce mère), tu peux saisir une **sortie manuelle** :

`/admin/stock` → bouton **+ Sortie** → ingrédient + quantité utilisée + raison.

⚠️ **C'est optionnel pour les recettes courantes** (l'app déduit automatiquement à la sortie « servi » de la commande). Mais utile pour les préparations en lot non liées à une commande spécifique.

---

### ⏸️ Inter-services

**Objectif : ranger, vérifier, préparer le soir.**

#### a) Vérifier les températures (relevé du début d'après-midi recommandé)

Si tu as eu un service intense, refais un relevé `/admin/hygiene`. Les frigos chargés peuvent monter en température.

#### b) Lots produits — réception fournisseur

Si un fournisseur livre dans l'après-midi, c'est ton job (ou le second) de :

1. **Vérifier** la marchandise (DLC, état, quantité commandée vs livrée)
2. `/admin/hygiene` → onglet **Lots produits** → bouton **+ Nouveau lot** pour chaque produit reçu
3. Saisis : produit, fournisseur, quantité, DLC, n° lot fournisseur, date de réception

⚠️ **Sans saisie de lot, pas de traçabilité.** Si un client tombe malade, tu dois pouvoir remonter au lot dans la journée. Sans saisie = procès indéfendable.

#### c) Préparation pour le soir

Pas dans l'app — physique. Mais profite pour vérifier :
- Est-ce qu'il manque un ingrédient ? Note dans `/equipes` chat → le gérant ou second va passer commande.

---

### 🌙 Service du soir

Même workflow que le midi. Sois plus vigilant sur la fatigue → plus de risque d'oubli (allergène, marquage prêt).

---

### 🌃 Fin de service

**Objectif : tout est tracé, demain matin tu repars sur du propre.**

#### a) Relevé température SOIR ⚠️ OBLIGATOIRE

Refaire le relevé `/admin/hygiene` → tous les frigos / congélateurs.

#### b) Pesée des déchets

`/admin/dechets` → bouton **+ Nouvelle pesée**. Pour chaque type :
- 🥬 Bio (épluchures, déchets de cuisine) en kg
- 🐟 Restes plats / retours
- 🧴 Huile usagée
- 🥫 Emballages
- 🥖 Pain rassis
- 🍷 Verre

L'app calcule automatiquement le **coût du gaspillage** en € (basé sur le coût d'achat des ingrédients perdus). Cette donnée nourrit le KPI gérant.

⚠️ **Faire chaque soir.** Sans pesée régulière, le rapport annuel obligatoire (déclaration tri à la source) n'est pas crédible.

#### c) Lots produits — sortie de fin de journée

Si tu as utilisé un lot complet aujourd'hui, marque-le « consommé » :

`/admin/hygiene` → onglet **Lots produits** → trouver le lot → bouton **« Statut »** → choisir « consommé ».

Si un lot est arrivé en fin de DLC sans être utilisé → marquer **« jeté »** (et noter dans `/admin/dechets` la quantité).

#### d) Checklist hygiène CUISINE — fermeture

`/admin/hygiene` → onglet Checklists → « Fermeture cuisine ». Items typiques :
- Plans de travail dégraissés et désinfectés
- Frigos rangés et fermés
- Hotte filtrée + bac à graisse vidé
- Sols nettoyés à la mousse + fond
- Poubelles vidées
- Couteaux rangés en zone propre
- Lumières éteintes (sauf veille)

⚠️ **À cocher AVANT de partir.** Le manager le vérifie le lendemain matin.

#### e) Pointage sortie

Tablette ou `/admin/rh` → pointer sortie. Tes heures sont calculées automatiquement.

---

## 4. Données que TU saisis (et qui alimentent le pilotage)

### Saisies QUOTIDIENNES obligatoires

| Saisie | Module | Fréquence | Impact |
|---|---|---|---|
| Relevés température (matin + soir) | `/admin/hygiene` | 2× / jour | Conformité HACCP, KPI gérant |
| Statut commandes (en_prep + prêt) | `/cuisine` | Continu pendant service | Métriques cuisine, satisfaction client |
| Checklist hygiène ouverture | `/admin/hygiene` | 1× / jour | Conformité HACCP |
| Checklist hygiène fermeture | `/admin/hygiene` | 1× / jour | Conformité HACCP |
| Pesée déchets | `/admin/dechets` | 1× / jour (fin de service soir) | Gaspillage € + rapport annuel obligatoire |
| Pointage entrée + sortie | `/admin/rh` | 1× / shift | Masse salariale, heures sup |

### Saisies OCCASIONNELLES

| Saisie | Quand | Module |
|---|---|---|
| Nouveau lot produit reçu | À chaque réception fournisseur | `/admin/hygiene` Lots |
| Statut lot (consommé / jeté / expiré) | Quand le lot est terminé | `/admin/hygiene` Lots |
| Non-conformité (en plus de l'auto-création) | Incident manuel (ex : vol, casse) | `/admin/hygiene` NC |
| Sortie de stock manuelle | Préparation grosse quantité | `/admin/stock` |

### Saisies que tu ne fais PAS (mais que tu consultes)

- Recettes (créer / modifier) → second ou gérant uniquement
- Ingrédients (créer / modifier prix) → second ou gérant
- Catalogue allergènes → gérant uniquement
- Réservations → réceptionniste / gérant
- Encaissements → serveur / caisse

Tu **lis** ces infos quand utile (vérifier une recette, un allergène) mais tu **ne les modifies pas**.

---

## 5. Les 5 réflexes à avoir

1. **Relevés température 2×/jour, sans exception.** Pas de relevés = pas de HACCP = potentiel fermeture administrative en cas de contrôle.

2. **Lecture systématique des allergènes** sur chaque commande qui en signale. Si doute, tu vérifies dans `/admin/allergenes` avant de cuisiner.

3. **Marquage statut commande dès le début et dès la fin.** « En préparation » au démarrage, « Prêt » au dressage. Pas de zone grise.

4. **Lots produits = obligation traçabilité.** Chaque livraison fournisseur = chaque lot saisi. Sinon zéro traçabilité en cas de souci.

5. **Pesée déchets quotidienne.** Tous les soirs. Même si tu penses que c'est rien — l'app calcule le coût pour toi.

---

## 6. Aide à la décision — que faire si...

### Le frigo est à 8°C alors que la norme dit ≤4°C

1. Saisis quand même le relevé température dans `/admin/hygiene` → l'app crée automatiquement une NC critique
2. **Action immédiate** : transfère les denrées sensibles dans un autre frigo, ou jette si impossible
3. Préviens le manager en personne + via `/equipes` chat
4. Note dans la NC l'action curative (transfert / jet) + l'action préventive (appel frigoriste)
5. Un frigoriste doit intervenir **dans les 24-48 h**

### Une commande arrive avec un allergène que tu ne maîtrises pas (rare, ex : céleri)

1. **STOP**. Ne te lance pas dans la préparation.
2. Va voir le serveur en personne pour vérifier l'allergie + proposer une alternative
3. Vérifie le catalogue `/admin/allergenes` à 2× plutôt qu'1
4. Si tu ne peux pas garantir l'absence de l'allergène (contamination croisée possible) → **REFUSE le plat**, propose un autre

### La cuisine est débordée et tu es 30 min en retard sur les commandes

1. Marque tout en « en_preparation » au moins (le serveur voit que tu travailles)
2. Préviens le serveur en personne ou via `/equipes` → il calme les clients
3. **Ne triche pas** sur le statut « prêt » — le plat doit être réellement prêt avant de marquer

### Un produit est livré sans étiquette ou avec DLC pas claire

1. **Refuse la livraison** ou met de côté, prévient le second/gérant
2. NE PAS saisir dans `/admin/hygiene` Lots un produit non-traçable
3. Si tu acceptes quand même (urgence) : saisis le lot avec « DLC inconnue » et le mets en rouge — à utiliser en priorité OU à jeter

### Tu casses un ingrédient cher (ex : tu fais tomber 1kg de truffes)

1. Va sur `/admin/stock` → sortie manuelle de l'ingrédient → motif « Casse / perte »
2. Saisis dans `/admin/dechets` la quantité jetée (ça alimente le coût gaspillage)
3. Préviens le second/gérant

---

## 7. Pièges classiques

1. **Sauter un relevé température** parce que « ça arrange pas le timing » → conformité HACCP en miettes
2. **Saisir un relevé bidon** (« 4°C » à l'aveugle sans regarder) → pareil, perte de la traçabilité réelle
3. **Marquer « prêt » avant que ce soit dressé** → le serveur arrive trop tôt, le plat refroidit en passe
4. **Oublier de saisir un lot** parce que c'était une petite livraison → traçabilité cassée
5. **Ne pas peser les déchets** parce que « ça prend 5 min » → KPI gérant incomplet, rapport annuel difficile
6. **Ignorer une commande avec allergène** parce que pressé → risque sanitaire grave
7. **Ne pas pointer sortie** → masse salariale faussée

---

## 8. Mapping rapide — où dans l'app pour quoi

| Je veux… | Aller sur |
|---|---|
| Voir les commandes en cours | `/cuisine` |
| Marquer un plat en préparation | `/cuisine` → tap sur le plat |
| Marquer un plat prêt | `/cuisine` → tap sur le plat |
| Saisir un relevé température | `/admin/hygiene` Relevés température |
| Cocher la checklist ouverture / fermeture | `/admin/hygiene` Checklists |
| Saisir une non-conformité manuelle | `/admin/hygiene` NC |
| Saisir un nouveau lot reçu | `/admin/hygiene` Lots produits |
| Changer le statut d'un lot | `/admin/hygiene` Lots → tap sur le lot |
| Peser les déchets fin de service | `/admin/dechets` |
| Faire une sortie de stock manuelle | `/admin/stock` |
| Vérifier les allergènes d'un plat | `/admin/allergenes` Catalogue |
| Consulter une recette | `/admin/recettes` |
| Consulter le stock d'un ingrédient | `/admin/ingredients` |
| Lire / écrire dans le chat équipe | `/equipes` |
| Pointer entrée / sortie | tablette ou `/admin/rh` |
| Voir mes formations en cours | `/admin/formation` |

---

## 9. Suivi de ta propre formation

### Premier jour
- [ ] Compte créé avec ton email
- [ ] Le manager t'a montré le bouton 🔔 « Activer son » sur `/cuisine`
- [ ] Tu as fait un relevé température de chaque équipement
- [ ] Tu as coché la checklist ouverture
- [ ] Tu as géré une commande de bout en bout (en_prep → prêt)
- [ ] Tu as pesé les déchets en fin de service

### Première semaine
- [ ] Réflexe relevé température 2×/jour acquis
- [ ] Lots produits saisis à chaque livraison fournisseur
- [ ] Tu sais où vérifier les allergènes dans le catalogue
- [ ] Tu as fini ton guide formation Cuisine (Module 27)
- [ ] Tu participes au chat équipe pour les questions

### Premier mois
- [ ] Tu n'as zappé aucun relevé température (vérifié par le manager)
- [ ] Aucune commande n'est partie sans validation allergène
- [ ] Tu signales toi-même les anomalies (frigo qui chauffe, livraison sans étiquette)
- [ ] Tu connais par cœur les seuils HACCP (≤4°C froid positif, ≤-18°C surgelé, ≥63°C maintien chaud)

---

> **Prochain doc** : Pizzaiolo (variant cuisinier avec colonne PIZZA dédiée + filtre contenu).
