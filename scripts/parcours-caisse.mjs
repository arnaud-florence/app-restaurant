// Parcours « Manageuse » — la caisse Zelty, des deux côtés du pont.
//
//   node scripts/parcours-caisse.mjs [--ecrire]
//
// Le guide 2 explique la caisse pendant le mode école : la carte, les taux,
// ce qui change à la bascule. Ceux-ci expliquent le PONT — ce qui circule
// entre la caisse et l'outil, dans quel sens, qui est maître de quoi, et ce
// qui casse quand on s'y prend à l'envers.
//
//   11. ce que la caisse sait faire, et ce qu'elle ne sait pas
//   12. qui est maître de quoi — la carte dans les deux sens
//   13. les gestes qui écrasent (l'upsert, le retrait, la rupture)
//   14. le quotidien : ventes, rapprochement, écarts
//   15. le jour de la bascule en mode réel
//
// ⚠️ Les guides 13 et 15 exigent 100 %. Le premier décrit des gestes qui
// écrasent le prix imprimé sur les tickets ; le second est un jour qui ne
// se rejoue pas.
//
// ⚠️ Chaque piège nommé ici a été PAYÉ sur ce projet : `expand[]=items`
// oublié, la TVA lue en millièmes, 84 plats rejetés en silence par zod, le
// webhook réel refusé en 401 pendant deux jours, les quatre Pago
// ressuscités par le miroir. Aucun ne se devine.

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const PARCOURS = [
  {
    titre: 'Manageuse 11 — Ce que la caisse sait faire, et ce qu’elle ne sait pas',
    description: "Zelty propose beaucoup d'écrans. Onze seulement ressortent par l'API — et c'est ce qui décide où on saisit quoi.",
    ordre: 111, niveau: 2, duree: 12, seuil: 80,
    etapes: [
      ['Un logiciel, deux caisses, un pont',
       "CasaTasia tourne sur **un logiciel Zelty et deux caisses** — le comptoir et, à la réouverture, le restaurant. SumUp a été abandonné le 28 août 2026.\n\n"
       + "Entre la caisse et cet outil, il y a un **pont** : des routes qui font circuler les ventes, la carte, les clients, les réservations et les ruptures.\n\n"
       + "⚠️ Les 426 tickets SumUp d'août **restent en base** et ne se purgent jamais : c'est tout l'historique de vente réel de la maison. Le pont est fait pour que deux caisses différentes cohabitent sans que rien n'ait à savoir d'où vient quoi."],
      ['⚠️ Onze endpoints sur soixante-sept',
       "L'API de la caisse a été sondée : **11 chemins répondent sur 67 testés.**\n\n"
       + "Ce qui sort : la carte, les familles, les commandes, les réservations, les clients, les clôtures, les appareils, les webhooks.\n\n"
       + "Ce qui **ne sort pas**, alors que le back-office le propose : toute la gestion des stocks (mercuriale, fiches techniques, fournisseurs, inventaire), les utilisateurs et le planning, la banque, le plan de salle, les statistiques."],
      ['⚠️⚠️ Pourquoi on ne saisit PAS les stocks dans la caisse',
       "C'est la conclusion la plus importante du chantier, et elle tranche une vraie question.\n\n"
       + "Zelty a un module de gestion des stocks qui recouvre une grande partie de cet outil. **Mais rien de tout cela ne ressort par l'API.**\n\n"
       + "Des données saisies là-bas seraient **prisonnières** : ni lisibles par l'outil, ni exportables vers le comptable, ni utilisables pour le food cost, les marges par activité ou la valeur du fonds.\n\n"
       + "**Saisir les stocks dans la caisse serait un aller sans retour.** L'outil reste le dépositaire des stocks, des achats et des marges ; la caisse reste le point de vente."],
      ['Ce qui a été branché, et dans quel sens',
       "**La caisse → l'outil** : les ventes (webhook + filet toutes les heures), le carnet de réservations, le fichier client, le Z de clôture, les ruptures déclarées au comptoir.\n\n"
       + "**L'outil → la caisse** : la carte (prix, TVA, photos), les familles, les ruptures déclarées sur tablette, les réservations du site, et — dès que le mode de paiement existera — les commandes web déjà réglées.\n\n"
       + "Chaque échange laisse une trace avec sa charge brute, dans l'écran « Pont caisse ↔ outil »."],
      ['⚠️ Ce qu’une caisse ne saura jamais',
       "Une caisse sait ce qui a été vendu. Elle ne sait pas :\n\n"
       + "· ce que ça a **coûté** — le prix d'achat réel, facture à l'appui ;\n"
       + "· ce qu'il **reste** en réserve ;\n"
       + "· ce qui a été **jeté** hier soir ;\n"
       + "· à quelle **activité** rattacher la vente — Zelty ventile par sur place / emporter / livraison, jamais par Fournil, bar ou pizzeria ;\n"
       + "· ce que **l'affaire vaut**.\n\n"
       + "C'est exactement le périmètre de cet outil, et c'est pour ça qu'on reste sur **un seul abonnement caisse** au lieu de deux comptes complets."],
    ],
    quiz: [
      ["Zelty propose un module de gestion des stocks. Faut-il l'utiliser ?",
       ["Oui, c'est plus simple d'avoir tout au même endroit", "Non : rien n'en ressort par l'API, les données y seraient prisonnières", "Oui, mais seulement pour les boissons", "Non, il coûte un supplément"], 1,
       "Ni lisible par l'outil, ni exportable au comptable, ni utilisable pour le food cost ou la valeur du fonds. Un aller sans retour."],
      ["Pourquoi l'outil calcule-t-il la ventilation par activité lui-même ?",
       ["Pour aller plus vite", "Parce que la caisse ventile par sur place / emporter / livraison, jamais par activité", "Parce que Zelty se trompe", "Pour ne pas payer un second compte"], 1,
       "Confirmé par Zelty en démo. C'est aussi ce qui permet de rester sur un seul abonnement — le rattachement se fait sur la LIGNE de vente, jamais sur l'en-tête du ticket."],
      ["Les 426 tickets SumUp d'août : que devient cet historique ?",
       ["Il sera purgé au passage à Zelty", "Il reste : c'est tout l'historique de vente réel de la maison", "Il est archivé hors ligne", "Il a déjà été supprimé"], 1,
       "Il alimente les ventes, la valeur de l'affaire, le rapprochement et le food cost. Le connecteur est fait pour que deux caisses cohabitent."],
    ],
  },

  {
    titre: 'Manageuse 12 — La carte : qui est maître de quoi',
    description: "La carte circule dans les deux sens. Savoir qui décide de quoi évite de voir une correction disparaître toute seule.",
    ordre: 112, niveau: 2, duree: 15, seuil: 80,
    etapes: [
      ['Le partage, en une phrase',
       "**La caisse est maîtresse du COMMERCIAL** — le nom qui s'imprime sur le ticket, le prix, la TVA, la disponibilité.\n\n"
       + "**L'outil garde ce qu'aucune caisse ne portera jamais** — les photos, les allergènes, les prix d'achat réels, la correspondance « Panuozzi ← pâton », les fiches techniques, les coûts.\n\n"
       + "Chaque nuit à 3 h 10, le miroir relit la carte de la caisse et met à jour la nôtre."],
      ['⚠️⚠️ Le miroir est maître de « actif » — et il rétablit',
       "Le 28 septembre 2026, quatre produits Pago ont été retirés de notre carte. **Vingt minutes plus tard ils étaient redevenus actifs**, sans la moindre trace.\n\n"
       + "La cause : le miroir relit `disable` chez Zelty. Le plat y était encore allumé, donc il a rallumé notre fiche.\n\n"
       + "⚠️ **L'ORDRE N'EST PAS INTERCHANGEABLE : on éteint la CAISSE d'abord, notre fiche ensuite.** Le miroir suivant ne fait plus que confirmer.\n\n"
       + "Et nos propres écritures dans le catalogue déclenchent une relecture — pousser huit desserts suffit à ressusciter ce qu'on venait de retirer."],
      ['Notre identifiant vit chez eux',
       "À l'import, notre identifiant de produit est écrit dans leur champ `remote_id`.\n\n"
       + "C'est ce qui rend la correspondance **exacte dès le premier jour** : 84 produits appariés sur 84, zéro rapprochement par le nom. Un produit renommé de part et d'autre reste le même produit.\n\n"
       + "Sans ça, on rapprocherait par le libellé — et le jour où « Croissant » devient « Croissant beurre » côté caisse, l'outil créerait un second produit et couperait la série statistique en deux, sans erreur ni alerte."],
      ['⚠️ Deux prix, deux boutons — et deux noms',
       "Le même gâteau se vend 3,20 € emporté au comptoir et 6,50 € servi à table. Ce sont **deux produits de caisse distincts**.\n\n"
       + "⚠️ Et il leur faut **deux NOMS différents**, sinon l'équipe voit deux boutons « Éclair au chocolat » à des prix différents et tape au jugé. C'est le champ `nom_caisse` qui porte le libellé du bouton — « Éclair au chocolat (salle) » — pendant que le nom de vitrine reste propre pour le site.\n\n"
       + "Même règle pour les deux cafés : 1,40 € au comptoir, 1,80 € servi à table. **Ce n'est pas l'heure qui change le prix, c'est le service.**"],
      ['Les familles, dans l’ordre du service',
       "L'import crée les produits mais les laisse **à plat**. Un bouton sans famille est introuvable au comptoir en plein service.\n\n"
       + "Un second geste crée les familles côté caisse et y range chaque produit. ⚠️ **L'ordre des familles est celui du SERVICE, pas l'alphabet** : à 6 h 20 on vend du pain et du café, pas des pizzas.\n\n"
       + "⚠️ Ça s'oublie : les huit desserts poussés le 28 septembre sont restés sans famille jusqu'à ce qu'un contrôle le signale."],
      ['Le contrôle après chaque écriture',
       "Un script compare la caisse à notre base, produit par produit : prix TTC au centime, TVA à emporter ET sur place, photo, nom, état.\n\n"
       + "Sur un endpoint qui peut écraser le prix imprimé sur les tickets, **la vérification n'est pas optionnelle**.\n\n"
       + "⚠️ Et une lecture faite juste après une écriture peut revenir **vide** : la caisse limite son débit. Attendre quelques secondes, et ne jamais conclure d'une seule lecture."],
    ],
    quiz: [
      ["Tu désactives un produit dans l'outil. Vingt minutes plus tard il est réactivé. Pourquoi ?",
       ["Quelqu'un l'a rallumé", "Le miroir relit `disable` chez Zelty, où le plat était encore allumé", "C'est un bug de la base", "Le cache du navigateur"], 1,
       "La caisse est maîtresse de cet interrupteur. On éteint la caisse d'abord, notre fiche ensuite."],
      ["Le même éclair se vend 3,20 € au comptoir et 5,50 € à table. Combien de boutons en caisse ?",
       ["Un seul, avec deux prix", "Deux boutons, avec deux NOMS différents", "Deux boutons du même nom", "Un bouton et une remise"], 1,
       "Deux boutons du même nom et l'équipe tape au jugé. C'est `nom_caisse` qui porte le libellé du bouton."],
      ["Pourquoi notre identifiant est-il écrit dans le `remote_id` de Zelty ?",
       ["Pour la facturation", "Pour que la correspondance soit exacte même si les noms changent", "C'est obligatoire chez Zelty", "Pour retrouver nos photos"], 1,
       "84 appariés sur 84, aucun rapprochement par le nom. Sans ça, un produit renommé couperait la série statistique en deux."],
      ["Qui décide du prix qui s'imprime sur le ticket ?",
       ["L'outil", "La caisse — et l'outil ne fait que le lui pousser puis le relire", "Les deux à égalité", "Le site casatasia.fr"], 1,
       "La caisse est maîtresse du commercial : nom, prix, TVA, disponibilité. L'outil garde photos, allergènes, coûts et correspondances."],
    ],
  },

  {
    titre: 'Manageuse 13 — Les gestes qui écrasent',
    description: "Trois écritures vers la caisse peuvent détruire le prix imprimé sur les tickets. Ce guide dit comment elles sont bordées.",
    ordre: 113, niveau: 3, duree: 15, seuil: 100,
    etapes: [
      ['⚠️⚠️ Écrire dans la carte est un UPSERT',
       "La seule façon d'écrire dans la carte de la caisse exige **trois champs obligatoires : le nom, le prix et la TVA**.\n\n"
       + "Un objet incomplet n'échoue pas : il **écrase** ce qui manque. Donc il peut remplacer le prix d'un plat — c'est-à-dire ce qui s'imprime sur les tickets et fait foi fiscalement.\n\n"
       + "La règle est absolue : **on RELIT la carte juste avant, on RECOPIE les trois champs tels quels, on ne touche que ce qu'on veut changer, et on REFUSE de construire s'il en manque un.** Aucun prix n'est jamais inventé."],
      ['Une rupture ne coupe pas le même interrupteur qu’un retrait',
       "Deux gestes voisins, deux drapeaux différents, et les confondre coûte cher.\n\n"
       + "· **Une RUPTURE** (plus de croissants ce matin) coupe les canaux EN LIGNE. Le produit reste vendable au comptoir — ce qui est le bon comportement, il en reste peut-être deux.\n\n"
       + "· **Un RETRAIT** (on arrête ce produit) éteint le plat entièrement.\n\n"
       + "⚠️ Éteindre un plat pour une simple rupture ferait relire « produit inactif » par le miroir, qui éteindrait la fiche chez nous — **et le produit ne reviendrait jamais, même réapprovisionné.** Une boucle silencieuse dont personne ne trouverait la cause."],
      ['Déclarer une rupture : deux secondes, sinon rien',
       "`(ops)/ruptures` : une liste, un appui, c'est marqué.\n\n"
       + "Le moment où l'on constate une rupture, c'est **au comptoir en plein service, une tablette à la main**. Si le geste prend plus de deux secondes il ne sera pas fait, et on continuera de vendre en ligne ce qu'on n'a plus.\n\n"
       + "⚠️ Une rupture est **DATÉE** : c'est une décision du jour, et elle se périme seule le lendemain. Sans date, personne ne penserait à la lever et le produit resterait invisible."],
      ['⚠️ Les ruptures descendent aussi de la caisse — mais jamais les levées',
       "Un plat marqué en rupture SUR LA CAISSE redescend chez nous. L'inverse n'existe pas : **on n'ajoute que des ruptures, on n'en lève jamais.**\n\n"
       + "Trois raisons, et chacune suffirait :\n\n"
       + "1. « pas en rupture » est la valeur PAR DÉFAUT de tout plat que personne n'a touché. Ça ne dit pas « on a vérifié », ça dit « rien n'a été déclaré ».\n"
       + "2. Lever effacerait le geste de l'équipe, en silence.\n"
       + "3. **Les deux erreurs ne coûtent pas pareil.** Une fausse rupture perd une vente ; une fausse disponibilité fait venir un client pour rien — et ça, il le raconte."],
      ['Retirer un plat : la caisse d’abord',
       "Pour sortir un produit de la vente :\n\n"
       + "1. **on l'éteint dans la caisse** ;\n"
       + "2. **puis on retire la fiche** chez nous.\n\n"
       + "Dans l'autre sens, le miroir rallume la fiche au passage suivant.\n\n"
       + "⚠️ Et si le produit avait des ventes, **elles doivent être reversées** sur le produit qui le remplace : un produit désactivé emporte son historique avec lui, et le chiffre d'affaires disparaîtrait alors que la vente a bien eu lieu."],
      ['Ce que le débit impose',
       "La caisse **limite le débit de son API**, et sa documentation ne le dit pas. Treize créations de familles à la file ont donné cinq refus à partir du cinquième appel.\n\n"
       + "Tout doit donc partir en **un seul appel groupé** : 84 plats en un envoi, pas 84 envois.\n\n"
       + "⚠️ Corollaire : nos propres écritures déclenchent des notifications, donc des relectures. Pousser la carte entière ferait revenir 84 notifications, donc 84 relectures en quelques secondes — **on se mettrait soi-même en panne** en croyant gagner du temps réel."],
    ],
    quiz: [
      ["Pourquoi relit-on la carte de la caisse avant d'y écrire ?",
       ["Pour vérifier qu'elle est en ligne", "Parce que l'écriture est un upsert : un champ manquant écrase le prix du ticket", "Pour gagner du temps", "Pour respecter le débit"], 1,
       "Nom, prix et TVA sont obligatoires. On les recopie tels quels, et on refuse de construire s'il en manque un."],
      ["Plus de croissants ce matin. Quel interrupteur ?",
       ["On éteint le plat dans la caisse", "On coupe les canaux en ligne — le comptoir continue de vendre ce qui reste", "On supprime le produit", "On met le stock à zéro"], 1,
       "Éteindre le plat ferait relire « inactif » par le miroir, qui éteindrait la fiche chez nous — et le croissant ne reviendrait jamais."],
      ["Un plat est marqué disponible dans la caisse, en rupture chez nous. Que fait l'outil ?",
       ["Il lève la rupture", "Il garde la rupture : « pas déclaré » n'est pas « vérifié »", "Il demande confirmation", "Il éteint le plat"], 1,
       "On n'ajoute que des ruptures. Une fausse disponibilité fait venir un client pour rien, et ça, il le raconte."],
      ["Tu retires un produit de la vente. Dans quel ordre ?",
       ["La fiche d'abord, la caisse ensuite", "La caisse d'abord, la fiche ensuite", "Peu importe", "Les deux en même temps"], 1,
       "Dans l'autre sens, le miroir rallume la fiche au passage suivant. Vécu sur les quatre Pago le 28 septembre."],
      ["Tu dois créer treize familles dans la caisse. Comment ?",
       ["Une par une, proprement", "En un seul appel groupé — la caisse limite son débit", "En les espaçant d'une minute", "Depuis le back-office uniquement"], 1,
       "Treize appels à la file ont donné cinq refus à partir du cinquième. Et chaque écriture déclenche une relecture."],
    ],
  },

  {
    titre: 'Manageuse 14 — Le quotidien : ventes, rapprochement, écarts',
    description: "Comment les ventes arrivent, et le contrôle qui dit si on a bien tout reçu.",
    ordre: 114, niveau: 2, duree: 15, seuil: 80,
    etapes: [
      ['Comment une vente arrive',
       "Deux chemins, et le second est le filet du premier :\n\n"
       + "· **le webhook** — la caisse prévient dès qu'un ticket est clos. Le ticket entre dans le chiffre d'affaires immédiatement.\n"
       + "· **le sondage horaire** — toutes les heures, l'outil redemande les deux derniers jours.\n\n"
       + "⚠️ Ce n'est pas un doublon : **un webhook n'a pas de mémoire.** Une livraison ratée perdrait la vente définitivement. Le sondage la rattrape."],
      ['⚠️ Signal contre vérité',
       "Une règle du pont, et elle a une histoire : **le webhook est une SONNETTE, pas une source.**\n\n"
       + "Rien n'est jamais écrit depuis ce que le webhook envoie. L'événement dit « quelque chose a changé », puis l'outil **rappelle la route qui fait autorité** et relit.\n\n"
       + "Pourquoi tant de prudence : sur cette API, un paramètre oublié a rendu les lignes de commande **vides** — chiffre d'affaires juste, stock et marges aveugles, aucune erreur pour le dire. Un autre oubli a fait rejeter **84 plats sur 84** en silence. Aucun de ces pièges ne se devine."],
      ['Le rapprochement quotidien',
       "Le miroir dit ce qu'on a **reçu** ; les commandes disent ce qu'on en a **compris**. Entre les deux il y a du code, et du code se trompe en silence.\n\n"
       + "Sans ce contrôle, une ingestion qui perd 3 % des lignes depuis six semaines ne se voit **nulle part** : le chiffre d'affaires reste juste — il vient des totaux — et seules les marges dérivent. **On finit par accuser les fournisseurs.**\n\n"
       + "Chaque nuit, une ligne figée par jour et par caisse, lisible dans « Pont caisse ↔ outil »."],
      ['Trois états, et ce qu’ils veulent dire',
       "· **ok** — reçu et compris concordent.\n\n"
       + "· **incomplet** — le montant est juste, mais on ignore CE QUI a été vendu. Stock, food cost et marges restent aveugles sur ces tickets.\n\n"
       + "· **écart** — montant, nombre de tickets ou ventilation de TVA divergents.\n\n"
       + "⚠️ Une journée sans aucun ticket n'écrit **pas** de ligne : une caisse fermée le lundi n'est pas une anomalie, et cent lignes vides rendraient le tableau illisible."],
      ['Le Z, troisième témoin',
       "Le montant reçu et le montant compris viennent du **même flux** : si un ticket ne nous parvient jamais, aucun des deux ne le sait, et la journée s'affiche « ok » en étant amputée.\n\n"
       + "Le **Z de clôture** est indépendant de notre ingestion — c'est le chiffre du comptable. Un Z supérieur à nos tickets reçus veut dire qu'il en manque, et **rien d'autre ne pouvait le dire.**\n\n"
       + "⚠️ Une caisse non clôturée n'a pas de Z. Absence n'est pas zéro : afficher zéro montrerait un écart énorme sur une journée simplement pas encore fermée."],
      ['Quand un chiffre ne tombe pas',
       "L'ordre des vérifications, du plus fréquent au plus rare :\n\n"
       + "1. **La journée est-elle finie ?** Le rapprochement part d'HIER — rapprocher le jour en cours produit un faux écart à chaque fois.\n"
       + "2. **La caisse a-t-elle été clôturée ?** Sans Z, il manque le témoin.\n"
       + "3. **L'écran « Pont caisse ↔ outil »** dit ce qui est passé et ce qui a échoué, avec la charge brute — donc c'est rejouable.\n"
       + "4. **Le bouton « Synchroniser la caisse »** de l'écran Caisse agréée force une relecture sans attendre l'heure suivante."],
    ],
    quiz: [
      ["Pourquoi garder un sondage horaire alors que le webhook est instantané ?",
       ["Pour aller plus vite", "Un webhook n'a pas de mémoire : une livraison ratée perdrait la vente", "Pour économiser des appels", "Le webhook n'est pas fiable chez Zelty"], 1,
       "Le sondage est le filet, pas le doublon. Une vente perdue par un webhook raté ne revient jamais."],
      ["Le rapprochement dit « incomplet ». Que sait-on ?",
       ["Le montant est faux", "Le montant est juste mais on ignore ce qui a été vendu", "Le ticket est perdu", "La caisse était fermée"], 1,
       "Stock, food cost et marges restent aveugles sur ces tickets. C'est arrivé sur deux paiements à montant libre tapés à l'ouverture."],
      ["À quoi sert le Z de clôture dans le rapprochement ?",
       ["À vérifier la TVA", "C'est le seul témoin indépendant de notre ingestion", "À clôturer la journée", "À calculer les pourboires"], 1,
       "Reçu et compris viennent du même flux : si un ticket ne nous parvient jamais, aucun des deux ne le sait. Le Z, si."],
      ["Un écart apparaît sur la journée d'aujourd'hui. Première réaction ?",
       ["Prévenir le comptable", "Vérifier que la journée est finie — le rapprochement part d'hier", "Relancer la synchro", "Recompter la caisse"], 1,
       "Rapprocher le jour en cours produit un faux écart à chaque exécution."],
    ],
  },

  {
    titre: 'Manageuse 15 — Le jour de la bascule en mode réel',
    description: "Un jour qui ne se rejoue pas. Ce qui change, dans quel ordre, et ce qu'il faut avoir vérifié avant.",
    ordre: 115, niveau: 3, duree: 12, seuil: 100,
    etapes: [
      ['⚠️ Ce que le mode école cache',
       "Tant que la caisse est en mode école, **les tickets n'entrent pas dans le chiffre d'affaires**. C'est le meilleur terrain d'apprentissage possible — et il disparaît d'un clic.\n\n"
       + "⚠️ Notre connecteur **force l'exclusion des tickets d'entraînement** : le mode école ne doit jamais entrer dans le CA. Donc aujourd'hui, une vente faite pour s'exercer ne remonte pas — c'est normal, ce n'est pas une panne.\n\n"
       + "Le jour de la bascule, tout ce qui se tape entre dans le chiffre. Il n'y a pas de retour en arrière."],
      ['L’ordre, et il n’est pas interchangeable',
       "1. **Déclarer le TPE du CIC** dans la caisse, et sortir du mode école.\n"
       + "2. **Relever le libellé EXACT du mode de paiement** en ligne.\n"
       + "3. **Planifier l'émission** des commandes web.\n"
       + "4. **Seulement alors**, brancher le paiement en ligne du site.\n\n"
       + "⚠️ Brancher le paiement du site AVANT l'étape 1 obligerait à encaisser hors caisse puis à rapprocher à la main — exactement ce que le connecteur existe pour éviter. **Ne pas commencer par là parce que c'est la partie visible.**"],
      ['⚠️ Le même geste débloque les commandes du site',
       "Aujourd'hui, une commande passée sur casatasia.fr arrive **uniquement dans notre écran de préparation**. La caisse n'en sait rien.\n\n"
       + "Le 3 octobre en l'état, la cuisine aurait **deux écrans** : la caisse pour le comptoir et les tables, notre écran pour le web. C'est précisément ce que la frontière d'août cherchait à éviter.\n\n"
       + "Le levier est unique : **déclarer le TPE**. Il crée le mode de paiement, et les commandes du site peuvent alors remonter dans la caisse **déjà réglées**, au lieu d'être ressaisies."],
      ['⚠️⚠️ Le piège qui coûte de l’argent, à connaître avant',
       "Quand on enverra les commandes web à la caisse, une règle de leur API compte plus que toutes les autres :\n\n"
       + "**Si le total envoyé est INFÉRIEUR à ce que la caisse recalcule, la commande est acceptée EN SILENCE** — et la caisse crée une remise égale à l'écart. Aucune erreur.\n\n"
       + "Un décalage de tarif entre notre carte et la leur ferait donc fuiter la marge sur CHAQUE commande web, invisiblement. Un total supérieur, lui, est rejeté proprement.\n\n"
       + "→ C'est pour ça que le contrôle de la carte, produit par produit, tourne après chaque écriture."],
      ['À vérifier le matin même',
       "· **Les 14 interrupteurs d'activité sont en base.** S'il en manque, l'outil tourne sur son repli « Fournil seul » — ce qui donne le bon résultat par accident et masque la panne. Le bouton « Ouvrir le restaurant » mettrait alors à jour **zéro ligne** et renverrait un succès.\n\n"
       + "· **La répétition générale passe.** Elle joue la bascule en entier puis restaure l'état initial. Le 3 octobre à 6 h 20 ne doit pas être le premier essai.\n\n"
       + "· **L'abonnement de la caisse est payé.** Il expire le 3 octobre, et aucun moyen de paiement n'y est enregistré."],
      ['Le geste, et ce qui suit',
       "L'ouverture tient en un bouton : **« Ouvrir le restaurant »**, qui allume sept modules d'un coup. Le site suit en moins d'une minute.\n\n"
       + "⚠️ **Aucun code n'est à modifier pour rouvrir.** Tout est piloté par une seule table.\n\n"
       + "⚠️ Et la règle du repli ne change pas : quand la base est injoignable, on retombe sur « Fournil seul », **jamais** sur « tout ouvert ». Une panne ne doit pas dévoiler une activité qui n'a pas ouvert ; l'erreur inverse est irrattrapable."],
    ],
    quiz: [
      ["Une vente d'entraînement faite aujourd'hui n'apparaît pas dans le CA. Est-ce une panne ?",
       ["Oui, il faut relancer la synchro", "Non : le connecteur exclut les tickets du mode école", "Oui, le webhook a échoué", "Non, il faut attendre la nuit"], 1,
       "Le mode entraînement ne doit jamais entrer dans le chiffre d'affaires. C'est forcé côté connecteur."],
      ["Par quoi commence-t-on pour brancher le paiement en ligne du site ?",
       ["Par le site, c'est la partie visible", "Par déclarer le TPE du CIC dans la caisse", "Par planifier l'émission", "Par prévenir la banque"], 1,
       "Brancher le site d'abord obligerait à encaisser hors caisse puis à rapprocher à la main — ce que le connecteur existe pour éviter."],
      ["On envoie une commande web avec un total inférieur à celui recalculé par la caisse. Que se passe-t-il ?",
       ["Elle est rejetée", "Elle est acceptée en silence, et la caisse crée une remise de l'écart", "Le client paie la différence", "Elle reste en attente"], 1,
       "Aucune erreur. Un décalage de tarif ferait fuiter la marge sur chaque commande web, invisiblement."],
      ["Avant d'ouvrir, que vérifie-t-on dans la table des activités ?",
       ["Que le restaurant est allumé", "Qu'elle contient bien ses 14 lignes", "Que les dates sont à jour", "Rien, le bouton suffit"], 1,
       "Table vide = l'outil tourne sur son repli, et le bouton d'ouverture mettrait à jour zéro ligne en renvoyant un succès."],
      ["La base devient injoignable un matin. Que montre le site ?",
       ["Tout, par sécurité", "Le Fournil seul", "Une page d'erreur", "La dernière version en cache"], 1,
       "Une panne ne doit pas dévoiler une activité qui n'a pas ouvert. L'erreur inverse est irrattrapable."],
    ],
  },
]

