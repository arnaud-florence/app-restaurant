# Formation interne — Poste SERVEUR

> Vue métier — comment le serveur utilise l'app au quotidien.
> À lire en ~20 min · base pour Module 27 et le widget « Tâches du jour ».

---

## 1. Ta mission

Tu es **l'interface entre la cuisine et le client**. La qualité de ce que tu saisis dans l'app conditionne **tout le pilotage du restaurant** :

- Tu encodes mal une commande → la cuisine prépare le mauvais plat → réclamation
- Tu oublies de signaler un allergène → risque sanitaire grave
- Tu ne marques pas un plat « servi » → la cuisine pense qu'il y a un retard
- Tu n'encaisses pas correctement → l'écart de caisse fausse le Z-report
- Tu sautes la checklist hygiène salle → la conformité HACCP saute

**Tu n'es pas un caissier amélioré. Tu es la main qui alimente toute la donnée du resto.**

---

## 2. Tes accès dans l'app

Quand tu te connectes avec ton email, tu accèdes à :

| Page | Ce que tu fais |
|---|---|
| **`/serveur`** | Plan de salle, prises de commandes, marquage « servi » — ÉCRITURE |
| **`/caisse`** | Encaissements et tickets clients — ÉCRITURE |
| **`/admin/clients`** | Fiche clients, allergies mémorisées, points fidélité — ÉCRITURE |
| **`/admin/allergenes`** | Catalogue plats × allergènes — LECTURE SEULE |
| **`/admin/boissons`** | Carte des vins/boissons + accords mets-vins — LECTURE SEULE |
| **`/admin/reservations`** | Réservations tables + événements du jour — LECTURE SEULE |
| **`/admin/hygiene`** | Checklists salle à cocher quotidiennement |
| **`/admin/formation`** | Tes guides + ton avancement |
| **`/equipes`** | Chat équipe + briefings |

**Tu n'as PAS accès à** : finances, fournisseurs, recettes (recettes), ingrédients, stock, RH, sécurité, configuration. Si tu en as besoin, demande au gérant.

Sur ton téléphone / tablette, en bas tu vois la **bottom nav 4 boutons** : 🍽️ Serveur · 👨‍🍳 Cuisine · 🍺 Bar · 💰 Caisse. Tu utilises principalement Serveur et Caisse.

---

## 🌐 Multi-canal : les 4 sources de commandes

Le restaurant reçoit des commandes par **4 canaux différents**. Tu dois savoir les reconnaître pour comprendre ce qui se passe en cuisine et qui fait quoi.

### Tableau de référence

| Source | Badge | Couleur | Origine | Qui crée la commande |
|---|---|---|---|---|
| **TABLE** | 🪑 TABLE | bleu | Plan de salle | **Toi** (serveur) sur `/serveur` |
| **COMPTOIR** | 🛒 COMPTOIR | violet | Vente directe bar/snack | Barman via modal "Comptoir" |
| **ONLINE** | 🌐 ONLINE | émeraude | Site web public | Client lui-même (autonome) |
| **BORNE** | 🛍 BORNE | rouge | Kiosk libre-service | Client sur la borne tactile |

### Ce que TU fais sur chaque source

| Source | Ton rôle |
|---|---|
| 🪑 **TABLE** | **Tu prends + tu sers + tu encaisses** (cycle complet) |
| 🛒 **COMPTOIR** | Tu ne crées PAS, mais tu peux **encaisser** au comptoir si le barman est occupé |
| 🌐 **ONLINE** | Tu ne crées PAS, mais **si un client te demande où retirer**, va sur `/emporter` |
| 🛍 **BORNE** | Tu ne touches PAS — c'est autonome (sauf si la borne plante : appelle Arnaud) |

### Comment ça se présente côté cuisine

Quand la cuisine reçoit ta commande TABLE, elle voit le **badge bleu 🪑 + numéro de table**. Quand elle reçoit une commande ONLINE, elle voit le **badge vert 🌐 + créneau horaire**. Ça l'aide à prioriser. **Tes commandes TABLE ont la priorité quand la table attend.**

### Le statut spécial "en attente paiement comptoir"

Quand un client commande sur la **BORNE** ou au **COMPTOIR**, sa commande **n'apparaît PAS en cuisine tant qu'il n'a pas payé**. Elle est en statut `en_attente_paiement_comptoir`.

