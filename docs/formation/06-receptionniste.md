# Formation interne — Poste RÉCEPTIONNISTE

> Vue métier — comment le/la réceptionniste utilise l'app au quotidien.
> À lire en ~25 min · base pour Module 27 et widgets.

---

## 1. Ta mission

Tu es **la 1ʳᵉ voix qui répond et la dernière main qui sert**. Ton job dans l'app :

1. **Prendre les réservations** (chambres, tables, groupes, événements)
2. **Suivre les paiements** (acomptes, soldes, factures)
3. **Préparer le briefing équipe** la veille / le matin (qui arrive, allergies, préférences)
4. **Maintenir la base clients** (fiches, allergies, préférences, historique)

Tu es le **carrefour entre les clients et l'équipe**. Sans ta saisie rigoureuse :
- Le serveur ne sait pas qui arrive ni avec quelle allergie
- Le cuisinier prépare au mauvais moment ou en mauvaise quantité
- Le gérant pilote sans voir les réservations qui arrivent
- Le ménage ne sait pas quand changer les chambres

**Tu n'es pas une « secrétaire » — tu es la colonne vertébrale opérationnelle du resto.**

---

## 2. Tes accès dans l'app

| Page | Mode | Ce que tu fais |
|---|---|---|
| **`/admin/reservations`** | ÉCRITURE | Réservations chambres + tables + événements |
| **`/admin/clients`** | ÉCRITURE | Fiches clients, fidélité, communications |
| **`/admin/groupes`** | ÉCRITURE | Tour-opérateurs, mariages, séminaires |
| **`/admin/chambres`** (route legacy) | ÉCRITURE | Configuration chambres (capacité, prix) |
| **`/admin/reservations`** (onglet Événements) | ÉCRITURE | Devis, contrats, événements privatisés (imprimables via la fiche événement) |
| **`/admin/allergenes`** | 👁 LECTURE | Catalogue plats × allergènes (utile pour suggérer aux clients) |
| **`/equipes`** | ÉCRITURE | Briefing équipe, communication interne |
| **`/admin/formation`** | ÉCRITURE | Tes formations |

**Tu n'as PAS accès à** : finances, RH (sauf pointage), recettes, ingredients, stock, fournisseurs, boissons, hygiène, sécurité.

Page d'accueil par défaut quand tu te connectes : **`/admin/reservations`**.

---

## 3. Routine quotidienne — par moment

### 🌅 Prise de poste (15-20 min)

**Objectif : tu sais qui arrive aujourd'hui, qui repart, qui mange ce midi/soir, qui doit régler quoi.**

#### a) Pointage + briefings

`/admin/rh` ou tablette → pointer arrivée. `/equipes` → lire les messages du gérant et de la veille.

#### b) Liste des arrivées chambres

`/admin/reservations` → onglet **Chambres** → grille de la journée.

Tu vois pour chaque chambre :
- Si occupée (vert/orange/rouge selon statut) ou libre
- Nom du client, dates
- Tap sur la cellule → fiche détaillée

**Liste mentale à faire** :
- Combien d'arrivées aujourd'hui ?
- Combien de départs ?
- Combien de chambres restent libres (pour réservations last-minute) ?

#### c) Liste des réservations tables midi + soir

`/admin/reservations` → onglet **Tables** → date du jour.

Note :
- Nombre de couverts midi (briefer la cuisine et le serveur)
- Allergies signalées sur les fiches client
- Anniversaires / occasions spéciales (cadeau maison, dressage spécial)

#### d) Événements en cours

`/admin/reservations` → onglet **Événements** → filtre « confirmés cette semaine ».

Si événement aujourd'hui :
- Re-vérifier la fiche : nb personnes, menu, matériel, début/fin
- Préparer le briefing complet pour l'équipe

#### e) Briefing équipe matin

`/equipes` canal général → message structuré type :

```
📅 BRIEFING DU [date]

🛏 Chambres
- 2 arrivées : Famille Dupont (T15h), M. Smith (T18h)
- 1 départ : Mme Garcia (avant 11h)

🍽 Tables midi
- 18 couverts confirmés
- T7 : 4 pers, allergie gluten signalée
- T12 : anniversaire 50 ans (offrir une coupe)

🥂 Événements
- Aucun aujourd'hui
- Demain : mariage 80 pers (briefing détaillé en fin de journée)

⚠ Points d'attention
- Pluie prévue → préparer parapluies à l'entrée
```

⚠️ **Ce briefing est crucial.** Sans lui, l'équipe découvre les surprises pendant le service → mauvaise expérience client.

---

### 📞 Pendant la journée — gérer les flux

#### a) Prendre une réservation chambre

**Source** : appel téléphonique, email, site web, walk-in.

`/admin/reservations` → onglet Chambres → tap sur une cellule libre (jour souhaité × chambre).

