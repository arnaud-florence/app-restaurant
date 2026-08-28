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
| Prix au taux du produit | `tauxTvaVente()` : le TTC servi et facturé suit `recettes.tva`, plus un taux figé | 0114 |
| Vente en ligne restreinte | boissons chaudes et formules retirées du click & collect | 0115 |
| Notification commande web | type `commande_online_recue` autorisé — l'insert échouait en silence | 0116 |
| Adresse postale | Parking des Ferrages, 83136 Sainte Anastasie sur Issole | 0117 |
| Produits hors Fournil endormis | `masque_hors_saison` — réveil par `sql/reveil-restaurant.sql` | 0118 |
| Visuels produits sans photo | plaques typographiques + vraies photos boissons de marque | 0124 |
| Factures multi-pages + lignes | scanner N pages en 1 appel, `facture_lignes`, prix d'achat auto | 0125 |
| Achat-revente + traçabilité libre | `recettes.cout_achat_ht`, `lots_produits.produit_nom` | 0126 |
| Avoirs fournisseurs | `type_document`, montants négatifs, scanner les reconnaît | 0127 |
| Hygiène & conformité | `date_releve`, suppression de lots, coffre `documents_conformite` | 0128 |
| Invendus du soir | `(ops)/invendus` — comptage à la fermeture, coût figé, synthèse 7 j | 0129 |
| Marges vivantes | `/admin/ventes` — marge brute, food cost pondéré, casse déduite | — |
| Commande conseillée | `/admin/commande-fournil` — ventes 14 j × couverture, colisage lu sur factures | — |
| Inventaire hebdo | `(ops)/inventaire` — stock compté et valorisé, repère « dernière fois » | 0130 |
| Correspondance d'achat | `recettes.libelle_achat` + `unites_par_achat` — panuozzi ← pâton | 0131 |
| Nom de la matière | `recettes.nom_matiere` — « Pâton à pizza » à l'inventaire | 0132 |
| Stock des matières | `ingredients.stocke`, `inventaires.ingredient_id` + `cible_id` | 0133, 0134 |
| Stock théorique & démarque | calcul à la lecture : comptage + factures − ventes | 0135 |
| Ventilation par activité | CA, marge et food cost par point de vente — calculés sur les LIGNES | — |
| Commissions + TVA presse | `type_revenu`, `commission_pct`/`_forfait_ht`, taux 2,1 % | 0136 |
| Pont caisse ↔ outil | journal des échanges + correspondance des catalogues | 0137 |
| Lecture patrimoniale | EBE récurrent, valeur du fonds, plus-value latente | 0143 |
| Registre légal d'ouverture | 24 obligations, drapeau `bloquant` sans date | 0147 |
| Heures de contrat décimales | un mi-temps fait 17,5 h, pas 17 ni 18 | 0148 |
| Visite guidée | accompagnement écran par écran, reprenable | 0149 |
| Bar : vendu ↔ acheté | `nom_matiere` + rendements, inventaire par poste | — |
| Allergènes vérifiés | `allergenes_valides_le` — « rien déclaré » ≠ « aucun allergène » | 0138 |
| Rapprochement caisse | contrôle quotidien reçu vs compris, page `/admin/integrations` | 0139 |
| Adaptateur Zelty | mapper pur + banc d'essai, prêt à brancher | — |

**Migrations actuelles : 0001 → 0149.**

### Réouverture de septembre — un seul geste, et une carte à saisir

Le bouton « Ouvrir le restaurant » de `/admin/etablissements` rallume
`activites_modules`. **C'est désormais le seul geste technique.**

`sql/reveil-restaurant.sql` ne fait plus rien : les 150 produits
restaurant/bar/pizza/snack étaient des **produits de test** (seed de
développement, mai-juin 2026 — Ricard, Burger Fermier, Tacos 2 viandes) et ont
été purgés le 27 août 2026, avec leurs 353 compositions et les 7 commandes
annulées qui les référençaient. Sauvegarde JSON conservée hors dépôt avant
suppression.

⚠️ Le piège évité : 71 de ces produits de test portaient `masque_hors_saison`,
donc la procédure documentée les aurait **mis en ligne** à la réouverture — sur
la caisse et sur casatasia.fr. Un « Coteaux Varois Rosé » et des « Tacos
2 viandes » qui n'existent pas.

La vraie carte du haut sera saisie quand le gérant l'aura arrêtée, et créée
directement `actif = true`. La base ne contient plus que les 96 produits du
Fournil (85 actifs).

### Ventilation par activité — sur les lignes, jamais sur l'en-tête

`getVentesStats()` rend `parPointDeVente` et `parActivite` : le CA, la marge et
le food cost de chaque étage. Le rattachement se fait sur la **ligne de vente**
(`recettes.etablissement_id`, repli `commandes.etablissement_id`), jamais sur
l'en-tête du ticket. Deux raisons, et elles sont structurelles :

- **une caisse ne donne pas toujours le point de vente.** Zelty l'a confirmé en
  démo le 27/08/2026 : sur un compte unique, ses statistiques ventilent par
  sur place / à emporter / livraison, jamais par activité ;
- **un même ticket mélange les activités** — un café du Fournil et une pizza
  sur la même addition.

C'est ce qui permet de rester sur **un seul abonnement caisse** (89 € + 39 €
la caisse secondaire) au lieu de deux comptes complets.

⚠️ Le food cost se divise par le CA HT **couvert** (produits dont le coût
d'achat est connu), pas par le CA HT total — sinon il est dilué par les
produits sans coût et paraît bien meilleur qu'il n'est : 26,2 % au lieu de
39,8 % sur les 30 jours d'août 2026. Toujours afficher la couverture à côté
du taux. Test : `node scripts/test-ventilation-activite.mjs`.

⚠️ La liste des **produits dormants** ne filtre plus sur
`tag_destination = 'FOURNIL'` : figée ainsi, aucun produit du bar ou de la
pizzeria n'aurait jamais pu y apparaître à la réouverture. `actif = true`
suffit.

### TVA : le taux du produit prime

`tauxTvaArticle(alcool, consommation)` ne connaît que le mode de consommation
et renvoie 5,5 % pour tout ce qui n'est pas alcoolisé à emporter. La carte du
Fournil mélange 5,5 % (boulangerie) et 10 % (snacking, pizzas, boissons) :
c'est **`tauxTvaVente(produit, consommation)`** qui fait foi côté catalogue,
site et encaissement en ligne. Un taux figé y ferait payer autre chose que le
prix du panneau — et sous-déclarerait la TVA sur la moitié de la carte.

`prix_vente_ht` est en `decimal(10,4)` depuis la 0114 : à 2 décimales, un TTC
de 2,40 € à 5,5 % est inatteignable (2,27 → 2,39 ; 2,28 → 2,41).

### Invendus du soir — la casse qui manquait au food cost

`(ops)/invendus` (0129) : comptage par produit à la fermeture, gros steppers
tactiles, upsert par (date, produit) — repasser corrige. `cout_unitaire_ht`
est FIGÉ à la saisie (la casse d'un jour reste valorisée au tarif de ce
jour). Quantité 0 = suppression de la ligne, pas un zéro stocké. Les
catégories boissons/formules sont exclues de la liste (rien ne s'y jette à
J+1). Synthèse 7 jours en tête de page : total € + top produits jetés —
c'est l'outil de réglage des commandes Gineys. Lien 🗑 dans l'en-tête du
KDS Fournil. Test : `node scripts/test-invendus.mjs`.

### Inventaire hebdomadaire — le stock compté et valorisé

`(ops)/inventaire` (0130) : même contrat que les invendus — upsert par
(date, produit), coût FIGÉ à la saisie (stock valorisé au tarif du jour du
comptage), quantité 0 = suppression. Saisie directe du nombre + steppers,
repère « dernière fois : N » sous chaque produit, recherche, valeur totale
en continu. Boissons incluses, formules exclues. Lien 📦 dans l'en-tête du
KDS. Test : `node scripts/test-inventaire.mjs`.

⚠️ **Le miroir caisse cherche parmi TOUS les produits, actifs ou non.**
`/api/integrations/caisse/encaissements` rapproche sans filtre `actif` : un
produit désactivé exprès (focaccias arrêtées, « Jus de fruit » remplacé par
orange/pomme) doit être RETROUVÉ, pas recréé en double au premier ticket.
La vente s'y rattache, le produit reste désactivé — donc hors site, hors
inventaire, hors commande conseillée. `.order('actif')` fait gagner un
homonyme actif sur un inactif.

**Le stock théorique se CALCULE, il ne se stocke pas.** Aucun compteur
entretenu à chaque vente : il dériverait au premier oubli (café offert, saisie
manquée, ticket non remonté) et un stock auquel personne ne croit ne sert à
rien. `(ops)/inventaire` recalcule à l'ouverture depuis les sources :

    attendu = dernier comptage + entrées (factures scannées) − sorties (ventes caisse)

Une facture scannée en retard corrige donc le chiffre toute seule. L'écart
entre l'attendu et le compté est la DÉMARQUE, affichée ligne à ligne pendant
la saisie (en pièces et en euros). Les avoirs comptent en négatif — c'est de
la marchandise rendue. Les entrées d'une ligne au colis sont multipliées par
le conditionnement ; celles d'une ligne à la pièce prises telles quelles.

⚠️ Les SORTIES ne sont connues que pour les produits revendus tels quels — la
caisse sait combien de croissants sont partis, pas combien de tranches de
jambon sont entrées dans les sandwichs (il faudrait une recette chiffrée,
hors modèle). Pour une matière première, on affiche les entrées seules et
AUCUN théorique : mieux vaut pas de chiffre qu'un chiffre faux.

**Trois produits remis à la carte le 28/08/2026** : pain aux céréales (3,20 €)
et les deux pizzas à la plaque (2,90 €), désactivés lors de la purge d'août.
Ils avaient déjà photo, prix et taux.

⚠️ Le libellé d'achat « PLAQUE PIZZA CRUE » est posé sur les **DEUX** pizzas.
Une plaque crue donne la margherita ET la jambon-fromage : n'en marquer qu'une
aurait laissé la seconde sans savoir d'où vient son coût, et sa marge se serait
affichée fausse sans que rien ne le signale. C'est le cas documenté du `filter`
plutôt que du `find`.

**40 matières suivies au 28/08/2026** (36 + ketchup, sauce barbecue, farine
T55, sacs à croissants). Sur les 134 lignes de facture : 60 rattachées à un
produit, 45 à une matière, 23 écartées, **6 en attente** — trois visent des
produits désactivés (focaccia, pain aux céréales, pizza à la plaque), un Pago
orange 33 cl qui n'existe pas au catalogue, le déca et un kit café mixte. Ce
sont des décisions commerciales, pas des correspondances à forcer.

⚠️ L'unité d'une matière (`ingredients.unite`) doit être celle de la LIGNE DE
FACTURE, pas une unité « logique » : Gineys facture la mozzarella au kg même
si elle arrive en sacs de 2 kg. Compter en sacs rendrait les entrées
incumulables. C'est aussi l'unité du prix relevé, donc la valorisation tombe
juste sans conversion.

**L'inventaire compte des produits ET des matières premières** (0133).
Un sandwich ou un panini ne se stocke pas — il s'assemble. Les catégories
Sandwich / Panini / Salade / Formule sont donc exclues de l'inventaire, et
`ingredients.stocke = true` marque les matières réellement comptées (jambon,
rosette, mozzarella, emballages…) — la table contient 100 lignes de démo du
modèle restaurant qu'il ne faut surtout pas afficher. Amorçage :
`node scripts/matieres-fournil.mjs` (36 matières issues des factures réelles).

Une ligne d'inventaire porte SOIT `recette_id`, SOIT `ingredient_id` (CHECK
`num_nonnulls = 1`). Le client envoie une `cible` : l'uuid brut pour un
produit, préfixé `ing:` pour une matière.

⚠️ **`onConflict` ne sait pas viser un index PARTIEL** — PostgREST répond
« no unique or exclusion constraint matching the ON CONFLICT specification »
et tout upsert échoue. D'où `inventaires.cible_id`, colonne générée
`coalesce(recette_id, ingredient_id)` avec un index unique TOTAL (0134) :
un seul `onConflict: 'date_inventaire,cible_id'` pour les deux types.

**Trois champs, trois rôles distincts** — ne pas les confondre :
`libelle_achat` (0131) sert à RECONNAÎTRE la ligne de facture, c'est le texte
brut du fournisseur ; `nom_matiere` (0132) est ce qu'on AFFICHE en comptant
(« Pâton à pizza ») ; `nom_caisse` est le libellé du ticket SumUp. La clé de
regroupement stock/commande est `nom_matiere ?? libelle_achat ?? nom`, mais
la recherche du conditionnement se fait toujours sur `libelle_achat`.

**On compte et on commande des MATIÈRES, pas des produits vendus.**
`(ops)/inventaire` et `/admin/commande-fournil` replient les produits qui
partagent un `libelle_achat` en UNE ligne : le congélateur contient des
pâtons, pas « Pizza ronde Reine » + « Panuozzi » ; la réserve contient une
boîte de capsules, pas quatre cafés. Les ventes et la casse s'ADDITIONNENT
sur la matière (÷ `unites_par_achat` : 10 parts de flan vendues = 1 flan à
racheter), et le coût affiché est celui de l'unité ACHETÉE
(`cout_achat_ht × unites_par_achat`). La ligne d'inventaire est portée par
un représentant stable (premier produit du groupe trié par id).

