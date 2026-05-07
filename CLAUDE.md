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

print/bons/[id]                → Module 9B — bons de prep 80mm (?dest=CUISINE|PIZZA|BAR, ?auto=1)
print/ticket/[id]              → Module 9B — ticket client 80mm (?auto=1)
```

### Planifiées (Modules 10-28)

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
| 16 | Maintenance & équipements | ⏳ | — |
| 17 | Obligations légales | ⏳ | — |
| 18 | Gestion des déchets | ⏳ | — |
| 19 | Gestion des groupes (TO) | ⏳ | — |
| 20 | Relation client & fidélité | ⏳ | — |
| 21 | Réservations & événementiel | ⏳ | — |
| 22 | Météo & prévisionnel intelligent | ⏳ | — |
| 23 | Journal de bord gérant | ⏳ | — |
| 24 | Assistant IA gérant | ⏳ | — |
| 25 | Pilotage stratégique (KPI + PWA) | ⏳ | — |
| 26 | Affichage dynamique salle (TV + QR) | ⏳ | — |
| 27 | Formation des équipes | ⏳ | — |
| 28 | Sécurité & accès (RBAC, 2FA, audit) | ⏳ | — |

À chaque livraison de module : `scripts/test-<nom>.mjs` doit passer 100% (setup → assertions → cleanup, bilan ✓/✗).

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

Par défaut 10% (restauration sur place) appliquée à plat sur le total HT. Stocké par recette (`recettes.tva`, default 10) et par boisson (`boissons.tva`). Le ticket client utilise un taux unique 10% — affinage TVA mixte par tag à venir.

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

- **Jest worker crash sur Windows** : Next dev en local plante régulièrement avec `Jest worker encountered child process exceptions, exceeding retry limit` sur les routes dynamiques `[id]`. Symptôme : 500 sur `/caisse/[id]/print`, `/print/bons/[id]`, etc. Toutes les routes statiques marchent. **Fix : redémarrer `npm run dev`**, ce n'est pas le code.

- **Supabase RLS** : à chaque nouvelle table créée via SQL Editor, RLS est ré-activée automatiquement. Toujours `alter table X disable row level security` à la fin de la migration, et créer un patch `00XX_disable_rls_<nom>.sql` si on l'oublie.

- **Encodage PowerShell** : Out-File / Set-Content écrivent en UTF-16 LE par défaut sur Windows. Utiliser `-Encoding utf8` ou créer les fichiers via les outils Edit/Write de Claude Code.

- **TVA mixte** : actuellement plat 10% partout. Le jour où on différencie alcool 20% / sur place 10% / vente à emporter 5,5%, recalculer à l'encaissement et dans le ticket client (constante `TVA_TAUX` dans `TicketClientPrintClient.tsx`).

- **Le projet voisin `C:\projets\monrestaurant`** est un ancien prototype, **pas** la version active. Ne pas s'y tromper.

- **Auto-impression KDS** : le toggle ON/OFF est persistant en `localStorage` par poste (`cuisine_auto_print`, `bar_auto_print`). Implémenté via iframe cachée qui appelle `window.print()` au montage. Nécessite que l'utilisateur ait interagi au moins une fois avec la page (politique navigateur).

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

# tests à créer au fil des modules suivants (un fichier par module, même pattern)
# node scripts/test-maintenance.mjs              # Module 16
# node scripts/test-legal.mjs                    # Module 17
# node scripts/test-dechets.mjs                  # Module 18
# node scripts/test-groupes.mjs                  # Module 19
# node scripts/test-clients.mjs                  # Module 20
# node scripts/test-reservations.mjs             # Module 21
# node scripts/test-previsionnel.mjs             # Module 22
# node scripts/test-journal.mjs                  # Module 23
# node scripts/test-assistant.mjs                # Module 24
# node scripts/test-pilotage.mjs                 # Module 25
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
