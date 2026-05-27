# Formation interne — Poste LIVREUR

> Vue métier — comment le/la livreur(se) utilise l'app au quotidien.
> À lire en ~15 min · base pour Module 27.
> ⚠️ Tu es **externe au service salle/cuisine** mais **interne à l'équipe** — tu fais le pont entre la prep et le client final qui n'a pas pu se déplacer.

---

## 1. Ta mission

Tu **livres les commandes ONLINE** dont le client a choisi le mode "livraison" (vs retrait sur place ou consommation en salle). Côté app, tu utilises principalement **une seule page** : `/livreur`.

Ton job :
1. **Voir** ta tournée de la journée (planning livraisons)
2. **Récupérer** les commandes en cuisine quand elles sont prêtes
3. **Livrer** au client à son adresse
4. **Marquer** chaque livraison comme effectuée (statut "livré")
5. **Gérer les incidents** (client absent, adresse fausse, refus, etc.)

**Tu représentes le restaurant chez le client.** Sourire, ponctualité, propreté du véhicule = autant d'avis Google +5 étoiles.

---

## 2. Tes accès dans l'app

| Page | Mode | Ce que tu fais |
|---|---|---|
| **`/livreur`** | ÉCRITURE — **ta page unique** | Voir la tournée, marquer livré, gérer incidents |
| **`/admin/clients`** | 👁 LECTURE (allergies/préférences) | Vérifier les notes spéciales d'un client |
| **`/admin/hygiene`** | ÉCRITURE (checklist véhicule) | Si tu pars en voiture/scooter, checklist hygiène transport |
| **`/equipes`** | ÉCRITURE | Chat équipe (incident, retard, panne véhicule) |
| **`/admin/formation`** | ÉCRITURE | Tes formations |

**Tu n'as PAS accès à** : prise de commande, encaissement, cuisine, finances, RH (sauf pointage), réservations, recettes, stock.

Page d'accueil par défaut : **`/livreur`** (la seule qui t'intéresse).

---

## 🌐 Multi-canal : tu ne gères QU'UN flux — ONLINE livraison

Le restaurant reçoit des commandes par 4 canaux, mais **tu ne gères qu'un flux** :

| Source | Toi ? | Pourquoi |
|---|---|---|
| 🪑 TABLE | ❌ | Client en salle, pas de livraison |
| 🛒 COMPTOIR | ❌ | Client vient chercher au comptoir |
| 🌐 ONLINE (retrait) | ❌ | Client vient retirer au resto |
| 🌐 **ONLINE (livraison)** | ✅ | C'est toi |
| 🛍 BORNE | ❌ | Client sur place |

→ **Tu ne vois que les commandes ONLINE avec `mode_retrait = livraison`.** Tout le reste est invisible pour toi.

### Comment ça arrive

Quand un client commande sur le site et choisit "livraison" :
1. Il saisit son **adresse de livraison** (+ étage, code, infos)
2. Il choisit un **créneau** (ex : "livraison entre 19h00 et 19h30")
3. Il paye (Stripe)
4. La commande arrive en **cuisine** et **sur ton `/livreur`** en même temps

---

## 3. Ton écran principal : `/livreur`

Quand tu ouvres `/livreur`, tu vois :

### Section "Tournée du jour"

