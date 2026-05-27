# Formation interne — Poste SNACK / COMPTOIR

> Vue métier — comment l'employé(e) snack/comptoir utilise l'app au quotidien.
> À lire en ~20 min · base pour Module 27.
> ⚠️ Ce poste est polyvalent : tu fais à la fois **prise de commande**, **préparation** et **encaissement**. Tu es l'équivalent d'un "fast-food worker" mais avec la rigueur métier d'un restaurant.

---

## 1. Ta mission

Tu gères **le flux de commandes rapides** : ventes au comptoir, retraits des commandes online, supervision de la borne kiosk. Ton service est **rapide, ergonomique, et hautement digital** :

1. Tu **encaisses** les clients qui arrivent directement au comptoir
2. Tu **prépares** (ou tu coordonnes avec la cuisine) les snacks, salades, sandwichs, pizzas à emporter
3. Tu **remets** les commandes online quand les clients viennent les chercher
4. Tu **dépannes** les clients perdus à la borne (NFC en échec, panier oublié, etc.)

**Tu es le visage rapide du restaurant** — différent du service en salle, mais aussi exigeant en sourire et précision.

---

## 2. Tes accès dans l'app

| Page | Mode | Ce que tu fais |
|---|---|---|
| **`/emporter`** | ÉCRITURE — **ta page principale** | Voir + encaisser BORNE/COMPTOIR, remettre ONLINE |
| **`/caisse`** | ÉCRITURE | Encaisser (carte/espèces/TR), Z-report fin de service |
| **`/cuisine`** | ÉCRITURE (filtre snacking) | Voir / changer statut des items snack |
| **`/bar`** | ÉCRITURE (si tu prépares aussi boissons soft) | Préparer boissons borne/comptoir |
| **`/admin/borne`** | 👁 LECTURE | Voir l'activité kiosque temps réel, alerter si NFC échoue trop |
| **`/admin/clients`** | ÉCRITURE | Ajouter une fiche client, gérer fidélité comptoir |
| **`/admin/hygiene`** | ÉCRITURE | Checklists comptoir, températures vitrines snack |
| **`/admin/dechets`** | ÉCRITURE | Pesée déchets fin de service |
| **`/equipes`** | ÉCRITURE | Chat équipe (signaler bug borne, client perdu, etc.) |
| **`/admin/formation`** | ÉCRITURE | Tes formations |

**Tu n'as PAS accès à** : finances, recettes (sauf lecture), ingrédients (sauf lecture), RH (sauf pointage), réservations, sécurité, configuration.

Page d'accueil par défaut : **`/emporter`** (tu vois tout ce qui te concerne).

---

## 🌐 Multi-canal : ton poste est au cœur de 3 canaux sur 4

Tu es l'interface directe pour **COMPTOIR, ONLINE retrait, et BORNE**. Le canal TABLE est géré par les serveurs.

### Tableau de tes flux

| Badge | Source | Ce que tu fais |
|---|---|---|
| 🛒 **COMPTOIR** (violet) | Client devant toi au comptoir | Tu prends la commande, tu encaisses immédiatement, tu prépares (ou tu transmets à la cuisine), tu remets |
| 🌐 **ONLINE** (émeraude) | Client a commandé en ligne | Tu vois la commande sur `/emporter`, tu la prépares au bon créneau, tu la remets quand le client arrive, tu marques "retiré" |
| 🛍 **BORNE** (rouge) | Client a utilisé la borne | Tu surveilles la borne, tu dépannes si NFC en échec, tu remets la commande quand préparée |

### 🛒 Workflow COMPTOIR : prendre + encaisser

Quand un client arrive directement au comptoir (sans table) :

1. Sur ton écran principal (`/emporter` ou `/bar` selon ce que ton manager a configuré), tap le bouton **"+ Comptoir"**
2. Modal qui s'ouvre :
   - **Catalogue** filtré sur SNACKING + PIZZA + BAR (boissons) → ce qui peut être vendu au comptoir
   - Tap sur chaque article voulu (×1, ×2, etc.)
   - **Consommation** : 🍽 sur place ou 📦 à emporter — impact TVA
   - **Fidélité** (optionnel mais important) : "Le client a-t-il un compte fidélité ?" → recherche par téléphone/nom/QR
3. **Total affiché** → bouton **"Encaisser"**
4. **Paiement** :
   - Carte : tap "Carte" → terminal contactless / chip
   - Espèces : saisis le montant donné, l'app calcule la monnaie
   - Ticket resto : valide
   - Multi : "+ Ajouter paiement" pour combiner
5. Bouton final **"Valider la commande"** → ticket imprimé + commande **part en cuisine instantanément**

