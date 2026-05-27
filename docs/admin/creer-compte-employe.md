# Créer un compte employé — procédure manager

> Pour chaque nouveau collaborateur, suis ces étapes dans l'ordre.
> Compte 5-10 minutes par employé.

---

## Pré-requis

- [x] Tu es connecté(e) sur l'app avec ton compte manager (Arnaud)
- [x] L'employé a une **adresse email pro** valide (sera son identifiant)
- [x] Tu connais son **poste principal** (serveur / cuisinier / barman / pizzaiolo / receptionniste / plonge / second / autre)

---

## Méthode A — via script (recommandée pour la 1ère batch)

Pour créer les 3 premiers employés rapidement, utilise le script :

```sh
node scripts/create-employe.mjs
```

Il te demandera interactivement :
- Prénom
- Nom
- Email
- Poste
- Mot de passe initial

Et fera tout en un seul coup :
1. Crée la fiche dans `employes`
2. Crée le compte Auth Supabase
3. Crée le profil `profils` lié avec rôle `employe` + poste

> ⚠️ Le script nécessite que `SUPABASE_SERVICE_ROLE_KEY` soit posée dans `.env.local`.

---

## Méthode B — via l'interface web (pour le quotidien)

### Étape 1 — Créer la fiche employé

1. Connecte-toi sur https://app-restaurant-livid.vercel.app/login
2. Va sur **`/admin/rh`** → onglet **Équipe**
3. Clique **"+ Ajouter un employé"**
4. Remplis :
   - Prénom, Nom
   - Email pro
   - Poste principal
   - Date d'embauche
   - Type de contrat (CDI / CDD / extra…)
   - SMIC ou taux horaire si différent
5. Sauvegarde → la fiche est créée

### Étape 2 — Créer le compte Auth Supabase

L'employé doit **lui-même** créer son compte (une seule fois) :

1. Tu lui envoies l'URL : https://app-restaurant-livid.vercel.app/login
2. Il clique **"Créer un compte"**
3. Il saisit **la même adresse email** que celle dans sa fiche RH
4. Il choisit un mot de passe (≥ 6 caractères)
5. Confirmation : selon ta config Supabase, il peut avoir besoin de cliquer un lien email reçu

> 💡 **Pour désactiver la confirmation email Supabase** (recommandé pour l'onboarding) :
> https://supabase.com/dashboard/project/ftnasfezxysyaooeyvwq/auth/providers → Email → décocher "Confirm email"

### Étape 3 — Lier le compte Auth à la fiche employé

Le système ne lie pas automatiquement. Tu dois le faire à la main :

1. Va sur **`/admin/securite`** → onglet **Profils**
2. Trouve la ligne du nouvel email (rôle par défaut = `employe`)
3. Clique **"Lier à un employé"**
4. Sélectionne la fiche RH créée à l'étape 1
5. Définis son **poste** (doit matcher celui de la fiche)
6. Optionnel : ajuste les **permissions custom** (par défaut, il aura accès aux écrans de son poste)
7. Sauvegarde

### Étape 4 — Envoyer l'email d'invitation

Voir [`template-email-envoi.md`](./template-email-envoi.md) pour le template à copier-coller.

---

## Vérifier que tout est OK

Une fois le compte créé :

1. Sur **`/admin/securite`** → onglet **Profils**, tu dois voir l'employé avec :
   - ✅ Rôle = `employe`
   - ✅ Poste rempli
   - ✅ employe_id rempli (donc fiche RH liée)
2. Sur **`/admin/rh`** → onglet **Équipe**, la fiche existe et a une colonne "Compte" qui indique "lié"
3. Si l'employé se connecte, il est automatiquement redirigé vers **`/formation/onboarding`** → wizard 3 étapes

Si l'une de ces vérifications échoue, refais l'étape correspondante.

---

## En cas de problème

### L'employé voit "Votre compte n'a pas le rôle manager"
→ Normal s'il essaie d'aller sur `/admin/*`. Il doit aller sur `/formation` ou son écran de poste.

### L'employé est bloqué sur `/formation/onboarding`
→ Vérifie que la fiche `employes` existe et que le `profils.employe_id` pointe dessus. Sans ce lien, l'onboarding ne peut pas démarrer.

### "Refresh token not found" / erreur 401
→ Le cookie de session est expiré (plusieurs heures sans activité). L'employé doit se reconnecter.

### Mot de passe oublié
→ Tu peux le reset depuis **`/admin/securite`** → onglet **Profils** → "Envoyer un email de reset". Sinon, suppression + recréation du compte.

---

## Désactiver / supprimer un employé

### Cas 1 — départ temporaire (congé, suspension)
→ `/admin/rh` → fiche employé → toggle **"Actif"** sur OFF. Son compte Auth reste actif mais il n'apparaît plus dans les écrans service.

### Cas 2 — départ définitif
→ Suppression à faire dans cet ordre :
1. Réassigner ou clôturer ses commandes / paiements / pointages en cours
2. `/admin/securite` → supprimer le profil
3. Le compte Auth Supabase peut être supprimé via le dashboard Supabase ou laissé en orphan (sans impact)
4. `/admin/rh` → archiver la fiche (ne pas la supprimer pour conserver l'historique RH légal)
