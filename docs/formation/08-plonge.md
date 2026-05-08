# Formation interne — Poste PLONGE / EXTRA

> Vue métier — comment le plongeur (ou l'extra polyvalent) utilise l'app au quotidien.
> À lire en ~10 min · base pour Module 27 et widgets.

---

## 1. Ta mission

Tu es **le pilier invisible du resto** : sans toi, la cuisine s'engorge, les serveurs n'ont plus de couverts, les sols glissent. Côté app, tu as **très peu de saisie** mais elle est critique :

1. **Cocher les checklists de nettoyage** — preuve de conformité HACCP
2. **Saisir la pesée des déchets** — alimente le KPI gaspillage du gérant

C'est tout. Pas de finance, pas de RH, pas de recettes. **Concentre-toi sur le concret terrain.**

---

## 2. Tes accès dans l'app

| Page | Mode | Ce que tu fais |
|---|---|---|
| **`/admin/hygiene`** | ÉCRITURE (checklists nettoyage) | Cocher les checklists ouverture / fermeture / hebdo |
| **`/admin/dechets`** | ÉCRITURE | Pesée fin de service |
| **`/equipes`** | ÉCRITURE | Chat équipe (questions, alertes) |
| **`/admin/formation`** | ÉCRITURE | Tes guides + ton avancement |

**Tu n'as PAS accès à** : aucune autre page. C'est volontaire — tu te concentres sur tes tâches sans perdre de temps.

Page d'accueil par défaut : **`/admin/hygiene`**.

---

## 3. Routine quotidienne

### 🌅 Prise de poste (5 min)

1. **Pointer ton arrivée** : tablette à l'entrée OU `/admin/rh` (si tu y as accès).
2. **Lire le chat équipe** : `/equipes` → canal général. Si un message t'est destiné, réponds.
3. **Vérifier la liste des tâches du jour** : si le second / gérant a posté un brief « plonge » dans `/equipes`, lis-le.

### 🍴 Pendant le service

**Pas de saisie pendant le service.** Tu fais la plonge, le rangement, l'aide au cuisinier si besoin.

Si tu as une question / un problème (machine en panne, manque de produit) → poste un message rapide dans `/equipes`.

### 🌃 Fin de service / fin de shift

#### a) Cocher la checklist nettoyage

`/admin/hygiene` → onglet **Checklists** → choisir « Fermeture cuisine » ou la checklist nettoyage spécifique du jour.

Items typiques (à cocher au fur et à mesure que tu fais le nettoyage) :
- ✅ Plonge faite et rangée
- ✅ Lave-vaisselle vidé + filtre nettoyé
- ✅ Plans de travail dégraissés et désinfectés
- ✅ Sols mousse + serpillère
- ✅ Poubelles vidées et sacs neufs
- ✅ Hotte filtrée + bac à graisse vidé (1× / semaine)
- ✅ Frigos extérieur essuyé (joints OK)
- ✅ Coin plonge nettoyé

⚠️ **Tu coches AU FUR ET À MESURE**, pas en bloc à la fin. Si tu coches tout sans avoir fait, c'est de la fraude. En cas de contrôle DDPP/AFSCA, l'historique des checklists est vérifié.

#### b) Pesée des déchets

`/admin/dechets` → bouton **+ Nouvelle pesée**.

Pour chaque catégorie, pèse (balance dédiée à la sortie poubelle) :

| Catégorie | Estimation typique |
|---|---|
| 🥬 Bio (épluchures, restes plats) | 5-15 kg / jour |
| 🥖 Pain rassis | 1-3 kg |
| 🍷 Verre (bouteilles vides + casses) | 3-8 kg |
| 🥫 Emballages cartons | 2-5 kg |
| 🧴 Huile usagée | quand bidon plein |

L'app calcule automatiquement le **coût du gaspillage** en € (basé sur le coût d'achat des ingrédients perdus côté bio). Cette donnée alimente le KPI gérant.

⚠️ **Cette pesée est obligatoire chaque soir.** Sans elle, le rapport annuel obligatoire (déclaration tri à la source — Loi AGEC) n'est pas crédible.

#### c) Sortie des poubelles

Pas dans l'app — physique. Mais à faire chaque soir : containers extérieurs, emplacements respectés selon les jours de collecte.

#### d) Pointage sortie

Tablette ou `/admin/rh`.

---

## 4. Routine hebdomadaire

| Jour | Tâche supplémentaire |
|---|---|
| Lundi | Grand nettoyage hotte + bac à graisses (cocher dans checklist hebdo `/admin/hygiene`) |
| Mercredi | Nettoyage chambre froide / réserve sèche |
| Vendredi | Détartrage lave-vaisselle |
| Dimanche | Récapitulatif déchets de la semaine (vue analytique `/admin/dechets`) |

---

## 5. Données que TU saisis

### Saisies QUOTIDIENNES obligatoires

| Saisie | Module | Fréquence | Impact |
|---|---|---|---|
| Checklist nettoyage cuisine | `/admin/hygiene` Checklists | 1× / jour (fermeture) | Conformité HACCP |
| Pesée déchets | `/admin/dechets` | 1× / jour (fin service soir) | KPI gaspillage gérant + rapport annuel obligatoire |
| Pointage entrée + sortie | `/admin/rh` ou tablette | 1× / shift | Masse salariale |