⚠️ **Toujours encaisser AVANT la prep**. Une commande COMPTOIR sans paiement n'arrive pas en cuisine (statut bloqué `en_attente_paiement_comptoir`).

### 🌐 Workflow ONLINE : préparer + remettre

Les commandes ONLINE sont **autonomes côté client** — il a commandé sur le site et payé. Toi tu gères la remise.

#### Pendant le service

Sur `/emporter`, tu vois 2 sections :
- **"À préparer"** : commandes ONLINE dont le créneau approche (< 30 min)
- **"Prêtes — en attente client"** : commandes prêtes, client va arriver

#### Quand une commande approche du créneau

Exemple : un client doit retirer à 13h00, on est à 12h45.
1. Tu vois le ticket sur `/emporter` (section "À préparer")
2. Si la cuisine ne l'a pas vu, tu peux **leur faire un rappel oral** ("ONLINE pour 13h, à sortir dans 10 min")
3. Quand la cuisine marque "prêt", la carte passe dans la section "Prêtes"

#### Quand le client arrive

1. Le client te dit son nom ou montre son SMS de confirmation
2. Tu cherches la commande sur `/emporter` (filtre nom ou numéro)
3. Tu **vérifies** que tout est dedans (vs la liste affichée)
4. Tu mets dans un sachet, scellé si possible
5. Tu remets au client + tap **"Retiré ✓"** → statut passe à `retire_par_client`

#### Si le client n'arrive jamais

Si une commande est "prête" depuis > 1 heure et le client n'est pas venu :
1. **Appelle le client** (numéro dans la fiche commande)
2. Si pas joignable → contacte le manager (Arnaud) via `/equipes`
3. **Ne jette pas le plat sans validation manager** — on peut le proposer en interne (équipe) ou le réajuster

### 🛍 Workflow BORNE : superviser + dépanner

La borne est censée fonctionner toute seule. Mais tu es **le filet de sécurité** :

#### Surveiller en service

Garde un œil sur la **borne physique** (généralement à 1-2 m de ton comptoir). Si tu vois :
- Un client qui **clique 3-4× sans succès** → va l'aider physiquement
- Un client qui **abandonne au moment du paiement** → propose de payer au comptoir
- Un client **âgé qui hésite** → guide-le poliment

#### Si la borne plante / NFC en échec

Sur `/emporter`, tu vois une section **"Caisse borne"** avec les commandes BORNE en attente de paiement (badge rouge 🛍).

Si la borne a basculé en mode "paiement au comptoir" (NFC en échec, client a cliqué "Payer au comptoir") :
1. Le client vient à toi avec son numéro de commande (ou son prénom saisi sur la borne)
2. Tu cherches sur `/emporter` → tap sa commande
3. Modal de paiement → tu encaisses (carte/espèces/TR)
4. La commande **part en cuisine automatiquement** (statut `en_attente`)
5. Tu remets le ticket / le numéro de retrait au client

#### Dashboard `/admin/borne` (en lecture seule pour toi)

Si Arnaud t'a donné l'accès, va sur `/admin/borne` 1× par jour pour voir :
- **Taux NFC échec** : si > 10%, la borne a un souci → préviens Arnaud
- **Commandes abandonnées** : si beaucoup, peut-être que les prix sont mal affichés → vérifie

---

## 3. Routine quotidienne — par moment

### 🌅 Prise de poste (10 min avant l'ouverture)

#### a) Pointer + briefings

`/admin/rh` → pointer arrivée. `/equipes` → lis les messages.

#### b) Check borne physique