Pourquoi ? Pour éviter qu'on prépare un plat qu'un client n'a pas validé.

Si tu te retrouves à l'encaisser au comptoir (la borne est en mode "payer plus tard" parce que NFC a échoué) :
1. Va sur **`/emporter`** → tu vois la liste des commandes BORNE/COMPTOIR à encaisser
2. Tap sur la commande → modal encaissement (carte / espèces / TR)
3. Une fois encaissée, **la commande part automatiquement en cuisine**

### Cas pratique : client mixte (commande online + bouteille à table)

Un client a commandé une pizza en ligne pour retrait à 19h, mais en arrivant il veut aussi un verre de vin. Tu fais :
1. Tu lui sers d'abord son vin via une commande TABLE classique (table T4 → ajouter article vin)
2. Sa pizza ONLINE est dans `/emporter` ou en cuisine. Quand elle est prête, tu vas la chercher et tu lui apportes
3. À l'encaissement : 2 commandes séparées (la TABLE vin + la ONLINE pizza déjà payée online ou à régler au comptoir selon son choix initial)

### Cas pratique : la borne tombe en panne

Si un client est devant la borne et clique "Payer au comptoir" (ou si la borne plante) :
1. Sa commande est dans `/emporter` au statut "en_attente_paiement_comptoir" (badge rouge 🛍)
2. Va sur `/emporter` → encaisse comme une commande normale (modal paiement)
3. Préviens Arnaud via `/equipes` qu'il y a eu un souci de borne

---

## 3. Routine quotidienne — par moment

### 🌅 Prise de poste (10 min avant l'ouverture)

**Objectif : être prêt à recevoir, sans surprise.**

#### a) Sélection serveur

Sur `/serveur`, en haut à droite, **choisis ton nom** dans le sélecteur. Toutes les commandes que tu prendras seront associées à toi (utile pour le pourboire, la productivité par employé, les commissions).

⚠️ **Tu oublies de te sélectionner ?** Toutes tes ventes vont dans « inconnu » — tu peux dire adieu à ton pourboire individuel.

#### b) Lire les briefings du jour

Va sur `/equipes` → canal général → lis les messages du gérant.