Modal de saisie :
- Client (nom, email, téléphone) — si client existant : autocomplétion
- Dates arrivée / départ
- Nb personnes
- Montant total (calculé auto basé sur prix nuit × nuits)
- **Acompte** demandé (généralement 30-50%)
- Notes : préférences (lit double, étage, vue, etc.)

⚠️ **Statut initial = `demande`.** Tant que l'acompte n'est pas reçu, ne pas bloquer la chambre. Une fois acompte reçu : passer en `confirmee`.

Email de confirmation : **pas envoyé automatiquement par l'app** (à brancher en v2). En attendant, copier-coller un template depuis ton outil mail externe.

#### b) Prendre une réservation table

`/admin/reservations` → onglet Tables → bouton **+ Nouvelle réservation**.

Modal :
- Date, heure d'arrivée (et départ optionnel)
- Nb personnes
- Table assignée (optionnel — tu peux laisser auto)
- Client (existant ou nouveau)
- Notes (allergies, occasion, préférence terrasse/intérieur)

Pas d'acompte requis pour les tables (sauf gros groupes).

#### c) Prendre un événement / privatisation

`/admin/reservations` → onglet Événements → bouton **+ Nouvel événement**.

Modal beaucoup plus dense :
- Type : mariage / anniversaire / séminaire / cocktail / banquet / EVJF/G / privatisation
- Date, heures début/fin
- Nb personnes
- Prix par personne HT + montant devis total
- Acompte (souvent 30-50% à la signature du contrat)
- Lieu (resto entier ? salle privée ?)
- Notes : matériel demandé, besoins techniques, contraintes alimentaires

⚠️ **Workflow événement** :
1. **`demande`** → tu reçois la demande, tu envoies le devis
2. **`confirmee`** → client signe + verse l'acompte
3. **`realise`** → événement passé, solde réglé
4. **`annulee`** → si annulation (penser à la politique remboursement)

#### d) Encaisser un acompte

Quand un client verse un acompte (CB, virement, espèces) :

`/admin/reservations` → tap sur la résa → bouton **Ajuster acompte** → saisis le montant reçu.

Le **reste à payer** se met à jour automatiquement.

⚠️ **Ne saisis jamais un acompte « anticipé ».** Si le client a juste promis, attends qu'il verse vraiment. Sinon ton inventaire trésorerie est faux.

#### e) Check-in client chambre

Le client arrive :

1. `/admin/reservations` → onglet Chambres → ta réservation pour aujourd'hui
2. Tap sur la cellule → modal détail → bouton **« Statut »** → choisir **`arrivee`**
3. Donne les clés / code, explique le fonctionnement, propose un drink de bienvenue
4. Met à jour la fiche client si nouveau (`/admin/clients`)

#### f) Check-out client chambre

Le client part :

1. `/admin/reservations` → tap sur la résa → bouton **« Statut »** → **`terminee`**
2. **Encaisser le solde** : soit via `/caisse` si paiement comptant, soit ajuster l'acompte au montant total = solde réglé
3. Imprimer la facture : bouton 🖨️ depuis la résa → lien `/admin/reservations/chambres/[id]/facture/print`
4. Demander si tout s'est bien passé → noter dans la fiche client (préférences, points à améliorer)
5. **Avis Google ?** Glisser un mot pour encourager un avis si tout s'est bien passé

#### g) Gérer les annulations

Téléphone : « Je dois annuler ma résa de demain. »

1. Vérifier la **politique d'annulation** : combien de jours avant pour rembourser l'acompte ?
2. `/admin/reservations` → tap résa → **Statut** → `annulee`
3. Décider : remboursement total / partiel / non
4. Si remboursement : note dans le commentaire de la résa
5. Mettre à jour la fiche client si récurrent (« annule souvent → noter »)

#### h) Mettre à jour une fiche client

`/admin/clients` → trouver le client (recherche par nom / email / téléphone) :

