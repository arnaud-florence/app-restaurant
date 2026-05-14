# app-restaurant

> Logiciel de gestion complète d'un restaurant indépendant (single-tenant).
> Du back-office (recettes, food cost, stocks, fournisseurs, équipe) au service en salle (caisse, plan de salle, écrans cuisine/bar/serveur en temps réel), avec 15 agents IA qui tournent 24/7 en arrière-plan.

🌐 **Prod** : https://app-restaurant-livid.vercel.app

---

## Stack

- **Next.js 14** App Router + Server Components + Server Actions
- **TypeScript** strict
- **Supabase** (Postgres + Realtime + Storage + Auth)
- **Tailwind 3** + shadcn/ui + lucide-react
- **Anthropic Claude** (assistant IA, scanner factures, génération de contenu)
- **Vercel** (hosting + edge functions)

## Périmètre fonctionnel

28 modules livrés couvrant l'ensemble des besoins d'un restaurant indépendant :

| Domaine | Modules |
|---|---|
| Carte & coûts | Ingrédients, Recettes & Food Cost, Menu Engineering, Boissons |
| Service | KDS Cuisine/Bar/Serveur, Caisse + Z-report, Tickets 80mm |
| Stock & achats | Stocks (déduction auto), Fournisseurs + Bons de commande |
| Hygiène & légal | HACCP, Allergènes, Maintenance, Obligations légales, Déchets |
| RH | Fiches employés, Planning, Pointage, Paie, Pourboires |
| Pilotage | Finances (P&L, TVA, trésorerie), Énergie, Pilotage 10 KPI |
| Client & ventes | CRM & Fidélité, Réservations chambres+tables, Groupes |
| IA & data | Assistant gérant Claude, Prévisionnel météo, Journal, Marketing IA |
| Comm & form | Équipes, Affichage TV, Formation niveaux 1-3 + certifs + badges |
| Sécurité | Supabase Auth, RBAC manager/employé, 2FA TOTP, audit, sauvegardes |

**Plus** : site public + API publique + 15 agents IA permanents.

## Agents IA permanents

15 agents tournent automatiquement via `pg_cron` (Supabase) :

🌙 Veilleur · 🌤️ Météorologue · 📦 Stock · 💰 Financier · 👥 RH · 🌡️ HACCP · 💬 Commercial · 📄 Scanner factures · 🎯 Stratégique · 🛡️ Sécurité · 👨‍🍳🍷🥪🍽 4 agents temps réel par poste · 🎓 Formateur

Chacun loggue ses runs + findings dans Supabase, alimente le dashboard `/admin/pilotage` et envoie des push notifs sur les alertes critiques (`sendPushToEmployeRateLimited`, max 3/h).

## Quick start

```sh
git clone https://github.com/arnaud-florence/app-restaurant.git
cd app-restaurant
npm install
cp .env.local.example .env.local   # puis remplir avec ton projet Supabase
npm run dev
```

Voir [`CLAUDE.md`](./CLAUDE.md) pour le guide projet complet (architecture, conventions, gotchas, agents, modules).

## Statut

Projet personnel, déployé en production. Pas de contributions externes attendues — le code est public à des fins de transparence et de documentation.

## Licence

Tous droits réservés.
