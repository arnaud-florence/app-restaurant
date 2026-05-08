# Formation interne — Poste PIZZAIOLO

> Vue métier — comment le pizzaiolo utilise l'app au quotidien.
> À lire en ~15 min · base pour Module 27 et widgets.
> ⚠️ Ce doc complète **03-cuisinier.md** (HACCP, températures, déchets — applique tout pareil). Ici on couvre uniquement les spécificités pizzaiolo.

---

## 1. Ta mission

Tu travailles **uniquement sur la pizza** : pâte, garniture, four. L'app a une vue dédiée pour toi qui filtre tout au domaine pizza :

- Sur `/cuisine?role=pizzaiolo`, tu ne vois **que la colonne pizza** (pas la cuisine principale qui te distrait pas)
- Sur `/admin/recettes`, `/admin/ingredients`, `/admin/stock`, `/admin/allergenes` → **filtrés sur PIZZA** automatiquement
- Pas de bottom nav 4-boutons sur ta vue (tu n'as pas à naviguer entre postes)

**L'idée** : tu es focalisé sur ton produit. L'app te masque tout ce qui n'est pas pizza pour pas te disperser.

---

## 2. Ton URL à bookmarker

Sur ta tablette / écran cuisine, **bookmark UNIQUEMENT** :

```
https://[ton-domaine]/cuisine?role=pizzaiolo
```

⚠️ **Ne supprime pas le `?role=pizzaiolo`.** Sans ce paramètre, tu vois aussi la colonne CUISINE — pas grave mais ta vue est moins concentrée.

Le manager peut aussi te donner un lien direct depuis la page TV salle pour basculer rapidement entre vue pizzaiolo et vue cuisine complète.

---

## 3. Tes accès dans l'app

Mêmes accès que le **cuisinier** sauf que tout est **filtré PIZZA** :

| Page | Mode | Filtre PIZZA |
|---|---|---|
| **`/cuisine?role=pizzaiolo`** | ÉCRITURE | ✅ Colonne PIZZA uniquement |
| **`/admin/hygiene`** | ÉCRITURE | Pas de filtre (toutes zones) |
| **`/admin/stock`** | ÉCRITURE | ✅ Ingrédients pizza uniquement |
| **`/admin/dechets`** | ÉCRITURE | Pas de filtre |
| **`/admin/recettes`** | 👁 LECTURE | ✅ Recettes PIZZA uniquement |
| **`/admin/ingredients`** | 👁 LECTURE | ✅ Ingrédients pizza uniquement |
| **`/admin/allergenes`** | 👁 LECTURE | ✅ Plats PIZZA uniquement |
| **`/equipes`** | ÉCRITURE | Pas de filtre |
| **`/admin/formation`** | ÉCRITURE | Pas de filtre |

**Tu n'as PAS accès à** : finances, RH (sauf pointage), réservations, sécurité, configuration, fournisseurs, boissons. Idem cuisinier.

---

## 4. Routine quotidienne — par moment

### 🌅 Prise de poste

**Spécificités pizza** par rapport au cuisinier classique :

#### a) Vérification de la pâte

**La pâte = ton produit le plus sensible.**

- Pâte fraîche du jour ou de la veille ? Vérifie la **DLC** (généralement 24-48h selon ta recette)
- `/admin/hygiene` → onglet **Lots produits** → filtre « pâte pizza » ou ton terme
- Si la pâte arrive en fin de DLC : décide
  - L'utiliser intégralement aujourd'hui (priorité absolue)
  - La jeter si elle est à risque (saisie dans `/admin/dechets`)
  - **NE JAMAIS** servir une pâte hors DLC

#### b) Allumage du four (HACCP critique)

Le four à pizza monte généralement à **400-500°C**. Cette montée prend 30-90 min.

⚠️ **Tu dois saisir un relevé température du four** une fois en régime :

`/admin/hygiene` → onglet Relevés température → équipement « Four pizza » → noter la température affichée.

Si température en deçà de la cible (ex 380°C alors que la norme maison dit ≥420°C) : NC automatique → ajuster le réglage / appeler le frigoriste / pizzaiolo de service.

#### c) Vérification des ingrédients pizza

`/admin/ingredients` (lecture seule, filtré pizza) → balayage rapide :
- Mozzarella : DLC ?
- Tomate / sauce : DLC ?
- Basilic : frais ?
- Charcuteries (jambon, chorizo, pepperoni) : DLC ?

Tu ne peux pas modifier les ingrédients (lecture seule). Si stock bas / DLC critique : signale dans `/equipes` ou en personne au cuisinier/gérant.

#### d) Checklist hygiène cuisine — ouverture

Idem cuisinier mais avec items pizzaiolo en plus :
- Banc à pâte propre + désinfecté
- Four allumé + en montée température
- Spatule, écumoir, pelle propres
- Mozzarella râpée préparée
- Sauce tomate prête
- Saisie : `/admin/hygiene` Checklists → cocher

---

### 🍴 Pendant le service

#### Recevoir une commande pizza

Sur `/cuisine?role=pizzaiolo` (vue dédiée) → la **colonne PIZZA** affiche toutes les commandes pizza en temps réel.

**Tu n'es pas dérangé par les commandes cuisine principale** (qui n'apparaissent pas dans ta vue).