**Correspondance produit vendu ↔ matière achetée** (0131) : le produit vendu
porte rarement le nom de la matière (« Panuozzi » ← « PATON A PIZZA », les
quatre cafés ← la même capsule Lavazza, une part de flan ← 1/10 d'un flan de
2 kg). `recettes.libelle_achat` (libellé fournisseur à reconnaître) +
`unites_par_achat` (unités vendues par unité achetée) portent ce lien ;
saisissables dans la fiche produit. La propagation utilise `filter` et non
`find` : une ligne de facture peut alimenter plusieurs produits. Amorçage :
`node scripts/correspondances-achat.mjs`.

⚠️ **L'UNITÉ DE LA LIGNE de facture décide, AVANT le C=N.** Gineys facture
tantôt au colis (`q=2 Col, pu=20,31`), tantôt à la pièce (`q=27 Pce,
pu=1,26`) — pour un libellé portant C=27 dans les deux cas. Diviser par C=N
une ligne déjà au détail donnait un moelleux à 4,7 centimes (food cost 3 %).
`extraireConditionnement()` lit aussi le format Brake sans « C= » (« 100
capsules », « Carton de 50 dosettes ») mais REFUSE les contenances
(« 90G », « 33 cl ») — les prendre pour un colisage diviserait un prix par
un poids.

⚠️ **Propagation des prix facture → produits : TOUJOURS à la pièce.** Le
prix de ligne Gineys est celui du COLIS (« CROISSANT … C=96 » = 28,84 € le
carton) : écrit tel quel dans `cout_achat_ht`, il a produit un croissant à
40 € de coût (vécu le 22/08, 4 produits corrompus par un scan). La
propagation divise par `extraireConditionnement()` (C=N), ne propage sans
C=N que si l'unité de ligne dit « pièce », et refuse tout coût ≥ 95 % du
prix de vente HT. Restauration : `node scripts/alimenter-couts-achat.mjs`.

### Factures fournisseurs : les lignes font les marges

