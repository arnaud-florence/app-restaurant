# Formation interne — Poste GÉRANT / DIRECTION

> Vue métier — comment le gérant utilise l'app au quotidien pour piloter son restaurant.
> À lire en ~30 min · base pour le contenu Module 27 et les widgets « Tâches du jour ».

---

## 1. Ta mission

**Tu es responsable de la rentabilité, de la qualité et de la conformité du restaurant.** L'app n'est pas un outil de saisie pour toi — c'est ton **tableau de bord de pilotage**. Tu y consultes les chiffres, tu prends les décisions, tu valides les actions de l'équipe.

Tes 3 priorités quotidiennes :

1. **Argent** : CA, food cost, masse salariale, trésorerie
2. **Conformité** : hygiène, légal, RH, contrôles obligatoires
3. **Équipe** : moral, planning, formations, communication

Tu as **accès à tous les modules** sans restriction. Tu personnalises au besoin les droits des autres employés via `/admin/rh` → édition employé → 🔐 Accès personnalisés.

---

## 2. Routine quotidienne — par moment de la journée

### 🌅 7h30 - 9h30 — Avant l'ouverture

**Objectif : démarrer la journée en sachant où tu en es.**

#### a) Check matinal sur ton téléphone (≤5 min)

Ouvre la PWA installée sur ton téléphone (icône 🟢). Tu atterris sur **`/admin/pilotage`** — le dashboard 10 KPIs.

Regarde 4 chiffres-clés :

| KPI | Seuil OK | Action si rouge |
|---|---|---|
| **CA mois cumulé** | sur la trajectoire de l'objectif mensuel défini | si en retard >10% : ajuster les promos ou la charte du jour |
| **Food cost moyen** | < 28% (vert) · 28-32% (orange) · > 32% (rouge) | retirer les plats rouges du menu, audit fournisseurs |
| **Masse salariale / CA** | < 32% (vert) · 32-35% (orange) · > 35% (rouge) | revoir le planning du jour, lisser les heures sup |
| **NC ouvertes** | 0 (idéal) · 1-3 (acceptable) · >3 (urgent) | dispatcher dans l'équipe avant ouverture |

#### b) Lire l'assistant IA

Va sur **`/admin/assistant`** → bandeau « Actions prioritaires du jour ».

L'assistant identifie automatiquement les 3 anomalies les plus urgentes (NC critique, lots DLC <24h, food cost rouge, etc.) avec l'action suggérée. Si tu vois une carte rouge : action **avant** l'ouverture.

Si rien d'urgent, pose-lui une question libre type :
- *« Comment va mon CA cette semaine vs la semaine dernière ? »*
- *« Quels plats je devrais mettre en avant ce midi ? »*
- *« Ai-je des employés en heures sup à signaler ? »*

#### c) Consulter le prévisionnel

Va sur **`/admin/previsionnel`**. Tu y vois la météo du jour et le CA prévisionnel basé sur la régression linéaire météo × historique.

Si tempête / canicule prévue : alerte l'équipe (planning, stock préparé). Le module suggère automatiquement des ajustements.

#### d) Vérifier les réservations & événements du jour

**`/admin/reservations`** → onglet Tables → date du jour. Combien de couverts annoncés ? Quels groupes ? Quels événements en cours ?

Si un groupe gros volume arrive : prévenir cuisine et bar la veille (dans `/equipes` chat ou via SMS).

---

### 🍽️ 9h30 - 12h00 — Pré-service

**Objectif : tout est prêt pour ouvrir.**

#### a) Briefing équipe

Va sur **`/equipes`** (Module 10). Poste un message dans le canal général : événement du jour, plat à pousser, allergène à signaler, etc.

#### b) Vérifier l'hygiène

**`/admin/hygiene`** → check rapide :
- Le relevé de température du matin a-t-il été fait ? (par le cuisinier normalement)
- Lots à DLC < 24h ? Dispatcher dans la carte du jour
- NC ouvertes : qui les traite ?

Si la cuisine n'a pas saisi le relevé température avant 11h : aller la voir / demander dans le chat équipe.

#### c) Activer le menu du jour sur la TV salle

**`/admin/affichage`** → onglet « Menu du jour » → ajouter / activer les plats. La TV salle (`/affichage/tv`) se met à jour automatiquement (Realtime).

---

### 🍴 12h00 - 15h00 — Service midi

**Objectif : surveiller, intervenir si besoin, ne pas micro-manager.**

Pendant le service, **tu ne saisis rien dans l'app — tu observes**. Garde ton téléphone ouvert sur :

