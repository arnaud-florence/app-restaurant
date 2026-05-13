# Agents permanents — Configuration du déclenchement automatique

Les 10 agents IA ont chacun une route HTTP (`GET /api/cron/agents/<id>`) qui les exécute. Pour qu'ils tournent automatiquement en arrière-plan, il faut un déclencheur externe qui les ping selon leur planning.

## Étape 1 — Générer un CRON_SECRET (une seule fois)

```sh
# Linux / Mac
openssl rand -hex 32

# Windows PowerShell
[System.Web.Security.Membership]::GeneratePassword(64, 0)
```

Garde la valeur de côté, tu vas la coller à 2 endroits.

## Étape 2 — Configurer Vercel

Project Settings → Environment Variables :
- **CRON_SECRET** = `<la valeur générée>`  (Production + Preview)

Redéploie pour que la variable soit active.

---

## Étape 3 — Choisir la méthode de déclenchement gratuite

Tu as 2 options. **Option B est plus simple si tu débutes.**

### Option A — GitHub Actions

✅ Tout dans ton repo, versionné, observable
⚠ Le quota free est 2000 min/mois pour repos privés. Avec sécu toutes les 30min + financier/haccp toutes les heures, on consomme ~3400 min/mois → **dépasse**.

**Solutions pour rester gratuit** :
1. **Repo public** → Actions illimités (mais ton code source est exposé)
2. **Réduire la fréquence** : passe Financier et HACCP toutes les 2h au lieu d'1h (~2100 min/mois — limite frôlée)
3. **Décaler les agents lourds vers cron-job.org** et garder GitHub pour les daily

Configuration :
1. Settings → Secrets and variables → Actions
   - Secret `CRON_SECRET` = même valeur que dans Vercel
   - Variable `RESTAURANT_BASE_URL` = `https://<ton-app>.vercel.app`
2. Le workflow `.github/workflows/agents-cron.yml` est déjà commité
3. Test manuel : onglet **Actions** → "Agents permanents" → "Run workflow"

### Option B — cron-job.org (recommandé)

✅ Gratuit, illimité, web UI très simple
✅ Aucun impact sur ton quota Vercel ou GitHub
⚠ Service tiers (mais réputé fiable depuis 15+ ans)

1. Crée un compte sur https://cron-job.org/
2. Crée **10 jobs** (1 par agent) avec ces paramètres :

| Agent | URL | Cron expression (UTC) |
|---|---|---|
| Veilleur | `https://<ton-app>.vercel.app/api/cron/agents/veilleur` | `0 1 * * *` (01h UTC) |
| Météo | `…/api/cron/agents/meteo` | `0 5 * * *` (05h UTC) |
| Stock | `…/api/cron/agents/stock` | `0 */2 * * *` (toutes les 2h) |
| Financier | `…/api/cron/agents/financier` | `5 * * * *` (toutes les heures) |
| RH | `…/api/cron/agents/rh` | `0 21 * * *` (21h UTC = 22h Paris hiver) |
| HACCP | `…/api/cron/agents/haccp` | `10 * * * *` (toutes les heures) |
| Commercial | `…/api/cron/agents/commercial` | `0 19 * * *` (19h UTC = 20h Paris hiver) |
| Stratégique | `…/api/cron/agents/strategique` | `0 6 * * 1` (Lundi 06h UTC = 07h Paris hiver) |
| Sécurité | `…/api/cron/agents/securite` | `*/30 * * * *` (toutes les 30 min) |

Note : Scanner n'est PAS un cron — il s'active à l'upload d'une image via `/admin/fournisseurs`.

3. Pour CHAQUE job, ajoute un header **HTTP** :
   - Key : `Authorization`
   - Value : `Bearer <ton CRON_SECRET>`

4. Sauvegarde et active le job. Tu peux tester avec "Run now".

---

## Étape 4 — Vérification

Une fois en place, va sur `/admin/pilotage` :
- Le bloc "🤖 Mes agents au travail" devrait montrer des timestamps récents
- Chaque agent a un lien "Lancer maintenant" sur sa page dédiée `/admin/pilotage/agents/<id>` pour test manuel

## Pendant la phase de dev (avant ouverture)

Tu peux te passer du cron : utilise le bouton **▶ Lancer maintenant** dans `/admin/pilotage/agents/<id>` quand tu veux tester un agent. Pas besoin de configurer le cron tant que le restaurant ne tourne pas en production.

## Coûts à anticiper

- Vercel : gratuit en hobby (à upgrader vers Pro $20/mois uniquement si tu veux Vercel Cron natif)
- GitHub Actions : voir Option A
- cron-job.org : gratuit illimité
- Anthropic (Claude) : ~$0.003 par run d'Agent Stratégique (1×/sem) + ~$0.005 par scan facture. Estimation < $1/mois.
- Supabase : gratuit en free tier (Pro à $25/mois à terme si volume gros)

**Budget cron-job.org + Vercel hobby + Supabase free + Anthropic dev** = $0-2/mois.