Liste de toutes les livraisons prévues aujourd'hui, triées par créneau de livraison. Chaque carte affiche :
- **Numéro de commande** (#1234)
- **Nom du client** + téléphone
- **Adresse complète** (+ étage / code / infos)
- **Créneau prévu** (ex: 19:00-19:30)
- **Articles** (résumé : "2 pizzas + 1 boisson")
- **Statut actuel** :
  - 🟡 `en_attente` ou `en_preparation` → la cuisine bosse, ne pars pas encore
  - 🟢 `pret` → tu peux récupérer
  - 🔵 `en_livraison` → tu es parti
  - ✅ `livre` → terminé

### Section "À livrer maintenant"

Filtre dynamique : les commandes au statut `pret` (la cuisine a terminé) **et** dont le créneau commence dans < 15 min.

→ C'est ton **buffer prioritaire**. Pars dès que tu en as 1-3 sur cette section.

### Section "Historique du jour"

Liste des livraisons déjà effectuées (statut `livre`). Tu peux vérifier ce que tu as fait + horaire.

---

## 4. Routine quotidienne — par moment

### 🌅 Prise de poste (10 min avant ta tournée)

#### a) Pointer + briefings

`/admin/rh` ou tablette → pointer arrivée. `/equipes` → lis les messages.

#### b) Préparer le véhicule

Pas dans l'app — physique :
- Carburant plein
- Sac isotherme propre + chaud/froid selon
- Téléphone chargé + GPS configuré
- Casque (si scooter)
- Tenue restaurant propre

#### c) Check `/livreur` — préparer ta tournée

Sur `/livreur` :
1. Compte le nombre de livraisons du jour
2. Trie mentalement par zone (regroupe géographiquement)
3. Anticipe le **timing** : si tu as 3 livraisons à faire entre 19h et 19h30 dans 3 zones différentes, regarde la distance → tu pars **dès la 1ère prête** sinon tu te mets en retard

#### d) Checklist hygiène transport (si requise)

`/admin/hygiene` → checklist "Véhicule livraison" (à configurer par Arnaud) :
- ✅ Sac isotherme nettoyé
- ✅ Température sac vérifiée
- ✅ Pas de croisement allergènes (sac séparé si livraison sensible)

---

### 🛵 Pendant le service / pendant ta tournée

#### Workflow d'une livraison standard

1. Sur `/livreur`, tu vois une commande passer de 🟡 à 🟢 (cuisine prête)
2. Tu vas en cuisine, tu prends le sachet
3. **Vérifie le sachet** : nom client visible (étiquette ou notes), nombre d'items vs ce que dit la commande
4. Sur `/livreur` → tap la commande → bouton **"🛵 En route"** → statut passe `en_livraison`
5. Tu pars (GPS sur l'adresse)
6. À l'arrivée :
   - Sonne à l'interphone / code / appartement
   - Remets la commande au client
   - Sourire + "bon appétit !"
7. Sur `/livreur` → tap la commande → bouton **"✅ Livré"** → statut passe `livre`

⚠️ **Marque "Livré" IMMÉDIATEMENT après la remise**, pas 30 min après en bas de l'immeuble. Sinon le manager ne sait pas où tu en es.

#### Si tu fais plusieurs livraisons en tournée

Tu peux marquer "En route" pour plusieurs commandes en même temps si elles partent ensemble :
1. Avant de partir : tap les 3 commandes → "En route" pour chacune
2. À chaque remise au client : "Livré" sur celle-ci
3. La dernière, tu rentres au resto

⚠️ **Respecte la chaîne du froid/chaud.** Si tu as 30 min entre la 1ère et la 3ème livraison, les premiers plats refroidissent. Le sac isotherme limite mais ne stoppe pas.

#### Cas critique : tu démarres "En route" sans avoir le sachet

Bug classique : tu cliques "En route" depuis ton phone en marchant vers la cuisine → tu te crois parti alors que le sachet n'est pas dans tes mains.

→ **Règle d'or** : ne cliques "En route" QU'APRÈS avoir le sachet dans ta main.

---

### 🚧 Incidents — que faire si...

#### Le client n'est pas là quand tu sonnes

1. **Appelle le client** (numéro affiché sur la carte commande)
2. **Attends 5-10 min** (souvent il est dans le salon, douche, etc.)
3. Si toujours pas : **prends une photo** du paquet devant la porte (preuve)
4. **Ne laisse PAS le paquet sans contact**
5. Repars avec le sachet, préviens le manager via `/equipes`
6. Sur `/livreur`, **NE marque PAS livré** — laisse en `en_livraison`
7. Quand le manager décide (re-livrer ce soir, demain, ou rembourser), il te dira quoi faire

#### Le client refuse la livraison (mauvais plat, retard, etc.)

1. **Reste poli**, prends le motif
2. **Reprends le sachet**, repars au resto
3. Via `/equipes` → préviens immédiatement le manager
4. Sur `/livreur`, **laisse en `en_livraison`** — le manager marquera comme "refusée" et fera le geste commercial

#### Tu as un accident / panne / problème véhicule

1. **Préviens immédiatement** Arnaud (téléphone) — c'est ta sécurité d'abord
2. **Préviens les clients** de ta tournée (numéros visibles dans `/livreur`)
3. Sur `/livreur`, laisse les commandes en l'état — le manager redispatche

#### L'adresse est fausse / introuvable

1. Appelle le client pour confirmer
2. Si vraiment introuvable, repars au resto avec le sachet
3. Préviens le manager via `/equipes`

#### Tu es en retard de >15 min sur le créneau

1. **Appelle le client EN AMONT** ("Je serai là dans 15 min, désolé")
2. **Préviens le manager** via `/equipes`
3. Considère un geste commercial à la remise (boisson offerte, dessert, code promo)

---

### 🌃 Fin de service

#### a) Vérifier qu'il n'y a plus de commandes en attente

`/livreur` → toutes tes commandes du jour doivent être au statut `livre` (ou `refusee` / `non_livree` pour les cas spéciaux).

Si tu as encore une commande en `en_livraison` → tu l'oublies, va voir le manager.

#### b) Pointage sortie

Tablette ou `/admin/rh` → pointer sortie.

#### c) Nettoyage véhicule

Pas dans l'app — physique :
- Vider le sac isotherme
- Nettoyer / désinfecter
- Ranger casque, sangles, équipement

#### d) Si tu as des notes / incidents

`/equipes` → note rapide au manager :
- "3 livraisons OK, 1 client absent (rappelé, livré 30 min plus tard)"
- "Adresse XXX corrigée — c'est en réalité au 12 bis et non 12"

Ces infos sont précieuses pour améliorer le service.

---

## 5. Les 5 réflexes à avoir

1. **"En route" UNIQUEMENT avec le sachet en main.** Pas avant.

2. **"Livré" IMMÉDIATEMENT après remise.** Pas dans 30 min, pas en rentrant.

3. **Vérifie le sachet AVANT de partir** : items vs commande, étiquette client, bouchon scellé.

4. **Appelle le client en cas de moindre retard / souci.** La communication évite 90% des avis négatifs.

5. **Respecte la chaîne du froid/chaud.** Le sac isotherme limite, mais ne fait pas de miracles.

---

## 6. Mapping rapide — où dans l'app pour quoi

| Je veux… | Aller sur |
|---|---|
| Voir ma tournée du jour | `/livreur` |
| Marquer "en route" | `/livreur` → tap commande → "🛵 En route" |
| Marquer "livré" | `/livreur` → tap commande → "✅ Livré" |
| Voir les détails d'un client | `/livreur` → tap commande → fiche client |
| Voir les allergies d'un client | `/admin/clients` → fiche |
| Signaler un incident | `/equipes` |
| Cocher la checklist véhicule | `/admin/hygiene` |
| Pointer entrée/sortie | tablette ou `/admin/rh` |
| Voir mes formations | `/admin/formation` |

---

## 7. Pièges classiques

1. **Cliquer "En route" trop tôt** (avant d'avoir le sachet) → tu te crois parti, tu oublies le sachet
2. **Oublier de marquer "Livré"** → le manager ne sait pas si la livraison est faite, peut envoyer un 2ᵉ livreur
3. **Laisser un paquet sans contact** → litige possible si le client dit ne pas l'avoir reçu
4. **Pas appeler avant un retard** → avis négatif assuré
5. **Marquer "Livré" alors que tu as eu un problème** → ça brouille les stats, le manager ne sait pas qu'il y a eu incident
6. **Ne pas respecter la chaîne du froid/chaud** → réclamation client garantie
7. **Pas pointer sortie** → tes heures sont faussées

---

## 8. Suivi de ta propre formation

### Premier jour
- [ ] Compte créé, mot de passe personnel
- [ ] Visite des écrans : `/livreur`
- [ ] Tu as fait 1 livraison test (réelle ou simulée) avec le manager
- [ ] Tu sais où sont les sachets isothermes
- [ ] Tu connais les zones de livraison habituelles (rayon ~5 km)
- [ ] Tu as testé le numéro client (appeler le manager avant de partir pour 1ʳᵉ vraie livraison)

### Première semaine
- [ ] Tu maîtrises le cycle complet (récup cuisine → en route → livré)
- [ ] Tu appelles systématiquement avant un retard
- [ ] Tu signales les incidents via `/equipes`
- [ ] Tu finalises ton guide Module 27 LIVREUR

### Premier mois
- [ ] 0% de "Livré" en retard ou faux
- [ ] 100% des incidents tracés via `/equipes`
- [ ] Tes avis Google moyennent ≥ 4.5/5 sur les commentaires livraison
- [ ] Tu connais les "habitués" et leurs préférences

---

> **Tu es l'ambassadeur du restaurant à 5 km à la ronde.** Sourire, ponctualité, propreté = ton triple atout. Bonne route ! 🛵
