# Architecture multi-établissement — Restaurant + Fournil

> **Statut : conception (rien n'est déployé).** Document de référence à valider avec l'expert-comptable
> avant exécution. Méthode d'implémentation : migration additive → `tsc` → déploiement → vérif, phase par phase.

## Résumé exécutif

Le projet passe de **mono- à multi-établissement** (Restaurant + Fournil, locaux séparés, exploités par
le même propriétaire pendant plusieurs années, puis **mise en gérance** possible du fournil).

**Bonne nouvelle :** la table `etablissements` existe déjà (migration 0074), avec une ligne par défaut
« Établissement principal » et `is_principal=true`. 17 colonnes `etablissement_id` existent déjà sur les
tables online/marketing. On **étend l'existant**, on ne reconstruit pas.

Principe directeur :
- **Référentiel partagé** : recettes, ingrédients, fournisseurs, employés, formation.
- **Transactionnel scopé** par `etablissement_id` : ventes, stock physique, caisse, planning, finances.
- **Vue consolidée par défaut** pour le propriétaire ; **filtrable par établissement** pour un futur gérant.
- **Couture de séparation propre** dès maintenant → gérance future sans reconstruction.

---

# M0 — Résultats d'audit (confirmé)

Audit lecture seule des 88 migrations (0001→0087, 108 tables). Constats :

| Constat | Détail | Impact |
|---|---|---|
| **Fondation présente** | Table `etablissements` (0074) + 1 ligne « Établissement principal » (`is_principal=true`) | On étend, on ne crée pas |
| **Pas de colonne `type`** | `etablissements` n'a que `is_principal` | Ajouter `type` (restaurant/fournil) |
| **`commandes` DÉJÀ scopé** | `etablissement_id` ajouté + backfillé en 0074 | La table de **ventes** est déjà prête ✅ |
| **`recettes`, `clients` DÉJÀ scopés** | idem | (voir décision design ci-dessous) |
| **9 autres tables déjà scopées** | plats_du_jour, promotions, codes_promo, cartes_cadeaux, capacite_cuisine_par_creneau, avis_publics, posts_marketing | rien à faire dessus |
| **Cœur transactionnel NON scopé** | `sessions_caisse`, `paiements_caisse`, `mouvements_caisse`, `mouvements_stock`, `tables_restaurant`, `planning`, `pointage`, `releves_temperatures`, `charges_fixes`… (confirmé = 0) | **C'est le périmètre M2** |
| **Stock = valeur unique** | `ingredients.stock_actuel / stock_minimum / stock_maximum` (colonnes simples, 0001) | Multi-site → `stocks_etablissement` (M6) |
| **Pattern de backfill validé** | 0074 utilise déjà `where is_principal = true` | On réutilise le même pattern |

**Conséquence : le chantier est encore plus léger que prévu.** La table la plus sensible (`commandes`)
est déjà scopée ; il reste à scoper le **cœur caisse/stock/planning/finances/HACCP** (≈ une vingtaine de
tables) via le pattern additif, plus la table `stocks_etablissement` pour le multi-site.

> **Dépendance technique à retenir (M6) :** le trigger de déduction de stock (Module 7, sur
> `commande_articles → 'servi'`) devra déduire du **bon établissement** via `commande.etablissement_id`
> → `stocks_etablissement`. À adapter lors du passage stock multi-site.

---

# PARTIE A — Schéma de migration `etablissement` (rétro-compatible)

## A.1 — Étendre la table `etablissements`

Elle existe déjà :
```
etablissements(id, nom, slug, adresse, telephone, email, siret, tva_intra,
               horaires_json, actif, is_principal, created_at)
```
Ajouts proposés (additifs, non-cassants) :
```sql
alter table etablissements add column if not exists type text not null default 'restaurant'
  check (type in ('restaurant','fournil','autre'));
-- L'« Établissement principal » existant = le restaurant.
update etablissements set type = 'restaurant' where is_principal = true and type is null;
-- Ajout du fournil (à faire au moment voulu) :
insert into etablissements (nom, slug, type, is_principal)
values ('Fournil', 'fournil', 'fournil', false)
on conflict (slug) do nothing;
```

## A.2 — Classification des 108 tables

> L'inventaire exact des colonnes est l'objet de la **Phase M0 (audit)**. Ci-dessous le classement
> de principe par catégorie.

### 🟦 PARTAGÉ (référentiel — PAS de `etablissement_id`)
`ingredients`, `recettes`, `recette_ingredients`, `boissons`, `accords_mets_boissons`,
`fournisseurs`, `historique_prix_ingredients`, `employes`, `profils`, `documents_employes`,
`certifications`, `badges_employes`, `guides_formation`, `etapes_formation`, `quiz_questions`,
`formations_employes`, `progressions_formation`, `clients`, `procedures_urgence`.

> Nuance : une recette peut n'être **disponible** que dans un établissement (pain = fournil).
> On gère ça par une **table d'association de disponibilité** plutôt que par duplication :
> `recettes_etablissements(recette_id, etablissement_id)` — la recette reste partagée, sa
> *disponibilité à la vente* est scopée.

### 🟧 SCOPÉ (transactionnel — AJOUT de `etablissement_id`)
- **Service / caisse** : `commandes`, `tables_restaurant`, `sessions_caisse`, `paiements_caisse`,
  `mouvements_caisse`, `pourboires_distribution(_lignes)`, `appels_serveur`.
  *(`commande_articles` hérite via `commande_id` — pas besoin de colonne propre.)*
- **Stock** : `mouvements_stock`, `lots_produits` + **nouvelle** `stocks_etablissement` (voir A.4).
- **RH / planning** : `planning`, `pointage`, `conges`, `taches_completees`, `valeurs_saisies_taches`,
  `pourboires_distribution`.
- **Finances** : `charges_fixes`, `charges_fixes_recurrentes`, `charges_variables`, `notes_de_frais`,
  `point_mort_mensuel`, `ventes_journalieres`, `objectifs`, `actions_strategiques`, `config_economique`.
- **HACCP / hygiène** : `releves_temperatures`, `checklists_hygiene`, `plan_nettoyage`,
  `non_conformites`, `interventions_antiparasitaire`, `plans_haccp`.
- **Énergie / maintenance / légal** : `releves_energie`, `equipements`, `materiels`,
  `interventions_maintenance`, `accidents_travail`, `obligations_legales`.
- **Déchets** : `suivi_dechets`, `collectes_dechets`.
- **Salle / affichage** : `menu_du_jour`, `plats_du_jour`, `affichage_infos`, `affichage_promos`,
  `affichages_verifications`.
- **Hôtellerie / événementiel** (Restaurant) : `chambres`, `reservations_chambres`,
  `reservations_tables`, `groupes`, `groupes_menus`, `evenements`.
- **CRM / fidélité / réputation** : `reclamations`, `retours_plats`, `campagnes`, `codes_promo`,
  `promotions`, `cartes_cadeaux`, `mouvements_cartes_cadeaux`, `mouvements_points`, `avis_publics`.
- **Pilotage / agents / journal** : `agent_findings`, `agents_runs`, `journal_entrees`,
  `journal_activite`, `comptes_rendus`.

### 🟩 DÉJÀ scopé (confirmé à l'audit M0)
Ont **déjà** `etablissement_id` (backfillé vers l'établissement principal en 0074/0078) :
`recettes`, `commandes`, `clients`, `plats_du_jour`, `promotions`, `codes_promo`,
`cartes_cadeaux`, `capacite_cuisine_par_creneau`, `avis_publics`, `posts_marketing`.

> ⚠️ **Décision de design à trancher** : `recettes` et `clients` sont aujourd'hui **scopés**
> (une recette / un client *appartient* à un établissement). Deux options :
> - **Garder scopé** (simple) : les recettes du fournil sont taguées `fournil`, celles du resto `restaurant`.
>   Une recette commune (ex. une sauce) est dupliquée si besoin.
> - **Rendre partagé** (catalogue commun) : retirer le scope et ajouter `recettes_etablissements`
>   (disponibilité). Plus propre si beaucoup de recettes communes, mais c'est un changement.
>
> **Reco : garder scopé pour l'instant** (le modèle existant marche, le fournil a surtout ses propres
> produits). On bascule en partagé plus tard seulement si le besoin de recettes communes émerge.

### ⚙️ SYSTÈME / global (pas de scope, ou tag optionnel)
`audit_logs`, `connexions`, `notifications`, `push_subscriptions`, `push_rate_limits`,
`assistant_conversations`, `assistant_messages`, `messages`, `parametres`, `formation_parametres`,
`formation_questions_ia`, `borne_*`.

## A.3 — Pattern d'ajout `etablissement_id` (rétro-compatible)

Pour **chaque** table scopée, en 3 temps non-cassants :
```sql
-- 1) Ajout nullable (ne casse aucun code existant)
alter table <table> add column if not exists etablissement_id uuid references etablissements(id);

-- 2) Backfill : tout l'historique existant = l'établissement principal (le restaurant)
update <table> set etablissement_id = (select id from etablissements where is_principal limit 1)
where etablissement_id is null;

-- 3) (Optionnel, après stabilisation) rendre obligatoire + index
alter table <table> alter column etablissement_id set not null;
create index if not exists idx_<table>_etab on <table>(etablissement_id);
```
**Pourquoi c'est rétro-compatible :** le code actuel qui ne filtre pas par établissement continue de
fonctionner (tout est rattaché au restaurant). On ajoute le filtre **progressivement**, écran par écran.

## A.4 — Stock multi-site + transferts

Le stock actuel est probablement une valeur unique par ingrédient (`ingredients.stock_actuel`).
Multi-site → on externalise la quantité :
```sql
create table if not exists stocks_etablissement (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  stock_actuel  numeric default 0,
  stock_minimum numeric default 0,
  unique (ingredient_id, etablissement_id)
);
-- Migration : la valeur actuelle devient le stock du restaurant.
```
**Transferts inter-établissements** (le fournil livre du pain au resto) : on réutilise `mouvements_stock`
avec un type `transfert` + `etablissement_source_id` / `etablissement_dest_id` (un mouvement sortie d'un
côté, entrée de l'autre). Le food cost et les agents Stock fonctionnent par établissement sans changement.

---

# PARTIE B — Module « Services tiers / commissions »

Pour intégrer **tabac, FDJ, FDJ Amigo, relais colis** au dashboard **sans remplacer leurs systèmes imposés**.

## Principe comptable (à valider avec l'expert-comptable)
- Tu es **agent/revendeur** → **ton revenu = la COMMISSION**, pas le brut transité.
- **TVA** : la vente de tabac et les remises ne sont **pas soumises à TVA** ; FDJ a son régime propre.
- L'argent encaissé pour ces services (mise FDJ, tabac du voisin, contre-remboursement colis) **transite
  par ta caisse mais ne t'appartient pas** = **« encaissement pour compte de tiers »** → à isoler dans la
  réconciliation de caisse, sinon le fond de caisse est faux.
- **On ne fait JAMAIS passer ces ventes par notre POS** (terminaux imposés FDJ / buraliste / relais).

## B.1 — Tables
```sql
create table if not exists services_tiers (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id),
  type text not null check (type in
    ('tabac','fdj','fdj_amigo','relais_colis','paiement_service_public','autre')),
  libelle text not null,
  regime_tva text not null default 'exonere'   -- exonere | specifique | normal
    check (regime_tva in ('exonere','specifique','normal')),
  taux_commission_default numeric,             -- ex : 5 (%) pour FDJ
  actif boolean default true,
  created_at timestamptz default now()
);

-- La COMMISSION (= notre revenu), saisie par période
create table if not exists commissions_tiers (
  id uuid primary key default gen_random_uuid(),
  service_tiers_id uuid not null references services_tiers(id) on delete cascade,
  etablissement_id uuid not null references etablissements(id),
  date_debut date not null,
  date_fin   date not null,
  montant_brut_transite numeric,    -- info (mises, ventes brutes) — pas notre CA
  montant_commission numeric not null,  -- NOTRE revenu
  nb_operations int,
  mode_saisie text default 'manuel' check (mode_saisie in ('manuel','import')),
  notes text,
  created_at timestamptz default now()
);

-- (Optionnel) Encaissements pour compte de tiers — réconciliation du tiroir
create table if not exists encaissements_tiers (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id),
  service_tiers_id uuid references services_tiers(id),
  date date not null,
  montant_du_a_tiers numeric not null,  -- ce qu'on doit reverser
  regle boolean default false,
  created_at timestamptz default now()
);
```

## B.2 — UI & intégration
- Page `/admin/services-tiers` (ou onglet sous `/admin/finances`) : liste des services, **saisie
  périodique** des commissions (depuis les relevés FDJ/Logista/relais), **import CSV** si dispo.
- **P&L (Module 14)** : les commissions apparaissent en **ligne de revenu distincte**
  (« Commissions services tiers »), avec leur **régime TVA propre** (tabac hors TVA, FDJ spécifique).
- **Dashboard / centre opérationnel** : carte « Commissions du mois » dans la vue consolidée **et** dans
  la vue établissement Fournil.
- **Agent IA dédié possible** (plus tard) : « Vérificateur commissions » qui alerte si une période n'a
  pas été saisie ou si une commission dévie de la moyenne.

## B.3 — Réconciliation de caisse
La caisse Fournil doit distinguer :
- **Ventes propres** (boulangerie, café…) → notre CA, sur le journal NF525.
- **Encaissements pour compte de tiers** → isolés, réconciliés via `encaissements_tiers`.

> La caisse agréée gère la partie fiscale ; notre module suit la **dette envers les tiers** + la
> **commission en revenu**. À cadrer précisément avec l'expert-comptable.

---

# PARTIE C — Plan de migration progressif (déployable sans interruption)

Chaque phase = migration **additive** (ne casse rien) → `tsc` → déploiement → vérif. Le code existant
continue de tourner à chaque étape (tout est rattaché au restaurant par défaut).

| Phase | Contenu | Dépend du POS ? | Quand |
|---|---|---|---|
| **M0 — Audit** | Recenser colonnes exactes, confirmer SHARED/SCOPED, lister les tables déjà scopées | non | **maintenant** |
| **M1 — Fondation** | `etablissements.type`, ajouter le Fournil, helpers « établissement courant » | non | **maintenant** |
| **M2 — Dimension scopée** | `etablissement_id` (nullable→backfill principal) sur tables transactionnelles | non | **maintenant** |
| **M3 — Contexte app** | Sélecteur d'établissement + vues consolidées/filtrées, filtre progressif des requêtes | non | **maintenant** |
| **M4 — RBAC scopé** | Rôle « gérant-établissement » (Module 28) limité à un établissement | non | **maintenant** |
| **M5 — Finances découpées** | P&L / trésorerie par établissement + **clé de répartition** des coûts partagés | non | bientôt |
| **M6 — Stock multi-site** | `stocks_etablissement` + transferts inter-établissements | non | bientôt |
| **M7 — Services tiers** | Module commissions (Partie B) | non | avant ouverture fournil |
| **M8 — Connecteur 2ᵉ POS** | Ingestion caisse fournil → données scopées « fournil » | **OUI** | quand caisse choisie |
| **M9 — Spécifique fournil** | Production boulangère (fournées), invendus, horaires décalés, TVA mixte analyse | partiel | à l'ouverture |
| **M10 — Handover gérance** | Export établissement / accès scopé / séparation comptable | non | le jour venu |

**Ce qui peut être fait MAINTENANT (sans attendre le POS) :** M0 → M5. C'est toute la **fondation
multi-établissement + RBAC + finances découpées** — exactement la couture « gérance-ready ».
**Ce qui attend le POS :** M8 (connecteur), et partiellement M9.

---

# Réserves d'honnêteté (à valider avec l'expert-comptable / l'avocat)

1. **Statut juridique** : une seule entité légale pour les deux activités maintenant, ou deux ?
   (Impacte TVA, caisse, et la future gérance — peut transformer « deux caisses » en « deux entités ».)
2. **Encaissement pour compte de tiers** (FDJ / tabac / colis) : traitement caisse + comptable spécifique.
3. **TVA mixte** (5,5 % à emporter / 10 % sur place / 20 % alcool / hors-TVA tabac) : portée par la
   caisse agréée, à paramétrer juste.
4. **Contrats** tabac (collab. buraliste voisin), FDJ, relais colis : vérifier ce que chaque contrat
   autorise à exposer/exporter vers un système tiers (notre dashboard).

---

# Architecture flexible — activation par CONFIG (préparée, non activée)

Objectif : quand l'expert-comptable répond, on **règle une config**, on ne reconstruit pas.
Tout est prêt en fichiers (migrations + couche de code), **rien n'est déployé**.

## Artefacts préparés (non exécutés / non déployés)
| Fichier | Rôle | État |
|---|---|---|
| `0089_…_m2_scoping.sql` | Caisses + stocks + planning + finances **séparés par activité** (`etablissement_id`) | prêt |
| `0090_…_m1b_flexibilite.sql` | **Flags de config** : `inclus_ca_principal`, `mode_fiscal`, `categorie`, `couleur`, `ordre` | prêt |
| `0091_…_m6_stocks_separes.sql` | Table `stocks_etablissement` (**stock séparé par activité**) | prêt |
| `src/lib/etablissements/types.ts` + `index.ts` | **Agrégation flexible** : consolidé / par activité + **exclusion hors-CA** | prêt, non câblé |

## Comment la réponse comptable s'active (sans reconstruction)
| Réponse du comptable | Réglage | Effet |
|---|---|---|
| **1 entité (consolidée)** | `etablissements.mode_fiscal = 'rattache'` | CA consolidé par défaut, P&L unique, vues filtrables par activité |
| **2 entités (séparées)** | `etablissements.mode_fiscal = 'autonome'` | P&L distincts par activité, accès scopé (RBAC), prêt pour gérance |

Dans **les deux cas**, le modèle de données est identique — seuls les **flags** et le **mode dashboard**
changent. On exécute alors `0089` + `0090` (+ `0091` pour le stock), puis on câble la couche de code.

## Les 5 capacités demandées → où elles sont préparées
1. **Plusieurs activités dans le même outil** → table `etablissements` (+ `type`, `categorie`).
2. **Caisses séparées par activité** → `0089` scope `sessions_caisse` / `paiements_caisse` / `mouvements_caisse`.
3. **Stocks séparés par activité** → `0089` scope `mouvements_stock` + `0091` `stocks_etablissement`.
4. **Dashboard consolidé OU par activité** → `src/lib/etablissements` (`filtrerVentes`, modes `consolide`/`par_activite`).
5. **Exclure des activités du CA principal** (tabac / FDJ / colis) → flag `inclus_ca_principal=false` + `agregerCA()` qui sépare `caPrincipal` / `caHorsPrincipal`.

> **Encaissement pour compte de tiers** : une activité « service_tiers » se règle simplement avec
> `inclus_ca_principal = false`. Le dashboard la montre à part (commissions), jamais dans le CA principal.

---

# Recommandation de démarrage

Attaquer **M0 → M2** : audit + fondation `etablissements` + dimension scopée rétro-compatible. C'est
non-bloquant, non-cassant, et ça pose la couture pour tout le reste (gérance incluse). Le connecteur 2ᵉ
POS (M8) viendra quand la caisse sera choisie.

---

# ADDENDUM — Réponses expert-comptable (juin 2026) → décisions verrouillées

Le comptable a tranché l'architecture juridique/comptable. Synthèse + implications app.

## Décisions structurantes
- **1 seule entité juridique** CASATASIA, **même comptabilité**, les 2 fonds dans le même acte d'achat
  (facilite revente/location-gérance d'un fonds, mutualise salariés, assurances, CFE, expert-comptable).
- **2 activités / fonds suivis séparément** (en vue d'une éventuelle mise en location-gérance future) :
  - **Activité 1 — Restaurant** : bar brasserie, pizzeria, snacking, chambres d'hôtes, événementiel (ouv. oct.2026→mars2027)
  - **Activité 2 — Fournil** : boulangerie, viennoiseries, pâtisseries, sandwiches, pizzas fournil, cafés/boissons
    **+ revente tabac, relais colis (Mondial Relay/Colissimo), FDJ (si licence)** (ouv. juil.→sept.2026)
- **2 comptes bancaires distincts** (1 par activité) pour le suivi de résultat.
- **Caisse** : 1 possible (bien dispatcher les activités au paramétrage) mais **2 caisses recommandées**
  (1 resto + 1 fournil) — préféré par le comptable. → 2 `source_caisse` dans le connecteur.
- **TVA mixte** gérée par paramétrage caisse : **5,5 % boulangerie / 10 % resto sur place / 20 % tabac**.
  Les déclarations TVA sont gérées par le comptable.
- **Tabac sans licence Seita** : AUTORISÉ pour établissements autorisés (restaurateurs/débitants).
  **TVA 20 % sur la MARGE** (le supplément de rémunération du service), pas sur le prix réglementaire
  (BOI-TVA-BASE-10-20-70). Démarches **Douane J-15** : attestation du débit de tabac de rattachement
  + déclaration d'engagement du représentant légal (service-public F23611).
- **Relais colis & FDJ** : commissions = **prestation de service, TVA 20 %**. **Facture mensuelle** à
  transmettre au comptable.
- **Vision consolidée** confirmée possible : CA par produit, global, marges, comptabilités séparées.

## Implications app (faites / à faire)
- ✅ Couche **activité** : `src/lib/activites.ts` (mapping slug PdV → restaurant|fournil). Tabac/colis/FDJ
  rattachés au **Fournil**.
- ✅ Dashboard **`/admin/ventes-pdv` → « Ventes — 2 activités »** : bandeau consolidé (Restaurant CA /
  Fournil CA / Total / Commissions) + section par activité (PdV + tiers commission), split encaissé/à encaisser.
- ✅ Connecteur caisse agréée multi-`source_caisse` (1 caisse resto + 1 caisse fournil) déjà supporté.
- ⏳ **Tabac on margin** : modéliser le supplément comme `montant_commission` (marge) dans `commissions_tiers`
  (le `montant_brut_transite` = prix réglementaire), TVA 20 %.
- ⏳ **Export facture mensuelle** des commissions tiers (colis/FDJ/tabac) pour le comptable.
- ⏳ **Échéance Douane tabac J-15** à ajouter comme obligation légale (Module 17).
- ⏳ (optionnel) Persister `etablissements.activite` (text) pour édition admin — aujourd'hui mappé par slug.

## Caisse agréée — short-list (recherche juin 2026)
Passent le critère « NF525 + API REST publique en lecture des encaissements » :
1. **Lightspeed K-Series** (la plus riche : Aggregated Sales group-by revenue-center = ventilation PdV native
   + webhooks Order/Payment) — accès API **partenaire approuvé**.
2. **SumUp POS Pro (ex-Tiller)** (OAuth2 + GET orders : TTC, TVA/ligne, mode paiement, deviceId/tableId)
   — le plus pragmatique pour un indépendant.
3. **Innovorder** (NF525 2016, portail dev — endpoints lecture à vérifier).
Pattern d'intégration réaliste : **webhook « mince » → pull API** (fetch-on-notify) → POST vers
`/api/integrations/caisse/encaissements`.