`facture_lignes` (0125) conserve le détail extrait par le scanner Claude
Vision — il était jeté avant, seuls les totaux survivaient. À la création
d'une facture, chaque ligne est rapprochée d'un ingrédient (normalisation
casse/accents, noms ≥ 4 caractères — un faux rapprochement écrirait un faux
prix, pire qu'aucun) ; les lignes rapprochées mettent à jour
`ingredients.prix_achat_ht` et tracent `historique_prix_ingredients`
(source `livraison`).

Le scanner accepte jusqu'à 8 pages **dans un seul appel** Claude Vision
(un JSON unique : totaux non dupliqués, pas de fusion de « reports »). Le
front réduit chaque photo à 1600 px avant envoi — 3 photos d'iPhone brutes
dépasseraient la limite de corps de requête Vercel (~4,5 Mo).

**Modèle Fournil : achat-revente, pas composition** (0126). Le Fournil achète
quasi tout surgelé et revend sans transformation : le coût d'un produit est
`recettes.cout_achat_ht` (prix d'achat par unité vendue), pas une recette
chiffrée. `synthese()` (src/lib/foodCost.ts) ADDITIONNE composition et coût
d'achat : achat-revente pur → composition vide ; les ~5 % transformés → les
deux. Alimentation : champ « Coût d'achat HT » de la fiche produit, et
propagation automatique depuis les lignes de facture scannées (rapprochement
par nom **et** `nom_caisse`, même prudence que pour les ingrédients).
Ne PAS relancer le chantier « saisir les 90 compositions » : il est hors
modèle. Tests : `node scripts/test-facture-lignes.mjs`,
`node scripts/test-achat-revente.mjs`.

**La référence fournisseur prime sur le libellé** (0142). Le rapprochement
d'une ligne de facture se faisait par le NOM normalisé, avec un seuil de
4 caractères — fragile par construction, et la 0125 le disait déjà : « un faux
rapprochement écrirait un faux prix, pire qu'aucun ».

Les factures Gineys portent une **référence par ligne**, et c'est la même que
celle du catalogue **Arti'Pat** — leur gamme boulangerie (« ARTIPAT » apparaît
d'ailleurs dans les libellés). Une référence ne change pas quand le libellé
change, ne souffre ni des accents ni des abréviations, et ne confond pas deux
produits proches.

Le scanner ne l'extrayait pas : elle était **perdue à chaque scan**. Il la
demande désormais (`reference`, avec consigne explicite de ne jamais en
inventer une — elle sert à écrire un prix d'achat). Elle est stockée sur
`facture_lignes.reference`, et `recettes.reference_fournisseur` /
`ingredients.reference_fournisseur` portent la contrepartie.

Ordre de rapprochement : **référence d'abord, libellé ensuite**. Le chemin par
le nom reste actif — toutes les factures antérieures n'ont pas de référence,
et tous les fournisseurs n'en impriment pas.

**La correspondance s'APPREND au scan (28/08/2026).** Le scanner extrayait la
référence, s'en servait pour rapprocher, puis la **jetait**. Chaque facture
repassait donc par le libellé — fragile par construction — et les 134 lignes
déjà scannées n'avaient laissé **aucune** référence derrière elles. La cause du
14 % de `libelle_achat` renseigné est là : chaque correspondance demandait à un
humain de taper un lien, et un humain ne le fait pas.

Désormais, une ligne rapprochée par le NOM et portant une référence **écrit
cette référence** sur le produit ou la matière. Le scan suivant est exact.
C'est le motif déjà éprouvé par le pont caisse (0137), appliqué aux factures.

⚠️ **Trois verrous, parce qu'une référence fausse est pire qu'une référence
absente** — elle passe AVANT le nom, donc elle se trompe en silence et pour
toujours : on n'apprend que si la ligne portait une référence, que si le
rapprochement s'est fait par le nom, et que si le nom a désigné **un seul**
produit. Une ligne qui en nourrit plusieurs (la capsule des quatre cafés)
n'enseigne rien. Une référence déjà en place n'est jamais écrasée.
`createFacture` rend `correspondances_apprises`.
Test : `node scripts/test-apprentissage-references.mjs` — ⚠️ il RECOPIE la
règle, modifier les deux ensemble.

**`/admin/correspondances` — les lignes que rien n'a reconnu (0145).** La
moitié manquante de l'apprentissage : une ligne rapprochée par le nom apprend
sa référence toute seule, mais une ligne que rien ne reconnaît restait
**invisible**. Mesure au 28/08/2026 : **127 lignes sur 134 orphelines, 95 %**.
Chacune est un prix d'achat perdu — stock théorique, démarque, commande
conseillée et marge du produit ignorent qu'elle existe.

`facture_lignes.recette_id` (0145) manquait pour ça : la ligne disait à quelle
MATIÈRE elle se rattachait, jamais à quel PRODUIT VENDU — le cas courant en
achat-revente. Une ligne qui nourrissait un produit était donc indistinguable
d'une orpheline, les deux ayant `ingredient_id` à NULL.

⚠️ Les composants **« Formule — … » sont exclus des cibles** : ils ne
s'achètent pas. Sans ça ils sortaient EN TÊTE pour les lignes croissant et pain
au chocolat — leur nom contient les deux mots — et un rattachement y aurait
écrit un prix d'achat sur un produit qui n'existe pas.

⚠️ Le score de suggestion départage par la **couverture**, pas seulement par le
nombre de mots communs : « Pain au chocolat » et « Cappuccino ou chocolat
chaud » en partagent autant avec une ligne « PAIN AU CHOCOLAT PREPOUSSE ». Une
cible dont TOUS les mots sont retrouvés passe devant. 77 % des orphelines ont
au moins une piste.

⚠️ **Le rattachement écrit aussi `libelle_achat`**, et c'est ce qui compte : sans
lui, le geste ne faisait que vider une liste. `libelle_achat` est LA clé de
regroupement du stock théorique, de la démarque et de la commande conseillée —
les rattacher sans l'écrire laissait ces trois fonctions à 12 produits sur 120.
On peut se le permettre ici alors que l'apprentissage automatique ne le
pouvait pas : ce n'est pas une déduction sur un nom, c'est un humain qui a
désigné la cible. Jamais écrasé s'il existe.

⚠️ **L'en-tête de bon de livraison est retiré du libellé.** Certaines lignes
Gineys sont préfixées « BORMES LES MIMOSAS B.L. 3447302 du 20/08/26 CROISSANT
… ». Écrit tel quel, ce libellé ne correspondrait JAMAIS à une autre facture :
il porte un numéro de BL et une date.

⚠️ **Le FORMAT doit concorder** dans le rattachement de masse
(`scripts/rattacher-lignes-certaines.mjs`). « PAGO NECTAR ORANGE PET 33CL » se
rapprochait de « Pago orange 20 cl » — tous les mots de la cible étaient
présents, le contenant ne l'était pas. Il n'existe pas de Pago orange 33 cl :
c'est un produit à créer, pas une correspondance à forcer.

⚠️ Le rattachement **ne propage PAS le prix**. Le calcul à la pièce dépend de
l'unité de ligne et du C=N ; se tromper écrit un coût faux qui détruit une
marge en silence — un croissant à 40 € a déjà été vécu. La prochaine facture le
fera correctement, avec toutes ses données sous la main.

`facture_lignes.ignoree` écarte définitivement ce qui ne correspond à rien de
vendable (port, consigne, remise de fin de mois) : sans ça elles reviennent à
chaque ouverture et rendent l'écran illisible, donc inutilisé.

**Le catalogue Arti'Pat comme pièce de contrôle.** 292 pages, 146 Mo —
indexé par `scripts/indexer-catalogue-artipat.mjs`, 599 références avec
colisage et prix indicatif. Trois usages :

1. **vérifier le colisage** — 20 sur 34 concordent exactement avec le `C=N`
   lu sur les factures ;
2. **vérifier un prix** — le tarif catalogue est INDICATIF ; Gineys consent
   20 à 30 % de remise. Un prix payé calculé AU-DESSUS du tarif signale un
   mauvais rapprochement, pas une hausse ;
3. **récupérer les vraies photos produit** — extraction des images intégrées
   via pdfjs (`page.getOperatorList()` + `page.objs`), recadrées en 900×675
   comme le reste de la grille.

⚠️ Le catalogue ne couvre QUE la gamme Arti'Pat. Le « Coulant Gourmand au
chocolat » (Carigel) et les glaces n'y sont pas : `libelle_achat` reste la
source pour ceux-là.

⚠️ **Un produit créé par la caisse peut DOUBLONNER un produit des affiches.**
Vécu : « Lin tournesol » (créé depuis un ticket SumUp) et « Pain
lin-tournesol » (issu des affiches) — même prix, même coût, même famille, deux
fiches. Fusion : on garde le nom de VITRINE, on lui transfère le `nom_caisse`
du doublon pour que les tickets s'y rattachent, on **déplace les ventes**
(sinon elles disparaissent du CA par produit alors qu'elles ont eu lieu), puis
on désactive le doublon **en effaçant son `nom_caisse`** — sans ça le miroir
pourrait encore le choisir et le rattachement redeviendrait ambigu.

Rejoué le 28/08/2026 sur **six** focaccias fondues en une seule (« Focaccia »,
4,90 €) : les six déclinaisons ne se distinguaient que par leur garniture,
qui se choisit au comptoir.

⚠️ **Après une fusion ou une création, contrôler quatre champs**, chacun
muet quand il manque :

| Champ | Ce qui casse en silence |
|---|---|
| `etablissement_id` | les ventes sortent de la ventilation par activité |
| `categorie` | famille inconnue de la caisse → **bouton sans famille**, introuvable au comptoir |
| `vendable_online` | le produit reste hors click & collect sans raison |
| `image_url` | pas d'image = invisible du site (le menu public exige famille ET photo) |

Une famille à un seul produit n'a pas sa place sur une caisse : la Focaccia
est rangée en **Sandwich**, où « Le Poulet » est au même prix. Contrôle :
`sans famille` dans `verifier-carte-zelty.mjs`, et l'assertion « tous
rattachés au point de vente » de `test-carte-fournil.mjs`.

⚠️ **Une photo de banque d'images n'est pas une photo produit.** Le « Pain
aux céréales » en portait une (Unsplash) : le client aurait vu le pain de
quelqu'un d'autre. Remplacée par une plaque typographique — assumer qu'on
n'a pas encore photographié vaut mieux que montrer autre chose.

**Garde-fou anti-doublon de facture.** `createFacture` REFUSE un numéro déjà
enregistré chez le même fournisseur et pour le même `type_document` — deux
scans de la même facture Promocash avaient gonflé les achats de ~447 € en
silence. Le double critère est nécessaire : deux fournisseurs numérotent
chacun leur série, et une facture peut légitimement partager son numéro avec
son avoir. `forcer_doublon: true` passe outre ; la case correspondante
n'apparaît dans le formulaire QU'APRÈS le refus (toujours visible, elle
finirait cochée par habitude). Test : `node scripts/test-doublon-facture.mjs`
— ⚠️ il RECOPIE la règle, modifier les deux ensemble.

**Avoirs fournisseurs** (0127) : même table et même scanner que les factures,
distingués par `type_document`. **Montants stockés en négatif** — l'UI saisit
du positif, l'action applique le signe — pour que toutes les sommes
existantes (dettes du pilotage, P&L, snapshot assistant) restent justes sans
modification. Les lignes d'un avoir ne propagent JAMAIS de prix d'achat :
c'est de la marchandise rendue, pas un tarif. `facture_liee_id` (on delete
set null) référence la facture d'origine. Test : `node scripts/test-avoirs.mjs`.

**Relevés température : `date_releve` est la date métier** (0128).
`created_at` n'est que l'horodatage d'insertion — un relevé saisi après coup
porte sa vraie date. TOUS les lecteurs (agent HACCP, registre imprimable,
snapshot assistant, mon-espace, page hygiène) filtrent sur `date_releve` ;
un nouveau lecteur doit faire pareil. La NC auto d'un relevé hors plage porte
aussi cette date.

**Documents de conformité** (0128) : bucket Storage public `conformite`
(créé par `scripts/creer-bucket-conformite.mjs`) + table
`documents_conformite`. Upload via `POST /api/conformite/documents`
(multipart, manager only — les server actions plafonnent à ~1 Mo, d'où la
route API) ; suppression via DELETE qui efface fiche ET fichier. UI :
`/admin/legal` → onglet 📁 Documents, catégorie en texte libre, alerte
expiration à J-30. Test : `node scripts/test-conformite.mjs`.

**Scanner de traçabilité** (`POST /api/agents/scanner-lots`) : photos des
étiquettes produit OU d'une page de cahier manuscrite → Claude Vision extrait
la liste des lots (produit, DLC, n° de lot, marque) → relecture ligne à ligne
obligatoire dans l'UI (l'OCR du manuscrit se trompe parfois d'un chiffre) →
création groupée. Bouton « 📷 Scanner étiquettes » dans /admin/hygiene,
onglet lots. Une photo peut porter plusieurs lots — la réponse est un tableau.

**Suppression de lots** (`supprimerLot`) : réservée aux erreurs de saisie —
le cycle de vie normal (consommé, jeté, expiré, rappelé) passe par les
STATUTS, qui gardent la trace au registre.

**Traçabilité en saisie libre** (0126) : `lots_produits.produit_nom` — on
trace n'importe quelle réception au clavier, le lien ingrédient est
facultatif. L'affichage montre `produit_nom ?? ingredient_nom`.

### ⛔ Plus jamais de commande de test sur le circuit réel

Depuis le 22 août 2026, **le Fournil attend de vraies commandes web** : toute
commande ONLINE est réelle et doit être traitée. Interdiction de créer des
commandes de test via le site ou `/api/public/commande` — l'équipe ne peut
pas distinguer un test d'une vraie livraison à préparer, et une vraie
commande noyée dans les tests serait manquée. Pour valider un changement du
tunnel : s'arrêter à l'étape de paiement SANS confirmer, ou tester la logique
en pur (scripts de test qui n'écrivent pas de commande ONLINE `en_attente`).
Si le gérant demande explicitement un test de bout en bout : nom de client
« TEST », prévenir l'équipe avant, supprimer immédiatement après.

### Clôture d'une commande web retirée au comptoir

`estRetraitFournil()` (dans `src/lib/commande-statut.ts`) clôt en `encaisse`
une commande ONLINE entièrement servie dont tous les articles sont FOURNIL et
qui n'est pas une livraison — même raisonnement que la vente au comptoir : le
client règle sur la caisse agréée en récupérant son sac. Sans elle, la commande
restait bloquée à `pret` (la chaîne d'états du ticket s'arrête là) et son CA
n'apparaissait nulle part.

Le bouton **« 📦 Remis au client »** du KDS est derrière la prop
`permetRemise`, fausse par défaut : en cuisine et au bar, c'est le serveur qui
clôt, pas la brigade.

⚠️ `scripts/test-commande-statut.mjs` **recopie** cette règle au lieu de
l'importer (la source est en TS) : modifier les deux ensemble.

### Activation par activité — TOUT ouvre en septembre 2026

⚠️ **Date corrigée le 28/08/2026 : l'ouverture de TOUTES les activités est
visée en septembre**, pas fin octobre. Les travaux sont en cours, et c'est la
fenêtre pour structurer. Toute la documentation antérieure qui parle de « fin
octobre » pour le restaurant est périmée.

⚠️ **La table `activites_modules` était VIDE** (constaté le 28/08/2026, jeu de
la migration 0110 rejoué depuis). L'application tournait donc sur son repli
`REPLI_FOURNIL_SEUL` — ce qui donnait le bon résultat par accident, et masquait
la panne. Le bouton « Ouvrir le restaurant » aurait mis à jour **zéro ligne** et
renvoyé un succès : `basculerActivite()` lit les modules de l'activité puis les
met à jour, donc sur une table vide il ne fait rien et le dit comme une
réussite. Découvert le jour de l'ouverture, à 6 h 20, c'était une matinée
perdue.

**Répétition générale** : `PORT=3000 node scripts/test-ouverture-septembre.mjs`
joue le geste en entier — bascule du groupe restaurant, vérification de ce que
le public et la caisse voient, puis **restauration systématique** de l'état
initial, même en cas d'échec. Le 30 septembre à 6 h 20 ne doit pas être le
premier essai.

⚠️ Il échoue aujourd'hui sur **un seul point, et c'est voulu** : les activités
CUISINE et PIZZA n'ont **aucun produit**. Allumer un module ne crée pas une
carte — le module s'allume, la carte reste vide, et le client ne voit rien. Ce
test repassera au vert le jour où la carte du restaurant et de la pizzeria
sera saisie. C'est le dernier verrou avant septembre.

**Contrôle à faire avant toute ouverture** : `select count(*) from
activites_modules` doit rendre **14**. Le repli est une sécurité, pas un état
normal — s'il est actif, c'est que la configuration a disparu. Tout est piloté par une seule table, `activites_modules` (migration 0110), et **aucun code n'est à modifier pour rouvrir**.

| Où | Quoi |
|---|---|
| `activites_modules` | 14 modules répartis en `fournil` / `restaurant` / `commun`. Colonnes : `actif`, `teaser`, `date_ouverture_prevue`. |
| `/admin/etablissements` | Le tableau des interrupteurs + bouton **« Ouvrir le restaurant »** (bascule groupée) + réglages de la livraison Fournil. |
| `src/lib/activation/config.ts` | Types, clés, correspondances module → tags / PdV / routes, repli. Client-safe. |
| `src/lib/activation/server.ts` | `getActivation()`, `estActif()`, `gardeModule()`. Server-only, mémoïsé par requête. |
| `GET /api/public/activation` | Sert l'état au site public (TTL 60 s). |

**Règle du repli** : quand la base ou l'API est injoignable, on retombe sur `REPLI_FOURNIL_SEUL` — **jamais** sur « tout ouvert ». Une panne ne doit pas dévoiler une activité qui n'a pas ouvert ; l'erreur inverse est irrattrapable.

**Points de branchement** : `lib/navigation.ts` (`filtrerCategories`), les pages ops/admin (`gardeModule` + `<ModuleEnVeille />`), `/api/public/menu` (filtre par `tag_destination`), et `lib/agents/runner.ts` (`agentEnVeille`).

Ouverture de septembre : `/admin/etablissements` → groupe Restaurant → **« Ouvrir le restaurant »** (7 modules d'un coup). Le site suit en moins d'une minute. Ne pas rejouer 0111, qui est la migration de fermeture.

Tests : `node scripts/test-activation.mjs` (restaure toujours l'état initial), `node scripts/test-commande-statut.mjs`, `node scripts/test-fournil-circuit.mjs`, `node scripts/test-carte-fournil.mjs`.

### 🧾 La frontière entre les caisses et l'outil (24 août 2026)

**L'outil ne prend plus de commande et n'encaisse plus.** Chaque activité
vend sur SA caisse (Fournil aujourd'hui ; bar / restaurant / pizzeria à la
réouverture), l'outil reçoit les tickets et sert au pilotage. La règle vit
dans **`src/lib/frontiere-caisse.ts`** — `VENTE_EN_CAISSE` est un
interrupteur d'ARCHITECTURE, pas un réglage de confort.

Pourquoi la frontière est nette : deux systèmes qui prennent des commandes
divergent toujours ; la caisse agréée est la source légale (NF525) et un
second encaissement produirait un CA parallèle sans valeur fiscale ; et
l'équipe ne doit jamais se demander « je saisis où ? ».

Écrans RETIRÉS (remplacés par une page d'explication, pas un 404) :
`/serveur` (plan de salle, prise de commande, encaissement), `/caisse`
(session, Z-report), `/emporter`. Leur code est dans l'historique git au
commit du retrait. L'encaissement a aussi été retiré du KDS bar, qui
PRÉPARE et n'encaisse plus.

Écrans CONSERVÉS, parce qu'ils n'ont pas d'équivalent en caisse : la
préparation (KDS), les commandes du site web, la tournée du livreur, et
tout le pilotage.

⚠️ Avant d'ajouter un écran qui saisit une vente, relire ce fichier : la
réponse par défaut est « ça se fait sur la caisse ».

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

Le **2,1 % (presse)** est supporté depuis la 0136 : `TauxTva = 2.1 | 5.5 | 10
| 20`, et `TAUX_ADMIS` sert de garde à `tauxTvaVente()`. Auparavant ce taux
était rejeté en silence et un journal sortait à 5,5 %.

| Cas | Taux |
|---|---|
| Alcool (sur place ou emporter) | 20 % |
| Plat / soft consommé sur place | 10 % |
| Plat / soft à emporter | 5,5 % |

Le taux est calculé par `tauxTvaArticle(contient_alcool, consommation)` et persisté par ligne (`commande_articles.tva_taux`, `tva_eur`) avec une ventilation par taux sur la commande (`ventilation_tva`). La carte Fournil (0113) porte les bons taux par produit : 5,5 % pains/viennoiseries/pâtisseries/gourmandises, 10 % snacking, pizzas et boissons.

⚠️ **20 % sur une denrée alimentaire est presque toujours une erreur de
CAISSE.** Constaté le 28/08/2026 : 7 produits actifs du Fournil (Paris-Brest,
moelleux choco, croque-monsieur, glace Mario, cône vanille, fusée, Sunroll)
étaient à 20 % sans contenir d'alcool. Tous créés automatiquement depuis les
tickets — **le taux venait de SumUp**. 8,13 € de TVA sur-collectée en 11 jours
de vente, soit ~270 €/an : pas un risque légal (sur-collecter ne se sanctionne
pas) mais de la marge pure, le prix du panneau ne bougeant pas.

Corrigé en recalculant `prix_vente_ht` pour que **le TTC affiché reste
identique au centime** — c'est le net qui monte, jamais le tarif.

⚠️ **La correction dans l'outil ne corrige PAS la caisse.** Le taux facturé
au client vient du ticket, donc de SumUp : tant qu'il n'y est pas changé, les
nouvelles ventes continuent d'arriver à 20 %. Le connecteur signale désormais
ces créations dans `tva_20_suspecte` pour que ça ne repasse plus inaperçu.

⚠️ **Formules petit-déjeuner : 10 % assumé.** Une « Formule Express » (café à 10 % + croissant à 5,5 %) est un panier mixte, mais `recettes.tva` ne porte qu'un taux. Le choix est le taux haut : sur-collecter est rattrapable, sous-collecter ne l'est pas. À revoir si ces formules pèsent lourd dans le CA.

### Adaptateur Zelty — écrit sur la documentation officielle

Écrit d'après **https://docs.zelty.fr (API 2.11)**, lue le 28/08/2026 avec le
compte fourni par Zelty. Tout l'inconnu reste enfermé dans une fonction PURE,
`src/lib/integrations/zelty/mapper.ts`.

| Fichier | Rôle |
|---|---|
| `zelty/schema.ts` | Forme réelle d'une commande (`OrderGet`, `OrderEntryGet`, `Transaction`). |
| `zelty/mapper.ts` | Traduction pure vers le format du connecteur. Aucun réseau, aucune base. |
| `zelty/client.ts` | HTTP : Bearer, pagination, `expand[]`, réessais. |
| `/api/cron/caisse/zelty` | Orchestration. `?dry=1` traduit et montre **sans rien écrire**. |
| `/api/integrations/zelty/verifier` | Banc d'essai : on colle une commande, il dit ce qu'il en fait. |

**Le contrat, tel qu'il est vraiment :**

- base `https://api.zelty.fr/{version}/{endpoint}`, version **2.11** ;
- `Authorization: Bearer <clé>` — la clé se génère depuis le back-office ;
- `from` / `to` au format **AAAA-MM-JJ**, pas de l'ISO complet ;
- pagination `limit` (défaut 100, **max 200**) + `offset` ;
- réponse enveloppée : `{ orders: [...], errno }` ;
- **montants ENTIERS en centimes** (`total: 1240` = 12,40 €) ;
- `price` et `tax` d'une ligne sont des **objets**
  (`price.final_amount_inc_tax`, `tax.tax_rate`, `tax.tax_amount`) ;
- l'identifiant stable d'un produit est `items[].item_id` — il alimente les
  correspondances de catalogue (0137).

⚠️ **`expand[]=items` est obligatoire pour obtenir le détail des lignes.**
Sans lui, `items` revient **vide** et le CA serait juste pendant que stock,
food cost et marges resteraient aveugles — sans la moindre erreur visible.
C'est le piège principal de cette API, et c'est ce qui explique que le
commercial n'ait pas su répondre en démo. Le client demande aussi
`transactions`, `transactions.method` (mode de paiement) et `price.taxes`.
Le mapper **signale** l'oubli si aucune commande ne porte de ligne.

⚠️ **La pagination n'est pas un confort.** Sans elle, l'API s'arrête à 100
commandes. Le Fournil fait déjà 75 tickets un bon jour : deux jours suffiraient
à perdre des ventes en silence, et le rapprochement quotidien crierait sans
qu'on sache pourquoi.

⚠️ **`is_sandbox=false`** est forcé : le mode entraînement de la caisse ne doit
jamais entrer dans le chiffre d'affaires.

⚠️ **`ZELTY_MONTANTS_EN_CENTIMES` n'a pas de valeur par défaut**, alors même
que la doc dit « centimes ». Se tromper multiplie le CA par cent et rien dans
les données ne le signale — les montants restent des nombres valides. La route
refuse de démarrer sans le réglage, et le mapper crie si le panier moyen
devient absurde.

⚠️ **La quantité d'une ligne n'est PAS documentée sur `GET /orders`** (elle
l'est sur la création). Le mapper prend 1 et le **dit** dans les
avertissements : une quantité muette transformerait 3 croissants en 1. À
confirmer sur une charge utile réelle.

⚠️ **`GET /orders` exclut par défaut** les commandes annulées
(`include_cancelled`) et ouvertes (`opened`). Le contrôle de statut du mapper
est une seconde barrière, pas la première. Le statut documenté est une chaîne
(`opened`) ; la forme numérique 255 est aussi acceptée par prudence.

#### Miroir du catalogue — `GET /catalog/dishes`

`/api/cron/caisse/zelty/catalogue[?dry=1]`. Zelty devient maître des données
**commerciales** — nom, prix, TVA, disponibilité, ce qui s'imprime sur le
ticket. L'outil garde ce qu'aucune caisse ne portera jamais : photos,
allergènes, prix d'achat réels, correspondance « Panuozzi ← pâton ».

Ce que la doc apporte, et qui tombe étonnamment bien :

- **`remote_id`** est un champ libre côté Zelty : on peut y écrire NOTRE
  identifiant. Un rapprochement par le nom suffit **une seule fois**, ensuite
  le lien est exact des deux côtés et les noms peuvent changer librement ;
- **`price_togo` et `tax_takeaway`** existent séparément de `price`/`tax` :
  le 5,5 % / 10 % français est natif, sans calcul de notre côté. Le Fournil
  vendant à emporter, ce sont eux qui font foi ;
- **`disable_takeaway` / `disable_delivery`** donnent la structure 7
  (disponibilités) sans rien inventer ;
- `fab_name` est le poste de production — l'équivalent de `tag_destination`.

⚠️ **La TVA arrive en MILLIÈMES : 1000 = 10 %, 550 = 5,5 %.** La prendre pour
un pourcentage facturerait une TVA à 1000 %.

⚠️ **`zc_only` veut dire « caisse seulement ».** Publier ces plats sur le site
afficherait des produits que le client ne peut pas commander (café offert,
gestes commerciaux). Ils restent actifs mais jamais `vendable_online`.

⚠️ **Zelty renvoie `null`, pas l'absence**, pour tout prix ou taxe non
renseigné : `price_delivery`, `cost_price`, `tax_delivery` sur un produit non
livré. En zod, `.optional()` accepte `undefined` mais REJETTE `null` — un seul
champ nul faisait tomber le plat entier dans « illisible ». Vécu sur les
données réelles : **84 plats reçus, 84 rejetés**, et le miroir se croyait vide
sans qu'aucune erreur ne remonte. Les champs numériques du schéma sont donc en
`.nullish()`. Cas de non-régression dans `test-zelty-catalogue.mjs` (18
assertions) — il échoue bien si on retire le correctif.

⚠️ **`limit=0` renvoie TOUT**, pas zéro — c'est documenté et contre-intuitif.
Une pagination de repli existe au cas où ce comportement changerait : un
catalogue tronqué en silence casserait le rapprochement sans le dire.

⚠️ **Rien n'est créé automatiquement.** Un plat Zelty sans correspondance est
REMONTÉ, pas inventé : créer à l'aveugle doublonnerait nos 85 fiches du
Fournil dès le premier appel. Et un écart de prix supérieur à 0,50 € est
signalé au lieu d'être appliqué en silence — ce n'est pas un arrondi, c'est
une décision commerciale.

Test : `PORT=3000 node scripts/test-zelty-catalogue.mjs` — 16 assertions, sans
compte ni clé.

#### Émission des commandes web — `POST /orders`

Confirmé par la documentation : on **crée une commande déjà réglée** en
joignant le tableau `transactions` (`name` = libellé EXACT d'un mode de
paiement du restaurant, `price` en centimes). La réponse revient en
`status: 255`. casatasia.fr reste donc notre site.

**Idempotence native** : un `remote_id` stable rend le renvoi sûr après un
timeout — l'API répond 200 avec `already_registred: true` et la commande
existante au lieu d'en créer une seconde. C'est exactement ce qu'il faut pour
une file d'attente avec reprise.

⚠️ **Le piège qui coûte de l'argent.** Si le `total` envoyé est **INFÉRIEUR**
au total recalculé par Zelty, la commande est **acceptée en silence** et Zelty
crée une remise globale égale à l'écart. Aucune erreur. Un décalage de tarif
entre notre catalogue et le leur ferait donc fuiter la marge sur **chaque**
commande web, invisiblement. Un `total` supérieur, lui, est rejeté en 400.
→ Toujours **vérifier l'égalité côté client** avant d'envoyer, ne jamais
compter sur un 400 pour l'attraper.

⚠️ **`item_id` est un champ MORT sur POST** — il faut envoyer `id` (entier).
Sur GET c'est l'inverse : `items[].item_id` porte l'identifiant. Les
correspondances de catalogue (0137) doivent donc stocker l'identifiant
numérique, utilisable dans les deux sens.

⚠️ **Deux validations que Zelty ne fait pas** : un menu envoyé avec MOINS de
parties que sa configuration est accepté et facturé plein tarif ; et une
`option_value_id` valide mais non rattachée au plat passe sans erreur, la
commande arrive incohérente en caisse. Construire les options depuis le
catalogue Zelty, jamais depuis notre propre correspondance.

`mode` est obligatoire ; `source` doit rester `web` (les valeurs des
plateformes de livraison sont réservées aux agrégateurs) ; `due_date` doit
être ISO-8601 et dans le futur. L'endpoint répond 404 sur une version d'API
antérieure à 2.11.

**Envoi effectif** : `/api/cron/caisse/zelty/emission[?commande=<uuid>][&dry=1]`
(migration 0140 : `commandes.caisse_externe_systeme` / `_id` / `_at`, colonnes
volontairement GÉNÉRIQUES — le connecteur survivra à un changement de caisse).

Deux usages, une seule route : appelée avec `?commande=` juste après un
paiement pour l'immédiateté, et sans paramètre par le cron pour rattraper ce
qui n'est pas parti. **C'est la file d'attente** : un envoi échoué laisse
`caisse_externe_id` à NULL et repart au tour suivant, sans risque de double
vente grâce à l'idempotence de `remote_id`.

⚠️ **TOUT OU RIEN.** Si une seule ligne du panier n'a pas de correspondance
Zelty, la commande entière est REFUSÉE. Envoyer le panier amputé serait
accepté sans erreur, et la caisse créerait une remise égale à la ligne
manquante : le client paierait chez nous ce que la caisse offrirait chez elle.

⚠️ Un règlement n'est joint **que s'il a vraiment eu lieu chez nous**. Une
commande à payer au comptoir doit rester à encaisser dans la caisse.

⚠️ Reprise bornée à **7 jours**. Au-delà, une commande jamais partie relève du
diagnostic, pas de la reprise automatique — l'injecter des semaines plus tard
fausserait le Z du jour.

`ZELTY_MODE_PAIEMENT_EN_LIGNE` doit correspondre **exactement** au libellé
d'un mode de paiement configuré dans Zelty : un nom inconnu renvoie 400
« Méthode de paiement invalide ».

Test : `PORT=3000 node scripts/test-zelty-emission.mjs` — 19 assertions, sans
compte ni clé.

#### Import initial de la carte — outil → Zelty

`/api/cron/caisse/zelty/import[?dry=1][&tag=FOURNIL]`. Zelty arrive **vide** :
plutôt que de saisir 85 produits à la main — avec les fautes de frappe et les
prix mal recopiés que ça implique — on pousse la carte qu'on a déjà, prix,
TVA et **photos** compris (Zelty accepte une URL d'image, et les nôtres sont
absolues).

⚠️ **Notre identifiant part dans leur `remote_id`.** C'est ce qui rend la
correspondance exacte dès le premier jour : plus jamais de rapprochement par
le nom, et un produit renommé de part et d'autre reste le même produit.

⚠️ **Aucun `id` n'est envoyé** : un `id` inconnu ferait échouer l'appel, un
`id` réutilisé écraserait un plat existant. L'import CRÉE ; la mise à jour
passe par le miroir. Le garde-fou anti-doublon est la table des
correspondances : seuls les produits sans lien sont envoyés, et les
identifiants rendus par Zelty sont enregistrés **immédiatement** — sans ça un
second lancement recréerait toute la carte en double, sans rien signaler.

⚠️ **La TVA SUR PLACE suit la loi, pas le panneau.** Notre `tva` est le taux
de l'emporter ; le recopier tel quel sous-déclarerait un croissant mangé à
table (10 %, pas 5,5 %). L'alcool reste à 20 % et la presse à 2,1 % dans les
deux modes. Le prix affiché ne change pas — c'est le taux qui change, donc la
marge sur place est légèrement moindre. C'est la règle française.

Le mode `?dry=1` **ne demande aucune clé** : il ne contacte personne, ce qui
permet de relire toute la carte avant même d'avoir un compte.

Test : `PORT=3000 node scripts/test-zelty-import.mjs` — 17 assertions.

#### Disponibilités — `POST /catalog/dishes` (0141)

`/api/cron/caisse/zelty/disponibilites[?dry=1]`. L'inventaire du matin sait
qu'il ne reste que quatre paninis ; sans le dire à la caisse, on continue de
les vendre en ligne et il faut ensuite l'expliquer au client sur le pas de la
porte.

⚠️ **C'est le sens le plus dangereux de toute l'intégration.**
`POST /catalog/dishes` est un **UPSERT** qui exige `name`, `price` et `tax`.
Un objet incomplet peut **écraser le prix d'un plat dans la caisse** — c'est-
à-dire ce qui s'imprime sur les tickets et fait foi fiscalement.

La règle du fichier `zelty/disponibilite.ts` est donc absolue : on RELIT le
catalogue juste avant, on **recopie** les champs obligatoires tels quels, on
ne touche QUE les drapeaux, et on **REFUSE de construire** si l'un des trois
manque. Aucun prix n'est jamais inventé.

⚠️ **La rupture coupe `disable_takeaway` et `disable_delivery`, JAMAIS
`disable`.** Éteindre `disable` ferait relire « produit inactif » par le
miroir du catalogue, qui éteindrait la fiche chez nous — et le produit
disparaîtrait définitivement, même réapprovisionné. Une boucle silencieuse
dont personne ne trouverait la cause. Couper les canaux en ligne laisse aussi
vendre au comptoir ce qui reste, ce qui est le bon comportement.

Saisie : **`(ops)/ruptures`** — une liste, un appui, c'est marqué. Le moment
où l'on constate une rupture, c'est au comptoir en plein service, une tablette
à la main : si le geste prend plus de deux secondes il ne sera pas fait, et on
continuera de vendre en ligne ce qu'on n'a plus. Bascule optimiste (attendre
le serveur pour voir la couleur changer donne l'impression que rien ne s'est
passé, et on tape deux fois), et la date est posée **côté serveur** — une
tablette dont l'horloge dérive marquerait une rupture pour hier, que la caisse
ne verrait jamais.

`recettes.rupture_le` est **daté** : une rupture est une décision du jour et
se périme seule. Sans date, personne ne penserait à la lever le lendemain et
le produit resterait invisible.

Seuls les plats dont l'état CHANGE sont renvoyés : réémettre le catalogue
entier à chaque passage multiplierait le risque d'écrasement pour aucun gain.
Une rupture sur un produit que la caisse ne connaît pas est **signalée**, pas
perdue en silence.

Test : `PORT=3000 node scripts/test-zelty-disponibilites.mjs` — 16 assertions,
dont l'essentiel porte sur ce que le constructeur REFUSE de faire.

#### Webhooks — temps réel plutôt que sondage

`POST /api/integrations/zelty/webhook`. Le sondage horaire a deux défauts :
les écrans de préparation voient les commandes en retard, et une heure creuse
coûte un appel pour rien.

Traités : `order.ended` (le ticket entre dans le CA immédiatement, via le
connecteur normalisé — jamais en écrivant directement). Tracés sans agir :
`till.close` (la clôture de caisse, future pièce du rapprochement),
`dish.availability_update`, et le reste — le jour où on les branche, on aura
des charges utiles RÉELLES sous la main au lieu d'hypothèses.

⚠️ **Signature obligatoire.** Cet endpoint écrit des VENTES : accepter un
corps non authentifié permettrait à n'importe qui de gonfler le chiffre
d'affaires. Sans signature valide → 401.

**La spec OpenAPI, lue le 28/08/2026** (`docs.zelty.fr`, section Webhooks) a
corrigé trois hypothèses fausses :

- l'événement se nomme **`event_name`**, pas `event`. Notre route ne le lisait
  pas : CHAQUE webhook serait tombé dans « inconnu » — tracé, jamais traité ;
- les lignes de commande sont dans **`contents`**, pas `items` — et `contents`
  y est **requis**. Ne lire que `items` aurait fait entrer chaque ticket sans
  une seule ligne : CA juste, stock et marges aveugles, aucune erreur pour le
  dire. C'est le même piège que `expand[]=items` sur `GET /orders`, par l'autre
  porte. Le schéma accepte désormais les deux noms ;
- la signature n'existe **qu'à partir de la version 2** du webhook. Un webhook
  déclaré sans `version: 2` arriverait non signé, donc refusé par notre route.

`GET /webhooks` liste les **22 événements** disponibles et le `secret_key`
(masqué). Ceux qui nous intéressent : `order.ended`, `till.close`,
`dish.availability_update`, plus `order.status.update` et `catalog.push` pour
plus tard. Un webhook se déclare avec `target` (URL) et `version`.

**Le secret est CHOISI par nous, pas fourni par Zelty.** `POST /webhooks`
accepte `secret_key` : inutile de leur réclamer une clé, on impose la nôtre et
on la reporte sur Vercel. C'est ce qui a débloqué le branchement.
Gestion : `node scripts/webhooks-zelty.mjs [--declarer] [--retirer <event>]
[--nouveau-secret]`.

**Déclaré le 28/08/2026** : `order.ended` → `/api/integrations/zelty/webhook`,
version **v2**. Production vérifiée le même jour : `ZELTY_API_KEY`,
`ZELTY_MONTANTS_EN_CENTIMES` et `ZELTY_WEBHOOK_SECRET` posées sur Vercel,
déploiement effectué. La route accepte une signature valide (200) et refuse
tout le reste (401) — signature d'un autre secret, signature de zéros, corps
altéré après signature, absence de signature. Chaque refus est tracé dans
`integration_evenements` avec les NOMS d'en-têtes reçus, jamais leurs valeurs.

⚠️ Contrôler une signature en modifiant un seul caractère est un mauvais test :
remplacer le dernier caractère par `0` ne change rien une fois sur seize, et
laisse croire à une faille. Signer avec un AUTRE secret est le contrôle juste.

⚠️ La version s'écrit **`v2`**, pas `2` (valeurs admises : `v1`, `v2`), et la
signature n'existe qu'à partir de v2 : en v1 le corps arrive nu, donc refusé
par notre propre route.

⚠️ **Ne rien déclarer avant d'avoir le secret en place sur Vercel** : notre
route refuse un corps non signé par 401, et Zelty réessaierait en boucle.

⚠️ Le nom de l'en-tête de signature n'est pas documenté (la page ne se
charge pas). On teste donc les en-têtes vraisemblables, en hexadécimal comme
en base64, préfixe `sha256=` toléré, comparaison à **temps constant**. Un
refus enregistre les **NOMS** d'en-têtes reçus — jamais leurs valeurs — pour
identifier le bon au premier appel réel. `ZELTY_WEBHOOK_HEADER` le fige
ensuite.

⚠️ Une erreur de traitement chez nous répond quand même **200** : sinon Zelty
réessaie indéfiniment. Le journal garde le brut, on rejoue.

Test : `PORT=3000 node scripts/test-zelty-webhook.mjs` — 11 assertions, dont
l'essentiel porte sur ce qui est REFUSÉ (corps non signé, signature fausse,
corps altéré après signature).

**Planification (`sql/setup-pgcron-zelty.sql`, appliqué le 28/08/2026)** —
cinq routes cron existaient pour le pont, **aucune n'était appelée**. Le
webhook couvre le temps réel, mais un webhook n'a pas de mémoire : une
livraison ratée perd la vente définitivement. Le sondage est son filet, pas
son doublon.

| Tâche | Rythme | Rôle |
|---|---|---|
| `zelty-commandes` | HH:20, 2 j de fenêtre | filet du webhook |
| `zelty-catalogue` | 03:10 | ce que la caisse a changé de son côté |
| `zelty-disponibilites` | `*/15 4-20` | ruptures → caisse, pendant le service |
| `caisse-rapprochement` | 05:30, 3 j | reçu vs compris |

Le secret n'est écrit nulle part : `call_zelty()` le lit dans le source de
`call_agent()`, comme `call_sumup()`. Le fichier est committable.

⚠️ **`emission` n'est PAS planifié** : sans méthode de paiement dans Zelty,
chaque passage échouerait en 400 et le monitoring compte tout code ≠ 200
comme une panne. À planifier le jour où le mode de paiement existe.

**`/admin/caisse-agreee` a suivi la bascule** : le bouton « Synchroniser
SumUp » est devenu « Synchroniser la caisse » et vise
`/api/cron/caisse/zelty`. Il reste utile malgré le cron — celui-ci passe à
HH:20, et quand on regarde le chiffre du jour à 11 h on ne veut pas attendre
l'heure suivante. La server action garde son principe : le `CRON_SECRET` ne
quitte jamais le serveur. Elle remonte aussi les **avertissements** du mapper
(`expand[]=items` oublié, panier moyen absurde, quantité muette) — les taire
les rendrait invisibles pour la seule personne qui regarde cet écran.

**SumUp est abandonné (28/08/2026).** L'établissement passe sur UN logiciel
Zelty et DEUX caisses Zelty couvrant toutes les activités. `sumup-sync` est
déplanifié. La coupure a eu lieu pendant la fermeture — dernier ticket SumUp le
24 août — donc aucune vente n'a été perdue.

⚠️ **Les données SumUp restent, et doivent rester.** 426 tickets, 2 357 €, du
17 au 24 août : c'est TOUT l'historique de vente réel de la maison. Il alimente
`/admin/ventes`, `/admin/patrimoine`, le rapprochement et le food cost. Ne
jamais purger `encaissements_externes` sur `source_caisse = 'sumup'` ni les
commandes qui en découlent. Le connecteur reste source-agnostique : c'est lui
qui permet à un historique SumUp et à un flux Zelty de cohabiter sans que rien
n'ait à savoir d'où vient quoi.

**Compte réel branché le 28/08/2026.** Clé #23628 « Claude » (portée
Casatasia), posée dans `.env.local` avec `ZELTY_MONTANTS_EN_CENTIMES=true`.
**Les 84 produits du Fournil ont été poussés le 28/08/2026** : 84 créés, 84
liens enregistrés, 0 sans retour. Le miroir les relit et les apparie **tous
par `remote_id`** — 84/84, aucun rapprochement par le nom, aucun écart de prix.
Rejouer l'import ne recrée rien (`a_creer: 0`, `deja_lies: 84`). Contrat confirmé à l'écran par
**Configuration → Widgets et API → Accès API** : base
`https://api.zelty.fr/2.11/`, version 2.11, `Authorization: Bearer` — soit
exactement nos valeurs par défaut. `POST /orders` existe : l'injection des
commandes de casatasia.fr est confirmée par la documentation.

⚠️ **L'établissement est en MODE ÉCOLE.** Les commandes qui y sont créées
n'entrent pas dans le chiffre d'affaires, et notre client force
`is_sandbox=false`. Ne rien brancher en production tant que le passage en mode
réel n'a pas été fait (bandeau bleu du back-office) : on ingérerait des tickets
d'entraînement, ou rien du tout. C'est une décision du gérant, liée à la date
d'ouverture.

⚠️ **Aucune méthode de paiement n'est configurée** dans Zelty
(`/transaction-methods` est vide). Tant que c'est le cas,
`ZELTY_MODE_PAIEMENT_EN_LIGNE` n'a pas de valeur possible et l'ÉMISSION des
commandes web est bloquée — un libellé inconnu renvoie 400. La lecture, elle,
fonctionne déjà.

⚠️ Abonnement Zelty **expirant le 03/10/2026**, sans moyen de paiement
enregistré : le renouvellement automatique échouera.

**Reste à faire pour la production** : poser `ZELTY_API_KEY` et
`ZELTY_MONTANTS_EN_CENTIMES=true` sur Vercel — après le passage en mode réel,
pas avant.

Tant que rien n'est configuré, la route répond **200** avec
`{ configure: false }` : une caisse pas encore branchée n'est pas une panne,
et le monitoring compte tout code ≠ 200 comme une erreur.

Tests, tous sans compte ni clé, à travers le banc d'essai
`/api/integrations/zelty/verifier` :
`PORT=3000 node scripts/test-zelty-mapper.mjs` (28 assertions, commandes) et
`PORT=3000 node scripts/test-zelty-catalogue.mjs` (16 assertions, catalogue).

### Rapprochement quotidien caisse ↔ outil (0139)

Le miroir `encaissements_externes` dit ce qu'on a **reçu** ; les `commandes`
disent ce qu'on en a **compris**. Entre les deux il y a du code, et du code se
trompe en silence. Sans ce contrôle, une ingestion qui perd 3 % des lignes
depuis six semaines ne se voit nulle part : le CA reste juste — il vient des
totaux — et seules les marges dérivent. On finit par accuser les fournisseurs.

`/api/cron/caisse/rapprochement?jours=N[&source=X]` (Bearer `CRON_SECRET`),
rejouable, écrit une ligne figée par jour et par caisse. **À planifier dans
pg_cron**, après la synchro des tickets.

Trois états : `ok`, `incomplet` (le montant est juste, mais on ignore ce qui a
été vendu — stock, food cost et marges restent aveugles sur ces tickets), et
`ecart` (montant, nombre de tickets ou ventilation TVA divergents).

Une journée sans aucun ticket n'écrit **pas** de ligne : une caisse fermée le
lundi n'est pas une anomalie, et cent lignes vides rendraient le tableau
illisible. Le calcul repart d'**hier** — rapprocher la journée en cours
produirait un faux écart à chaque exécution.

Trouvé au premier passage sur les données réelles : 2 tickets du 17 août
(6 h 02 et 6 h 29, ouverture) arrivent sans aucun produit — des paiements à
montant libre tapés sur le terminal avant que la carte SumUp ne soit prête.
11,40 € dont on connaît le montant mais pas le contenu.

Lecture : **`/admin/integrations`**. Un contrôle que personne ne lit ne sert à
rien. Test : `PORT=3000 node scripts/test-rapprochement.mjs` — il FABRIQUE une
anomalie et vérifie qu'elle est vue ; un contrôle qui ne dit jamais « écart »
ne prouve rien.

⚠️ **Une seule source pour la ventilation par point de vente.**
`src/lib/ventes-par-pdv.ts` est partagé par `/admin/ventes` et
`/admin/ventes-pdv`. Cette dernière sommait auparavant
`commandes.etablissement_id` : correct tant que chaque activité a sa caisse,
faux dès qu'une caisse unique envoie des tickets mixtes ou tait son point de
vente. Deux pages qui ventilent différemment finissent par afficher deux
chiffres, et personne ne sait lequel croire.

⚠️ **Deux modèles de commission coexistent, et c'est voulu.**
`etablissements.inclus_ca_principal` + `commissions_tiers` (0093) raisonnent
par ÉTABLISSEMENT et par PÉRIODE — c'est le relevé mensuel du buraliste ou de
la FDJ. `recettes.type_revenu` (0136) raisonne par VENTE — indispensable dès
qu'une caisse unique vend du pain et du tabac sur le même ticket. Le premier
sert à rapprocher, le second à estimer en continu.

### Allergènes : « rien déclaré » n'est pas « aucun allergène » (0138)

Constaté le 27/08/2026 : la page publique du QR code affichait
**« ✓ Aucun allergène déclaré »**, en vert, pour les 85 produits actifs — dont
les croissants, sandwiches et paninis. Aucun n'avait d'allergène renseigné, et
un tableau vide était rendu comme une absence d'allergène. Ce n'est pas une
information manquante : c'est une **affirmation fausse et rassurante**, lue
par un client allergique au gluten sur un croissant.

Un tableau vide ne peut pas porter deux sens. D'où
`recettes.allergenes_valides_le` (+ `_par`, nominatif — une déclaration
d'allergènes engage) :

- **NULL** → personne n'a vérifié → le public lit « information non
  disponible, demandez-nous » ;
- **renseigné** → un humain a validé → un tableau vide veut alors vraiment
  dire « aucun des 14 allergènes ».

Trois endroits corrigés, et les trois mentaient séparément :

1. le libellé du produit (coche verte → avertissement ambre) ;
2. le **filtre** « j'évite le gluten » — un produit non vérifié a une liste
   vide, il passait donc le filtre comme s'il était sûr. Il est désormais
   marqué « ne peut pas être garanti sans allergène » ;
3. le **compteur** — il annonçait « 85 / 85 plats compatibles » à un
   allergique. Un plat non vérifié n'est pas compatible, il est inconnu.

⚠️ `recette_ingredients` est à **0** : le modèle achat-revente n'a pas de
composition, donc la voie « allergènes déduits des ingrédients » est fermée
ici. Tout passe par `allergenes_complementaires`, saisi à la main.
`setAllergenesComplementaires()` **vaut validation** — c'est l'enregistrement
qui pose la date.

Les suggestions de l'écran d'admin sont volontairement **minimales** (gluten
sur les produits à base de farine, rien d'autre) : une suggestion généreuse
serait acceptée en bloc par habitude, et une déclaration fausse est plus
dangereuse qu'une déclaration absente.

**Le scanner d'emballages — la composition n'est écrite qu'au dos du carton.**
`POST /api/agents/scanner-allergenes` + onglet « 📷 Scanner un emballage ».
Photos de la liste d'ingrédients → Claude Vision → relecture ligne à ligne →
déclaration signée. Même patron que `scanner-lots` (8 photos par appel,
réduction à 1600 px côté client, rien n'est écrit par la route).

C'était le vrai blocage : un croissant contient du gluten **par définition**,
mais qu'il contienne du lait, des œufs ou du soja dépend de la recette de
Gineys — et cette recette n'existe qu'imprimée sur l'emballage. Sans lecture,
la seule déclaration honnête est « on ne sait pas », ce qui n'aide aucun
client allergique.

⚠️ **Une étiquette illisible rend des listes VIDES et ne peut pas être
appliquée.** C'est le garde-fou central : une liste vide, une fois signée,
se lit « aucun allergène ». Le modèle a consigne explicite de ne rien déduire
du NOM du produit.

⚠️ **« Contient » et « peut contenir des traces de » ne sont jamais
fusionnés**, et se tromper est fautif dans les deux sens : déclarer une trace
comme un ingrédient fait fuir un client sans motif, taire une trace expose un
allergique sévère. Les traces remontent marquées `~` et **ne sont pas
pré-cochées**.

⚠️ Les catégories rendues par le modèle sont **filtrées sur les 14** : un
« lactose » ou une « noix de coco » remonterait sinon jusqu'à l'écran comme
s'il était réglementaire.

**Pré-remplissage : `node scripts/prefill-allergenes.mjs [--ecrire]`.**
70 produits sur 120 au 28/08/2026 — gluten là où la farine est
définitionnelle (pain, viennoiserie, panini, pizza, sandwich, pâtisserie,
gourmandise), sulfites sur les vins et apéritifs à base de vin, gluten sur
les bières, lait sur les boissons lactées.

⚠️ **Le script ne pose JAMAIS `allergenes_valides_le`** — il propose, il ne
signe pas. Et il n'écrit que ce qui est vrai **par définition du produit**,
jamais par probabilité.

⚠️ **Valider affirme que la liste est COMPLÈTE**, pas seulement que ce qui est
coché est exact. D'où le piège que le pré-remplissage ouvrait : signer la
famille « Viennoiserie » telle que proposée déclarerait qu'un croissant ne
contient **pas de lait**. La validation groupée pose donc la question au
moment du clic — « avez-vous lu l'emballage ? » — et renvoie vers le scanner.

⚠️ Les distillats (whisky, vodka, gin, rhum) sont **exemptés** d'étiquetage
gluten par l'annexe II du règlement, même issus de céréales. Ne pas les
déclarer par analogie avec la bière.

Test : `PORT=3000 node scripts/test-scanner-allergenes.mjs` — 14 assertions,
sans consommer Claude Vision ; l'essentiel porte sur ce qui est REFUSÉ.

**Saisie par FAMILLE**, onglet par défaut de `/admin/allergenes`. 85 produits
ouverts un par un dans une fenêtre modale, personne ne le fait un mercredi
entre deux fournées — et un écran qu'on n'utilise pas ne protège de rien. Or
une baguette, un pain de campagne et une ficelle portent les mêmes allergènes :
la vraie unité de saisie est la famille. On coche une fois, on décoche les
exceptions produit par produit, on valide (`validerAllergenesEnLot`). Ré-ouvrir
une famille repart de ce qui y est déjà déclaré **à l'unanimité**, pour ne rien
effacer.

### Paie : les heures de contrat sont décimales (0148)

`employes.heures_contrat` était un **entier**. Le temps partiel le plus courant
en France — la moitié de 35 h — y était donc inexprimable : PostgREST refusait
l'écriture (22P02), et le formulaire d'admin l'arrondissait en silence
(`parseInt`).

Refuser vaut mieux qu'arrondir, mais le bon comportement est d'accepter :
17 h ou 18 h à la place de 17,5 décalent le salaire mensuel d'une trentaine
d'euros, et ce décalage remonte jusqu'à la masse salariale, à l'alerte
« > 35 % du CA », au coût par shift du planning et à l'EBE — donc à la
valorisation du fonds. Personne ne remonterait de là jusqu'à une colonne mal
typée. 24 h, 28 h, 30,5 h sont la règle en restauration, pas l'exception.

Trois endroits à garder cohérents : la colonne (`numeric(5,2)`), le schéma zod
de `/admin/rh` (plus de `.int()`), et le champ du formulaire (`step="0.5"` +
`parseFloat`).

⚠️ **`salaire_horaire` est un taux BRUT.** Les salaires se négocient en NET :
la conversion utilisée ici est `brut = net / 0,78` (non-cadre). C'est une
ESTIMATION — c'est le comptable qui fixe le brut du contrat. Reporté dans
`notes_internes` de chaque fiche pour que l'hypothèse reste lisible.

⚠️ Le **coefficient de charges patronales à 1,45** est à vérifier : sous
1,6 SMIC la réduction générale s'applique encore largement, et un coefficient
trop haut sous-estime l'EBE — donc la valeur du fonds, dans le mauvais sens.

⚠️ Un statut de **président de SAS (assimilé-salarié)** ne suit ni le ratio
net/brut de 78 % ni le coefficient 1,45 : ses charges sont sensiblement plus
lourdes. À trancher pour Arnaud.

⚠️ **Désactiver un employé ne ferme PAS son compte.** `employes.actif = false`
le sort de la masse salariale et des plannings ; `profils` est une autre table,
et l'ex-salarié peut toujours se connecter. Les deux gestes sont à faire.
Constaté le 28/08/2026 en sortant Joris. On DÉSACTIVE plutôt qu'on ne supprime :
la suppression effacerait l'historique de ventes et de formation, et ne se
défait pas.

⚠️ `scripts/test-rh.mjs` lisait le CONTENU de `/admin/rh` sans authentification.
Depuis le module 28 le middleware renvoie un 307 vers `/login` : deux
assertions échouaient donc **en permanence, pour un comportement correct**. Un
test rouge en permanence finit par être ignoré, et ce jour-là il ne protège
plus rien. Il vérifie désormais la propriété qui compte : ces pages exposent
des salaires, elles ne doivent jamais répondre à un appel non authentifié.

### La visite guidée — accompagner les premières connexions (0149)

L'onboarding existant (`/formation/onboarding`, imposé par le middleware) est
une **porte** : lire un guide, réussir un quiz, l'accès s'ouvre. Après quoi on
est lâché sur vingt-huit modules sans savoir par où commencer.

`<VisiteGuidee />` est l'autre moitié. Elle emmène la personne **d'écran en
écran**, dit ce qu'il faut y regarder, et nomme les pièges **à l'endroit exact
où on peut tomber dedans** — un avertissement lu dans un manuel s'oublie, le
même lu devant le bouton concerné, non.

Deux parcours dans `src/lib/visite-guidee.ts` (client-safe) : **manager**
(12 étapes, de la frontière avec la caisse jusqu'au journal de bord) et
**comptoir** (6 étapes). Le repli est la courte : montrer trop à quelqu'un dont
ce n'est pas le métier le décourage plus que ça ne l'aide.

⚠️ **Trois règles de conception, qui comptent plus que le contenu :**

1. **Elle ne bloque JAMAIS.** Panneau posé dans un coin, jamais une fenêtre
   modale. Un accompagnement qui empêche de travailler est fermé au premier
   client qui entre, et jamais rouvert.
2. **Elle se reprend.** L'étape vit sur `profils.visite_guidee_etape` (0149),
   pas dans le navigateur : commencée au bureau, reprise sur la tablette du
   comptoir, et un localStorage vidé ne la fait pas recommencer.
3. **Elle se passe.** Un accompagnement qu'on ne peut pas quitter devient une
   corvée, et une corvée se traverse sans rien lire. « Non merci » est aussi
   visible que « Commencer » — sinon c'est un piège à clic.

⚠️ Un « Non merci » cliqué par réflexe le premier jour serait **définitif** :
le panneau ne se propose qu'une fois. D'où `<RelancerVisite />` sur
`/mon-espace`, qui rattrape le geste.

⚠️ Montée dans les layouts admin ET (ops), sous `print:hidden` : une visite
guidée n'a rien à faire sur un bon de préparation ou un rapport comptable.
Absente si aucun profil n'est connecté — le comptoir tourne souvent sans
session ouverte.

⚠️ L'avancement passe par `POST /api/visite-guidee`, pas par une server action :
le panneau écrit depuis n'importe quelle page, et une revalidation sous les yeux
de quelqu'un qui lit lui ferait perdre le fil. L'écriture n'est jamais bloquante
— on avance à l'écran d'abord, on enregistre ensuite.

⚠️ Le test vérifie que **chaque étape pointe vers une page qui existe**, en
résolvant les segments DYNAMIQUES (`/comptoir/fournil/kds` est servi par
`/comptoir/[slug]/kds`). Une visite qui envoie sur un 404 est pire que pas de
visite : elle apprend que l'outil est cassé.

Test : `PORT=3000 node scripts/test-visite-guidee.mjs` — 20 assertions, il
restaure l'état initial du profil qu'il modifie.

### Accueillir une manageuse — accès et parcours (28/08/2026)

Ambre rejoint l'équipe comme manageuse. Deux gestes, `scripts/acces-ambre.mjs`
et `scripts/parcours-manageuse.mjs`, tous deux rejouables.

⚠️ **Le poste `manager` COURT-CIRCUITE le système de permissions.** Il porte
`allowed: ['*']`, et `isReadOnly()` rend `false` avant même de lire
`custom_permissions` — un réglage « lecture seule » posé sur un manager est
purement **ignoré**. Il n'existe donc pas de « manager en lecture » : soit
tout ouvert, soit un poste non-manager plus des permissions sur mesure.

D'où le montage de prise en main : `profils.poste = 'polyvalent'` +
`custom_permissions` — **10 écrans en écriture** (comptoir, inventaire,
invendus, ruptures, KDS, journal de bord) et **25 en lecture seule**, dont
TOUT l'argent : ventes, marges, finances, patrimoine, pilotage.

La lecture est volontairement totale. Une manageuse qui entre au capital sera
payée sur le résultat : lui cacher ces écrans serait le mauvais signal et
l'empêcherait de comprendre ce sur quoi on la juge. Elle voit les chiffres
avant de pouvoir les modifier, pas l'inverse.

⚠️ Les trois écrans couverts le sont parce qu'ils **se trompent en silence** —
l'erreur y ressemble à une réussite : `/admin/allergenes` (valider = signer une
déclaration légale nominative), `/admin/fournisseurs` (un scan écrit les prix
d'achat — le croissant à 40 € du 22/08), `/admin/recettes` (pousser vers Zelty
est un upsert qui écrase le prix imprimé sur les tickets). Aucune vigilance ne
rattrape une erreur qui ne se signale pas.

⚠️ **Aucun compte n'est créé par script.** Ambre s'inscrit elle-même sur
`/login` (elle choisit son mot de passe), puis on relance
`node scripts/acces-ambre.mjs --email=… --ecrire` pour rattacher le profil à
la fiche et poser les permissions. Passage en manager le jour venu :
`/admin/securite` → Profils → rôle `manager`, et effacer `custom_permissions`.

**Parcours « Manageuse » — 5 guides, 25 étapes, 17 questions** (poste
`manager` dans le module 27). L'ordre n'est pas celui du menu : (1) pourquoi
l'outil ne prend pas les commandes — sans ça tout le reste paraît incohérent,
(2) la caisse pendant qu'elle est en mode école, (3) lire les chiffres avant
de les modifier, (4) les gestes du quotidien, (5) les trois écrans dangereux.

⚠️ Le guide 5 exige **100 %** au quiz, contre 80 % partout ailleurs : sur ces
écrans, « à peu près compris » ne suffit pas.

⚠️ Le **mode école** de Zelty est une fenêtre qui se ferme. Tant qu'il dure,
un ticket d'entraînement n'entre pas dans le CA — c'est le meilleur terrain
d'apprentissage possible, et il disparaît au passage en mode réel.

### Le registre légal d'ouverture (0147)

`obligations_legales` était **vide**. Le module 17 est livré depuis des mois
et n'a jamais été nourri — donc l'alerte à J-30 de l'agent HACCP ne pouvait se
déclencher sur rien, et le registre ne protégeait de rien. Or on ouvre un
**débit de boissons** en septembre 2026.

Amorçage : `node scripts/obligations-ouverture.mjs [--ecrire]` — 24
obligations, idempotent (rapproché sur le titre, n'écrase jamais une ligne
renseignée à la main).

⚠️ **Aucune date n'est inventée.** Une échéance fausse dans un registre légal
est pire que pas d'échéance : elle rassure. Toutes les lignes arrivent sans
date, en `a_faire`. C'est le gérant qui les pose au fur et à mesure.

⚠️ **`obligations_legales.bloquant`** (0147) existe pour une raison précise :
l'agent HACCP ne lisait que les obligations **datées**
(`.not('date_echeance','is',null)`). Suffisant pour des renouvellements — un
contrôle gaz a toujours une date. Faux pour une ouverture : les six
obligations qui peuvent **empêcher d'ouvrir** sont justement celles qui n'ont
pas de date, parce que personne ne les a encore engagées. Sans ce drapeau,
elles auraient été les **seules du registre à n'alerter jamais**. Une
bloquante sans date ne dit pas « rien à faire », elle dit « pas commencé ».

Le défaut est `false` : un défaut à `true` crierait sur tout le registre et
serait ignoré au bout d'une semaine.

⚠️ **C'est une REPRISE de fonds, pas une création** — et la distinction change
la nature de la moitié du registre : on **mute** une licence au lieu de
l'ouvrir, on **retrouve** un dossier d'accessibilité au lieu de le constituer,
on **met à jour** la déclaration DDPP au lieu de la déposer. Beaucoup de ces
démarches ont pu être faites par le notaire à la cession, d'où des lignes qui
disent « vérifier dans l'acte » plutôt que « faire ».

Une reprise ajoute en revanche ce qu'une création n'a pas : transfert des
contrats du cédant, reprise des contrats de travail (art. L1224-1), solidarité
fiscale du repreneur. **Le piège d'une reprise n'est pas ce qu'on oublie de
créer, c'est ce qu'on croit hérité et qui ne l'est pas** — un contrat resté au
nom du cédant se découvre le jour où l'électricité est coupée.

⚠️ Le **bail** est le point sensible de cette reprise : cédé avec le fonds, sa
clause de DESTINATION peut ne couvrir que la boulangerie. Ni le débit de
boissons ni la restauration n'y entreraient alors, et la déspécialisation
suppose l'accord du bailleur — donc du délai.

**Bloquantes au 28/08/2026** : déclaration de mutation du débit de boissons
(Cerfa 11542), autorisation de travaux ERP + visite de la commission de
sécurité, registre public d'accessibilité, assurance multirisque + RC,
destination du bail.

✅ **Acquis** : licence IV, permis d'exploitation, formation HACCP.

✅ **La licence IV est ACQUISE** — transférée avec le fonds, confirmé par le
gérant le 28/08/2026. C'était
le seul point dont le délai ne dépendait pas de nous — les licences IV sont
contingentées (1 pour 450 habitants) et ne se créent plus depuis 1959. Elle
couvre les spiritueux de la carte bar (0144) : whisky, vodka, gin, rhum et
digestifs, soit sept produits qu'une licence III n'aurait pas permis de servir.

⚠️ Trois choses restent attachées à cette licence : **l'afficher** dans
l'établissement (la ligne « Licence IV » d'`affichages_verifications` est
encore marquée absente), la **mentionner au Cerfa 11542**, et faire confirmer
sa validité si le débit de boissons est resté fermé longtemps — une licence IV
**non exploitée pendant 5 ans d'affilée est périmée** (art. L3333-1 CSP).
Vérifiable en une visite en mairie, irrattrapable le jour de l'ouverture.

⚠️ **La visite de la commission de sécurité est le chemin critique du
planning.** L'établissement est en travaux ; la réouverture au public après
aménagement d'un ERP est subordonnée à un avis favorable, et la commission ne
se réunit pas à la demande.

⚠️ Le registre est une **liste de contrôle**, pas un avis juridique : à
confirmer avec la mairie, le comptable et le SDIS. Il sert à ce que rien ne
soit oublié, pas à trancher.

Test : `node scripts/test-obligations-ouverture.mjs` — 14 assertions ; il
CRÉE une obligation témoin bloquante sans date et vérifie qu'elle est vue,
puis la supprime.

### L'historique économique des produits (0146)

`historique_prix_ingredients` existait depuis le module 3 — 184 lignes. Les
**produits**, eux, n'avaient aucune trace. Or dans le modèle achat-revente,
c'est sur `recettes` que vivent les trois chiffres qui font la marge :
`cout_achat_ht`, `prix_vente_ht`, `tva`.

Mesuré le jour même : le café est passé de 1,20 à 1,40 €, quatre formules ont
pris 20 centimes, trois prix ont été corrigés et un taux de TVA rectifié — et
**rien ne l'a enregistré**. Dans un mois, personne n'aurait su ni quand, ni
depuis quel prix.

C'est le socle de toute lecture causale : on ne peut pas expliquer un mouvement
de marge si on ignore ce que valait le produit la semaine d'avant.

⚠️ **C'est un TRIGGER, pas du code applicatif, et c'est délibéré.** Le
28/08/2026, les prix ont été modifiés depuis cinq scripts différents, la
propagation des lignes de facture et le miroir du catalogue caisse. Une
écriture posée dans une server action en aurait manqué l'essentiel — et l'aurait
manqué EN SILENCE, le pire cas pour un journal. Le trigger ne se contourne pas.

⚠️ Seuls les champs **économiques** déclenchent une trace. Une photo remplacée
ou un libellé corrigé n'ont rien à faire dans un historique de prix : le bruit
rendrait la lecture inutilisable. Réécrire la même valeur ne trace pas non plus.

⚠️ La `source` vaut `inconnu` par défaut, et c'est honnête : un trigger ne peut
pas savoir POURQUOI un prix change. Elle s'infère après coup, en rapprochant la
date d'une facture ou d'une synchro. Mieux vaut « inconnu » qu'une source
inventée. Une ligne de reprise par produit sert de point de départ — sans elle,
le premier changement n'aurait rien à quoi se comparer.

Test : `node scripts/test-historique-prix-produits.mjs` (11 assertions, crée et
supprime son propre produit).

### Ce que l'affaire VAUT — lecture patrimoniale (0143)

`/admin/patrimoine`. Tout le reste de l'outil mesure ce qui entre en caisse.
Cette page mesure ce qui se **construit** : l'EBE récurrent, et la valeur de
fonds qu'il porte.

Le chiffre qui résume la thèse : **1 000 € de résultat MENSUEL récurrent valent
30 000 à 48 000 € de valeur de fonds** (multiples 2,5 à 4 × l'EBE annuel). Un
euro qui reste et se répète vaut trente fois un euro sorti une fois — et sorti
en prime, il coûte 1 420 € à la société pour qu'il en reste ~700.

⚠️ **La page REFUSE d'afficher une valorisation sous 30 jours de vente.**
Annualiser huit jours d'ouverture — avec leur effet de nouveauté — produirait
un chiffre faux affiché en gros caractères. Trois niveaux : `insuffisant`
(< 30 j), `indicatif` (30-90 j), `solide` (> 90 j), toujours affichés avec le
nombre de jours réellement observés.

⚠️ Ce sont les **jours AVEC VENTE** qui comptent, pas les jours calendaires :
un établissement fermé trois semaines pour incendie ne doit pas voir son EBE
divisé par la durée de la fermeture.

⚠️ **L'EBE se calcule AVANT le financement.** Le remboursement du crédit du
fonds (1 900 €/mois) n'est pas une charge d'exploitation : c'est le prix
d'acquisition étalé. Le laisser dans les charges fixes fait payer deux fois le
même fonds — une fois à l'achat, une fois dans sa propre valorisation — et
sous-estimait la valeur d'environ un multiple × 22 800 €, soit 57 000 à
91 000 €. Les lignes de `charges_fixes_recurrentes` dont le libellé porte
crédit / emprunt / remboursement / prêt sont donc sorties de l'EBE et rendues
à part (`chargesFinancieres`), avec `resultatDisponibleMensuel` = ce qui reste
réellement en caisse. Deux chiffres, deux usages : on se partage le
disponible, on valorise sur l'EBE.

⚠️ Les produits en **commission** (0136) sont exclus du taux de charges
variables : ils n'ont pas de coût matière et le fausseraient.

⚠️ Une valorisation **négative n'existe pas** : un fonds déficitaire ne vaut
pas moins que rien, il vaut son bail et son emplacement. Plancher à 0.

Deux méthodes en parallèle — multiple d'EBE et pourcentage du CA annuel —
parce qu'aucune ne fait autorité seule ; l'écart entre elles dit si la valeur
tient au résultat ou au volume. Multiples réglables dans `config_patrimoine` :
ils varient selon l'emplacement, le bail et l'époque, c'est au comptable de
les arbitrer, pas au code.

### Le pont caisse ↔ outil (0137)

Deux fondations, agnostiques de la caisse : elles servent avec SumUp
aujourd'hui et serviront telles quelles avec Zelty.

**`integration_evenements`** — chaque échange laisse une trace avec sa charge
utile BRUTE. Sans journal, un import qui échoue à 6 h du matin est invisible
jusqu'à ce que quelqu'un s'étonne d'un chiffre trois semaines plus tard, et à
ce moment-là la donnée du jour manqué n'est récupérable nulle part. Le brut
permet de REJOUER. Helpers : `journaliser()` et `avecJournal()`
(`src/lib/integrations/journal.ts`) — ils ne lèvent JAMAIS : perdre un import
réussi parce que sa trace n'a pas pu s'écrire serait absurde.

**`correspondances_catalogue`** — la clé stable entre les deux mondes.
Le rattachement d'un ticket à un produit se faisait par le LIBELLÉ ; le jour
où « Croissant » devient « Croissant beurre » côté caisse, l'outil créait un
second produit et coupait la série statistique en deux, sans erreur ni alerte.
L'identifiant de la caisse survit au renommage, donc **il passe AVANT le
libellé** dans `/api/integrations/caisse/encaissements`.

La correspondance se constitue toute seule : rattachement réussi par le nom +
identifiant fourni → le lien est noté, et le rattachement suivant se passe du
libellé. SumUp n'expose aucun identifiant produit : le chemin par le nom reste
donc actif et testé.

Test : `PORT=3000 node scripts/test-integration-correspondances.mjs` (le
serveur de dev doit tourner, et `CRON_SECRET` être renseigné dans
`.env.local` — il y est vide par défaut, la vraie valeur vit sur Vercel).

⚠️ Les tickets de test créent des commandes `encaisse` qui entreraient dans le
CA : le cleanup du script les supprime, il doit rester complet.

### Commissions : encaissé ≠ chiffre d'affaires (0136)

Tabac, presse, FDJ et relais colis ne sont **pas des ventes de marchandise**.
`recettes.type_revenu = 'commission'` les distingue, et la rémunération se dit
soit en pourcentage du prix TTC (`commission_pct` — remise du débitant de
tabac, dépôt-vente presse), soit en forfait HT par opération
(`commission_forfait_ht` — un colis remis). **Le forfait prime** si les deux
sont renseignés.

Pourquoi ça ne pouvait pas rester modélisé en vente : un paquet à 12 € encaissé
laisse quelques dizaines de centimes. Compté comme du CA, il gonfle le chiffre
d'affaires et écrase tous les taux — la boulangerie à 70 % de marge noyée dans
du tabac à quelques pour cent. Ces lignes sortent **aussi du food cost** : le
prix est imposé, il n'y a rien à optimiser.

`getVentesStats()` expose `commissions: { encaisse, revenu, lignes }` et un
`revenu` par point de vente et par activité — CA HT pour une vente, commission
pour le reste.

Garde-fous : une contrainte CHECK refuse un produit en commission sans
rémunération (son revenu serait silencieusement nul) ; côté action, repasser un
produit de commission à vente **efface** les deux champs, sinon un taux fantôme
survivrait (la contrainte ne contrôle que l'autre sens) ; et la règle « coût
d'achat OU composition » de la fiche produit ne s'applique pas à une commission.

Test : `node scripts/test-commission-tva.mjs` — ⚠️ il RECOPIE les formules de
`src/lib/tva.ts` et `src/lib/ventes-stats.ts`, modifier les trois ensemble.
Aucune commande n'y est créée : le circuit de vente est réel.

### Produits arrivés par la caisse : classer, nommer, illustrer

Les produits créés automatiquement depuis les tickets arrivent en catégorie
**« À classer »**, sans photo, sans description et `vendable_online = false`.
Le menu public exige **DEUX** conditions — une famille valide ET une image
(`.not('image_url','is',null).neq('categorie','À classer')`) — donc ils
restent invisibles du site tant que les deux ne sont pas remplies.

Traité le 28/08/2026 pour 13 produits : classement en familles (dont une
nouvelle, **Glace**, pour quatre glaces qui ne se rangeaient nulle part),
fusion de « Gourmandises » au pluriel dans « Gourmandise », correction des
noms d'affichage (« Fusee » → « Fusée », « Paris brest » → « Paris-Brest »…)
et plaques d'attente.

⚠️ **Corriger `nom` ne casse RIEN.** Le rapprochement des tickets passe
d'abord par `nom_caisse`, et `norm()` retire les accents — « Fusée » et
« Fusee » se normalisent pareil. `nom_caisse` doit rester le libellé BRUT de
la caisse ; c'est `nom` qu'on soigne pour la vitrine.

**`vendable_online` suit une règle établie, pas une intuition** : vérifiée sur
les 66 produits déjà photographiés — 0/6 pour les boissons chaudes, 0/8 pour
les formules (règle de la 0115), 100 % partout ailleurs.

`scripts/generer-visuels-sans-photo.mjs [--ecrire]` : plaques typographiques
pour tout produit actif sans photo, pilotées par la base (l'ancien
`generer-visuels-manquants.mjs` avait une liste figée, périmée depuis la purge
des focaccias). Essai à blanc par défaut. Les composants de formule
(`Formule — …`) sont exclus : ce ne sont pas des produits autonomes.

⚠️ Ce sont des **visuels d'attente**. Dès que le fournil photographie, il
suffit de remplacer les fichiers : les URL en base ne bougent pas. Et rien
n'est visible avant **déploiement**.

### Le bar sait ce qu'il achète — inventaire par poste

Le bar ouvrait avec 36 produits tarifés et poussés en caisse, et **pas un seul
lien vers une matière**. Il se serait allumé aveugle : aucune bouteille à
l'inventaire, aucune commande conseillée, et une marge fondée sur les
estimations qui avaient servi à bâtir la carte.

`node scripts/matieres-bar.mjs [--ecrire]` pose la correspondance vendu ↔
acheté : `nom_matiere` dit ce qu'on COMPTE, `unites_par_achat` combien on en
tire. Même patron que « Panuozzi ← pâton » (0131/0132). **26 liens,
25 matières.**

Les rendements sont **arithmétiques, pas estimés** : 30 L / 25 cl = 120 demis,
70 cl / 4 cl = 17,5 doses, 75 cl / 12 cl = 6 verres. La mousse et les purges ne
sont pas déduites — les inventer ferait un chiffre faux ; l'écart réel se lit
dans la démarque, où il est une information (un fût qui rend 105 demis au lieu
de 120 se règle au tirage).

⚠️ **Aucun `libelle_achat` n'est écrit, et c'est délibéré** : c'est le texte
LITTÉRAL du fournisseur, et aucune facture France Boissons n'est encore
arrivée. L'inventer produirait une clé qui ne correspondrait à rien. Il
s'apprendra au premier scan (0142) ou se posera dans `/admin/correspondances`.
Aucun **prix** non plus : remonter les coûts par dose en prix de bouteille
transformerait des estimations en données mesurées.

⚠️ **Huit produits restent DEHORS, exprès** — Kir, Kir royal, Spritz, Monaco,
Panaché, Picon bière, Diabolo, Alcool + soft. Ils mélangent deux matières ; les
rattacher à une seule en perdrait l'autre, qui sortirait du stock sans que rien
ne le signale. Ils relèvent d'une composition, pas d'une correspondance
d'achat. Les deux **pichets** attendent une décision : un pichet ne dit pas sa
couleur.

**`(ops)/inventaire?poste=fournil|bar`.** L'écran filtrait `tag_destination =
'FOURNIL'` en dur — les 25 matières du bar n'y seraient jamais apparues. Le bar
et le Fournil ne se comptent ni au même moment, ni par la même personne, ni
dans la même pièce : mélanger leurs lignes rallongerait le comptage du matin
pour rien, et **un inventaire qu'on abrège est un inventaire faux**.

⚠️ Au bar, un produit **sans `nom_matiere` est EXCLU** de l'inventaire. Le repli
en cascade `nom_matiere ?? libelle_achat ?? nom` ferait sinon apparaître « Kir »
comme une ligne de stock — et personne ne stocke des kirs.

⚠️ Le repère « la dernière fois » et la valeur du stock précédent sont
**filtrés sur le poste**. Sans ça, la page du bar affichait les 457 € du
Fournil : un chiffre juste, au mauvais endroit, donc faux pour qui le lit.

⚠️ Les matières de `ingredients` (jambon, mozzarella, emballages) ne
s'affichent **que sous le Fournil** : la table n'a pas de colonne d'activité,
et le bar n'en a pas encore — ses matières sont portées par les produits
eux-mêmes, une bouteille de whisky se vendant à la dose.

**France Boissons** est créé comme fournisseur actif, pour que la première
facture scannée se rattache au lieu de produire 25 lignes orphelines.

Test : `PORT=3000 node scripts/test-matieres-bar.mjs` — 24 assertions.

### La carte du bar (0144, 28 août 2026)

36 produits créés pour l'ouverture de septembre : 9 bières, 9 apéritifs,
7 alcools, 7 vins, 4 softs manquants (sirop à l'eau, diabolo, limonade,
Perrier). Le bar partait de **zéro produit alcoolisé**. Fournisseur retenu :
**France Boissons** (groupe Heineken) — pression, softs et cave chez le même.

**Les prix sont posés sur le coût du SERVICE, pas sur le coût d'achat.** Une
heure de service coûte 17,23 € chargés, donc une consommation coûte 1,72 € de
main-d'œuvre à dix consos/heure et 0,43 € à quarante. Le plancher réel est
là — un verre servi prend le même temps qu'il soit vendu 2,50 € ou 4 €. La
carte est volontairement basse (demi 2,50 €, pastis 2,50 €, verre de vin
2,80 €) : elle est rentable au-dessus de 15 consos/heure et perd de l'argent
sous 10. C'est cohérent avec la stratégie du passage obligé, mais **ça la rend
obligatoire**. Repère à suivre dès l'ouverture : consommations par heure de
présence.

⚠️ L'alcool n'est **jamais** `vendable_online` : pas de contrôle d'âge sur le
click & collect.

⚠️ La **bière sans alcool est à 10 %**, pas 20 % — ce n'est pas une boisson
alcoolique au sens fiscal. Elle reste dans la famille « Bière » sur l'ardoise,
d'où une exception documentée dans le contrôle de cohérence des taux par
famille (l'autre étant le composant viennoiserie des formules).

### `prix_sur_place_ttc` — un produit, deux prix (0144)

Un Coca ne se vend pas au même prix dans sa canette au comptoir (1,80 €) et
dans un verre consigné à une table (2,50 €). Zelty porte nativement `price`
(salle) et `price_togo` (emporter) ; **notre base n'avait qu'un seul prix**, et
l'import envoyait la même valeur des deux côtés — soit 70 centimes perdus à
chaque verre servi en salle, sans que rien ne le signale.

`recettes.prix_sur_place_ttc` est **en TTC**, contrairement à `prix_vente_ht` :
c'est le prix de l'ardoise, celui que le gérant décide et que le client lit.
Le convertir en HT à la saisie ferait dériver l'arrondi. **NULL = pas de tarif
distinct**, le prix de vente s'applique partout — c'est le cas de tout le
Fournil et de tout le bar, où le sur place EST le prix.

Le verre consigné n'est pas qu'un choix commercial : la loi AGEC interdit le
jetable pour la consommation sur place.

⚠️ `verifier-carte-zelty.mjs` contrôle désormais **les deux prix**. N'en
vérifier qu'un laissait passer exactement l'écart qu'on venait de créer.

⚠️ **Une lecture de l'API juste après une écriture peut revenir vide** :
constaté le 28/08, un `GET /catalog/dishes` immédiatement après un POST a rendu
0 plat (limite de débit), ce qu'un script naïf prend pour un catalogue vide.
Attendre quelques secondes, et ne jamais conclure d'une seule lecture.

### Carte du Fournil et photos produit

Les 60 produits viennent des 13 affiches CasaTasia (migration 0113, prix TTC des affiches → HT en base). Les photos sont **découpées dans les affiches elles-mêmes** par `scripts/generer-photos-fournil.mjs` (sharp, rectangles en fractions de l'affiche) et déposées dans `public/produits/*.jpg`.

`image_url` doit rester une **URL absolue** (`https://app-restaurant-livid.vercel.app/produits/<slug>.jpg`) : le site vitrine est un projet distinct qui consomme `/api/public/menu` en CORS, une URL relative y pointerait sur son propre domaine. Corollaire : **une photo n'est visible qu'après déploiement de l'app**.

**Corrections du 28/08/2026, appliquées des DEUX côtés** (base + caisse) :
trois prix ramenés aux affiches (Salade saumon 4,90 → 5,50 € ; jus d'orange et
jus de pomme 33 cl 2,00 → 1,80 €), « Pago pomme 33 cl » passé de 5,5 % à 10 %
— seule boisson fraîche au taux réduit, donc **sous-collecte** — et Donuts
remis en vente en ligne. Comme pour les 7 produits à 20 % d'août, la
correction de TVA garde le **TTC du panneau identique** : c'est le net qui
s'ajuste.

⚠️ **Écrire dans le catalogue Zelty se fait en relisant d'abord.**
`POST /catalog/dishes` est un upsert qui exige `name`, `price` et `tax` : on
relit le plat, on recopie ces champs tels quels, on ne touche que ce qu'on
veut, et on REFUSE de construire s'il en manque un. Un objet incomplet
écraserait le prix qui s'imprime sur les tickets.

⚠️ Reste à trancher : « Jus de pomme 33 cl » et « Pago pomme 33 cl » sont deux
fiches distinctes, chacune avec son libellé de caisse (« Jus de pommes 33cl »
et « Pago pommes 33cl ») — donc deux boutons sur la caisse. Ce ne sont pas des
doublons au sens technique, mais c'est peut-être le même produit vendu sous
deux noms. À vérifier en boutique avant de fusionner : une fusion déplace
l'historique des ventes et ne se défait pas.

**Ranger la carte par familles** : `node scripts/pousser-familles-zelty.mjs
[--ecrire]`. L'import crée les produits mais les laisse **à plat** — 84 boutons
sans classement, inutilisables au comptoir. Le script crée les 13 familles côté
Zelty et y rattache chaque produit. `remote_id` du tag = notre nom de famille,
donc lien exact des deux côtés.

⚠️ **L'ordre des familles est celui du SERVICE, pas l'alphabet** : à 6 h 20 on
vend du pain et du café, pas des pizzas. Le champ `o` du tag pilote l'affichage
de la caisse.

⚠️ **Zelty limite le débit de son API — la documentation ne le dit pas.**
Treize créations de tags à la file ont donné cinq `429` à partir du cinquième
appel. Tout doit partir en **un seul appel** avec un tableau : c'est déjà ce que
fait l'import (84 plats, un POST), et c'est pour ça qu'il passait. Le client de
lecture réessaie 3 fois sur 429 ; les écritures, elles, doivent grouper.

**Contrôle de la carte poussée** : `node scripts/verifier-carte-zelty.mjs`
compare la caisse à notre base, produit par produit — prix TTC au centime, TVA
à emporter ET sur place, photo, nom, état. Lecture seule. 84/84 conformes au
28/08/2026.

⚠️ La TVA **sur place** vérifiée est celle de la LOI (10 %, ou 20 % alcool,
ou 2,1 % presse), pas celle du panneau : recopier le taux d'emporter
sous-déclarerait un croissant mangé à table.

⚠️ **Un contrôle « famille → taux » ne suffit pas** pour les produits nés des
tickets : ils n'ont aucune affiche de référence, donc ils échappaient au
contrôle. D'où le contrôle de **cohérence interne** : dans une même famille,
deux produits ne peuvent pas être à des taux différents. C'est lui qui a
trouvé « Pago pomme 33 cl » à 5,5 % quand les seize autres boissons fraîches
sont à 10 %. Un taux trop BAS est le seul qui ne se rattrape pas.
Les composants de formule (`Formule — …`) en sont exclus : leur taux suit ce
qu'ils contiennent, pas leur famille.

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

4. **Bumper `CACHE_VERSION`** (`public/sw.js`, ligne 8) à CHAQUE livraison qui
   touche l'UI — pas seulement les « critiques ». Le service worker sert les
   chunks en cache-first : sans bump, les tablettes du comptoir continuent de
   faire tourner l'ancienne version et le gérant signale des fonctionnalités
   « absentes » qui sont en prod depuis des jours (vécu deux fois : panier
   comptoir le 20/08, date des relevés le 22/08).

5. Annoncer dans le récap final : ce qui est livré, où, et **explicitement** "pas de migration" si c'est le cas.

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

# Pilotage multi-activités (août 2026)
node scripts/test-ventilation-activite.mjs      # CA/marge/food cost par étage (lecture seule)
node scripts/test-commission-tva.mjs            # commissions tabac/presse/FDJ + TVA 2,1 %
PORT=3000 node scripts/test-integration-correspondances.mjs   # pont caisse : journal + correspondances
PORT=3000 node scripts/test-rapprochement.mjs   # contrôle quotidien reçu vs compris
PORT=3000 node scripts/test-zelty-mapper.mjs   # traduction Zelty — commandes (sans compte)
PORT=3000 node scripts/test-zelty-catalogue.mjs # traduction Zelty — catalogue (sans compte)
PORT=3000 node scripts/test-zelty-emission.mjs  # émission vers la caisse (sans compte)
PORT=3000 node scripts/test-zelty-disponibilites.mjs # ruptures vers la caisse (sans compte)
PORT=3000 node scripts/test-zelty-import.mjs   # import initial de la carte (sans compte)
PORT=3000 node scripts/test-zelty-webhook.mjs  # webhook signé (secret de test local)
PORT=3000 node scripts/test-scanner-allergenes.mjs # scanner d'emballages (sans Claude Vision)
PORT=3000 node scripts/test-matieres-bar.mjs   # correspondance vendu ↔ acheté du bar
node scripts/test-obligations-ouverture.mjs    # registre légal + drapeau bloquant
node scripts/acces-ambre.mjs                   # accès manageuse (essai à blanc par défaut)
node scripts/parcours-manageuse.mjs            # parcours de formation manageuse
PORT=3000 node scripts/test-visite-guidee.mjs  # visite guidée (contrat d'accompagnement)
node scripts/test-planning-rythme.mjs          # semaine type (pur, sans base)

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
