# Déploiement Vercel — App Restaurant

## Pré-requis (1 fois)

1. **Compte Vercel** lié à ton compte GitHub : https://vercel.com/signup
2. **CLI Vercel** :
   ```sh
   npm i -g vercel
   vercel login
   ```
3. **Repo Git** poussé sur GitHub/GitLab/Bitbucket (Vercel branche dessus pour les builds auto à chaque push).

## Variables d'environnement à configurer dans Vercel

Console Vercel → Project → Settings → Environment Variables. Crée pour les 3 environnements (Production, Preview, Development) :

| Variable | Source | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Console → Project Settings → API → Project URL | Public, peut être dans le bundle client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Console → Project Settings → API → anon public | Public |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys | **Server-side only** — ne jamais exposer au client |

Optionnel (selon modules activés) :
- `OPENWEATHERMAP_API_KEY` (Module 22, météo)

## Configuration Supabase pour la prod

1. **Auth → URL Configuration** : ajouter le domaine Vercel dans `Site URL` et `Redirect URLs` (ex : `https://mon-restaurant.vercel.app`).
2. **Auth → Email Auth** : décider si tu actives la confirmation email obligatoire (cf. CLAUDE.md gotchas Module 28).
3. **Database → Backups** : vérifier que les sauvegardes auto Postgres sont activées (gratuit dans le plan Pro de Supabase).

## Déploiement initial

```sh
# 1. Première fois — relier le projet local à Vercel
vercel link

# 2. Importer les vars depuis .env.local local (optionnel, sinon UI Vercel)
vercel env pull       # télécharge les vars de la prod dans .env.local

# 3. Déployer en preview (URL temporaire)
vercel

# 4. Déployer en production
vercel --prod
```

À chaque `git push` sur la branche principale, Vercel rebuild automatiquement.

## Bootstrap de prod

Une fois le site en ligne :

1. **Crée le 1ᵉʳ compte gérant** : va sur `https://ton-domaine.vercel.app/login`, cliquer "Créer un compte" — le 1ᵉʳ user inscrit devient automatiquement manager (logique dans `getProfile()`).
2. **Active le 2FA** sur `/admin/securite` onglet 2FA.
3. **Lance les migrations Supabase** dans l'ordre `0001 → 0050` via le SQL Editor (si pas déjà fait sur le projet Supabase prod).
4. **Configure le restaurant** sur `/admin/setup` (nom, tables, employés, recettes initiales).

## Bonnes pratiques

- **Branches preview** : push une feature branch → URL preview unique générée (ex : `app-restaurant-git-feat-x.vercel.app`). Idéal pour valider avant de merger.
- **Rollback** : `vercel rollback` ramène la version précédente en 1 clic depuis la console Vercel.
- **Logs runtime** : `vercel logs <URL>` ou Console Vercel → Deployments → Functions.
- **Performance** : la route `/api/assistant/stream` est configurée `maxDuration: 60s` (streaming SSE). Si tu vois des timeouts, augmenter dans `vercel.json`.

## Coûts attendus

- **Hobby tier Vercel** : gratuit, suffit pour un restaurant solo (100 GB bandwidth, 100 GB-h fonctions/mois). 
- **Supabase Free** : 500 MB DB + 1 GB bandwidth — OK pour démarrer, à upgrader vers Pro (~25 $/mois) dès qu'il y a du trafic réel.
- **Anthropic** : pay-as-you-go, ~0,001 $ / message Haiku 4.5 (Module 24 assistant). 5 $ couvrent ~5 000 messages.

## Checklist finale go-live

- [ ] Variables d'env configurées sur Vercel (3 envs)
- [ ] Domaine personnalisé configuré (Vercel → Settings → Domains)
- [ ] Supabase Auth `Site URL` pointe sur le domaine
- [ ] Migrations 0001-0050 lancées dans Supabase prod
- [ ] 1ᵉʳ compte manager créé + 2FA activé
- [ ] Sauvegarde JSON exportée (test du flux `/admin/securite` onglet Sauvegarde)
- [ ] Page TV (`/affichage/tv`) testée sur écran cible (1920×1080)
- [ ] PWA installée sur smartphone gérant (test ajouter à l'écran d'accueil)
