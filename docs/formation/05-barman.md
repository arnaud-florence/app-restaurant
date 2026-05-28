# Formation interne — Poste BARMAN

> Vue métier — comment le barman utilise l'app au quotidien.
> À lire en ~20 min · base pour Module 27 et widgets.

---

## 1. Ta mission

Tu **gères les boissons et le bar** : préparation des cocktails, service au comptoir, gestion du stock alcool, accords mets-vins. Tu es à la fois **opérationnel** (tu produis et sers) et **gestionnaire** (tu maintiens la carte boissons, tu fais les inventaires).

L'app a une vue dédiée pour toi sur `/bar` (commandes boissons en temps réel) et te donne **l'écriture complète sur le module boissons** — tu es le seul, après le gérant, à pouvoir créer/modifier la carte des vins. C'est une **responsabilité importante** : la marge sur les boissons représente souvent 50% du résultat d'un resto.

---

## 2. Tes accès dans l'app

| Page | Mode | Filtre | Ce que tu fais |
|---|---|---|---|
| **`/bar`** | ÉCRITURE | — | Réception commandes bar, marquage prêt |
| **`/caisse`** | ÉCRITURE | — | Encaissement comptoir (si tu sers au bar) |
| **`/admin/boissons`** | ÉCRITURE | — | Carte vins/boissons + accords mets-vins |
| **`/admin/stock`** | ÉCRITURE | ✅ BAR | Sortie/inventaire ingrédients bar uniquement |
| **`/admin/ingredients`** | ÉCRITURE | ✅ BAR | Ingrédients utilisés dans cocktails (sirops, jus, etc.) |
| **`/admin/fournisseurs`** | ÉCRITURE | (pas filtré aujourd'hui) | Bons commande boissons |
| **`/admin/clients`** | ÉCRITURE | — | Allergies boissons (sulfites, lactose lait) |
| **`/admin/hygiene`** | ÉCRITURE | — | Checklists bar, NC, températures frigos bar |
| **`/admin/dechets`** | ÉCRITURE | — | Pesée fin de service (verre, casses) |
| **`/equipes`** | ÉCRITURE | — | Chat équipe |
| **`/admin/formation`** | ÉCRITURE | — | Tes formations |

**Tu n'as PAS accès à** : finances, recettes cuisine (sauf BAR), RH (sauf pointage), réservations, sécurité.

Sur ta tablette / mobile, en bas tu vois la **bottom nav 4 boutons** : Serveur · Cuisine · 🍺 Bar · Caisse. Tu utilises principalement Bar + Caisse.

**EN PLUS** : tu as accès à `/emporter` pour voir et encaisser les commandes BORNE/COMPTOIR/ONLINE.

---

## 🌐 Multi-canal : ton bar reçoit de 4 sources + tu CRÉES les commandes COMPTOIR

Tu es le poste avec le **plus de polyvalence multi-canal**. Tu vois et tu agis sur tous les canaux :

### Tableau des sources que tu reçois

| Badge | Source | Spécificité BAR |
|---|---|---|
| 🪑 **TABLE** (bleu) | Boisson commandée par serveur | Tu prépares, le serveur passe chercher |
| 🛒 **COMPTOIR** (violet) | **TU L'AS CRÉÉE** ou un autre comptoir | Souvent paiement immédiat |
| 🌐 **ONLINE** (émeraude) | Boissons commandées sur le site | Préparer en emballage à emporter |
| 🛍 **BORNE** (rouge) | Boisson du catalogue borne | Limité (eau, soft, bière — pas d'alcool fort) |

### 🛒 Ton rôle unique : créer des commandes COMPTOIR

Quand un client arrive directement **au bar/comptoir** (sans passer par une table), c'est TOI qui crées la commande :

1. Sur `/bar`, en bas à droite tu vois un bouton flottant vert **"+ Nouvelle commande"** → un modal **"🛒 Comptoir"** s'ouvre
2. Tap → modal de création de commande comptoir s'ouvre
3. Sélectionne les articles (catalogue boisson + snacking)
4. Choisis **consommation** : 🍽 sur place / 📦 à emporter (impacte la TVA)
5. **Fidélité** (optionnel) : si le client est fidélité, scan ou recherche par nom/téléphone
6. **Paiement** : carte / espèces / TR — encaissement immédiat
7. Bouton **"Valider et encaisser"** → la commande part directement en cuisine/bar (statut `en_attente`)

⚠️ **Important** : les commandes COMPTOIR sont **toujours payées avant de partir en cuisine**. Pas de "je règle après".

### 🛍 Si la borne plante (NFC en échec)

Quand un client paye à la borne avec sa carte (NFC) et que ça plante, la borne peut basculer en mode "paiement au comptoir" :
1. La commande arrive dans `/emporter` au statut `en_attente_paiement_comptoir` (badge rouge 🛍)
2. Le client se présente à TON comptoir avec son numéro de commande
3. Tu vas sur `/emporter` → tu retrouves sa commande → modal paiement
4. Une fois encaissée, la commande **part en cuisine automatiquement** (Realtime)

Tu peux aussi prendre l'initiative : si tu vois un client perdu devant la borne, **clique "Payer au comptoir"** sur l'écran borne pour lui → il vient te voir.

### 🌐 Workflow ONLINE (boissons)

Si un client commande une boisson sur le site (rare mais possible — il a un retrait combiné pizza+bière) :
- Tu la reçois sur `/bar` avec badge 🌐 + créneau horaire
- Tu la prépares **juste avant le créneau**
- Tu la mets en sachet/emballage avec la pizza/snacking de la même commande
- Statut "prêt" quand l'ensemble de la commande est prêt

### ⚠️ Règle d'or alcool

**La borne ne sert PAS d'alcool fort** (catalogue limité aux boissons soft + bière sans alcool max). C'est volontaire pour éviter qu'un mineur commande de l'alcool en autonomie.

Si un client te dit "j'ai commandé une bière mais la borne refuse" → c'est normal pour les alcools forts. Propose-lui de commander **au bar** avec vérification de pièce d'identité si nécessaire.

### Vue d'ensemble : qui voit quoi

| Écran | TABLE | COMPTOIR | ONLINE | BORNE |
|---|---|---|---|---|
| `/serveur` | ✅ centré | ❌ | ❌ | ❌ |
| `/cuisine` | ✅ | ✅ | ✅ | ✅ (post-paiement) |
| `/pizza` | ✅ (pizzas) | ✅ (pizzas) | ✅ (pizzas) | ✅ (pizzas, post-paiement) |
| `/bar` | ✅ (boissons) | ✅ (boissons) | ✅ (boissons) | ✅ (boissons, post-paiement) |
| `/emporter` | ❌ | ✅ (à encaisser/encaissée) | ✅ (retrait) | ✅ (à encaisser) |
| `/livreur` | ❌ | ❌ | ✅ (livraison uniquement) | ❌ |
| `/caisse` | ✅ (Z-report) | ✅ | ✅ | ✅ |

---

## 3. Routine quotidienne

### 🌅 Prise de poste (15 min avant ouverture)

#### a) Pointer + briefings

- Tablette ou `/admin/rh` → pointer arrivée
- `/equipes` canal bar → événements du jour, vins/cocktails à pousser

#### b) Relevés température frigos bar

⚠️ **Frigos bar = aussi HACCP.** Vins blancs / champagnes / pression bière en froid positif (≤4°C).

`/admin/hygiene` → onglet Relevés température → équipement « Frigo bar » / « Cave à vin » / « Tireuse bière » → noter température.

Si hors plage → NC auto, action immédiate (transfert ou appel frigoriste).

#### c) Vérification stock bouteilles ouvertes

**Spécificité bar** : les bouteilles ouvertes (vins, alcools) ont une durée de vie limitée :

| Type | Durée vie après ouverture |
|---|---|
| Vin rouge tannique | 3-5 jours (en cave fraîche) |
| Vin rouge léger | 2-3 jours |
| Vin blanc / rosé | 2-3 jours |
| Champagne / Crémant | 1-2 jours (conserve les bulles avec bouchon) |
| Spiritueux (whisky, gin) | Indéfini (mais qualité diminue après 6 mois) |
| Liqueurs ouvertes | 2-12 mois selon sucre |
| Bière fût ouvert | 5-7 jours (selon CO2) |

⚠️ **Avant l'ouverture**, vérifie chaque bouteille ouverte / fût en cours :
- Si fin de vie / goût douteux → `/admin/dechets` saisir + jeter
- Si OK → noter mentalement la priorité (vendre en premier)

#### d) Mise en place bar physique

Pas dans l'app — physique :
- Glace concassée dans bac
- Citrons / oranges / herbes (basilic, menthe) coupés
- Sirops accessibles
- Verres polis et triés par type

#### e) Checklist hygiène ouverture bar

`/admin/hygiene` Checklists → « Ouverture bar ». Items typiques :
- Comptoir nettoyé + désinfecté
- Évier nettoyé
- Tireuse bière propre (becs + drip tray)
- Verres polis et alignés
- Bouteilles présentation alignées
- Frigos vérifiés (température OK)

---

### 🍴 Pendant le service

#### Recevoir une commande boisson

Sur `/bar`, tu vois les commandes par grille de cartes (1/2/3 colonnes selon écran). Chaque carte indique :
- Numéro de table ou ID
- Boissons commandées avec quantité
- **Allergènes signalés** ⚠️ (en rouge)
- Minuteur depuis l'envoi

Workflow standard :
1. **`en_attente`** par défaut
2. **`en_preparation`** → tap sur la boisson → 🔥 dès que tu commences
3. **`pret`** → tap → ✅ dès que c'est dressé

⚠️ **Cocktails complexes** : marque « en_preparation » dès que tu prends le shaker. Le serveur sait alors que tu y travailles.

#### ⚠️ Allergènes boissons (souvent oubliés)

- **Sulfites** (vins) : >10 mg/L = mention obligatoire (loi UE)
- **Lait** : crèmes (Bailey's, certains liquoreux)
- **Œufs** : whisky sour traditionnel (blanc d'œuf)
- **Fruits à coque** : Frangelico (noisette), Amaretto (amande)
- **Gluten** : la plupart des bières (sauf marquées sans gluten), certains spiritueux

Si client signale allergie → vérifie `/admin/boissons` (lecture-écriture) → propose alternative.

#### Encaissement comptoir bar

Si tu sers au comptoir (consommations sans table) :
- `/caisse` → modal encaissement → ventilation paiement (CB / espèces / multi)
- Bouton « Encaisser » → ticket imprimé

⚠️ **Le pourboire au bar est souvent en cash sur le comptoir.** Saisis-le dans le champ pourboire (pas dans le total CA) — ça t'est attribué.

#### Service à table (commande table → bar)

Le serveur prend la commande en salle → la commande arrive sur ta vue `/bar`. Tu prépares, tu marques « prêt » → le serveur vient chercher. Tu n'as pas besoin d'aller à la table.

---

### ⏸️ Inter-services

#### a) Recharger les fûts si besoin

Si fût bière à <20% pendant le service : prévoir le changement avant le rush soir. Saisis le **changement de fût** dans `/admin/stock` (filtré BAR) → mouvement « entrée » avec quantité + référence fût.

#### b) Vérification rapide DLC

`/admin/ingredients` (filtré BAR) → tri par stock bas / DLC critique. Si stock proche de zéro sur un produit clé, prévient le gérant via `/equipes`.

#### c) Préparation pour le service soir

Physique mais utile :
- Glace en réserve
- Mise en place agrumes / herbes
- Verres polis et rangés

---

### 🌃 Fin de service — INVENTAIRE BAR (critique)

**Le bar est le poste où le contrôle de stock est LE PLUS critique** : alcool = produit cher + facilement chapardable.

#### a) Inventaire bouteilles ouvertes

Pour chaque bouteille ouverte au bar :
1. Estime visuellement le niveau restant (ou pèse si tu as une balance)
2. `/admin/stock` (filtré BAR) → bouton « Inventaire » → onglet du jour
3. Saisis le niveau réel pour chaque bouteille / fût
4. L'app calcule l'écart entre stock théorique (ce qui aurait dû rester après les ventes) et le réel
5. Écart > 5% → enquête (vol ? sur-service ? casse non saisie ?)

#### b) Casses / pertes

Saisis dans `/admin/dechets` → catégorie « Verre » :
- Verres cassés (poids estimé)
- Bouteilles tombées (poids + valeur de l'alcool perdu)
- Cocktails ratés (saisis aussi le coût matière)

⚠️ **Saisis honnêtement.** Mieux vaut signaler 5 verres cassés qu'avoir un écart inventaire inexpliqué.

#### c) Vérification fûts en cours

Dans `/admin/stock` ou via tableau papier :
- Niveau approximatif de chaque fût
- Si un fût a changé pendant le service, c'est tracé
- Si fût en fin de vie (> 7 jours après ouverture) → marquer « jeté » dans /admin/stock + saisie /admin/dechets pour la valeur restante

#### d) Relevé température frigo bar (soir)

Idem matin → `/admin/hygiene` Relevés.

#### e) Pesée déchets bar

`/admin/dechets` → catégories typiques :
- 🍷 Verre (bouteilles vides + casses)
- 🥫 Emballages
- 🍋 Bio (épluchures agrumes)

#### f) Checklist fermeture bar

`/admin/hygiene` Checklists → « Fermeture bar » :
- Comptoir nettoyé
- Évier vidé + désinfecté
- Tireuse bière nettoyée (becs)
- Frigos fermés (vérifier joints)
- Bouteilles ouvertes rangées au frais
- Sol balayé

#### g) Pointage sortie

Tablette ou `/admin/rh`.

---

## 4. Maintenance carte boissons (rôle stratégique)

**Tu es responsable de la carte boissons** (carte des vins, cocktails maison, bières pression, softs). Cette carte évolue : vins millésimés qui s'épuisent, nouveaux cocktails, accords mets-vins.

### Fréquence recommandée

- **Hebdomadaire** : check des stocks bas (vins en fin de stock à signaler au gérant pour commande)
- **Mensuel** : rotation cocktails (pousser les boissons sous-vendues, retirer les invendables)
- **Saisonnier** (été/hiver/Noël) : refonte d'une partie de la carte

### Comment modifier la carte

`/admin/boissons` → liste complète :

#### Créer une nouvelle boisson

Bouton « + Nouvelle boisson » :
- **Type** : vin / bière / spiritueux / cocktail / soft / autre
- **Couleur** (si vin) : rouge / blanc / rosé / orange
- **Nom** : Châteauneuf-du-Pape 2018, Mojito maison, etc.
- **Producteur / appellation**
- **Prix achat HT** + **Prix vente HT** par format
- **Formats vendus** : bouteille / verre / pinte / cocktail
- **Stock actuel** : nombre de bouteilles / fûts en cave
- **Allergènes** : cocher sulfites, lait, fruits à coque selon composition

L'app calcule automatiquement la **marge** par format. Cible standard : **70% minimum** sur la boisson.

#### Modifier une boisson

Tap sur la boisson → ✏️ Modifier. Mettre à jour stock, prix, ajouter une note (« stock épuisé fournisseur, retour avril »).

#### Désactiver / supprimer

🚫 Désactiver → la boisson disparaît du menu côté serveur mais reste en historique
🗑 Supprimer → suppression définitive (à éviter si historique pertinent)

### Accords mets-vins

`/admin/boissons` → tap sur un vin → onglet **Accords**. Tu peux lier ce vin à des plats du resto.

⚠️ **C'est un atout commercial** : le serveur a accès à ces accords sur sa vue `/serveur` quand il prend une commande. Il peut suggérer le bon vin pour le bon plat → ticket moyen +15-20%.

Pour chaque accord : noter la note de dégustation (« Tannique, accompagne les viandes rouges » par exemple).

---

## 5. Données que TU saisis

### Saisies QUOTIDIENNES

| Saisie | Module | Fréquence |
|---|---|---|
| Statut commandes | `/bar` | Continu |
| Encaissements comptoir | `/caisse` | Si service au bar |
| Relevés température bar | `/admin/hygiene` | 2× / jour |
| Inventaire fin de service | `/admin/stock` filtré BAR | 1× / jour |
| Pesée déchets (verre + bio) | `/admin/dechets` | 1× / soir |
| Checklists hygiène | `/admin/hygiene` | Ouverture + fermeture |
| Pointage entrée + sortie | `/admin/rh` | 1× / shift |

### Saisies HEBDOMADAIRES

- Vérification stocks bas pour signaler au gérant → bon de commande
- Rotation carte (désactivation des invendables)

### Saisies MENSUELLES

- Audit complet de la carte boissons (revue par catégorie)
- Mise à jour des accords mets-vins selon nouvelle carte plats

### Saisies que tu ne fais PAS (mais que tu consultes)

- Recettes cuisine (sauf cocktails maison) → cuisine ou gérant
- Fiches employés / paie → gérant
- Réservations → réceptionniste

---

## 6. Aide à la décision — bar-spécifique

### Un cocktail signature ne se vend pas (5 ventes / mois)

1. Vérifie le **prix** : trop cher ? compare à la concurrence locale
2. Vérifie le **placement carte** : visible en haut ? mis en avant par le serveur ?
3. Décide :
   - **Repricer** dans `/admin/boissons` → modifier prix vente
   - **Retirer** : 🚫 désactiver dans `/admin/boissons`
   - **Repositionner** : ajouter en accords mets-vins avec un plat spécifique

### Un fût bière vient de craquer (perte massive)

1. **Coupe** la pression immédiatement
2. Évalue la perte (5L ? 10L ?) — saisis dans `/admin/dechets` → Verre + Bio
3. Saisis aussi dans `/admin/stock` → mouvement « casse » avec quantité réelle
4. Préviens le manager (perte > 20€ généralement)
5. Crée une NC dans `/admin/hygiene` → catégorie Équipement (le fournisseur peut rembourser le fût défectueux)

### L'inventaire ne tombe pas juste (écart > 5%)

1. **Vérifie** que tu as bien saisi toutes les casses + cocktails ratés
2. Recompte le stock physique (souvent erreur de comptage)
3. Si écart confirmé : **enquête**
   - Vol ? (vérifier qui était au bar)
   - Sur-service / mauvaise dose ?
   - Boisson offerte non saisie ?
4. **Saisis l'écart** quand même (l'inventaire doit refléter le réel)
5. **Note** dans `/equipes` chat manager pour échange

### Un client demande une recommandation cocktail

1. Va sur `/admin/boissons` → onglet Cocktails
2. Filtre par type (rafraîchissant, signature, classique)
3. Si tu vois les **accords mets-vins** : propose le cocktail qui matche son plat
4. Si tu peux personnaliser (sirops disponibles, fruits frais) : propose une création maison

### Un vin est en rupture pendant le service

1. **Préviens le serveur** immédiatement → il informe les clients qui le commandent
2. Sur `/admin/boissons` → modifier la boisson → 🚫 désactiver temporairement
3. Saisis dans `/equipes` chat → le gérant passe commande au fournisseur

---

## 7. Pièges classiques

1. **Saisir un cocktail comme « prêt » alors qu'il n'est pas dressé** → le serveur arrive trop tôt, le verre traîne
2. **Sauter l'inventaire fin de service** par fatigue → écarts cumulés non identifiables après plusieurs jours
3. **Ne pas saisir une casse** parce que c'est gênant → écart inventaire inexpliqué
4. **Oublier de signaler une allergie sulfites** → réaction allergique grave (asthmatiques surtout)
5. **Modifier une boisson sans mettre à jour les accords** → le serveur recommande une boisson désactivée
6. **Servir une bouteille ouverte hors DLC** par flemme → goût altéré, risque retour client
7. **Ne pas vérifier le frigo bar** au passage matin → vins blancs servis chauds = qualité dégradée

---

## 8. Mapping rapide barman

| Je veux… | Aller sur |
|---|---|
| Voir les commandes boissons | `/bar` |
| Marquer un cocktail prêt | `/bar` → tap |
| Encaisser un client comptoir | `/caisse` |
| Modifier une boisson de la carte | `/admin/boissons` → ✏️ |
| Ajouter un accord mets-vins | `/admin/boissons` → tap → onglet Accords |
| Inventaire bouteilles fin de service | `/admin/stock` filtré BAR |
| Saisir une casse | `/admin/dechets` (verre) + `/admin/stock` (mouvement) |
| Relevé température frigo bar | `/admin/hygiene` |
| Cocher hygiène | `/admin/hygiene` Checklists |
| Vérifier allergènes d'un vin | `/admin/boissons` → tap |
| Voir stock fournisseur | `/admin/fournisseurs` |
| Lire chat équipe | `/equipes` |
| Pointer | tablette ou `/admin/rh` |

---

## 9. Suivi de ta formation

### Premier jour
- [ ] Compte créé avec ton email
- [ ] Tu connais la nomenclature carte boissons (cocktails maison)
- [ ] Tu as fait l'inventaire fin de service avec le manager
- [ ] Tu as marqué une boisson de bout en bout (en_prep → prêt)
- [ ] Tu as fait la pesée déchets

### Première semaine
- [ ] Réflexe relevé température bar 2×/jour
- [ ] Inventaire quotidien sans oubli
- [ ] Tu sais filtrer la carte boissons par type / couleur
- [ ] Tu as participé à la maj d'1 boisson dans `/admin/boissons`
- [ ] Tu as fini ton guide formation Module 27

### Premier mois
- [ ] Aucun écart inventaire >5% (ou écart documenté + enquêté)
- [ ] Tu as ajouté ≥3 accords mets-vins
- [ ] Tu as proposé une rotation carte au gérant
- [ ] Tu connais les marges cibles : >70% sur boissons

---

> **Prochain doc** : Réceptionniste (réservations chambres + tables + événements + groupes — gros volume saisie).
