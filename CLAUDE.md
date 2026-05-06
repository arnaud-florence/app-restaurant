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

Les routes `(ops)` partagent un layout sombre `bg-[#0D0D0D]` (tablette en service). Les routes `/print/*` sont en dehors et héritent uniquement du root layout (fond blanc pour impression).

## 4. État d'avancement

| Module | Périmètre | Statut | Migrations |
|---|---|---|---|
| 1  | Fondations (schéma 27 tables) | ✅ | 0001, 0002 |
| 2  | Setup wizard 7 étapes (établissement, horaires, zones/tables, TVA, livraison, employés) | ✅ | — |
| 3  | Ingrédients + historique prix + allergènes | ✅ | 0003, 0004 |
| 4  | Recettes + food cost (calcul portion, marge, statut couleur) | ✅ | 0005 |
| 5  | Menu Engineering (matrice popularité × marge) | ✅ | 0006 |
| 6  | Boissons (vins/bières/softs avec marges multi-format verre/btl/pinte + accords mets-vins) | ✅ | 0007, 0008 |
| 7  | Stocks (entrées, pertes, inventaires, mouvements, déduction auto à 'servi') | ✅ | 0009 |
| 8  | Fournisseurs + bons de commande + factures + réception | ✅ | 0010, 0011 |
| 9A | Écrans service temps réel (cuisine/bar/serveur), sessions caisse, encaissement multi-paiement, tips, plan de salle grille, Z-report | ✅ | 0012, 0013 |
| 9B | Tickets imprimables 80mm (bons prep par destination, ticket client) + auto-impression KDS | ✅ | — (sans schema) |
| 10–20 | Non encore définis | ⏳ | — |
| 21 | Réservations (tables + chambres) | 🔜 | — |
| 22–28 | Non encore définis | ⏳ | — |

À chaque livraison de module : `scripts/test-<nom>.mjs` doit passer 100% (setup → assertions → cleanup, bilan ✓/✗).

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

# tests par module (le dev server doit tourner pour la partie HTTP)
node scripts/verify-supabase.mjs
node scripts/test-setup-save.mjs
node scripts/test-ingredients.mjs
node scripts/test-recettes.mjs
node scripts/test-engineering.mjs
node scripts/test-boissons.mjs
node scripts/test-stock.mjs
node scripts/test-fournisseurs.mjs
node scripts/test-service.mjs
PORT=3000 node scripts/test-tickets.mjs

# build prod
npm run build && npm start
```

Variables `.env.local` requises :

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