Workflow standard :
1. **`en_attente`** par défaut quand le serveur envoie
2. **`en_preparation`** → tap sur le plat → bouton « 🔥 En préparation » dès que tu commences à étaler la pâte
3. **`pret`** → tap sur le plat → bouton « ✅ Prêt » dès que la pizza sort du four

⚠️ **Allergènes pizza** : la pizza est un piège fréquent côté allergie :
- **Gluten** : la pâte = gluten, sauf si tu as une option pâte sans gluten signalée
- **Lactose** : la mozzarella + le parmesan
- **Œuf** : sur certaines garnitures (carbonara, capricciosa)
- **Fruits à coque** : pesto avec pignons

Si la commande affiche un allergène en rouge → vérifie `/admin/allergenes` (lecture, filtré pizza) avant de cuire. Si la pizza ne peut pas être faite sans l'allergène (ex : sans-gluten alors que tu n'as pas de pâte sans gluten) → refuse et préviens le serveur.

#### Pendant la cuisson (1-3 min selon four)

- Tu peux préparer la commande suivante en parallèle (étaler pâte n+1)
- Garde l'œil sur la cuisson — un sur-cuit = retour client

#### Sortie de stock manuelle (rarement)

Si tu utilises beaucoup d'un ingrédient (ex : tu prépares une fournée de sauce tomate pour la journée), tu peux saisir une sortie manuelle :

`/admin/stock` (filtré pizza) → bouton + Sortie → ingrédient + quantité.

⚠️ **L'app déduit automatiquement les ingrédients à la sortie « servi » de chaque pizza.** Pas besoin de saisir manuellement pour chaque pizza.

---

### ⏸️ Inter-services

Spécificités pizza :

- **Préparation pâte du lendemain** : si tu pétris ce soir pour demain, **saisis un nouveau lot** dans `/admin/hygiene` Lots produits avec :
  - Produit : « Pâte pizza maison »
  - DLC : J+1 ou J+2 selon ta recette
  - Note : « Préparée le [date], pour service du [date+1] »
- Vérification four : nettoyage rapide des résidus de farine, vérifier que les briques sont OK

---

### 🌃 Fin de service

#### a) Relevé température four (soir)

`/admin/hygiene` → relevé température four → noter la température en fin de service.

⚠️ **Pas obligatoire de saisir un four froid** (température ambiante) — saisis avant l'extinction si possible.

#### b) Vérification lots pâte restante

S'il te reste de la pâte non utilisée :
- Si DLC tient encore demain → garde au frigo, marque dans `/admin/hygiene` Lots → statut « en_stock »
- Si DLC dépassée demain → jet, marque le lot « jeté » + saisie dans `/admin/dechets`

#### c) Pesée déchets pizza

`/admin/dechets` → pesée :
- Restes de pâte (poids)
- Cartons emballage farine / mozzarella
- Résidus garniture

#### d) Checklist fermeture

`/admin/hygiene` Checklists → « Fermeture cuisine » (la même que le cuisinier — il n'y a pas de checklist pizzaiolo dédiée pour l'instant). Coche les items pizza :
- Banc à pâte nettoyé
- Four nettoyé (cendres / résidus)
- Pelle, spatule lavées
- Réserve d'ingrédients pizza rangée

#### e) Pointage sortie

Tablette ou `/admin/rh`.

---

## 5. Données que TU saisis

### Saisies quotidiennes

| Saisie | Module | Fréquence |
|---|---|---|
| Statut commandes pizza | `/cuisine?role=pizzaiolo` | Continu |
| Relevé température four | `/admin/hygiene` | 2× / jour |
| Lot pâte (préparation) | `/admin/hygiene` Lots | À chaque préparation |
| Statut lot pâte (consommé / jeté) | `/admin/hygiene` Lots | Fin de service |
| Pesée déchets | `/admin/dechets` | 1× / soir |
| Checklist hygiène | `/admin/hygiene` | Ouverture + fermeture |
| Pointage | `/admin/rh` | 1× / shift |

### Lecture (consulter, pas modifier)

- Recettes pizza disponibles : `/admin/recettes` (filtré PIZZA)
- Allergènes par pizza : `/admin/allergenes` (filtré PIZZA)
- Stock ingrédients pizza : `/admin/ingredients` (filtré pizza)

---

## 6. Spécificités four à pizza

Le four à pizza est ton outil principal. Il a des règles de température différentes des fours classiques :

| Critère | Cible (pizza napolitaine traditionnelle) | Action si hors plage |
|---|---|---|
| Température dôme | 430-480°C | Si <400°C : pizza pas correctement cuite, ajuster le brûleur |
| Température sole | 380-450°C | Si trop bas : sole humide, fond pas cuit |
| Cuisson | 60-90 sec | Au-delà de 2 min : carbonisation |
| Refroidissement nocturne | Naturel (porte fermée) | Pas de refroidissement forcé |