const existants = await sb('guides_formation?select=id,titre')
const parTitre = new Map(existants.map(g => [g.titre.trim(), g.id]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
let crees = 0, deja = 0
for (const g of PARCOURS) {
  const dejaLa = parTitre.get(g.titre)
  console.log(`  ${dejaLa ? '=' : '+'} ${g.titre}`)
  console.log(`      ${g.etapes.length} étapes · ${g.quiz.length} questions · seuil ${g.seuil}% · ${g.duree} min · niveau ${g.niveau}`)
  if (dejaLa) { deja++; continue }
  crees++
  if (!ECRIRE) continue
  const [guide] = await sb('guides_formation', { method: 'POST', body: JSON.stringify({
    titre: g.titre, description: g.description, poste: 'manager',
    ordre: g.ordre, actif: true, seuil_reussite_pct: g.seuil,
    duree_minutes: g.duree, niveau: g.niveau }) })
  await sb('etapes_formation', { method: 'POST', body: JSON.stringify(
    g.etapes.map(([titre, contenu], i) => ({ guide_id: guide.id, ordre: i + 1, titre, contenu }))) })
  await sb('quiz_questions', { method: 'POST', body: JSON.stringify(
    g.quiz.map(([question, choix, idx, explication], i) =>
      ({ guide_id: guide.id, ordre: i + 1, question, choix, bonne_reponse_idx: idx, explication }))) })
}
const nbE = PARCOURS.reduce((s, g) => s + g.etapes.length, 0)
const nbQ = PARCOURS.reduce((s, g) => s + g.quiz.length, 0)
console.log(`\n  ${PARCOURS.length} guides · ${nbE} étapes · ${nbQ} questions`)
console.log(`  à créer : ${crees} · déjà présents : ${deja}`)
console.log(`\n  ⚠️ Les guides 13 et 15 exigent 100 % : des gestes qui écrasent, et un jour qui ne se rejoue pas.`)
if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)\n')