Cherche en particulier :
- **Plat à pousser** ou **menu du jour** (souvent annoncé la veille au soir ou le matin)
- **Allergène spécifique** signalé (ex : « attention, on a 1 client coeliac aujourd'hui »)
- **Événement** ou **groupe** prévu

#### c) Vérifier les réservations du jour

`/admin/reservations` → onglet Tables → date du jour. Combien de couverts ? Quels groupes ? Tu sauras à l'avance que la T7 sera occupée à 12h30.

#### d) Survoler les allergènes

`/admin/allergenes` → onglet Catalogue. Repère 3-4 plats avec allergènes critiques (gluten, lactose, fruits à coque) — tu seras plus rapide quand un client demande.

⚠️ **Tu ne peux PAS modifier les allergènes** (lecture seule). Si tu vois une erreur, signale au gérant via `/equipes`.

#### e) Cocher la checklist hygiène salle (ouverture)

`/admin/hygiene` → onglet Checklists → choisir « Ouverture salle ». Coche les items :
- Nappes / sets propres
- Sels / poivres remplis
- Couverts polis
- Sol balayé
- Mise en place table

⚠️ **Cette checklist doit être cochée AVANT l'ouverture.** Sans elle, la conformité HACCP du jour saute.

---

### 🍴 Pendant le service

**Objectif : prendre, servir, encaisser, garder le rythme sans perdre la qualité de saisie.**

#### Prendre une commande (étape par étape)

1. Sur `/serveur` → onglet **Plan de salle** → cliquer sur la table (T1, T2, etc.). Si elle est libre (vert), elle devient « occupée » dès que tu envoies la 1ʳᵉ commande.

2. Le **catalogue** s'ouvre avec les recettes regroupées par catégorie. Filtre :
   - 🍳 Cuisine (entrées, plats, desserts)
   - 🍷 Bar (boissons, cocktails, vins)
   - 🍕 Pizza (si vous avez un pizzaiolo)

3. Pour chaque article voulu :
   - Tap sur la recette → elle s'ajoute au panier
   - **Quantité** : par défaut 1, modifie au besoin (× 2, × 3…)
   - **Commentaire** : « sans oignon », « cuisson saignant », « +mayo »
   - **Allergène à éviter** ⚠️ : si le client est allergique, **CLIQUE sur l'allergène concerné**. Cela alerte la cuisine en gros et en rouge sur le bon de préparation.

4. Quand le panier est complet, vérifie le **total** affiché en bas → bouton **« Envoyer en cuisine »**. La commande part vers la cuisine et le bar en temps réel.

5. Tu peux **ajouter** d'autres articles plus tard (entrée puis plat puis dessert) en re-cliquant la table.

#### ⚠️ Cas critique : allergie

**Si un client signale une allergie, suis cette procédure** :

1. Demande **précisément** quels allergènes (gluten, lactose, fruits à coque, etc.)
2. Va sur `/admin/allergenes` (en haut tu peux ouvrir un nouvel onglet si besoin) → onglet Catalogue → cherche le plat → vérifie ses allergènes
3. Si le plat contient l'allergène : **propose une alternative** (le client te demande conseil)
4. Sur la commande dans `/serveur`, **coche les allergènes à éviter** dans la ligne d'article
5. Si ce client revient régulièrement : ouvre sa fiche `/admin/clients` → mets à jour le champ « Allergies mémorisées »

⚠️ **Ne JAMAIS dire « ça doit aller » sans vérifier.** Une réaction allergique grave = procès + fermeture du resto.

#### Servir un plat

Quand la cuisine marque le plat « prêt » (Module 9A), tu reçois une **alerte sonore** et le plat apparaît dans l'onglet **« À servir »** de `/serveur`.

1. Va chercher le plat en cuisine
2. Apporte-le à la table (vérifie 2× la table mentionnée sur le bon)
3. Sur `/serveur` onglet À servir → tap **✓ Marquer servi**

⚠️ **Ne pas marquer servi = la cuisine pense que le plat traîne** → ils stressent, te relancent. Sois discipliné.

#### Recevoir un appel client (Module 26 — QR salle)

Si un client a scanné le QR code sur sa table, tu vois apparaître en haut de `/serveur` un **banner rouge avec son d'alerte** :

- 💧 Eau · 🧾 Addition · 🆘 Aide · 👋 Autre

1. Va à la table immédiatement
2. Réponds à la demande
3. Sur le banner → bouton **✓ Pris** (sinon le banner reste affiché pour tous les serveurs)

#### Encaissement (fin de table)

1. Sur `/serveur` onglet **« À encaisser »** → tap la table
2. Le **modal d'encaissement** s'ouvre :
   - Ventilation des paiements : **Carte / Espèces / Tickets resto / Multiple**
   - Pourboire : champ optionnel, attribué à toi
   - Email client : optionnel mais utile (envoi du ticket par email + alimente la base CRM)
3. Bouton **Encaisser** → la commande passe au statut « encaissé », un ticket s'imprime automatiquement

⚠️ **Si tu fais un paiement multiple** (un client paie carte + un autre espèces), saisis chaque ligne séparément avec son montant exact. Sinon le Z-report fin de service ne tombera pas juste.

#### Retour plat (le plat ne convient pas au client)

Si un client renvoie un plat (cuisson, goût, hors menu) :

1. **Excuse-toi** auprès du client, propose un remplacement
2. Sur `/admin/clients` → onglet **Retours plats** → bouton **+ Nouveau retour**
3. Sélectionne le plat, le motif (cuisson, qualité, allergie, autre), commentaire libre
4. **Décide avec le manager** si le plat est offert ou décompté (le retour est tracé pour le food cost et la satisfaction client)

---

### 🌃 Fin de service / fin de shift

**Objectif : tout est tracé, tu pars sereinement.**

#### a) Vérifier qu'il n'y a plus de tables ouvertes

`/serveur` onglet **Plan de salle** : aucune table en rouge (à encaisser) ?

Si oui, encaisse avant de partir. Si tu pars en laissant une table ouverte, le serveur du shift suivant ne sait pas quoi faire.

#### b) Cocher la checklist hygiène salle (fermeture)

`/admin/hygiene` → onglet Checklists → « Fermeture salle ». Items typiques :
- Tables nettoyées et essuyées
- Nappes pliées / partis au lave-linge
- Sol balayé / serpillère
- Comptoir bar essuyé
- Frigos salle fermés et thermomètres OK
- Lumières secondaires éteintes

⚠️ **À cocher AVANT de partir.** C'est obligatoire pour la conformité.

#### c) Pointage sortie

Sur `/admin/rh` (ou la tablette dédiée à l'entrée), pointer sortie. Tes heures travaillées sont calculées automatiquement.

⚠️ **Si tu oublies, le manager doit corriger manuellement le lendemain.** Pas grave une fois, à éviter en routine.

---

## 4. Données que TU saisis (et qui alimentent le pilotage)

### Saisies QUOTIDIENNES obligatoires

| Saisie | Module | Impact |
|---|---|---|
| Sélection de ton nom en début de shift | `/serveur` | Productivité serveur, pourboires, commissions |
| Commandes (avec allergènes signalés) | `/serveur` | CA, food cost, sécurité allergie |
| Marquage « servi » des plats prêts | `/serveur` onglet À servir | Métriques temps cuisine, qualité service |
| Encaissements (avec méthode + pourboire) | `/caisse` | CA, ratios CB/cash, écart Z-report |
| Checklist hygiène salle (ouverture + fermeture) | `/admin/hygiene` | Conformité HACCP |
| Pointage entrée + sortie | `/admin/rh` ou tablette | Masse salariale, heures sup |

### Saisies OCCASIONNELLES

| Saisie | Quand | Module |
|---|---|---|
| Nouveau client | 1ʳᵉ visite + il accepte | `/admin/clients` |
| Mise à jour allergies client | Client signale | `/admin/clients` fiche |
| Retour plat | Plat refusé / réclamation | `/admin/clients` onglet Retours |
| Réclamation client (verbale ou écrite) | Client mécontent | `/admin/clients` onglet Réclamations |
| Réponse à une demande WiFi client | Si tu gères le WiFi guests | `/admin/clients` (signup WiFi auto via `/wifi-signup`) |

### Saisies que tu ne fais PAS (mais que tu consultes)

- Recettes / prix / food cost → c'est le rôle du gérant ou second
- Ingrédients / stocks → cuisine + gérant
- Réservations (création) → réceptionniste ou gérant
- Boissons / accords → gérant ou barman
- Allergènes (catalogue) → gérant uniquement

Tu **lis** ces infos quand tu en as besoin, tu **ne les modifies pas**.

---

## 5. Les 5 réflexes à avoir

1. **Allergènes = STOP.** Tout client qui mentionne « allergie », « intolérance », « régime », tu vérifies systématiquement avant de prendre la commande.

2. **Marquage servi = obligatoire.** Si tu apportes un plat mais ne marques pas, la cuisine ne sait pas. Réflexe à automatiser dès la pose en table.

3. **Email client à la fin.** Demande l'email à l'encaissement (« pour vous envoyer le ticket par email »). 80% acceptent — c'est précieux pour le CRM (campagnes, retours, fidélité).

4. **Pourboire dans le bon champ.** Saisis-le dans le champ « Pourboire » à l'encaissement, pas dans le total. Sinon ça gonfle artificiellement le CA.

5. **Checklist hygiène = avant de partir.** Tu ne quittes pas le resto sans avoir coché la checklist fermeture. Sinon le manager t'embête le lendemain et la conformité saute.

---

## 6. Aide à la décision — que faire si...

### Un client a une allergie mortelle (épi-pen sur lui)

1. **Prends-le très au sérieux.** Pas de blagues.
2. Va sur `/admin/allergenes` → onglet **Procédures d'urgence** → procédure « Allergie ».
3. Lis la procédure pas-à-pas (qui appeler, où est l'épi-pen équipe, etc.).
4. Préviens immédiatement le manager / chef de cuisine en présentiel.
5. Vérifie ULTRA-rigoureusement chaque plat servi : cuisinier informé, ustensiles séparés, pas de croisement d'allergène.

### Le QR appel serveur sonne pendant que tu prends une commande à une autre table

1. Termine la commande en cours (en quelques secondes — ne perds pas le fil avec le client devant toi).
2. Va voir la table qui a appelé.
3. Dans le banner, **▼ Pris** dès que tu y vas — sinon un autre serveur va aussi y aller.

### Une commande est partie en cuisine avec une erreur (tu t'es trompé de plat)

1. Va voir la cuisine en personne pour annuler. Ne te repose pas seulement sur l'app.
2. Reviens sur `/serveur`, ouvre la commande, **annule l'article erroné** (action `changerStatutArticle` → annule).
3. Saisis la bonne commande à la place.

### Le système de paiement plante / l'imprimante du ticket ne marche pas

1. Continue à saisir les commandes manuellement (sur ton téléphone ou via l'app).
2. **Note l'incident** dans `/equipes` chat → le manager intervient.
3. Pour l'encaissement immédiat : carbonless paper backup + saisis a posteriori dans `/caisse`.

### Un client paie en plusieurs fois (table de 4 qui split)

1. Sur `/caisse` modal d'encaissement → bouton **+ Ajouter paiement**
2. Pour chaque personne, saisis le montant + méthode (CB, espèces, ticket resto)
3. Le total doit matcher le ticket de la table → **Encaisser**
4. Ne fais PAS 4 encaissements séparés — c'est UNE table avec 4 lignes de paiement.

---

## 7. Pièges classiques

1. **Oublier de te sélectionner en début de shift** → tes ventes ne te sont pas attribuées
2. **Saisir une commande sans cliquer « Envoyer »** → la cuisine ne reçoit rien
3. **Cliquer « Servi » avant que ce soit servi** (anticipation) → si le plat finalement n'est pas livré, tu trafiques la donnée
4. **Mettre l'allergène en commentaire libre au lieu de le cocher** → l'alerte cuisine ne se déclenche pas
5. **Faire un encaissement « partiel »** sans terminer → la table reste ouverte indéfiniment
6. **Ignorer un appel serveur** → mauvaise expérience client
7. **Pointer arrivée mais pas sortie** → masse salariale faussée

---

## 8. Mapping rapide — où dans l'app pour quoi

| Je veux… | Aller sur |
|---|---|
| Prendre une commande | `/serveur` Plan de salle → cliquer la table |
| Marquer un plat servi | `/serveur` onglet À servir |
| Encaisser une table | `/serveur` onglet À encaisser, ou `/caisse` |
| Vérifier l'allergène d'un plat | `/admin/allergenes` Catalogue |
| Voir les vins disponibles | `/admin/boissons` |
| Voir les réservations du jour | `/admin/reservations` Tables |
| Ajouter un nouveau client | `/admin/clients` |
| Saisir un retour plat | `/admin/clients` Retours plats |
| Saisir une réclamation | `/admin/clients` Réclamations |
| Cocher l'hygiène salle | `/admin/hygiene` Checklists |
| Voir mes formations en cours | `/admin/formation` |
| Pointer entrée/sortie | `/admin/rh` ou tablette dédiée |
| Lire les messages équipe | `/equipes` |

---

## 9. Suivi de ta propre formation

### Premier jour
- [ ] Compte créé avec ton email perso, mot de passe choisi
- [ ] Ton manager t'a expliqué la sélection de ton nom en début de shift
- [ ] Tu as pris une commande test (avec un plat + un allergène)
- [ ] Tu as encaissé un ticket test (en mode multiple paiement)
- [ ] Tu as coché les checklists ouverture + fermeture

### Première semaine
- [ ] Tu te sélectionnes systématiquement en début de shift (réflexe)
- [ ] Tu signales TOUS les allergènes systématiquement (vérification)
- [ ] Tu marques « servi » à chaque plat sans oublier
- [ ] Tu cliques le bouton « Pris » sur les appels serveur
- [ ] Tu finalises le module formation Serveur (Module 27)

### Premier mois
- [ ] Tu maîtrises les 4 méthodes de paiement (CB / espèces / tickets resto / multi)
- [ ] Tu créées des fiches client à la moindre occasion (>5 fiches/semaine)
- [ ] Tu remontes les retours plats systématiquement (pas en off au manager)
- [ ] Tu poses des questions au manager sur ce que tu ne comprends pas

---

> **Prochain doc** : Cuisinier (consomme l'app via `/cuisine`, saisit relevés température, hygiène, lots produits).