- **`/serveur`** ou **`/admin/pilotage`** pour suivre le rythme
- Tu vois en temps réel les commandes, les tables occupées, les appels serveur (Module 26 — bandeau rouge avec son d'alerte)

Si une **non-conformité critique** apparaît (NC créée par le cuisinier après un relevé température hors plage), tu reçois la notification dans `/admin/hygiene` (réactualisation).

À la fin du service midi (~14h30) :

- Va sur **`/caisse`** → vérifier le Z-report du midi : CA midi, méthodes paiement, écarts (s'il y a un écart entre fond théorique et réel : enquêter)

---

### ⏸️ 15h00 - 18h00 — Inter-services

**Objectif : analyser le service midi, préparer le soir.**

#### a) Analyser le midi

Va sur **`/admin/finances`** → semaine en cours. Compare le CA midi à la moyenne des 7 derniers jours. Anomalie ?

Va sur **`/admin/recettes`** onglet Engineering — quels plats ont été le plus vendus ? Lesquels traînent ? Décide si tu retires un plat « dog » (faible vente, faible marge) du menu.

#### b) Action sur le journal de bord

**`/admin/journal`** : crée une entrée pour le service midi. Note l'humeur du service (très bonne / bonne / normale / difficile / très difficile), un fait marquant, une photo si pertinente. Cette donnée alimente les analyses 6 mois (corrélation humeur × CA × météo).

**Cette saisie est OBLIGATOIRE quotidiennement — sans elle, le module 23 ne sert à rien.**

#### c) Reposer / déléguer

C'est le moment le plus calme. Profite pour :
- Vérifier les **factures fournisseurs à payer** (`/admin/fournisseurs`) : 2-3 par semaine en moyenne
- Valider les **demandes de congés** en attente (`/admin/rh` onglet Congés)
- Répondre aux **réclamations clients** (`/admin/clients` onglet Réclamations) — réponse sous 48h

---

### 🌙 18h00 - 23h00 — Service soir

Même principe que le midi. Surveille, n'intervient que si besoin.

À noter : le service soir est plus lourd en :
- Bar (plus de boissons → bottoming-up des stocks à surveiller)
- Allergènes (clients plus diversifiés le soir)
- Réclamations (les clients soir sont plus exigeants)

---

### 🌃 23h00 - 00h00 — Clôture quotidienne

**Objectif : la journée est tracée, le pilotage est nourri.**

#### a) Z-report final + dépôt caisse

**`/caisse`** → fermeture de session. Comparer le fond théorique (encaisse - retraits) au fond réel compté physique. Écart ? Note dans le journal.

#### b) Journal de bord (suite ou nouvelle entrée)

Si tu as déjà saisi une entrée midi, modifie-la. Sinon, nouvelle entrée pour la journée complète. Ajoute :
- Humeur globale
- Faits marquants (avis Google reçu, panne, événement spécial)
- Photos (vue salle, plat du jour, équipe)

#### c) Vérification rapide

**`/admin/pilotage`** : recharger. Le CA du jour est-il dans la cible ? Le food cost moyen toujours OK (les nouvelles recettes saisies aujourd'hui ont mis à jour ce KPI) ?

**Données obligatoires saisies aujourd'hui** :
- ✅ Au moins 1 relevé de température (cuisine)
- ✅ Au moins 1 entrée journal (toi)
- ✅ Z-report caisse fermé (caisse)
- ✅ Pointage employés clos (RH)

Si une de ces 4 données manque : la qualité du pilotage demain sera dégradée.

---

## 3. Routine hebdomadaire (souvent le lundi matin)

| Jour | Tâche | Module | Durée |
|---|---|---|---|
| Lundi 9h | Plan d'action de la semaine | `/admin/pilotage` onglet Plan d'action (kanban) | 20 min |
| Lundi 9h30 | Validation planning RH | `/admin/rh` onglet Planning | 30 min |
| Lundi 10h | Revue prévisionnel 7 jours | `/admin/previsionnel` | 15 min |
| Mardi | Audit allergènes (mise à jour menu) | `/admin/allergenes` | 20 min |
| Mercredi | Réception fournisseurs (commandes hebdo) | `/admin/fournisseurs` onglet Bons | 30 min |
| Jeudi | Suivi formation équipe | `/admin/formation` onglet Progressions | 15 min |
| Vendredi | Préparation week-end (stocks, événements) | `/admin/reservations`, `/admin/groupes` | 30 min |
| Dimanche soir | Bilan de la semaine | `/admin/finances` + `/admin/journal` analyse 6 mois | 45 min |

**Total : ~3h/semaine de pilotage stratégique**, hors temps de présence physique.

---

## 4. Routine mensuelle (1ère semaine du mois)

### a) Clôture comptable du mois précédent

**`/admin/finances`** → Compte de résultat → exporter le rapport PDF mensuel. Envoyer au comptable.

Vérifier dans le rapport :
- CA total HT et TTC
- Food cost réel sur la période
- Masse salariale calculée (pointages × salaire horaire)
- TVA collectée et déductible
- Trésorerie 30/60/90j

### b) Définir les objectifs du mois

**`/admin/pilotage`** → cliquer sur 🎯 dans chaque carte KPI → définir l'objectif chiffré pour le mois en cours.

Exemple : objectif CA = 35 000 € · objectif food cost ≤ 28% · objectif masse sal ≤ 32%.

### c) Paie

**`/admin/rh`** onglet Paie → consulter le ratio masse salariale / CA. Lancer la paie chez le comptable.

### d) Audit hygiène

**`/admin/hygiene`** → onglet Plan HACCP → cocher le contrôle mensuel. Vérifier que tous les contrôles obligatoires (extincteurs, hotte, etc.) sont à jour dans `/admin/maintenance`.

### e) Plan formation

**`/admin/formation`** onglet Progressions → identifier les employés qui n'ont pas terminé leur guide poste. Programmer 1h de formation interne par semaine.

### f) Sauvegarde manuelle

**`/admin/securite`** onglet Sauvegarde → télécharger le JSON. Stocker sur disque externe ou cloud personnel. Une fois par mois minimum.

---

## 5. Indicateurs à surveiller — référentiel rapide

### Vert / Orange / Rouge

| Indicateur | Seuil VERT | Seuil ORANGE | Seuil ROUGE |
|---|---|---|---|
| Food cost moyen | < 28% | 28-32% | > 32% |
| Masse salariale / CA | < 32% | 32-35% | > 35% |
| Marge brute | > 65% | 60-65% | < 60% |
| Taux remplissage | > 70% | 50-70% | < 50% |
| NC hygiène ouvertes | 0 | 1-3 | > 3 |
| Score satisfaction | > 90% | 75-90% | < 75% |
| Marge plat (food cost ≥ 30%) | nb < 5% des plats | 5-15% | > 15% |
| Lots DLC < 24h | 0-1 | 2-5 | > 5 |
| Obligations légales expirées | 0 | 0 | ≥ 1 |

### KPIs sans seuil (à comparer dans le temps)

- CA mois (vs N-1, vs objectif défini)
- Ticket moyen (€/couvert)
- Énergie / couvert (kWh, à benchmarker)

---

## 6. Données critiques à saisir — référentiel quotidien / hebdo / mensuel

### Saisies QUOTIDIENNES obligatoires (par TOI ou délégué)

- [ ] **Journal de bord** — 1 entrée minimum (humeur + 1-2 lignes) — `/admin/journal`
- [ ] **Validation Z-report caisse** — vérifier l'écart théorique/réel chaque soir — `/caisse`

### Saisies QUOTIDIENNES par d'autres postes (à superviser)

- [ ] Relevés température cuisine — 2× par jour (matin + soir) — cuisine via `/admin/hygiene`
- [ ] Pointage entrée/sortie employés — `/admin/rh` (auto via tablette)
- [ ] Pesée déchets en fin de service — `/admin/dechets`
- [ ] Tickets clients encaissés — auto via `/caisse`

### Saisies HEBDOMADAIRES

- [ ] Plan d'action — actions stratégiques semaine — `/admin/pilotage`
- [ ] Validation planning équipe — `/admin/rh`
- [ ] Bon de commande fournisseurs — `/admin/fournisseurs`
- [ ] Vérification factures à payer — `/admin/finances`

### Saisies MENSUELLES

- [ ] Objectifs KPI du mois — `/admin/pilotage`
- [ ] Relevés énergie (compteurs) — `/admin/energie`
- [ ] Pesée stock complet (inventaire) — `/admin/stock` onglet Inventaire
- [ ] Audit allergènes (mise à jour si nouveau plat) — `/admin/allergenes`
- [ ] Sauvegarde JSON locale — `/admin/securite`

---

## 7. Aide à la décision — que faire si...

### Le food cost grimpe au-dessus de 32% sur un plat

1. Va sur `/admin/recettes` → ouvre la recette → vérifier les coûts ingrédients
2. `/admin/fournisseurs` → un fournisseur a-t-il augmenté ses prix ? (alerte automatique au-dessus de +5%)
3. Si oui : changer fournisseur OU repricer le plat OU le retirer du menu
4. Saisir une action dans `/admin/pilotage` plan d'action

### Une non-conformité critique apparaît (HACCP)

1. **Action immédiate** physique (jeter le lot, isoler la zone)
2. `/admin/hygiene` → ouvrir la NC → décrire l'action curative
3. Décider : modification du process ou formation employé ?
4. Si récurrence : `/admin/formation` → créer un guide pizza/cuisine adapté

### La masse salariale dépasse 35% du CA

1. `/admin/rh` onglet Planning → vérifier les heures sup
2. Décider : recadrer les shifts ou accepter le coût (haute saison ?)
3. `/admin/pilotage` → définir un objectif masse salariale plus serré le mois prochain

### Un employé n'a pas terminé sa formation depuis >2 semaines

1. `/admin/formation` onglet Progressions → identifier l'employé
2. `/equipes` → lui poster un message rappel
3. Bloquer 30 min lors d'un service calme pour le former en présentiel

### Le CA baisse de >15% vs N-1 sur 7 jours

1. `/admin/assistant` → poser la question libre : *« Pourquoi le CA est-il en baisse cette semaine ? »*
2. Croiser avec `/admin/journal` (humeurs des jours concernés) et `/admin/previsionnel` (météo)
3. Vérifier `/admin/clients` réclamations / retours plats récents
4. Si tendance de fond : campagne CRM (`/admin/clients` → Campagnes)

---

## 8. Mapping rapide — où dans l'app pour quoi

| Je veux… | Aller sur |
|---|---|
| Voir mes KPIs en un coup d'œil | `/admin/pilotage` |
| Poser une question libre à l'assistant IA | `/admin/assistant` |
| Saisir mon journal de bord | `/admin/journal` |
| Voir le CA détaillé | `/admin/finances` |
| Gérer l'équipe (planning, paie, formations) | `/admin/rh` |
| Voir / valider les réservations | `/admin/reservations` |
| Définir un événement privatisé | `/admin/reservations` onglet Événements |
| Mettre à jour le menu du jour TV salle | `/admin/affichage` |
| Auditer l'hygiène (NC, contrôles) | `/admin/hygiene` |
| Personnaliser les droits d'un employé | `/admin/rh` → édition employé → 🔐 Accès personnalisés |
| Activer ma 2FA | `/admin/securite` onglet 2FA |
| Sauvegarder une copie locale des données | `/admin/securite` onglet Sauvegarde |
| Configurer le restaurant initial (tables, etc.) | `/admin/setup` |
| Imprimer un Z-report ou une facture | bouton 🖨️ depuis chaque page concernée |
| Suivre la formation de l'équipe | `/admin/formation` onglet Progressions |
| Voir les retours et réclamations clients | `/admin/clients` |

---

## 9. Pièges classiques à éviter

1. **Ne pas saisir le journal de bord** → pas d'analyse 6 mois → tu pilotes à l'aveugle
2. **Reporter les NC d'hygiène** → risque légal en cas de contrôle DDPP / AFSCA
3. **Laisser les heures sup s'accumuler sans suivi** → choc de paie en fin de mois
4. **Ne pas définir d'objectifs mensuels** → les KPIs sont neutres, pas de motivation équipe
5. **Ne pas faire la sauvegarde mensuelle** → si Supabase a une panne majeure, données perdues
6. **Activer la 2FA seulement après avoir oublié les codes de secours** → tu te bloques toi-même

---

## 10. Suivi de ta propre formation à l'app

Coche au fur et à mesure :

### Semaine 1
- [ ] Compte créé, 2FA activée, sauvegarde JSON téléchargée
- [ ] Configuration `/admin/setup` complétée (tables, employés initiaux)
- [ ] 1ʳᵉ entrée journal saisie
- [ ] 1ʳᵉ recette créée et testée en service

### Semaine 2
- [ ] Tous les employés créés dans `/admin/rh` avec leur poste correct
- [ ] Permissions personnalisées vérifiées pour chaque employé
- [ ] Plan d'action de la semaine en place (`/admin/pilotage`)
- [ ] Premier rapport mensuel exporté (`/admin/finances` → rapport)

### Semaine 4
- [ ] Routine quotidienne intégrée (check 5 min matin)
- [ ] Routine hebdo intégrée (lundi 9h)
- [ ] Routine mensuelle planifiée

### Mois 3
- [ ] Tu utilises l'assistant IA au moins 3× par semaine
- [ ] Tu as paramétré tes objectifs mensuels et les tiens
- [ ] L'équipe a >80% de progression formation Module 27
- [ ] Tu as nourri le journal de bord ≥80% des jours

---

> **Prochaine étape** : ce document deviendra (a) un guide imprimable PDF, (b) le contenu du Module 27 → Guide « Gérant », (c) la base d'un widget « Tâches du jour » sur `/admin/pilotage` qui rappelle automatiquement ce qu'il faut faire selon le moment de la journée.