⚠️ **Si tu remarques une variation anormale** (ex : le four met 60 min à monter alors que d'habitude 30 min) :
1. Note dans le relevé température
2. Crée une NC manuelle dans `/admin/hygiene` → type « Équipement »
3. Préviens le manager → il appelle le frigoriste / fumiste

---

## 7. Aide à la décision — pizza-spécifique

### La pâte est trop molle / trop dure

1. **Identifie la cause** : température salle, hydratation, repos insuffisant
2. Adapte la prochaine fournée
3. **Note** dans `/equipes` chat cuisine pour discussion équipe
4. Si récurrent → propose une mise à jour de la recette au gérant (qui modifiera dans `/admin/recettes`)

### Le four ne monte pas en température

1. Vérifie la cuve à gaz / bouteille (si gaz)
2. Vérifie le brûleur (résidus à nettoyer ?)
3. Saisis le relevé tel quel (avec température basse) → l'app crée NC critique
4. Préviens le manager **AVANT** l'ouverture si possible — sinon la pizza sera mal cuite

### Une commande pizza vient avec un allergène GLUTEN signalé

1. **Tu n'as pas de pâte sans gluten** → REFUSE le plat. Préviens le serveur immédiatement.
2. **Tu as de la pâte sans gluten** :
   - Utilise une planche / une pelle / un poste de travail SÉPARÉS
   - Lave-toi les mains entre 2 préparations
   - Ne mélange pas les farines
3. Saisis bien l'allergène coché côté serveur (la commande arrive avec le rouge bien visible chez toi)

### Tu manques d'un ingrédient critique en plein service

1. **Préviens le serveur** immédiatement (par chat ou en personne) → il prévient les clients pour adapter
2. Si gros volume : prévient aussi le manager
3. **Note** dans `/equipes` chat → le manager passe commande
4. Si tu as une alternative correcte (ex : roquette à la place du basilic), propose-la au serveur pour validation client

---

## 8. Pièges classiques

1. **Bookmark `/cuisine` au lieu de `/cuisine?role=pizzaiolo`** → tu vois la colonne CUISINE qui te distrait
2. **Ne pas saisir le lot de pâte quand tu prépares** → quand un client se plaint, pas de traçabilité
3. **Servir une pizza avec une pâte hors DLC** par flemme → risque sanitaire
4. **Sauter le relevé température four** parce que « il est toujours à 450°C » → conformité HACCP en miettes en cas de panne
5. **Mélanger pâte gluten et sans-gluten sur le même banc** → procès si réaction allergique
6. **Marquer « prêt » avant que la pizza soit cuite** parce que le serveur stresse → pizza pas cuite, retour client

---

## 9. Mapping rapide pizzaiolo

| Je veux… | Aller sur |
|---|---|
| Voir mes commandes pizza | `/cuisine?role=pizzaiolo` |
| Marquer une pizza en cours | tap pizza → 🔥 En préparation |
| Marquer une pizza prête | tap pizza → ✅ Prêt |
| Saisir relevé température four | `/admin/hygiene` Relevés |
| Saisir un lot de pâte | `/admin/hygiene` Lots |
| Cocher hygiène | `/admin/hygiene` Checklists |
| Vérifier les pizzas du menu | `/admin/recettes` (filtré PIZZA) |
| Vérifier allergènes d'une pizza | `/admin/allergenes` (filtré PIZZA) |
| Voir stock mozza / sauce | `/admin/ingredients` (filtré pizza) |
| Peser les déchets | `/admin/dechets` |
| Lire chat équipe | `/equipes` |
| Pointer | tablette ou `/admin/rh` |

---

## 10. Suivi de ta formation

### Premier jour
- [ ] URL bookmarkée : `/cuisine?role=pizzaiolo`
- [ ] Relevé température four matin + soir
- [ ] Préparation pâte saisie comme lot dans `/admin/hygiene`
- [ ] Pizza traitée du début (en_prep) à la fin (prêt)
- [ ] Pesée déchets fin de service

### Première semaine
- [ ] Réflexe relevé température four 2×/jour
- [ ] Saisie systématique des lots pâte
- [ ] Tu vérifies les allergènes pizza dans le catalogue (filtré PIZZA)
- [ ] Tu maîtrises la nomenclature interne (ex : « Margherita » = code XX)
- [ ] Tu as fini ton guide formation Module 27

### Premier mois
- [ ] Aucun relevé four manqué (vérifié manager)
- [ ] Aucune pizza servie hors DLC pâte
- [ ] Tu remontes les anomalies équipement (four, banc, pétrin)
- [ ] Tu connais les températures cibles four (430-480°C dôme)

---

> **Prochain doc** : Barman (`/bar` + filtre BAR + boissons écriture).
