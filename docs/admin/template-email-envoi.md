# Templates email — envoi aux employés

Trois variantes à copier-coller dans Gmail (ou ton client email).

---

## 1. Email court — annonce + lien (recommandé pour démarrer)

> **Objet** : 🚀 CASATASIA — ton accès à l'app de gestion

> Bonjour {Prénom},
>
> Le grand jour approche : voici ton accès à l'application CASATASIA pour t'entraîner avant l'ouverture.
>
> **🌐 URL** : https://app-restaurant-livid.vercel.app
>
> **🔑 Tes identifiants** :
> - Email : `{email-employe@example.com}`
> - Mot de passe temporaire : `{mot-de-passe-initial}`
>
> 👉 **Première connexion** : l'app va te guider à travers un onboarding de 30 minutes (manuel + quiz). Prends le temps de bien le faire — c'est ta première formation.
>
> 📱 **Sur ton téléphone** : installe l'app en allant sur l'URL puis "Ajouter à l'écran d'accueil" (Safari) ou "Installer" (Chrome).
>
> 📖 **Guide complet** : pièce jointe (ou : https://app-restaurant-livid.vercel.app/admin/formation/docs/bienvenue-employe — si tu rends le doc accessible online)
>
> 📞 **Une question, un bug** : appelle-moi ou envoie-moi un SMS.
>
> Bon apprentissage 🎯
>
> Arnaud

---

## 2. Email long — avec contexte + checklist

> **Objet** : Ton accès à CASATASIA + ton parcours d'apprentissage

> Salut {Prénom},
>
> Tu trouveras ci-dessous tout ce qu'il te faut pour démarrer sur l'application CASATASIA. Je te conseille d'y consacrer **1h cette semaine** : 30 minutes pour la première connexion + onboarding, et 30 minutes pour explorer librement.
>
> ---
>
> ## 🔑 Tes identifiants
>
> - **URL** : https://app-restaurant-livid.vercel.app
> - **Email** : `{email-employe@example.com}`
> - **Mot de passe** : `{mot-de-passe-initial}` (à changer dès ta première connexion)
> - **Ton poste dans l'app** : {Serveur(se) / Cuisinier(ère) / Barman / etc.}
>
> ---
>
> ## ✅ Ta checklist
>
> 1. [ ] Va sur l'URL ci-dessus et connecte-toi
> 2. [ ] Change ton mot de passe (icône en haut à droite → "Mon profil")
> 3. [ ] Termine l'onboarding (3 étapes : bienvenue + manuel + quiz)
> 4. [ ] Installe l'app sur ton smartphone (PWA)
> 5. [ ] Explore l'écran de ton poste (`/serveur`, `/cuisine` selon le cas)
> 6. [ ] Crée 1-2 commandes test pour voir comment ça marche
> 7. [ ] Va sur `/formation` et regarde les manuels niveaux 2 et 3 disponibles pour ton poste
>
> ---
>
> ## 📌 Important — période de test
>
> Tu es en mode "découverte" jusqu'à l'ouverture officielle :
>
> - ✅ Tu peux tout tester sans crainte
> - ✅ Les fausses commandes / encaissements seront effacés avant l'ouverture
> - ❌ Ne touche pas aux recettes / ingrédients / paramètres (je les ai configurés)
> - ❌ Les chiffres de "chiffre d'affaires" que tu vois ne sont pas réels
>
> ---
>
> ## 🆘 Besoin d'aide ?
>
> - App qui plante / page blanche → recharge la page, redémarre ton appareil
> - Mot de passe perdu → SMS-moi, je te reset
> - Question métier (comment encaisser, comment annuler) → le manuel de ton poste a tout
> - Bug visible (un bouton qui ne marche pas) → capture d'écran + SMS-moi
>
> 📞 **Mon numéro** : {ton-numéro}
> 📧 **Mon email** : infos.agentsalliance@gmail.com
>
> ---
>
> À très vite,
>
> Arnaud

---

## 3. SMS court (en complément ou seul)

```
Salut {Prénom} ! Ton accès à l'app CASATASIA :
🌐 app-restaurant-livid.vercel.app
🔑 {email} / {mot-de-passe}

L'app te guidera (onboarding 30 min). Installe-la sur ton phone "Ajouter à l'écran d'accueil".

Période de test, tu peux tout casser, rien n'est définitif.

Une question, appelle-moi 👍
```

---

## 4. Message WhatsApp groupe (optionnel)

```
🚀 Hello team CASATASIA !

L'app est prête, vous avez tous reçu vos accès individuels par email.

📋 Ce qu'on attend de vous cette semaine :
1️⃣ Connexion + onboarding (30 min) ✅
2️⃣ Installer l'app sur votre phone 📱
3️⃣ Explorer librement votre écran de poste 🔍

🆘 Question ou bug → ping-moi en privé
🎯 On en reparle samedi en briefing

Bon apprentissage ! 💪
```

---

## Tips pour personnaliser

- Remplace `{Prénom}`, `{email-employe@example.com}`, `{mot-de-passe-initial}`, `{ton-numéro}` par les vraies valeurs
- Choisis un mot de passe initial mémorisable, ex : `Casa2026!` puis dis-leur de le changer
- Si tu envoies par email avec pièce jointe, attache **`docs/onboarding/bienvenue-employe.md`** convertie en PDF (commande : `pandoc docs/onboarding/bienvenue-employe.md -o bienvenue.pdf`)
