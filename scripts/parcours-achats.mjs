// Parcours « Manageuse » — acheter, comparer, commander.
//
//   node scripts/parcours-achats.mjs [--ecrire]
//
// Les cinq premiers guides (101-105) apprennent à LIRE l'outil. Ceux-ci
// apprennent à ACHETER avec : le catalogue, la comparaison, le réassort, le
// bon de commande, l'inventaire.
//
// L'ordre suit la chaîne réelle, pas le menu :
//   6. ce qu'on achète, chez qui, à quel prix ;
//   7. comparer deux fournisseurs sans se tromper de gagnant ;
//   8. compter ce qu'il reste — c'est l'entrée de tout le reste ;
//   9. le réassort : seuil, cible, quantité ;
//  10. envoyer, pour de vrai.
//
// ⚠️ Le guide 10 exige 100 % : un bon de commande engage de l'argent, et
// les quatre refus qu'il décrit sont chacun une façon de payer deux fois.
//
// ⚠️ Chaque piège nommé ici a été VÉCU sur ce projet — le croissant à 40 €,
// le pain à burger à 64 €/kg, « −97 % » sur les serviettes, le comptage
// d'août pris pour du stock. Un guide qui énumère des bonnes pratiques
// s'oublie ; un guide qui raconte ce qui est arrivé se retient.

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
    titre: 'Manageuse 6 — Le catalogue d’achat : ce qu’on achète, chez qui, à quel prix',
    description: "La plateforme d'achat en quatre onglets, et la seule chose qu'il faut vraiment comprendre : un prix a une NATURE.",
    ordre: 106, niveau: 2, duree: 15, seuil: 80,
    etapes: [
      ['Quatre onglets, quatre questions',
       "`/admin/achats` répond à quatre questions différentes, et c'est pour ça qu'il a quatre onglets.\n\n"
       + "🔥 **Promos du moment** — les remises relevées chez les fournisseurs, celles sur ce qu'on achète d'abord.\n\n"
       + "🧺 **Ce que nous achetons** — NOTRE catalogue : 194 références, leur fournisseur, leur prix, leur code article.\n\n"
       + "📚 **Catalogue** — les 4 672 références des sept fournisseurs. Ce qu'ils proposent, pas ce qu'on prend.\n\n"
       + "🧭 **Ce qui est en place** — l'avancement du chantier, et ce qui manque encore."],
      ['⚠️ Un prix a une NATURE, et c’est la chose à retenir',
       "Quatre natures, et elles ne valent pas la même chose :\n\n"
       + "· **facture** — un prix RÉELLEMENT PAYÉ. C'est une preuve.\n"
       + "· **devis** — une PROPOSITION. Elle peut être un tarif d'appel consenti pour emporter un client, et ne jamais se revoir.\n"
       + "· **portail** — le tarif affiché sur l'espace en ligne du fournisseur. Frais, mais pas payé.\n"
       + "· **catalogue** — le prix imprimé au catalogue. Indicatif : Gineys consent 20 à 30 % de remise dessus.\n\n"
       + "La nature est écrite partout à l'écran. **Arbitrer un fournisseur sur un devis en croyant lire une facture se paie pendant des mois.**"],
      ['Prix relevé, prix estimé',
       "À côté de chaque coût, l'outil dit s'il est RELEVÉ ou ESTIMÉ.\n\n"
       + "· **relevé** — il vient d'une facture. On l'a payé.\n"
       + "· **estimé** — c'est une hypothèse, souvent celle qui a servi à bâtir la carte. 67 de nos 95 matières sont dans ce cas.\n\n"
       + "⚠️ Un chiffre faux se corrige. **Un chiffre juste présenté comme mesuré ne se rouvre jamais**, parce que personne ne le remet en question. C'est pour ça que le drapeau existe, et qu'il ne se coche pas à la légère."],
      ['« Tarif public — remise à demander » n’est pas un refus',
       "2 889 références portent cette mention. Elle ne veut pas dire « on a demandé et c'est non ».\n\n"
       + "Elle veut dire : **personne n'a encore demandé**. C'est mesuré — le portail Gineys applique notre remise (22 % en moyenne) aux articles de notre contrat, et affiche le prix public sur tout le reste, au centime près.\n\n"
       + "C'est le plus gros gisement de l'écran. La sélection puis le bouton « Demander les conditions » envoie un mail chez UN fournisseur, avec la référence de chaque article."],
      ['⚠️ Modifier un prix : l’unité ACHETÉE, pas l’unité vendue',
       "Le bouton « Modifier » de chaque ligne change le fournisseur, le code article et le prix.\n\n"
       + "⚠️⚠️ **Le prix qu'on saisit est celui de l'unité ACHETÉE.** Une part de flan coûte le dixième du flan ; l'outil divise tout seul.\n\n"
       + "Le 22 août 2026, le prix d'un CARTON de 96 croissants (28,84 €) a été écrit tel quel sur le croissant : **un croissant à 40 € de coût**. Quatre produits corrompus, marges fausses, et rien pour le signaler.\n\n"
       + "Depuis, l'outil REFUSE tout coût qui atteindrait 95 % du prix de vente, et il explique son calcul."],
      ['L’envoi d’une demande est un geste humain',
       "Rien ne part tout seul de cet écran. Un commercial relancé automatiquement cesse de répondre.\n\n"
       + "⚠️ **Sans adresse e-mail, rien n'est envoyé et rien n'est daté.** Le message s'affiche pour être copié, et l'article reste « à demander » — parce que c'est la vérité. Dater une demande qui n'est pas partie ferait attendre une réponse qui ne viendra jamais.\n\n"
       + "Quatre fournisseurs sur sept n'ont pas d'adresse aujourd'hui."],
    ],
    quiz: [
      ["Le jambon est à 6,89 € chez Félix Potin (devis) et 8,28 € chez Gineys (facture). Que sais-tu ?",
       ["Félix Potin est moins cher, on bascule", "On paie 8,28 € aujourd'hui ; 6,89 € est une proposition à confirmer", "Les deux prix se valent", "Le devis est plus fiable, il est plus récent"], 1,
       "Une facture est une preuve de paiement, un devis une proposition. L'écart est réel, mais il ne devient vrai qu'à la première facture."],
      ["Un coût marqué « estimé » : que veut dire le drapeau ?",
       ["Le prix est approximatif à quelques centimes", "Le prix n'a jamais été facturé — c'est une hypothèse", "Le fournisseur n'est pas sûr", "Le prix va bientôt changer"], 1,
       "Estimé = jamais payé. 67 de nos 95 matières sont dans ce cas, et ça change la confiance qu'on accorde à la marge calculée dessus."],
      ["Tu saisis le prix d'un carton de 96 croissants à 28,84 €. Que tapes-tu ?",
       ["28,84 € — c'est ce qu'on paie", "0,30 € — le prix d'un croissant", "28,84 € et l'outil divisera", "Le prix de vente moins la marge"], 1,
       "Le prix saisi est celui de l'unité ACHETÉE. Écrire 28,84 sur le croissant a déjà donné un croissant à 40 € de coût — vécu le 22 août 2026."],
      ["« Tarif public — remise à demander » sur 2 889 références. Que fais-tu ?",
       ["Rien, la remise a été refusée", "Tu sélectionnes et tu demandes les conditions par mail", "Tu changes de fournisseur", "Tu attends leur prochain catalogue"], 1,
       "Personne n'a encore demandé. C'est le plus gros gisement de l'écran, et il coûte un mail."],
    ],
  },

  {
    titre: 'Manageuse 7 — Comparer deux fournisseurs sans se tromper de gagnant',
    description: "L'écran des tarifs. Trois pièges donnent un classement faux sans la moindre erreur visible.",
    ordre: 107, niveau: 2, duree: 15, seuil: 80,
    etapes: [
      ['On compare à l’unité, jamais au colis',
       "Un bidon d'huile de 5 L à 24,66 € et un litre à 4,93 € sont **exactement le même prix**. Côte à côte en prix de colis, le premier paraît cinq fois plus cher.\n\n"
       + "L'outil ramène donc tout à l'unité — le kilo, le litre, la pièce — avant de comparer. C'est ce qu'on appelle le prix de référence, et c'est lui qu'on lit."],
      ['⚠️ Le format doit concorder, sinon on ne conclut rien',
       "« RACLETTE TR 22G 400G » porte le poids de la TRANCHE et celui de la BARQUETTE. Choisir au hasard donne un prix au kilo faux d'un facteur vingt — affiché comme les autres, en toute confiance.\n\n"
       + "Quand la désignation est ambiguë, l'outil n'affiche **AUCUN** prix de référence, et la ligne reste grise avec la mention « non comparable ».\n\n"
       + "⚠️ Une ligne grise n'est pas une ligne chère : c'est une ligne qu'on ne sait pas comparer. La colorer en rouge laisserait croire le contraire."],
      ['Le travail change le produit',
       "« JAMBON CUIT SUP AC 8K » et « Jambon blanc tranché » partagent presque tous leurs mots. Ce n'est pas le même produit : le premier est une pièce entière à trancher. Son prix au kilo est plus bas **parce que le travail reste à faire**.\n\n"
       + "Même chose pour les oignons épluchés contre émincés, les frites avec peau contre surgelées, le poulet cru IQF contre le tranché rôti.\n\n"
       + "⚠️ Rapprocher ces lignes afficherait un écart qui compare deux produits."],
      ['⚠️ Rien n’est rapproché automatiquement — et voici pourquoi',
       "C'est une règle absolue de l'outil. La méthode automatique a été essayée, et voilà ce qu'elle propose :\n\n"
       + "· **Roquette** → ROQUEFORT\n"
       + "· Citron → GATEAU CITRON ROND\n"
       + "· Glace → SUCRE GLACE 25KG\n"
       + "· Vinaigrette → CAPRE FINE VINAIGRE\n\n"
       + "Un fromage pour une salade, un gâteau pour un fruit. **La suggestion se calcule, la décision s'enregistre.** C'est toi qui coches."],
      ['Poser une clé de comparaison',
       "Deux références ne se comparent que si elles portent la MÊME clé. 247 clés sont posées sur 4 672 références — c'est le vrai frein de l'écran.\n\n"
       + "Chaque clé posée est un face-à-face de plus. Il y en a 37 aujourd'hui.\n\n"
       + "⚠️ **Ajouter une ligne à un groupe peut le casser** : la comparaison exige que TOUTES les lignes tombent sur la même base. Une conserve 5/1 glissée dans un groupe au kilo rend le groupe entier incomparable, et le face-à-face qui marchait disparaît sans un mot."],
      ['⚠️ Un écart en pourcentage ne décide de rien',
       "« Mayonnaise −58 % chez Félix Potin » est vrai. Mais ça compare un **seau de 4,65 kg** à notre bouteille souple de 920 g : l'économie est réelle et elle suppose de reconditionner.\n\n"
       + "Un écart au kilo ne dit pas le travail qu'il y a derrière, ni le minimum de commande, ni le délai de livraison, ni la qualité.\n\n"
       + "**Il se multiplie par les quantités réelles avant de changer de fournisseur.** 58 % sur trois bouteilles par mois ne paie pas l'ouverture d'un compte."],
    ],
    quiz: [
      ["Une ligne s'affiche en gris, « non comparable ». Que veut dire ce gris ?",
       ["Elle est plus chère que les autres", "On ne sait pas ramener son prix à la même unité", "Le fournisseur n'a pas répondu", "Le produit est en rupture"], 1,
       "Gris = on ne sait pas comparer, pas « c'est cher ». La colorer en rouge laisserait croire qu'elle est chère alors qu'on n'en sait rien."],
      ["« JAMBON CUIT SUP AC 8K » à 9 €/kg contre notre jambon tranché à 8,28 €. Bonne affaire ?",
       ["Oui, à peine plus cher pour une pièce entière", "Non : ce n'est pas le même produit, il reste à trancher", "Oui si on commande plus de 8 kg", "Impossible à dire sans le devis"], 1,
       "Le travail change le produit. Le prix au kilo d'une pièce entière est plus bas parce que le travail reste à faire."],
      ["Pourquoi l'outil ne rapproche-t-il jamais deux références tout seul ?",
       ["Ça prendrait trop de temps machine", "Parce qu'il range « Roquette » sous « ROQUEFORT »", "Pour laisser le choix du fournisseur", "Parce que les fournisseurs l'interdisent"], 1,
       "Essayé, et voilà ce que ça donne. La suggestion se calcule, la décision s'enregistre."],
      ["Tu vois « −58 % » sur la mayonnaise. Que fais-tu avant de basculer ?",
       ["Tu bascules, 58 % ne se discute pas", "Tu multiplies par les quantités réelles et tu regardes le conditionnement", "Tu demandes un devis à un troisième", "Tu attends la prochaine facture"], 1,
       "C'est un seau de 4,65 kg contre une bouteille de 920 g. L'économie est réelle mais suppose de reconditionner — et sur trois bouteilles par mois elle ne paie pas l'ouverture d'un compte."],
    ],
  },

  {
    titre: 'Manageuse 8 — Compter le stock : l’inventaire et la démarque',
    description: "Le comptage du matin est l'entrée de toute la chaîne. Sans lui, le réassort commande à l'aveugle.",
    ordre: 108, niveau: 2, duree: 12, seuil: 80,
    etapes: [
      ['On compte des MATIÈRES, pas des produits vendus',
       "Le congélateur contient des **pâtons**, pas « Pizza ronde Reine » plus « Panuozzi ». La réserve contient une **boîte de capsules**, pas quatre cafés.\n\n"
       + "`(ops)/inventaire` replie donc tous les produits qui partagent le même achat en UNE ligne. Les ventes et la casse s'additionnent sur la matière.\n\n"
       + "Deux postes séparés : `?poste=fournil` et `?poste=bar`. Ils ne se comptent ni au même moment, ni par la même personne, ni dans la même pièce — et **un inventaire qu'on abrège est un inventaire faux**."],
      ['Le stock théorique se CALCULE, il ne se stocke pas',
       "Il n'y a aucun compteur entretenu à chaque vente, et c'est délibéré : il dériverait au premier oubli (un café offert, une saisie manquée, un ticket non remonté). **Un stock auquel personne ne croit ne sert à rien.**\n\n"
       + "À chaque ouverture, l'écran recalcule depuis les sources :\n\n"
       + "`attendu = dernier comptage + entrées (factures scannées) − sorties (ventes caisse)`\n\n"
       + "Une facture scannée en retard corrige donc le chiffre toute seule."],
      ['La démarque, c’est l’écart',
       "Entre l'attendu et le compté, il y a la **démarque** — affichée ligne à ligne pendant la saisie, en pièces et en euros.\n\n"
       + "C'est là que se lisent la casse non déclarée, le geste commercial, l'erreur de caisse, et le fût qui rend 105 demis au lieu de 120.\n\n"
       + "⚠️ Les rendements du bar sont **arithmétiques** : 20 L ÷ 25 cl = 80 demis. La mousse et les purges ne sont pas déduites — les inventer ferait un chiffre faux. L'écart réel se lit ici, où il est une information."],
      ['⚠️ Ce qu’on ne peut PAS savoir',
       "Les sorties ne sont connues que pour les produits **revendus tels quels**. La caisse sait combien de croissants sont partis ; elle ne sait pas combien de tranches de jambon sont entrées dans les sandwichs.\n\n"
       + "Pour une matière première, l'écran affiche les entrées seules et **AUCUN théorique**.\n\n"
       + "**Mieux vaut pas de chiffre qu'un chiffre faux.** C'est une règle qu'on retrouve partout dans l'outil."],
      ['Les invendus du soir',
       "`(ops)/invendus` compte ce qu'on jette à la fermeture. C'est la casse qui manquait au food cost.\n\n"
       + "Le coût est FIGÉ à la saisie : la casse d'un jour reste valorisée au tarif de ce jour-là. Repasser corrige, une quantité à zéro supprime la ligne.\n\n"
       + "La synthèse 7 jours en tête de page — total en euros et top des produits jetés — c'est **l'outil de réglage des commandes**."],
    ],
    quiz: [
      ["Pourquoi l'outil ne tient-il pas un compteur de stock mis à jour à chaque vente ?",
       ["Ce serait trop lent", "Il dériverait au premier oubli, et un stock auquel personne ne croit ne sert à rien", "La caisse ne le permet pas", "C'est prévu plus tard"], 1,
       "Café offert, saisie manquée, ticket non remonté : le compteur dérive. Le stock se recalcule depuis les sources à chaque ouverture."],
      ["Le jambon tranché n'affiche aucun stock théorique. Pourquoi ?",
       ["Il n'a pas été compté", "La caisse ignore combien de tranches sont parties dans les sandwichs", "Son prix est estimé", "C'est un bug"], 1,
       "Les sorties ne sont connues que pour ce qui est revendu tel quel. Mieux vaut pas de chiffre qu'un chiffre faux."],
      ["Tu comptes 105 demis là où l'outil en attendait 120. Que dit cet écart ?",
       ["Le comptage est faux", "C'est la démarque : mousse, purges, verres offerts", "Le fût était plus petit", "Il faut corriger le rendement"], 1,
       "La démarque est une information, pas une erreur. Les rendements sont arithmétiques exprès ; l'écart réel se règle au tirage."],
    ],
  },

  {
    titre: 'Manageuse 9 — Le réassort : seuil, cible, et ce qu’il faut commander',
    description: "L'écran qui relie le stock, les prix et la commande. Deux réglages, et il ne faut pas les confondre.",
    ordre: 109, niveau: 2, duree: 15, seuil: 80,
    etapes: [
      ['⚠️ Le seuil DÉCLENCHE, la cible DIMENSIONNE',
       "Deux réglages, deux rôles, et les mélanger fait commander trop tôt ou trop peu.\n\n"
       + "· **Le seuil** : en dessous, il faut commander. C'est l'alarme.\n"
       + "· **La cible** : le niveau à retrouver. C'est la quantité.\n\n"
       + "L'outil REFUSE une cible inférieure au seuil — on recommanderait aussitôt livré."],
      ['⚠️ Un comptage vieux n’est pas un stock',
       "Le dernier comptage du Fournil date du 24 août ; la maison a fermé depuis. Au-delà de **30 jours**, le comptage est signalé en rouge ET ramené à « inconnu » pour le calcul.\n\n"
       + "Sinon l'écran proposerait un complément sur un stock qui n'existe plus. La date reste affichée : **on signale, on ne masque pas.**\n\n"
       + "Quand AUCUNE référence n'a de comptage récent, l'écran le dit en tête : « Aucun comptage récent : c'est une commande d'ouverture ». Il n'y a rien à compléter, il y a tout à constituer."],
      ['« Jamais compté » n’est pas « zéro »',
       "Les deux appellent la même commande, mais le premier dit que **personne n'a regardé**.\n\n"
       + "La distinction a failli se perdre en repliant les doublons : `(rien) + (rien)` vaut zéro en informatique, et transformait l'un en l'autre. L'outil n'additionne que s'il y a au moins un comptage.\n\n"
       + "⚠️ Et **sans cible, aucune quantité n'est proposée** : la ligne affiche « à paramétrer » et reste à zéro. Un nombre sorti de nulle part se fait valider par habitude, et on le découvre à la livraison."],
      ['On commande au moins cher',
       "C'est la règle du gérant, et elle est active par défaut. Quand un fournisseur est moins cher sur une ligne comparable, la ligne bascule chez lui — et l'écran le DIT : « → part chez Félix Potin (−30 %) ».\n\n"
       + "⚠️ **On ne bascule QUE là où la comparaison tient** : deux fournisseurs distincts, unités ramenées à la même base. Ailleurs il n'y a pas de « moins cher » à choisir, il y a une absence d'information.\n\n"
       + "L'interrupteur « Commander au moins cher » permet le cas inverse — ne pas ouvrir un compte pour une seule ligne."],
      ['⚠️ Une ligne qui bascule part SANS prix',
       "Notre coût est celui de NOTRE conditionnement (barquette 500 g), le leur celui du sien (seau 4,65 kg). Les convertir de tête écrirait un faux prix sur un document qui engage de l'argent.\n\n"
       + "Le prix reste donc vide, et le total du bon aussi : l'écran affiche « tarif à confirmer ».\n\n"
       + "⚠️ **Sommer des cases vides donnerait 0,00 €**, qui se lit « gratuit ». C'est la même faute qu'un food cost à 0 % affiché en vert."],
      ['Le total dit ce qu’il ignore',
       "« 2 547 € HT, dont 238 € sur des ESTIMATIONS — à confirmer avant d'engager », et « 11 références sans prix connu, NON chiffrées ».\n\n"
       + "Un total présenté comme ferme alors qu'il saute onze lignes devient une contestation de facture.\n\n"
       + "⚠️ Les lignes **sans fournisseur connu** sont affichées EN DERNIER et jamais masquées : ce sont celles qu'on oublierait de commander. Il y en a 30 aujourd'hui."],
    ],
    quiz: [
      ["Seuil 2 kg, cible 8 kg. Que veut dire chaque nombre ?",
       ["On commande entre 2 et 8 kg", "En dessous de 2 kg on commande, et on remonte à 8", "On garde toujours entre 2 et 8 kg en réserve", "Le fournisseur livre par lots de 2 à 8 kg"], 1,
       "Le seuil déclenche, la cible dimensionne. Une cible sous le seuil est refusée : on recommanderait aussitôt livré."],
      ["Un comptage date du 24 août. Nous sommes fin septembre. Que fait l'écran ?",
       ["Il l'utilise, c'est le dernier connu", "Il le signale en rouge et le traite comme inconnu", "Il le supprime", "Il l'extrapole"], 1,
       "Au-delà de 30 jours, le comptage ne décrit plus rien. On signale, on ne masque pas — la date reste affichée."],
      ["Une ligne bascule chez un nouveau fournisseur et part sans prix. Est-ce un bug ?",
       ["Oui, il manque le tarif", "Non : notre conditionnement n'est pas le sien, convertir écrirait un faux prix", "Oui, il faut saisir le prix à la main", "Non, le prix arrivera à la livraison"], 1,
       "Notre barquette de 500 g contre leur seau de 4,65 kg. Un faux prix ne se signale pas, il se découvre à la facture."],
      ["Le total affiche « dont 11 sans prix connu ». Pourquoi ne pas les compter à zéro ?",
       ["Ça fausserait la TVA", "Un zéro se lit « gratuit » et le total paraîtrait ferme alors qu'il saute onze lignes", "Le fournisseur pourrait les offrir", "Pour gagner du temps de calcul"], 1,
       "Un total présenté comme ferme alors qu'il ignore onze lignes devient une contestation de facture."],
    ],
  },

  {
    titre: 'Manageuse 10 — Commander pour de vrai : du brouillon à l’envoi',
    description: "Un bon de commande engage de l'argent. Quatre refus, et chacun est une façon de payer deux fois.",
    ordre: 110, niveau: 3, duree: 12, seuil: 100,
    etapes: [
      ['⚠️ Créer un bon N’ENVOIE RIEN',
       "Le bouton « Créer les bons de commande » du réassort fabrique **un brouillon par fournisseur**. Rien ne quitte l'outil.\n\n"
       + "L'envoi est un SECOND geste, depuis `/admin/fournisseurs`. Un bouton qui commanderait depuis un écran de calcul ferait partir des commandes qu'on croyait simuler.\n\n"
       + "⚠️ Et **aucun automatisme n'envoie de bon**. Un bon de commande engage de l'argent : ce ne sera jamais l'effet de bord d'un agent qui tourne toutes les deux heures."],
      ['⚠️ « Envoyer » n’envoyait rien — l’histoire vaut la leçon',
       "Jusqu'au 27 septembre 2026, le bouton « Envoyer » ne faisait que **changer une étiquette**. Aucun message ne quittait l'outil, et l'écran affichait « envoyé ».\n\n"
       + "**Un bon marqué envoyé que personne n'a reçu est pire qu'un brouillon** : on croit la commande passée, et on l'apprend le matin où la marchandise n'arrive pas.\n\n"
       + "C'est réparé. Mais la leçon reste : un statut n'est pas une preuve."],
      ['Les quatre refus',
       "L'outil refuse d'envoyer dans quatre cas, et chacun est une façon de payer deux fois :\n\n"
       + "1. **un bon sans ligne** ;\n"
       + "2. **une quantité nulle ou négative** — un signe inversé ;\n"
       + "3. **un fournisseur sans adresse** — cinq sur huit aujourd'hui ;\n"
       + "4. ⚠️ **un bon DÉJÀ envoyé** — le renvoyer, c'est une seconde livraison et une seconde facture.\n\n"
       + "Le quatrième se force volontairement, pour un renvoi assumé."],
      ['Sur refus, le brouillon est TOUJOURS rendu',
       "Quand le fournisseur n'a pas d'adresse, le message s'affiche **prêt à copier** — pour le coller dans un mail, un SMS ou le portail du fournisseur.\n\n"
       + "Et le bon reste marqué « à envoyer », ce qui est la vérité.\n\n"
       + "⚠️ Chaque ligne porte la **référence fournisseur** quand on l'a. Un commercial qui doit retrouver « BAGUETTE PRECUITE 280G » dans son propre catalogue peut en servir une autre — et ça se découvre au déchargement."],
      ['Gineys se commande à la main',
       "Décision du gérant : la commande Gineys se passe **directement sur leur portail**, pas par mail. Ils n'ont pas d'API, et l'adresse enregistrée chez nous est une boîte de facturation, pas un commercial.\n\n"
       + "L'outil sert alors de liste : il dit quoi commander et en quelle quantité, on recopie sur le portail.\n\n"
       + "⚠️ Avant le premier envoi à Gineys, il faut une VRAIE adresse de commercial."],
      ['⚠️ Le bon dit d’où viennent ses lignes',
       "Quand des lignes ont été réaiguillées vers un fournisseur moins cher, le bon le mentionne : « ↪ 2 ligne(s) réaiguillée(s) ici car moins chères ».\n\n"
       + "Sans ça, on reçoit un bon d'un fournisseur chez qui on n'a jamais commandé, sans comprendre pourquoi.\n\n"
       + "⚠️ Et **un minimum de commande peut rendre une ligne unique chez un nouveau fournisseur plus chère que l'économie**. C'est à regarder avant d'envoyer : le bon La Frite Belge ne portait qu'un ketchup."],
    ],
    quiz: [
      ["Tu cliques « Créer les bons de commande » depuis le réassort. Que se passe-t-il ?",
       ["Les commandes partent chez les fournisseurs", "Un brouillon par fournisseur est créé, rien ne part", "Un mail de confirmation t'est envoyé", "Le stock est mis à jour"], 1,
       "Créer n'envoie rien. L'envoi est un second geste explicite, depuis l'écran Fournisseurs."],
      ["Un bon est déjà marqué « envoyé ». Tu cliques Envoyer à nouveau. Que fait l'outil ?",
       ["Il renvoie le mail", "Il refuse : le renvoyer, c'est une seconde livraison et une seconde facture", "Il crée un second bon", "Il annule le premier"], 1,
       "C'est le plus coûteux des quatre refus. Il se force volontairement, pour un renvoi assumé."],
      ["Le fournisseur n'a pas d'adresse mail. Que se passe-t-il ?",
       ["Le bon est supprimé", "Le message s'affiche prêt à copier, et le bon reste « à envoyer »", "L'outil marque le bon envoyé quand même", "Rien, le bouton est grisé"], 1,
       "Cinq fournisseurs sur huit sont dans ce cas. Marquer envoyé sans preuve ferait croire la commande passée."],
      ["Pourquoi aucun agent automatique n'envoie-t-il de bon de commande ?",
       ["Ce n'est pas encore codé", "Un bon engage de l'argent : ce ne sera jamais l'effet de bord d'un agent", "Les fournisseurs refusent les mails automatiques", "Le cron n'est pas planifié"], 1,
       "L'automatiser se décidera peut-être un jour, mais jamais comme effet de bord d'un agent qui tourne toutes les deux heures."],
      ["Comment commande-t-on chez Gineys ?",
       ["Par mail depuis l'outil", "À la main sur leur portail — l'outil sert de liste", "Par téléphone", "Par l'API Gineys"], 1,
       "Pas d'API, et l'adresse enregistrée est une boîte de facturation. L'outil dit quoi commander, on recopie sur le portail."],
    ],
  },
]

// ── Exécution ──────────────────────────────────────────────────────
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
console.log(`\n  ⚠️ Le guide 10 exige 100 % : un bon de commande engage de l'argent.`)
if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)\n')