- **Allergies mémorisées** : champ structuré (le serveur le verra à la résa suivante)
- **Préférences** : table préférée, plat fétiche, vin habituel
- **Points fidélité** : automatiquement calculés, mais peut être ajusté manuellement (en cas d'erreur ou de bonus offert)
- **Niveau** : nouveau / régulier / VIP — calculé auto
- **Réclamations** : onglet dédié — note les soucis pour ne pas les re-faire

---

### 🔄 Inter-services / journée calme

**Profite des moments calmes pour travailler les tâches stratégiques.**

#### a) Préparer le briefing du lendemain

À 17h-18h, fais un brouillon du briefing du lendemain. Anticipe :
- Arrivées tôt le matin (vérifier la chambre dispo + propre)
- Gros groupes annoncés
- Allergies à signaler

Poste-le dans `/equipes` canal général **avant ton départ**.

#### b) Suivi des acomptes en attente

`/admin/reservations` → filtre statut « demande » → liste des résas non confirmées.

Pour chaque :
- Vérifie depuis combien de temps c'est en attente
- Si > 3 jours : relance par email ou téléphone
- Si > 7 jours sans réponse : passe en `annulee` et libère la chambre / table

#### c) Campagnes CRM (si délégué par le gérant)

`/admin/clients` → onglet Campagnes (si activé). Selon les périodes :
- Anniversaire client : email automatique avec offre
- Newsletter mensuelle (annonces événements, plats du jour)
- Relance clients dormants (>3 mois sans visite)

⚠️ **L'envoi d'email réel n'est pas automatisé dans l'app aujourd'hui.** Tu prépares le contenu et la liste, mais l'envoi se fait manuellement via Mailchimp/Brevo/Sendinblue. Le gérant te dira quel outil utiliser.

#### d) Relances réclamations

`/admin/clients` → onglet Réclamations → filtre « non répondu » :
- Réponds à chaque réclamation sous 48h max
- Note la solution apportée dans la fiche
- Si grave : escalader au gérant

---

### 🌃 Fin de journée

**Objectif : la journée est tracée, demain est anticipé.**

#### a) Vérifier les statuts en suspens

`/admin/reservations` :
- Une réservation table à 19h en statut `confirmee` mais le client n'est jamais arrivé → passer en `no_show`
- Une réservation chambre check-out non fait → relancer la chambre / passer manuellement en `terminee`

#### b) Briefing du lendemain (si pas déjà posté)

Cf §c inter-services.

#### c) Pointage sortie

Tablette ou `/admin/rh`.

---

## 4. Données que TU saisis

### Saisies QUOTIDIENNES

| Saisie | Module | Fréquence |
|---|---|---|
| Briefing équipe matin | `/equipes` | 1× / jour |
| Réservations entrantes (chambres + tables + événements) | `/admin/reservations` | Au fil de l'eau |
| Encaissement acomptes | `/admin/reservations` | À réception |
| Check-in / check-out chambres | `/admin/reservations` | Continu |
| Mise à jour fiche client (allergies, préférences) | `/admin/clients` | Continu |
| Réponses aux réclamations | `/admin/clients` | Sous 48h |
| Pointage entrée + sortie | `/admin/rh` | 1× / shift |

### Saisies HEBDOMADAIRES

- Vérification résas en attente >3 jours → relance ou annulation
- Suivi des événements à venir (semaine + mois) → ajustements de planning
- Mise à jour campagne CRM (si délégué)

### Saisies MENSUELLES

- Bilan post-événement (gros mariage, séminaire) : note dans la fiche client + retour gérant
- Audit base clients : doublons, fiches incomplètes

### Saisies que tu ne fais PAS

- Configuration des chambres (création / prix) → gérant uniquement (sauf si tu as l'override `/admin/chambres`)
- Encaissements caisse classique (CB midi/soir) → serveur / caisse
- Catalogue allergènes → gérant
- Modifs recettes → cuisine / gérant

---

## 5. Les 5 réflexes à avoir

1. **Briefing équipe avant 9h.** Sans lui, l'équipe découvre les surprises en service. Réflexe non négociable.

2. **Acompte = condition à la confirmation.** Pas d'acompte = pas de chambre/event bloqué. Évite les annulations last-minute qui plombent le CA.

3. **Allergies dans la fiche client = fiabilité.** Saisis dans le champ structuré, pas en commentaire libre. Le serveur le verra automatiquement à la prochaine résa.

4. **Statut `no_show` à signaler.** Si un client ne vient pas à sa résa table, passe en `no_show` (pas en `annulee`). Le gérant peut alors politiquer une réservation prépayée à l'avenir.

5. **Réponse réclamation < 48 h.** Au-delà, le client se sent ignoré → il poste un avis Google négatif. Tu prends 5 min pour répondre, tu sauves la réputation.

---

## 6. Aide à la décision — réception-spécifique

### Un client veut réserver mais l'horaire demandé est complet

1. Vérifie sur `/admin/reservations` Tables → date demandée → toutes les zones (salle / terrasse)
2. Si vraiment complet : propose un autre horaire (1h plus tôt / plus tard) ou un autre jour
3. Si urgent : check si tu peux **pousser** une résa existante de 30 min (en accord avec ces clients d'abord)
4. **NE JAMAIS** sur-réserver. Si tu accordes 4 personnes en plus que la capacité, tu auras des plaintes.

### Un client signale une allergie à la dernière minute (juste avant arrivée)

1. **Saisis** dans la fiche client immédiatement (`/admin/clients`)
2. **Note** dans la résa elle-même : « ⚠ Allergie [type] signalée 1h avant »
3. **Préviens** la cuisine via `/equipes` ou en personne
4. Quand le client arrive, le serveur a l'info (la résa est liée à la fiche client)

### Un événement annule à 7 jours

1. Vérifie le **contrat de privatisation** : politique annulation J-7 ?
2. `/admin/reservations` Événements → tap → `annulee`
3. Décision remboursement (souvent acompte non remboursable à <14j)
4. **Note** dans la fiche client : « Annulation tardive sans motif » → marquer comme « risqué » pour future résa
5. Préviens cuisine + équipe : libérer le planning, redéployer le staff

### Un VIP arrive sans réservation

1. Vérifie sur `/admin/clients` s'il est dans la base et marqué « VIP »
2. Si oui : faire le maximum (table privilégiée, drink offert, info chef pour attention spéciale)
3. Si non : noter dans la fiche après son passage pour la prochaine fois

### Un client arrive 1 h en retard à sa résa table

1. Vérifie si la table est encore libre / réutilisée
2. Si encore libre : accepte mais signale le retard (impacte le tournage)
3. Si réutilisée : excuse-toi, propose un autre créneau ou une consommation au bar
4. Note dans la fiche client : « Arrivé 1h en retard sans prévenir »

### Le système de réservation en ligne (Module 21) génère des doublons

1. Identifie le doublon (même client, même date, même heure)
2. Garde la résa la plus ancienne, supprime la dernière
3. Préviens le gérant pour vérifier l'intégration externe (peut-être bug)

---

## 7. Pièges classiques

1. **Saisir une réservation au mauvais nom de client** → fiche dupliquée, allergies non vues, fidélité non comptée
2. **Oublier de passer en `arrivee` au check-in** → le tableau chambres est faux, le ménage ne sait pas
3. **Ne pas faire le briefing matin** → l'équipe découvre les surprises pendant le service
4. **Accepter un acompte sans le saisir** → trésorerie faussée, conflit possible avec le client
5. **Confondre `no_show` et `annulee`** → impacte les statistiques + politique commerciale future
6. **Répondre aux réclamations >48h** → 1 avis Google négatif coûte X clients potentiels
7. **Ne pas mettre à jour les allergies dans la fiche client** → re-création à chaque résa, oublis garantis

---

## 8. Mapping rapide réceptionniste

| Je veux… | Aller sur |
|---|---|
| Voir le planning chambres | `/admin/reservations` Chambres |
| Voir les résas tables du jour | `/admin/reservations` Tables |
| Voir les événements à venir | `/admin/reservations` Événements |
| Prendre une nouvelle résa chambre | tap sur cellule libre dans la grille Chambres |
| Prendre une nouvelle résa table | bouton + Nouvelle résa onglet Tables |
| Saisir un nouvel événement | bouton + Nouvel événement |
| Check-in / check-out | tap sur la résa → Statut |
| Encaisser un acompte | tap sur résa → Ajuster acompte |
| Imprimer une facture chambre | tap résa → 🖨️ |
| Imprimer un devis événement | tap event → 🖨️ |
| Imprimer un contrat de privatisation | tap event → 🖨️ contrat |
| Mettre à jour fiche client | `/admin/clients` |
| Saisir une réclamation | `/admin/clients` → Réclamations |
| Voir les allergies d'un client | `/admin/clients` → tap |
| Configurer un groupe TO / mariage | `/admin/groupes` |
| Vérifier les allergènes des plats (suggérer) | `/admin/allergenes` |
| Briefer l'équipe | `/equipes` |
| Pointer | tablette ou `/admin/rh` |

---

## 9. Suivi de ta formation

### Premier jour
- [ ] Tu as fait le tour des 3 onglets `/admin/reservations` (chambres / tables / événements)
- [ ] Tu as saisi une résa test de chaque type
- [ ] Tu as fait un check-in + check-out fictifs
- [ ] Tu as posté un briefing test dans `/equipes`
- [ ] Tu maîtrises les statuts (demande / confirmee / arrivee / terminee / annulee / no_show)

### Première semaine
- [ ] Tu fais le briefing matin sans rappel
- [ ] Tu saisis chaque acompte au bon moment
- [ ] Tu mets à jour systématiquement les fiches clients (allergies, préférences)
- [ ] Tu réponds aux réclamations en moins de 48h
- [ ] Tu as fini ton guide formation Module 27

### Premier mois
- [ ] Aucune résa n'a été perdue (oubliée du briefing)
- [ ] Tous les acomptes sont encaissés à temps
- [ ] La base clients est nettoyée (pas de doublons sur les nouveaux)
- [ ] Tu as géré ≥1 événement de bout en bout (devis → contrat → réalisation → solde)
- [ ] Tu as identifié et signalé ≥1 client VIP au gérant pour traitement privilégié

---

> **Prochain doc** : Second / Chef de cuisine (quasi-gérant côté cuisine, écriture sur recettes/ingredients/stock/fournisseurs).
