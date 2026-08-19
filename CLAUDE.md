# app-restaurant — guide projet

## 1. Mission

Logiciel de gestion complète d'un restaurant indépendant (mono-établissement, single-tenant). Couvre le back-office (recettes, food cost, stocks, fournisseurs, équipe), le service en salle (caisse, plan de salle, écrans cuisine/bar/serveur temps réel) et l'imprimable (bons de prep, ticket client, rapport Z).

Cible matérielle : tablettes Android/iPad pour le service, desktop pour l'admin. Imprimante thermique 80mm pour les bons et tickets (impression web standard, pas de driver ESC/POS).

## 2. Stack

- **Next.js 14.2.35** App Router + Server Components + Server Actions
- **TypeScript strict**
- **Supabase** (Postgres + Realtime + Storage). RLS désactivée (single-tenant, pas d'auth utilisateur en interne)
- React 18, **react-hook-form + zod** pour les formulaires, **zustand** ponctuel
- **Tailwind 3** + shadcn/ui (components/ui/), **lucide-react**
- date-fns, recharts, framer-motion
- Geist Sans + Geist Mono (locaux)

## 3. Architecture des routes

### Livrées

```
/                              → landing (à faire)
/admin/setup                   → wizard config initiale (Module 2)
/admin/ingredients             → Module 3
/admin/recettes                → Module 4
/admin/recettes/engineering    → Module 5
/admin/boissons                → Module 6
/admin/stock                   → Module 7
/admin/fournisseurs            → Module 8
  └ /bons/[id]/print           → bon de commande imprimable

(ops)/cuisine                  → Module 9A (KDS cuisine + pizza)
(ops)/bar                      → Module 9A (KDS bar)
(ops)/serveur                  → Module 9A (plan de salle, prise commande, encaissement)
(ops)/caisse                   → Module 9A (dashboard live + ouverture/clôture session)
  └ /[id]/print                → rapport Z imprimable
(ops)/emporter                 → Phase 0 — service ONLINE différencié
(ops)/livreur                  → tableau de bord livraisons du jour (MVP, sans flag mode_retrait)
(ops)/reception                → arrivées/départs jour, demandes résa, acomptes (adossé Module 21)

print/bons/[id]                → Module 9B — bons de prep 80mm (?dest=CUISINE|PIZZA|BAR, ?auto=1)
print/ticket/[id]              → Module 9B — ticket client 80mm (?auto=1)
```

Chaque écran (ops) affiche en haut un `<BriefingPoste />` personnalisé (`src/lib/briefing/poste.ts`) : météo, plats à pousser, points HACCP, alertes stock du poste.

### Modules administratifs (10-28) — tous livrés

```
/equipes                       → Module 10 (com interne, hors /admin car aussi accessible postes)
/admin/hygiene                 → Module 11 (HACCP, températures, checklists)
/admin/allergenes              → Module 12 (14 allergènes, QR salle, alerte cuisine)
/admin/rh                      → Module 13 (fiches employés, planning, paie, pourboires)
/admin/finances                → Module 14 (P&L, trésorerie, simulateurs, exports)
/admin/energie                 → Module 15 (élec/gaz/eau, alertes conso)
/admin/maintenance             → Module 16 (équipements, contrôles obligatoires)
/admin/legal                   → Module 17 (licences, assurances, échéances)
/admin/dechets                 → Module 18 (pesées, gaspillage, registre)
/admin/groupes                 → Module 19 (TO, menus négociés, arrhes)
/admin/clients                 → Module 20 (CRM, fidélité, campagnes, WiFi)
/admin/reservations            → Module 21 (chambres + événementiel + terrasse)
/admin/previsionnel            → Module 22 (météo, IA prévisions CA/stock)
/admin/journal                 → Module 23 (journal gérant + analyse IA 6 mois)
/admin/assistant               → Module 24 (chat IA connecté aux données)
/admin/pilotage                → Module 25 (10 KPI, objectifs, PWA mobile gérant)
/admin/affichage               → Module 26 (TV salle, QR tables)
/admin/formation               → Module 27 (guides, fiches poste, quiz)
/admin/securite                → Module 28 (RBAC, 2FA, journal d'audit, sauvegardes)
```

Les routes `(ops)` partagent un layout sombre `bg-[#0D0D0D]` (tablette en service). Les routes `/print/*` sont en dehors et héritent uniquement du root layout (fond blanc pour impression). Les routes `/admin/*` sont en thème clair par défaut. `/equipes` (Module 10) sera neutre — accessible aux postes de service comme à l'admin.

## 4. État d'avancement

### Tableau de bord

| Module | Périmètre court | Statut | Migrations |
|---|---|---|---|
| 1  | Fondations (schéma 27 tables) | ✅ | 0001, 0002 |
| 2  | Setup wizard 7 étapes | ✅ | — |
| 3  | Ingrédients + historique prix + allergènes | ✅ | 0003, 0004 |
| 4  | Recettes + food cost | ✅ | 0005 |
| 5  | Menu Engineering | ✅ | 0006 |
| 6  | Boissons (multi-format + accords mets-vins) | ✅ | 0007, 0008 |
| 7  | Stocks (déduction auto à 'servi') | ✅ | 0009 |
| 8  | Fournisseurs + bons + factures + réception | ✅ | 0010, 0011 |
| 9A | Écrans service temps réel + caisse + Z-report | ✅ | 0012, 0013 |
| 9B | Tickets imprimables 80mm (bons + client) | ✅ | — |
| 10 | Communication interne équipes (chat 5 canaux + affichage + CR + matériel) | ✅ | 0014, 0015 |
| 11 | Hygiène & sécurité (HACCP + températures + lots + checklists + nettoyage + NC + 3D) | ✅ | 0016, 0017 |
| 12 | Allergènes (14 EU + override + QR salle + alerte cuisine + procédures urgence) | ✅ | 0018, 0019 |
| 13 | RH (équipe + docs + formations + planning + pointage + congés + paie + registre légal) | ✅ | 0020, 0021 |
| 14 | Finances (P&L + charges + TVA + trésorerie + simulateurs + notes frais + CSV + rapport PDF) | ✅ | 0022, 0023 |
| 15 | Énergie (relevés élec/gaz/eau + comparaison N vs N-1 + alerte +20% + coût/plat + suggestions) | ✅ | 0024, 0025 |
| 16 | Maintenance (équipements + planning préventif + interventions + contrôles obligatoires alerte 1 mois) | ✅ | 0026 |
| 17 | Légal (obligations + 14 affichages obligatoires + accidents travail + registre sécurité imprimable) | ✅ | 0027, 0028 |
| 18 | Déchets (pesées 8 types + coût gaspillage + collectes BSD + rapport annuel imprimable) | ✅ | 0029, 0030 |
| 19 | Groupes (TO + menu négocié + planning calendrier + arrhes/solde + facture imprimable) | ✅ | 0031, 0032 |
| 20 | CRM & fidélité (clients + niveaux + segments + campagnes + réclamations + retours + parrainage + WiFi) | ✅ | 0033, 0034 |
| 21 | Réservations (chambres calendrier + tables/terrasse + événements + facture/devis/contrat imprimables) | ✅ | 0035, 0036 |
| 22 | Prévisionnel (météo OWM + régression CA + prévision 7j + suggestions règles) | ✅ | 0037, 0038 |
| 23 | Journal (entrées humeurs + tags + photos + analyses 6 mois + snapshot auto météo/CA) | ✅ | 0039, 0040 |
| 24 | Assistant IA gérant (chat Claude streaming + snapshot KPIs + alertes) | ✅ | 0041, 0042 |
| 25 | Pilotage stratégique (10 KPIs + objectifs + plan d'action kanban + saisonnier 12 mois + PWA installable) | ✅ | 0043, 0044 |
| 26 | Affichage salle (TV publique rotative + menu du jour + promos + QR appel serveur realtime) | ✅ | 0045, 0046 |
| 27 | Formation (guides step-by-step par poste + quiz QCM seuil 80% + suivi progression + fiche poste imprimable) | ✅ | 0047, 0048 |
| 28 | Sécurité (Supabase Auth + RBAC manager/employe + 2FA TOTP + audit + connexions + sauvegarde JSON) | ✅ | 0049, 0050 |

### Évolutions post-Module 28 (Phases business 0-6 et système d'agents)

| Périmètre | Détail | Migrations |
|---|---|---|
| Phase 0 — site public + ONLINE | catalogue site, différenciation source ONLINE dans cuisine/pizza/bar, notifs internes, email client commande, réputation/avis | 0051–0076 |
| Phase 1 — API publique outil 1 | 11 routes `/api/public/*`, auth client magic link, RGPD export, Stripe webhook, carte cadeau, realtime publi | 0077 |
| Phase 4 — Chambres d'hôtes | API publique chambres + réservation, page `/admin/chambres`, vidéo 360° par chambre | 0078 |
| Phase 6 — Marketing IA + créneaux | génération posts Claude, cron collecte avis J+1, créneaux multi-zones snack/pizza | 0079–0081 |
| Agents IA permanents | 15 agents (10 cron + 4 RT par poste + Formateur), dashboard `/admin/pilotage`, push rate-limited | 0082, 0083 |
| Push rate-limited | `sendPushToEmployeRateLimited()` plafonne 3 push/h/employé | 0084, 0085 |
| Endpoint admin exec-sql | `/api/admin/exec-sql` + fonction PG `exec_sql()` security definer pour migrations automatiques | 0086 |
| Module 27 enrichi | niveaux 1/2/3, simulations interactives, certifications par poste, badges, Q/R IA contextualisée | 0087 |
| Carte réelle du Fournil | 60 produits des 13 affiches CasaTasia + photos découpées dans les affiches | 0113 |

**Migrations actuelles : 0001 → 0113.**

### Activation par activité — « Fournil d'abord » (août 2026)

Le Fournil ouvre seul (juillet-septembre 2026) ; restaurant, bar, pizzeria, chambres et événementiel n'ouvrent que **fin octobre 2026**. Tout est piloté par une seule table, `activites_modules` (migration 0110), et **aucun code n'est à modifier pour rouvrir**.

| Où | Quoi |
|---|---|
| `activites_modules` | 14 modules répartis en `fournil` / `restaurant` / `commun`. Colonnes : `actif`, `teaser`, `date_ouverture_prevue`. |
| `/admin/etablissements` | Le tableau des interrupteurs + bouton **« Ouvrir le restaurant »** (bascule groupée) + réglages de la livraison Fournil. |
| `src/lib/activation/config.ts` | Types, clés, correspondances module → tags / PdV / routes, repli. Client-safe. |
| `src/lib/activation/server.ts` | `getActivation()`, `estActif()`, `gardeModule()`. Server-only, mémoïsé par requête. |
| `GET /api/public/activation` | Sert l'état au site public (TTL 60 s). |

**Règle du repli** : quand la base ou l'API est injoignable, on retombe sur `REPLI_FOURNIL_SEUL` — **jamais** sur « tout ouvert ». Une panne ne doit pas dévoiler une activité qui n'a pas ouvert ; l'erreur inverse est irrattrapable.

**Points de branchement** : `lib/navigation.ts` (`filtrerCategories`), les pages ops/admin (`gardeModule` + `<ModuleEnVeille />`), `/api/public/menu` (filtre par `tag_destination`), et `lib/agents/runner.ts` (`agentEnVeille`).

Réouverture fin octobre : `/admin/etablissements` → groupe Restaurant → **« Ouvrir le restaurant »**. Le site suit en moins d'une minute. Ne pas rejouer 0111, qui est la migration de fermeture.

Tests : `node scripts/test-activation.mjs` (restaure toujours l'état initial), `node scripts/test-commande-statut.mjs`, `node scripts/test-fournil-circuit.mjs`, `node scripts/test-carte-fournil.mjs`.

### Clôture des ventes au comptoir

Une vente COMPTOIR sans table ni ardoise passe **directement à `encaisse`** quand tous ses articles sont `servi` (règle pure dans `src/lib/commande-statut.ts`).

Sans cela, elle restait à `servi` indéfiniment et son chiffre d'affaires n'apparaissait **nulle part** : tout le calcul du CA (dashboard, `/service`, finances, agents) filtre sur `statut = 'encaisse'`. Le Fournil aurait affiché 0 € toute la journée.

⚠️ Ce n'est **pas** un encaissement fiscal : aucune ligne n'est écrite dans `paiements_caisse`, donc le Z-report de l'app reste vide pour ces ventes. La caisse agréée demeure la source de vérité fiscale (NF525) et le connecteur `encaissements_externes` (migration 0108) rapproche ses tickets de ces commandes. `mode_paiement = 'caisse_agreee'` marque la distinction.

Exclusions : commandes de table (addition demandée plus tard) et **ardoises** (compte ouvert soldé à la fin — les clôturer les rendrait introuvables et la tournée suivante créerait une 2ᵉ commande).

À chaque livraison de module : `scripts/test-<nom>.mjs` doit passer 100% (setup → assertions → cleanup, bilan ✓/✗).

### Agents IA permanents — architecture

15 agents définis dans `src/lib/agents/types.ts`. Chaque agent a une route `POST /api/cron/agents/<id>` ou `/api/cron/agents/realtime/<poste>`, auth `Authorization: Bearer ${CRON_SECRET}`, runner partagé `src/lib/agents/runner.ts` (timing, persistance run dans `agents_runs`, dedup findings, push notif rouge automatique).

| # | Agent | Planning |
|---|---|---|
| 1 | 🌙 Veilleur | 01h UTC (= 02h Paris hiver) — clôture/backup/recap J-1 |
| 2 | 🌤️ Météorologue | 05h UTC (= 06h Paris) — OWM + prévision CA 7j |
| 3 | 📦 Stock | toutes les 2h — ruptures J+3, bons commande, DLC |
| 4 | 💰 Financier | chaque heure HH:05 — food cost, masse sal, trésorerie |
| 5 | 👥 RH | 21h UTC (= 22h Paris) — productivité, heures sup, pourboires |
| 6 | 🌡️ HACCP | chaque heure HH:10 — températures, checklists, DLC |
| 7 | 💬 Commercial | 19h UTC (= 20h Paris) — dormants, anniv, avis non répondus |
| 8 | 📄 Scanner | event-driven (upload facture) — OCR Claude Vision |
| 9 | 🎯 Stratégique | lundi 06h UTC (= 07h Paris) — synthèse hebdo Claude |
| 10 | 🛡️ Sécurité | toutes les 30 min — connexions, écarts caisse, agents erreur |
| 11-14 | 👨‍🍳 RT par poste (cuisine, serveur, bar, snack) | toutes les 15 min — alertes service en cours |
| 15 | 🎓 Formateur | 08h UTC (= 09h Paris) — progression, badges, alertes J-30 certif |
| 16 | 🥖 Fournil RT | toutes les 15 min — cmd web en attente, tournée en retard, retraits oubliés |

Les agents 11-14 portent un `module` d'activation et sont **en veille** tant que le restaurant n'a pas ouvert (leur route répond `200 { skipped: true }`, jamais une erreur — le monitoring compte tout code ≠ 200 comme une panne). L'agent 16 couvre le Fournil, seul point de vente ouvert d'ici fin octobre 2026.

**Déclenchement cron :** pg_cron + pg_net dans Supabase, fichier `sql/setup-pgcron-agents.sql` (gitignored car contient `CRON_SECRET` en clair). Alternative : `.github/workflows/agents-cron.yml` (ne couvre que les 9 agents originaux, à étendre si on bascule dessus).

**Dashboard :** `/admin/pilotage` affiche `<AgentsAuTravail />` avec emoji + statut + findings actifs. Drill-down `/admin/pilotage/agents/[id]` pour résoudre/ignorer/relancer.

### Roadmap détaillée 10-28

**Module 10 — Communication interne équipes** `/equipes`
Messagerie interne entre postes, tableau d'affichage digital infos du jour, notifications push employés, compte-rendu réunion archivé, attribution matériel par employé.

**Module 11 — Hygiène & sécurité alimentaire** `/admin/hygiene`
Plan HACCP avec CCP (points critiques), relevés températures 2× par jour avec alertes, traçabilité produits lot/DLC/fournisseur, checklists ouverture/fermeture/hebdo/mensuel avec signature numérique, plan de nettoyage, registre non-conformités, registre antiparasitaire.

**Module 12 — Allergènes & traçabilité** `/admin/allergenes`
14 allergènes par plat, fiche allergènes QR code en salle, alerte cuisine pour clients allergiques, procédure réaction allergique, traçabilité complète par lot.

**Module 13 — Ressources humaines** `/admin/rh`
Fiches employés avec documents, planning avec calcul coût par shift, alerte masse salariale > 35% CA, pointage arrivée/départ, heures supplémentaires automatiques, gestion congés avec solde, formations obligatoires, productivité par employé, registre personnel obligatoire, suivi pourboires.

**Module 14 — Finances & pilotage** `/admin/finances`
Compte de résultat temps réel, seuil rentabilité quotidien, charges fixes avec alertes prélèvements, TVA collectée et déductible, trésorerie 30/60/90 jours, simulateur CA, simulateur "Et si", export CSV comptable, rapport mensuel PDF, notes de frais.

**Module 15 — Gestion énergie** `/admin/energie`
Suivi mensuel électricité/gaz/eau, comparaison annuelle, alerte consommation anormale, coût énergétique par plat, suggestions réduction coûts.

**Module 16 — Maintenance & équipements** `/admin/maintenance`
Registre équipements avec garanties, planning maintenance préventive, suivi pannes et réparations, contrôles obligatoires électricité/gaz/extincteurs/hotte avec alertes 1 mois avant.

**Module 17 — Obligations légales** `/admin/legal`
Licence IV, permis exploitation, affichages obligatoires, formations HACCP par employé, assurances avec échéances, bail commercial, registre sécurité, alertes 1 mois avant chaque échéance.

**Module 18 — Gestion des déchets** `/admin/dechets`
Pesée quotidienne par type, calcul gaspillage en euros, registre collectes, rapport annuel obligatoire.

**Module 19 — Gestion des groupes** `/admin/groupes`
Fiche groupe avec tour-opérateur, menu groupe avec prix négocié, facturation directe, planning groupes sur calendrier, gestion arrhes et soldes.

**Module 20 — Relation client & fidélité** `/admin/clients`
Fichier clients avec historique, allergies mémorisées, programme fidélité avec points et niveaux, segmentation, campagnes email et SMS, gestion réclamations, retours plats avec impact food cost, WiFi clients avec collecte email, parrainage.

**Module 21 — Réservations & événementiel** `/admin/reservations`
Calendrier multi-chambres, check-in/check-out avec facture PDF, devis événementiel automatique, contrat privatisation PDF, fiche technique équipes, gestion matériel, suivi acomptes, bilan post-événement, gestion terrasse.

**Module 22 — Météo & prévisionnel intelligent** `/admin/previsionnel`
Météo locale 7 jours via OpenWeatherMap, corrélation météo et fréquentation, prévision CA semaine suivante, prévision stock et couverts, alertes préventives, suggestions IA.

**Module 23 — Journal de bord gérant** `/admin/journal`
Note quotidienne avec météo et CA associés automatiquement, photos joignables, recherche historique, analyse IA corrélations sur 6 mois.

**Module 24 — Assistant IA gérant** `/admin/assistant`
Chat connecté à toutes les données, alertes "3 actions prioritaires du jour", analyse hebdomadaire automatique, détection anomalies, rapport mensuel, tableau de bord prédictif.

**Module 25 — Pilotage stratégique** `/admin/pilotage`
Les 10 indicateurs clés en 2 minutes, objectifs mensuels et annuels, plan d'action mensuel, analyse saisonnière, **PWA mobile gérant installable**.

**Module 26 — Affichage dynamique salle** `/admin/affichage`
Écran TV avec menu du jour et événements, météo locale, QR codes tables pour allergènes et appel serveur, contenu mis à jour depuis dashboard.

**Module 27 — Formation des équipes** `/admin/formation`
Guides interactifs par poste, fiches de poste PDF, quiz de validation, procédures urgence, suivi progression par employé.

**Module 28 — Sécurité & accès** `/admin/securite`
Connexion sécurisée avec rôles par poste, authentification 2FA gérant, journal des actions, alertes connexion inconnue, sauvegarde automatique quotidienne, cadenas discret en footer.

## 5. Règles métier absolues

### Cycle de vie d'une commande

```
en_attente → en_preparation → pret → servi → encaisse
                                          ↘ annule
```

**RÈGLE D'OR** : une commande ne disparaît des écrans cuisine/bar/serveur **qu'au statut `encaisse` ou `annule`**. Tous les autres statuts intermédiaires restent visibles.

Synchronisation `commande.statut` depuis l'agrégat `commande_articles.statut` :
- tous `servi` → commande `servi`
- tous `pret` ou `servi` → commande `pret`
- au moins un `en_preparation` → commande `en_preparation`
- sinon → `en_attente`

Ne **jamais** rétrograder depuis `encaisse` ou `annule`.

### Cycle de vie d'une table

`libre` → `occupee` (commande créée) → `a_encaisser` (commande passe à `servi`) → `libre` (encaissement validé).
Statut `reservee` réservé au futur Module 21.

### Caisse

- Une seule session ouverte par jour (`fermee_at IS NULL` + `date_session = current_date`).
- Encaissement = N paiements (espèces / carte / ticket_resto / virement / autre), tip optionnel par ligne, total = `commande.montant_total_ttc` à 0,05 € près.
- À l'ouverture : `fond_initial`. À la clôture : `ca_compte` saisi → `ecart = ca_compte - (fond_initial + sum_especes)`.

### Food cost (Modules 4 & 6)

| Statut | Seuil |
|---|---|
| 🟢 Sain | < 28% |
| 🟡 À surveiller | 28% – 32% |
| 🔴 Trop élevé | > 32% |
| 🚨 Alerte auto | > 30% |

### Stock

- `stock_actuel ≤ 0` → 🔴 rupture
- `stock_actuel ≤ stock_minimum` → 🟠 alerte
- sinon 🟢 OK

Trigger Module 7 : à chaque article qui passe à `servi`, déduction automatique des ingrédients via `recette_ingredients` + insert d'un `mouvements_stock` type `sortie`.

### Minuteur cuisine (Module 9A)

| Couleur | Temps écoulé depuis création commande |
|---|---|
| 🟢 vert | < 10 min |
| 🟠 orange | 10 – 20 min |
| 🔴 rouge | > 20 min |

### TVA

Multi-taux depuis la migration 0066 — source de vérité `src/lib/tva.ts` :

| Cas | Taux |
|---|---|
| Alcool (sur place ou emporter) | 20 % |
| Plat / soft consommé sur place | 10 % |
| Plat / soft à emporter | 5,5 % |

Le taux est calculé par `tauxTvaArticle(contient_alcool, consommation)` et persisté par ligne (`commande_articles.tva_taux`, `tva_eur`) avec une ventilation par taux sur la commande (`ventilation_tva`). La carte Fournil (0113) porte les bons taux par produit : 5,5 % pains/viennoiseries/pâtisseries/gourmandises, 10 % snacking, pizzas et boissons.

⚠️ **Formules petit-déjeuner : 10 % assumé.** Une « Formule Express » (café à 10 % + croissant à 5,5 %) est un panier mixte, mais `recettes.tva` ne porte qu'un taux. Le choix est le taux haut : sur-collecter est rattrapable, sous-collecter ne l'est pas. À revoir si ces formules pèsent lourd dans le CA.

### Carte du Fournil et photos produit

Les 60 produits viennent des 13 affiches CasaTasia (migration 0113, prix TTC des affiches → HT en base). Les photos sont **découpées dans les affiches elles-mêmes** par `scripts/generer-photos-fournil.mjs` (sharp, rectangles en fractions de l'affiche) et déposées dans `public/produits/*.jpg`.

`image_url` doit rester une **URL absolue** (`https://app-restaurant-livid.vercel.app/produits/<slug>.jpg`) : le site vitrine est un projet distinct qui consomme `/api/public/menu` en CORS, une URL relative y pointerait sur son propre domaine. Corollaire : **une photo n'est visible qu'après déploiement de l'app**.

Vérification : `node scripts/test-carte-fournil.mjs` (compare la base aux prix des affiches, la TVA par famille, et l'existence réelle de chaque fichier photo).

### Realtime obligatoire

Les 3 tables suivantes **doivent** être dans `publication supabase_realtime` :
- `commandes`
- `commande_articles`
- `tables_restaurant`

Sans cela, les écrans cuisine/bar/serveur ne se synchronisent plus.

## 6. Design system

### Couleurs sémantiques (Tailwind)

| Sémantique | Classes |
|---|---|
| OK / sain / libre | `emerald-{500,600,400/300}` |
| Attente / occupée / chaud | `amber-{500,400/300}` |
| Critique / à encaisser / rupture | `red-{600,500,400/300}` |
| Info / réservée / online | `blue-{500,400/300}` |
| Cuisine | `amber` (👨‍🍳) |
| Pizza | `red` (🍕) |
| Bar | `violet` (🍷) |
| Source TABLE | `blue` (🪑) |
| Source ONLINE | `emerald` (🌐) |
| Source COMPTOIR | `violet` (🛒) |

### Layout

- (ops) : fond `#0D0D0D`, texte `zinc-100`, bordures `zinc-800`. Sticky header avec safe-area (`env(safe-area-inset-top)`).
- /print/* : fond blanc, texte `zinc-900`, font mono, largeur fixe `74mm` (avec `@page { size: 80mm auto; margin: 3mm }`).
- Admin : fond clair (par défaut Tailwind).

### Tactile

**Boutons minimum 48px de hauteur** (`min-h-[48px]` ou `h-12`). Inputs critiques (montants, fond) en `h-14` minimum, `text-2xl tabular-nums text-right`.

### Formats

```ts
// src/lib/foodCost.ts (réexporté par boissons.ts et service.ts)
fmtPrix(n)  // 1 234,56 €
fmtPrix4(n) // 1 234,5678 €
fmtPct(n)   // 12,3 %
```

### Notification sonore

`playDing()` (src/lib/service.ts) — Web Audio API, pas de fichier audio. Activation requise par interaction utilisateur (limitation navigateur) : bouton "🔔 Activer son" dans le header cuisine/bar.

## 7. Workflow de dev (par module)

1. **Migration SQL d'abord** dans `supabase/migrations/00XX_<nom>_module.sql` :
   - Idempotent (`create table if not exists`, `add column if not exists`, `do $$ ... end $$ exception when duplicate_object then null`)
   - Toujours **désactiver RLS** sur les nouvelles tables (`alter table X disable row level security`) car Supabase la réactive automatiquement après création via SQL Editor — pattern observé 6+ fois.
   - Diagnostic en queue de fichier (counts + RLS check)
   - L'utilisateur exécute la migration manuellement dans Supabase Dashboard → SQL Editor. Demander explicitement.

2. **Code** :
   - Server Component pour la page (`page.tsx`, `export const dynamic = 'force-dynamic'`)
   - Client Component pour l'interactif (`'use client'`, suffixé `Client.tsx`)
   - Server actions dans `actions.ts` du dossier de la route, avec `'use server'`, validation zod, `revalidatePath` à la fin
   - Pour les types partagés entre page et client component : extraire dans un `types.ts` (sinon Next 14 plante en compilation).
   - Import alias `@/` configuré sur `src/`.

3. **Test d'intégration** dans `scripts/test-<module>.mjs` :
   - Lit `.env.local` à la main (pas de dotenv)
   - Crée des données test, valide le comportement, **cleanup** systématique (delete dans l'ordre inverse des FK + restore des stocks/tables modifiés)
   - Bilan ✓/✗ + `process.exit(1)` si échec
   - Optionnel : fetch HTTP si `PORT=3000` est passé en env

4. Annoncer dans le récap final : ce qui est livré, où, et **explicitement** "pas de migration" si c'est le cas.

## 8. Gotchas connus

- **Déploiement prod** : `https://app-restaurant-livid.vercel.app` (Vercel, repo public `arnaud-florence/app-restaurant`, branche `main` auto-deploy).

- **Domaine public : `casatasia.fr`** (OVH, titulaire CASATASIA, compte `xj9701-ovh`, renouvellement auto en août 2027). Il sert le **site vitrine**, projet Vercel `site-restaurant` — *pas* cette app. Zone DNS chez OVH : `A @ → 216.198.79.1` et `CNAME www → f0ab09f3a0e2f92c.vercel-dns-017.com.` ; `www` redirige en 308 vers l'apex, qui reste l'adresse canonique (c'est elle qu'on imprime). Les 3 MX `mx{1,2,3}.mail.ovh.net` sont ceux de la boîte incluse avec le domaine : **ne pas les supprimer**, sinon la messagerie tombe. Le back-office n'a pas encore de sous-domaine ; s'il en reçoit un (`app.casatasia.fr`), penser à mettre à jour `NEXT_PUBLIC_SITE_URL` et la base des `image_url` en base. Toutes les env vars critiques (Supabase, Anthropic, CRON_SECRET, VAPID, Resend) sont configurées côté Vercel. Manque : `OPENWEATHER_API_KEY` (agent Météo + Module 22 ne tourneront pas sans).

- **Auth Supabase : `getUser()` doit OBLIGATOIREMENT être en try/catch côté serveur**. Quand le refresh token est expiré (cookies stales, ce qui arrive après un déploiement, un reset, ou plusieurs heures), `supabase.auth.getUser()` throw `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` (code `refresh_token_not_found`). Sans try/catch, l'erreur remonte dans le RSC qui crash → page d'erreur Next générique. **Fix appliqué dans `src/lib/auth.ts:getProfile()` et `src/lib/supabase/middleware.ts:updateSession()`** (commit 8f281ec). Si tu ajoutes un nouveau wrapper auth, applique le même pattern.

- **Supabase Realtime : nom de channel UNIQUE par instance de hook**. Si 2 Client Components instancient le même hook (genre `useLiveFindings()`) avec les mêmes filtres, ils créent deux channels avec le même nom (ex: `agent_findings_live__`). Le 2ᵉ `subscribe()` throw "cannot add `postgres_changes` callbacks after `subscribe()`". **Fix** : utiliser `useId()` React pour générer un ID stable SSR/CSR unique par instance et l'inclure dans le nom du channel (cf. `src/hooks/useLiveFindings.ts` et `useLiveAgentRuns.ts`, commit df789fb).

- **Service Worker cache : bumper `CACHE_VERSION` quand on push du code critique**. Le SW (`public/sw.js`) cache les chunks `/_next/static/*` en cache-first (immutables car hash). Mais entre 2 builds, les anciens chunks restent dans le cache et peuvent être servis si toujours référencés. **Solution** : incrémenter `CACHE_VERSION` (ligne 8) à chaque fix critique → l'event `activate` vide les anciens caches → next fetch va en réseau.

- **Vercel logs en CLI** : `npx vercel logs --since 30m --level error --expand --no-follow` permet de voir les erreurs runtime de la prod sans passer par le dashboard. L'auth se fait automatiquement via `VERCEL_OIDC_TOKEN` (dans `.env.local`). Très utile pour diagnostiquer un "Oups une erreur" générique côté utilisateur.

- **Agents cron** : déclenchés par pg_cron dans Supabase (`sql/setup-pgcron-agents.sql`, gitignored). Si on régénère `CRON_SECRET`, regénérer ce fichier et relancer le SQL. Monitoring : `select status_code, count(*) from net._http_response where created > now() - interval '1 day' group by 1` — toute valeur ≠ 200 = agent qui plante.

- **Endpoint exec-sql** : `POST /api/admin/exec-sql` permet à un script (ou à l'AI) d'exécuter du SQL arbitraire sans passer par le SQL Editor Supabase, auth Bearer `CRON_SECRET`. Utilise la fonction PG `exec_sql()` créée par migration 0086, EXECUTE granté uniquement à `service_role`.

- **Jest worker crash sur Windows** : Next dev en local plante régulièrement avec `Jest worker encountered child process exceptions, exceeding retry limit` sur les routes dynamiques `[id]`. Symptôme : 500 sur `/caisse/[id]/print`, `/print/bons/[id]`, etc. Toutes les routes statiques marchent. **Fix : redémarrer `npm run dev`**, ce n'est pas le code.

- **Supabase RLS** : à chaque nouvelle table créée via SQL Editor, RLS est ré-activée automatiquement. Toujours `alter table X disable row level security` à la fin de la migration, et créer un patch `00XX_disable_rls_<nom>.sql` si on l'oublie.

- **Encodage PowerShell** : Out-File / Set-Content écrivent en UTF-16 LE par défaut sur Windows. Utiliser `-Encoding utf8` ou créer les fichiers via les outils Edit/Write de Claude Code.

- **TVA mixte — FAIT** (migration 0066 + `src/lib/tva.ts`) : 20 % alcool, 10 % sur place, 5,5 % à emporter. `tauxTvaArticle()` est branché dans `(ops)/actions.ts`, l'encaissement serveur, la borne et `/api/public/menu`. Le comptoir (`(ops)/comptoir/actions.ts`) ventile par taux et force `consommation: 'emporter'`. **Limite connue** : une viennoiserie consommée sur place devrait être à 10 % et sort à 5,5 % — sous-collecte marginale, à traiter si le fournil développe de la conso sur place.

- **Le projet voisin `C:\projets\monrestaurant`** est un ancien prototype, **pas** la version active. Ne pas s'y tromper.

- **Auto-impression KDS** : le toggle ON/OFF est persistant en `localStorage` par poste (`cuisine_auto_print`, `bar_auto_print`). Implémenté via iframe cachée qui appelle `window.print()` au montage. Nécessite que l'utilisateur ait interagi au moins une fois avec la page (politique navigateur).

- **Assistant IA (Module 24)** : nécessite `ANTHROPIC_API_KEY=sk-ant-api03-...` dans `.env.local` (un seul `sk-ant-`, attention aux préfixes dupliqués au copier/coller). Modèle par défaut `claude-haiku-4-5`. Prompt caching activé sur le bloc persona du system prompt (~2 KB stable) ; le snapshot KPI volatile est dans un 2ᵉ bloc system non caché. Le snapshot est gelé à la création de la conversation — bouton "rafraîchir" disponible. Tarif Haiku : $1/$5 par million tokens, donc ~0,001 $ par message moyen.

- **PWA Module 25** : `public/icon-192.png` et `icon-512.png` sont générés en couleur unie #10b981 par `scripts/generate-pwa-icons.mjs` (sans dépendance native). Pour un rendu de qualité, installer `sharp` puis remplacer le contenu de ces deux PNG en rasterisant `public/icon.svg`. Le service worker (`public/sw.js`) est minimal : juste assez pour rendre la PWA installable, pas de cache offline. Modifier le SW invalide la PWA installée — incrémenter une constante de version si besoin.

- **Module 26 — Page TV `/affichage/tv`** : pensée pour 1920×1080 paysage, plein écran via F11/borne TV. Rotation auto 10 s entre 4 écrans (menu / météo / événements / promos). Skip silencieux des écrans sans contenu. Realtime sur `menu_du_jour` et `affichage_promos` → la TV se rafraîchit dès qu'un item est ajouté côté admin. Page publique sans authentification.

- **Module 26 — QR appel serveur** : QR par table générés côté admin via lib `qrcode` (déjà installée Module 12, dynamic import client-side). URL pointée : `/table/[numero]/appel`. Anti-spam : 1 appel max par table toutes les 10 s. Le banner sur `/serveur` joue `playDing()` du Module 9A à chaque INSERT realtime — nécessite que le navigateur ait reçu une interaction utilisateur au moins une fois (politique audio).

- **Module 27 — Formation** : `/formation` est publique, sélection employé persistée en localStorage (`formation_employe_id`). Anti-spam quiz : 1 tentative / 24 h par guide × employé (vérifié côté action serveur). Si un guide n'a aucune question, il est validé dès toutes ses étapes vues (statut → `reussi`). UNIQUE `(guide_id, employe_id)` sur `progressions_formation` : 1 ligne max par employé par guide — utiliser `resetProgression(guide_id, employe_id)` côté admin pour réinitialiser. Cascade delete : supprimer un guide supprime étapes + questions + progressions. Procédures d'urgence (incendie, allergie, etc.) sont gérées dans Module 12 — un lien depuis `/admin/formation` pointe vers `/admin/allergenes`.

- **Pages /print en RSC** : ne JAMAIS utiliser `<button onClick={...}>` dans un Server Component — Next 14 RSC interdit les event handlers en pur RSC (erreur runtime "Event handlers cannot be passed to Client Component props"). Toujours extraire le bouton imprimer dans un fichier séparé `PrintButton.tsx` avec `'use client'` (pattern utilisé par Module 27).

- **Module 28 — Bootstrap manager** : la 1ʳᵉ personne qui s'inscrit via `/login` devient automatiquement manager (logique dans `getProfile()` : si 0 ligne avec role='manager' alors le nouveau profil est créé en role='manager', sinon en role='employe'). Pour ajouter un autre manager : laisser la personne s'inscrire (compte employé par défaut), puis la promouvoir dans `/admin/securite` onglet Profils.

- **Module 28 — Confirmation email Supabase** : selon la config du projet Supabase (Console → Authentication → Email Auth), `signUp()` peut envoyer un email de confirmation obligatoire. Si oui, l'utilisateur ne peut pas se connecter avant d'avoir cliqué le lien. Pour faciliter le dev local, désactiver "Confirm email" dans la console Supabase.

- **Module 28 — Middleware** : `src/middleware.ts` protège `/admin/*` (redirige vers `/login` si pas de session ou rôle ≠ manager). Les pages opérationnelles (`/caisse`, `/serveur`, `/cuisine`, `/bar`) et publiques (`/affichage/tv`, `/table/*`, `/formation`, `/login`) restent accessibles sans login. Le matcher exclut explicitement `/api/assistant/stream` (Module 24) parce que le SSE doit fonctionner côté client sans rotation de cookie.

- **Module 28 — RLS toujours désactivée** : single-tenant + protection middleware = l'app utilise toujours l'anon key Supabase et RLS reste OFF sur toutes les tables. Les server actions n'ont pas besoin de `service_role` key. Si on bascule un jour en multi-tenant, il faudra réactiver RLS et écrire des policies par profil.

- **Module 28 — 2FA TOTP** : `otplib` génère le secret base32 + URI otpauth, lib `qrcode` affiche le QR. Codes de secours stockés en clair dans `profils.backup_codes` (text[]) — ils ne sont pas encore consommés à l'usage côté login (TODO si besoin). Si l'horloge du téléphone dérive, le code peut être rejeté — `authenticator.check()` accepte ±1 step (30s) par défaut.

## 9. Quick start

```sh
# install
npm install

# dev
npm run dev          # http://localhost:3000

# tests par module — livrés (le dev server doit tourner pour la partie HTTP)
node scripts/verify-supabase.mjs
node scripts/test-setup-save.mjs                 # Module 2
node scripts/test-ingredients.mjs                # Module 3
node scripts/test-recettes.mjs                   # Module 4
node scripts/test-engineering.mjs                # Module 5
node scripts/test-boissons.mjs                   # Module 6
node scripts/test-stock.mjs                      # Module 7
node scripts/test-fournisseurs.mjs               # Module 8
node scripts/test-service.mjs                    # Module 9A
PORT=3000 node scripts/test-tickets.mjs          # Module 9B
PORT=3000 node scripts/test-equipes.mjs          # Module 10
PORT=3000 node scripts/test-hygiene.mjs          # Module 11
PORT=3000 node scripts/test-allergenes.mjs       # Module 12
PORT=3000 node scripts/test-rh.mjs               # Module 13
PORT=3000 node scripts/test-finances.mjs         # Module 14
PORT=3000 node scripts/test-energie.mjs          # Module 15
PORT=3000 node scripts/test-maintenance.mjs      # Module 16
PORT=3000 node scripts/test-legal.mjs            # Module 17
PORT=3000 node scripts/test-dechets.mjs          # Module 18
PORT=3000 node scripts/test-groupes.mjs          # Module 19
PORT=3000 node scripts/test-clients.mjs          # Module 20
PORT=3000 node scripts/test-reservations.mjs     # Module 21
PORT=3000 node scripts/test-previsionnel.mjs     # Module 22
PORT=3000 node scripts/test-journal.mjs          # Module 23

node scripts/test-assistant.mjs                  # Module 24 (data-only)
PORT=3002 node scripts/test-assistant-e2e.mjs    # Module 24 (E2E streaming Claude — nécessite ANTHROPIC_API_KEY + crédit)
PORT=3000 node scripts/test-pilotage.mjs         # Module 25
PORT=3000 node scripts/test-affichage.mjs        # Module 26
PORT=3000 node scripts/test-formation.mjs        # Module 27
PORT=3000 node scripts/test-securite.mjs         # Module 28

# Bascule « Fournil d'abord » (août 2026)
node scripts/test-commande-statut.mjs            # règle de statut + clôture comptoir (pur, sans base)
node scripts/test-activation.mjs                 # interrupteurs par activité (restaure l'état initial)
node scripts/test-fournil-circuit.mjs            # circuit de vente Fournil bout en bout
node scripts/test-carte-fournil.mjs              # carte réelle (60 produits, prix affiches, photos)

# tests à créer au fil des modules suivants (un fichier par module, même pattern)
# node scripts/test-affichage.mjs                # Module 26
# node scripts/test-formation.mjs                # Module 27
# node scripts/test-securite.mjs                 # Module 28

# build prod
npm run build && npm start
```

Variables `.env.local` requises :

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