### Saisies HEBDOMADAIRES

| Saisie | Module | Fréquence |
|---|---|---|
| Checklist hebdomadaire (hotte, chambre froide, etc.) | `/admin/hygiene` Checklists | 1× / semaine |

### Saisies que tu ne fais PAS

Tout le reste. Tu n'as pas à toucher aux recettes, ingrédients, factures, RH, etc. **Reste dans ton périmètre.**

---

## 6. Les 3 réflexes du plongeur

1. **Cocher AU FUR ET À MESURE.** Pas de fraude — si tu coches sans avoir fait, c'est documenté et l'historique est vérifiable en cas de contrôle.

2. **Pesée déchets quotidienne.** Sans elle, le gérant pilote à l'aveugle son KPI gaspillage. C'est aussi obligation légale (Loi AGEC).

3. **Si quelque chose ne marche pas, signale.** Une machine en panne, un produit manquant, une zone glissante → message rapide dans `/equipes`. Ne le garde pas pour toi.

---

## 7. Aide à la décision — plonge-spécifique

### Le lave-vaisselle est en panne en plein service

1. **Préviens immédiatement** le second / cuisinier via `/equipes` ou en personne
2. **Bascule en plonge manuelle** (eau chaude + détergent + rinçage + désinfection) — c'est lent mais conforme
3. Le gérant appellera le réparateur. Toi, tu continues à servir des couverts propres en plonge manuelle.
4. Une fois résolu : note dans `/admin/hygiene` → NC (Module 11) → catégorie « Équipement », note la durée d'arrêt.

### Tu manques de produit (détergent, sacs poubelle, javel)

1. Note dans `/equipes` chat → le second / gérant passe commande
2. Si urgence : utilise l'alternative disponible (savon de cuisine pour la plonge si plus de détergent — pas idéal mais dépanne)
3. Ne sors pas le produit interdit (eau de javel sur surface alimentaire en présence d'aliments, par exemple)

### Tu casses un objet (verre, assiette, vaisselle)

1. **Sécurise** la zone (tessons en sécurité, sol nettoyé)
2. Saisis dans `/admin/dechets` → catégorie Verre + saisie de la quantité approximative
3. Préviens le second / gérant via `/equipes` (pour suivi du coût matériel)

### Tu as un doute sur un produit (DLC dépassée, odeur suspecte)

1. **NE LE SERS PAS / NE LE GARDE PAS** dans le frigo si la cuisine pourrait l'utiliser par erreur
2. Mets-le de côté et **demande au cuisinier ou second** avant décision
3. Si jeté : saisis dans `/admin/dechets` + note dans `/equipes` (le gérant veut savoir si c'est récurrent)

---

## 8. Pièges classiques

1. **Cocher la checklist sans avoir fait** → fraude documentée, sanction possible si le gérant contrôle
2. **Sauter la pesée déchets** « parce qu'il n'y avait pas grand chose » → KPI faux, rapport annuel incomplet
3. **Ne pas signaler une panne machine** par peur d'être ennuyeux → la cuisine s'engorge, le service plante
4. **Mélanger les déchets** (plastique dans bio, bio dans verre) → tri à la source non conforme = sanction Loi AGEC
5. **Utiliser un produit ménager incorrect** (javel sur surface alimentaire, dégraissant sur acier inox sans protection) → équipement abîmé
6. **Ne pas pointer entrée/sortie** → masse salariale faussée, paie en retard

---

## 9. Mapping rapide plonge

| Je veux… | Aller sur |
|---|---|
| Cocher la checklist du jour | `/admin/hygiene` Checklists |
| Voir les checklists hebdo en attente | `/admin/hygiene` Checklists (filtre semaine) |
| Saisir une pesée déchets | `/admin/dechets` |
| Voir la moyenne déchets de la semaine | `/admin/dechets` (vue analytique) |
| Signaler une panne / un manque | `/equipes` chat |
| Voir mes formations | `/admin/formation` |
| Pointer | tablette ou `/admin/rh` |

---

## 10. Suivi de ta formation

### Premier jour
- [ ] Tu sais où est la balance pour peser les déchets
- [ ] Tu as fait ton 1er coche de checklist nettoyage avec le second
- [ ] Tu as fait ta 1ʳᵉ pesée déchets (toutes catégories)
- [ ] Tu sais utiliser `/equipes` pour signaler

### Première semaine
- [ ] Tu coches systématiquement la checklist en fin de service
- [ ] Tu pèses les déchets chaque soir
- [ ] Tu as fait au moins 1 grand nettoyage hebdo (hotte ou chambre froide)
- [ ] Tu as fini ton guide formation Module 27

### Premier mois
- [ ] Aucun oubli de pesée
- [ ] Aucune checklist non cochée (vérifié par le second)
- [ ] Tu remontes les pannes / manques sans rappel
- [ ] Tu maîtrises les codes de tri (déchets bio / verre / emballages / huile)

---

> **Fin de la collection formation par poste.** Les 8 documents complètent le contenu pour le Module 27 (formation in-app) et serviront de base au widget « Tâches du jour » par poste.