- La borne est-elle allumée et opérationnelle (page d'accueil affichée) ?
- Le lecteur NFC est-il propre ?
- L'imprimante de ticket borne a-t-elle du papier ?

Si non : préviens Arnaud immédiatement.

#### c) Mise en place comptoir

- Caisse ouverte sur `/caisse` → bouton "Ouvrir session" avec fond initial
- Vitrine snacking (sandwichs, salades) remplie et fraîche
- Vitrine boissons (eau, soft, jus) remplie
- Sachets / boîtes emporter prêts
- Imprimante ticket testée

#### d) Relevé température vitrines

Si tu gères des vitrines réfrigérées (frigos snacks) :
`/admin/hygiene` → relevé température. Idem cuisinier (cf. doc 03-cuisinier).

#### e) Checklist comptoir ouverture

`/admin/hygiene` → checklist "Ouverture comptoir/snack" (à créer par Arnaud si pas existante). Items typiques :
- ✅ Vitrines remplies et fraîches
- ✅ Sachets / boîtes / serviettes en quantité
- ✅ Carte du jour visible
- ✅ Borne testée (1 commande blanche annulée)
- ✅ Caisse ouverte

---

### 🍴 Pendant le service

#### Workflow type d'une heure de pointe

11h45 — pic snack du midi commence :
- 2 clients en file au comptoir → tu encaisses chacun (commande COMPTOIR)
- 1 ticket arrive sur `/emporter` → commande ONLINE pour 12h00 → tu la prépares
- 3 commandes BORNE arrivent simultanément → tu vérifies que la cuisine les voit
- 1 client cherche son numéro de retrait à la borne → tu l'aides

→ **Reste calme, garde le sourire, gère la file**. Si tu sens que tu débordes, **appelle physiquement le serveur via `/equipes`** pour venir aider à encaisser.

#### Gestion file d'attente

Si tu as 4+ clients en file :
1. Annonce à voix haute : "Vous pouvez aussi commander à la borne !" → réduit ta file
2. Si la cuisine accumule du retard, le manager voit sur `/admin/pilotage` → il peut intervenir

#### Cas spécial : groupe de 6+ au comptoir

Si un groupe de 6+ arrive au comptoir :
1. **Suggère de séparer** : "vous préférez 1 commande groupée ou chacun la sienne ?"
2. Si groupée : 1 seule commande COMPTOIR, paiement unique (ou multiple ventilé)
3. Si chacun : files distinctes, propose la borne aux autres

---

### ⏸️ Inter-services (14h-18h)

Période calme. Profite pour :

1. **Réapprovisionner les vitrines** snacks
2. **Faire un check borne** : test 1 commande de A à Z (annuler avant paiement)
3. **Vider les déchets** (`/admin/dechets` pesée intermédiaire)
4. **Nettoyer le comptoir** (checklist hygiène à mi-service)

---

### 🌃 Fin de service / fin de shift

#### a) Vérifier qu'il n'y a plus de commandes pendantes

`/emporter` → :
- Aucune commande BORNE/COMPTOIR en `en_attente_paiement_comptoir` (sinon : encaisse ou annule)
- Aucune commande ONLINE prête depuis > 2h sans retrait (sinon : appelle le client ou marque "non retiré")

#### b) Pesée déchets

`/admin/dechets` → bouton "+ Pesée". Pour chaque catégorie (snack, bio, emballages, etc.).

⚠️ Le snack génère beaucoup d'**emballages** (sachets, boîtes, gobelets). Pèse-les séparément.

#### c) Checklist fermeture comptoir

`/admin/hygiene` → checklist "Fermeture comptoir/snack". Items typiques :
- ✅ Vitrines vidées et nettoyées
- ✅ Frigos rangés
- ✅ Borne arrêtée OU mode "veille" activé
- ✅ Caisse fermée → Z-report imprimé
- ✅ Sols nettoyés
- ✅ Poubelles vidées

#### d) Z-report final

`/caisse` → bouton "Fermer session" :
- Comparer fond théorique (encaisse - retraits) au fond réel compté physique
- Saisir `ca_compte` → l'app calcule l'écart automatiquement
- Si écart > 5€ : note dans le journal du gérant via `/equipes`

#### e) Pointage sortie

Tablette ou `/admin/rh` → pointer sortie.

---

## 4. Les 5 réflexes à avoir

1. **Encaisse AVANT de servir au comptoir.** Sinon la commande n'arrive pas en cuisine. Réflexe non négociable.

2. **Surveille la borne du coin de l'œil.** Tu es le filet de sécurité — un client qui galère = mauvaise expérience qui peut se traduire en avis 1 étoile.

3. **Sourire + précision.** Le snack/comptoir, c'est rapide, mais ce n'est pas du fast-food sans âme. Tu fais partie de l'expérience CASATASIA.

4. **Vérifie chaque sachet AVANT de remettre.** Une boisson oubliée sur une commande ONLINE = un client perdu pour 6 mois.

5. **Fidélité à chaque transaction.** Demande systématiquement "vous avez un compte fidélité ?" — le client met 5 sec, toi tu gagnes une fiche CRM pour la vie.

---

## 5. Aide à la décision — que faire si...

### Un client paye à la borne, sa commande n'apparaît pas en cuisine

1. Va sur `/emporter` → cherche la commande (numéro / prénom)
2. Vérifie le statut : si `en_attente_paiement_comptoir` → le paiement n'est pas validé → demande au client une preuve (SMS de confirmation Stripe)
3. Si paiement OK mais statut bloqué → bug app, préviens Arnaud immédiatement via `/equipes`
4. **Solution de secours** : refais la commande au comptoir manuellement, marque l'ancienne comme "annulée"

### La borne est en panne / écran noir

1. Préviens Arnaud immédiatement (`/equipes` + appel/SMS)
2. **Mets une pancarte physique** "Borne en maintenance - Commandez au comptoir"
3. Tous les clients passent par toi → tu encaisses au comptoir
4. Demande au serveur de venir aider si la file s'allonge

### Un client conteste un retrait ONLINE (il n'a rien reçu)

1. Va sur `/emporter` → cherche la commande
2. Vérifie le statut : si "retiré par client" → quelqu'un a marqué comme retiré
3. Demande son nom + heure → croise avec qui était à ton poste à ce moment
4. Si pas de retrait visible → repropose une nouvelle préparation (offert si c'est notre erreur)
5. Note l'incident sur `/admin/clients` onglet Réclamations

### Tu vois 5 commandes BORNE qui s'accumulent et pas de cuisinier

1. **Stop ton activité comptoir** quelques minutes
2. Va voir la cuisine physiquement → où est l'équipe ? Surchargée ?
3. Préviens Arnaud via `/equipes` : "BORNE accumule, cuisine débordée"
4. Aide à la cuisine si tu sais (préparer un sandwich, mettre en sachet)

### Le terminal de paiement carte plante

1. Bascule en mode "espèces uniquement" pour les COMPTOIR
2. Préviens les clients en file
3. Préviens Arnaud
4. Pour les BORNE : la NFC peut continuer à fonctionner même si le terminal CB plante (système indépendant)

---

## 6. Pièges classiques

1. **Servir un COMPTOIR sans encaisser d'abord** → la commande n'arrive pas en cuisine, tu perds le ticket, tu te disputes avec le client
2. **Oublier un article dans un sachet ONLINE** → le client retourne, mécontent, avis Google 1 étoile
3. **Marquer "retiré" avant la remise effective** → pas de moyen de retrouver la commande si litige
4. **Ne pas surveiller la borne** → file qui s'allonge devant toi alors que la borne pourrait absorber 30% de la charge
5. **Pas demander la fidélité** → tu perds une opportunité CRM à chaque transaction
6. **Z-report mal fermé** → ton remplaçant ne peut pas ouvrir une nouvelle session le lendemain

---

## 7. Mapping rapide — où dans l'app pour quoi

| Je veux… | Aller sur |
|---|---|
| Voir les commandes en attente de retrait | `/emporter` (section "Prêtes") |
| Voir les commandes BORNE/COMPTOIR à encaisser | `/emporter` (section "Caisse borne") |
| Encaisser une commande BORNE | `/emporter` → tap → modal paiement |
| Créer une commande COMPTOIR | `/emporter` ou `/bar` → bouton "+ Comptoir" |
| Marquer une ONLINE comme retirée | `/emporter` → "Retiré ✓" |
| Voir l'activité kiosque | `/admin/borne` (lecture seule) |
| Encaisser le total du jour | `/caisse` → "Fermer session" |
| Cocher la checklist hygiène | `/admin/hygiene` |
| Peser les déchets | `/admin/dechets` |
| Ajouter une fiche client | `/admin/clients` |
| Lire le chat équipe | `/equipes` |
| Pointer entrée/sortie | tablette ou `/admin/rh` |
| Voir mes formations | `/admin/formation` |

---

## 8. Suivi de ta propre formation

### Premier jour
- [ ] Compte créé, mot de passe personnel
- [ ] Tour des écrans : `/emporter`, `/bar`, `/admin/borne`
- [ ] Tu as encaissé une commande COMPTOIR test (ex: ton café personnel)
- [ ] Tu as vu une commande BORNE arriver et tu l'as marquée encaissée
- [ ] Tu as fermé une session caisse (Z-report)
- [ ] Tu as testé la borne en mode "annulation" (faire une commande puis annuler)

### Première semaine
- [ ] Tu sais distinguer les 4 badges (TABLE, COMPTOIR, ONLINE, BORNE) au premier coup d'œil
- [ ] Tu encaisses systématiquement AVANT de transmettre en cuisine
- [ ] Tu demandes la fidélité à chaque transaction (réflexe)
- [ ] Tu as géré au moins 1 incident borne (NFC échec → comptoir)
- [ ] Tu finalises ton guide Module 27 SNACK

### Premier mois
- [ ] Tu maîtrises les 3 canaux (COMPTOIR, ONLINE, BORNE) en autonomie
- [ ] Tu peux remplacer un serveur sur l'encaissement TABLE en cas d'urgence
- [ ] Tu remontes les bugs borne / problèmes UX à Arnaud
- [ ] Tu connais les flux food cost snack (pas besoin de modifier mais tu sais lire)

---

> **Tu es le pilier rapide du restaurant.** Sans toi, le digital ne sert à rien. Bon snack ! 🍔
