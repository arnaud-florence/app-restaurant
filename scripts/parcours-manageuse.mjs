// Parcours « Manageuse » dans le module Formation.
//
// Il existait 34 guides, mais un seul pour le gérant — un « Manuel Gérant »
// de niveau 1. Rien qui enchaîne les écrans dans l'ORDRE où ils prennent du
// sens, et rien qui nomme les pièges.
//
// L'ordre compte, et il n'est pas celui du menu :
//   1. pourquoi l'outil ne prend pas les commandes (sinon tout le reste
//      paraît incohérent) ;
//   2. la caisse, tant qu'elle est en mode école ;
//   3. lire les chiffres — avant de pouvoir les modifier ;
//   4. les gestes du quotidien ;
//   5. les trois écrans qui se trompent en silence.
//
// Le dernier guide est le seul dont le quiz exige 100 % : sur ces écrans,
// « à peu près compris » ne suffit pas — l'erreur y ressemble à une réussite.
//
//   node scripts/parcours-manageuse.mjs [--ecrire]

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
    titre: 'Manageuse 1 — Pourquoi cet outil ne prend pas les commandes',
    description: "La question que tout le monde pose le premier jour. Sans la réponse, la moitié de l'outil paraît incohérente.",
    ordre: 101, niveau: 1, duree: 12, seuil: 80,
    etapes: [
      ['Deux systèmes, deux métiers',
       "La caisse Zelty ENCAISSE. Cet outil PILOTE.\n\n"
       + "Chaque activité vend sur sa caisse — le Fournil aujourd'hui, le bar, le restaurant et la pizzeria à la réouverture. L'outil reçoit les tickets et s'en sert pour calculer les marges, le stock, le food cost et la valeur de l'affaire.\n\n"
       + "Ce n'est pas un manque : c'est une décision d'architecture, et elle est écrite noir sur blanc dans le code (`src/lib/frontiere-caisse.ts`)."],
      ['Pourquoi jamais les deux',
       "Trois raisons, et aucune n'est négociable :\n\n"
       + "1. **Deux systèmes qui prennent des commandes divergent toujours.** Pas parfois — toujours.\n\n"
       + "2. **La caisse est la source légale.** Elle est certifiée NF525. Un second encaissement produirait un chiffre d'affaires parallèle sans valeur fiscale.\n\n"
       + "3. **L'équipe ne doit jamais se demander « je saisis où ? ».** Une hésitation de deux secondes, cent fois par jour, c'est une commande perdue par semaine."],
      ['Ce qui a été retiré, et qu\'on ne remettra pas',
       "Des écrans ont existé puis ont été supprimés : la prise de commande serveur, le plan de salle, l'encaissement, la session de caisse et le rapport Z.\n\n"
       + "Si tu tombes sur une page qui explique qu'un écran a été retiré, ce n'est pas un bug — c'est la frontière qui parle.\n\n"
       + "⚠️ Avant de demander un écran qui saisit une vente : la réponse par défaut est « ça se fait sur la caisse »."],
      ['Ce que l\'outil garde, parce que la caisse ne le fait pas',
       "La préparation (les écrans cuisine et comptoir), les commandes du site web, la tournée du livreur — et TOUT le pilotage.\n\n"
       + "Une caisse sait ce qui est vendu. Elle ne sait pas ce que ça a coûté, ce qu'il reste en réserve, ce qui a été jeté hier soir, ni ce que l'affaire vaut. C'est là que cet outil travaille."],
      ['Le cas particulier : les commandes du site',
       "casatasia.fr prend de vraies commandes depuis le 22 août 2026.\n\n"
       + "⚠️ **Interdiction absolue de passer une commande de test sur le site.** L'équipe ne peut pas distinguer un test d'une vraie livraison à préparer — et une vraie commande noyée dans les tests serait manquée.\n\n"
       + "Pour essayer le tunnel : aller jusqu'à l'étape de paiement et S'ARRÊTER sans confirmer."],
    ],
    quiz: [
      ["Un client veut commander à table. Où saisis-tu ?",
       ["Sur la caisse Zelty", "Dans l'outil, écran serveur", "Dans l'outil puis sur la caisse", "Sur le site casatasia.fr"], 0,
       "Toujours la caisse. L'écran serveur a été retiré exprès : deux systèmes qui prennent des commandes divergent toujours."],
      ["Pourquoi ne pas encaisser aussi dans l'outil ?",
       ["Ce serait trop long à coder", "La caisse est certifiée NF525 : elle seule fait foi fiscalement", "Ça coûterait un abonnement de plus", "Le réseau ne suivrait pas"], 1,
       "Un second encaissement produirait un CA parallèle sans aucune valeur fiscale."],
      ["Tu veux vérifier que le tunnel de commande du site marche. Que fais-tu ?",
       ["Une commande au nom de TEST", "Tu vas jusqu'au paiement sans confirmer", "Tu commandes puis tu supprimes", "Tu demandes à un client"], 1,
       "Toute commande web est réelle depuis le 22/08/2026. On s'arrête AVANT de confirmer."],
    ],
  },
  {
    titre: 'Manageuse 2 — La caisse, pendant qu\'elle est en mode école',
    description: "Le compte Zelty est en mode école : rien n'entre dans le chiffre d'affaires. C'est le moment de tout essayer — cette fenêtre se ferme à l'ouverture.",
    ordre: 102, niveau: 1, duree: 20, seuil: 80,
    etapes: [
      ['Le mode école, et sa date de péremption',
       "Aujourd'hui, les commandes créées dans Zelty n'entrent pas dans le chiffre d'affaires. Tu peux passer deux cents tickets, te tromper, annuler, recommencer : rien n'est compté.\n\n"
       + "⚠️ **Cette liberté disparaît au passage en mode réel**, qui se fera pour l'ouverture. Après, chaque erreur est un ticket fiscal qui se rattrape à la main.\n\n"
       + "C'est maintenant qu'on apprend, pas en septembre."],
      ['La carte, rangée dans l\'ordre du service',
       "125 produits, 13 familles. L'ordre des familles sur la caisse n'est PAS l'alphabet : c'est celui du service.\n\n"
       + "À 6 h 20 on vend du pain et du café, pas des pizzas. Pain, Viennoiserie, Boisson chaude et Formule petit-déjeuner viennent donc en premier.\n\n"
       + "Si un produit te semble mal rangé, c'est peut-être vrai — dis-le, ça se corrige en une commande."],
      ['Les taux de TVA, et l\'erreur qui coûte cher',
       "Quatre taux coexistent : **5,5 %** (pain, viennoiserie, pâtisserie à emporter), **10 %** (snacking, pizzas, boissons, et TOUT ce qui est consommé sur place), **20 %** (alcool), **2,1 %** (presse).\n\n"
       + "⚠️ **20 % sur un gâteau est presque toujours une erreur de caisse.** C'est arrivé : 7 produits du Fournil étaient à 20 % sans contenir d'alcool, créés automatiquement depuis les tickets. 8,13 € de TVA sur-collectée en 11 jours — environ 270 € par an de marge perdue, le prix du panneau ne bougeant pas.\n\n"
       + "Si tu vois un taux qui te surprend, signale-le."],
      ['Sur place ou à emporter : ce n\'est pas le même taux',
       "Un croissant emporté est à 5,5 %. Le même croissant mangé à table est à 10 %. C'est la loi, pas un réglage.\n\n"
       + "Le prix affiché ne change pas — c'est la marge qui bouge légèrement. La caisse porte les deux taux : elle sait le faire toute seule si le mode de consommation est bien saisi."],
      ['Ce qui change le jour de la bascule',
       "Au passage en mode réel : les tickets entrent dans le CA, remontent dans l'outil par le webhook, alimentent le stock et les marges.\n\n"
       + "Deux choses restent à faire côté Zelty avant ce jour-là : configurer au moins un **mode de paiement** (il n'y en a aucun — c'est ce qui bloque l'envoi des commandes web vers la caisse), et enregistrer un **moyen de paiement pour l'abonnement**, qui expire le 3 octobre 2026."],
    ],
    quiz: [
      ["Une part de flan à emporter : quel taux ?",
       ["5,5 %", "10 %", "20 %", "2,1 %"], 0,
       "Pâtisserie à emporter : taux réduit 5,5 %."],
      ["Tu vois un moelleux au chocolat à 20 % sur la caisse. Que penses-tu ?",
       ["C'est normal, c'est du snacking", "C'est presque sûrement une erreur : 20 % = alcool", "C'est normal si c'est sur place", "Il faut baisser le prix de vente"], 1,
       "20 % est le taux de l'alcool. Sur une denrée, c'est presque toujours une erreur venue de la caisse — et c'est de la marge perdue."],
      ["Pourquoi apprendre la caisse maintenant plutôt qu'à l'ouverture ?",
       ["Il y aura moins de monde", "Le mode école n'entre pas dans le CA — cette liberté disparaît à la bascule", "Les prix ne sont pas encore posés", "Le personnel n'est pas embauché"], 1,
       "Le mode école est un terrain d'essai sans conséquence. Il ne durera pas."],
    ],
  },
  {
    titre: 'Manageuse 3 — Lire les chiffres avant de les modifier',
    description: "Ce que l'outil mesure, et les trois pièges de lecture qui font croire que tout va bien.",
    ordre: 103, niveau: 1, duree: 25, seuil: 80,
    etapes: [
      ['/admin/ventes — et la ligne qu\'il faut regarder à côté du food cost',
       "CA, marge brute, food cost. Mais le food cost se divise par le CA **couvert** — les produits dont on connaît le coût d'achat — pas par le CA total.\n\n"
       + "⚠️ Sinon il est dilué par les produits sans coût et paraît bien meilleur qu'il n'est : **26,2 % affichés au lieu de 39,8 % réels** sur août 2026.\n\n"
       + "La règle : **toujours lire le taux ET la couverture.** Un food cost à 25 % avec 40 % de couverture ne veut rien dire."],
      ['La ventilation par activité, et pourquoi elle se fait sur les lignes',
       "Le CA, la marge et le food cost sont calculés par étage : Fournil, bar, restaurant, pizzeria.\n\n"
       + "Le rattachement se fait sur la **ligne de vente**, jamais sur l'en-tête du ticket. Deux raisons :\n\n"
       + "· une caisse ne donne pas toujours le point de vente ;\n"
       + "· un même ticket mélange les activités — un café du Fournil et une pizza sur la même addition.\n\n"
       + "C'est ce qui permet de rester sur **un seul abonnement caisse** au lieu de deux comptes complets."],
      ['Encaissé n\'est pas chiffre d\'affaires',
       "Tabac, presse, FDJ, relais colis : ce ne sont pas des ventes de marchandise. Un paquet à 12 € encaissé laisse quelques dizaines de centimes.\n\n"
       + "Comptés comme du CA, ils gonflent le chiffre et écrasent tous les taux — la boulangerie à 70 % de marge noyée dans du tabac à quelques pour cent.\n\n"
       + "Ces lignes sortent aussi du food cost : le prix est imposé, il n'y a rien à optimiser."],
      ['/admin/patrimoine — le chiffre qui change les décisions',
       "**1 000 € de résultat MENSUEL récurrent valent 30 000 à 48 000 € de valeur de fonds** (2,5 à 4 × l'EBE annuel).\n\n"
       + "Un euro qui reste et se répète vaut trente fois un euro sorti une seule fois. Et sorti, il coûte environ 1 420 € à la société pour qu'il en reste 700.\n\n"
       + "⚠️ La page REFUSE d'afficher une valorisation sous 30 jours de vente : annualiser huit jours d'ouverture produirait un chiffre faux affiché en gros caractères."],
      ['Le rapprochement quotidien — le contrôle que personne ne regarde',
       "`/admin/integrations` compare ce que la caisse a **envoyé** à ce que l'outil a **compris**.\n\n"
       + "Sans ce contrôle, une ingestion qui perd 3 % des lignes depuis six semaines ne se voit nulle part : le CA reste juste — il vient des totaux — et seules les marges dérivent. On finit par accuser les fournisseurs.\n\n"
       + "Trois états : `ok`, `incomplet` (on connaît le montant mais pas ce qui a été vendu), `ecart`. Un coup d'œil par semaine suffit."],
    ],
    quiz: [
      ["Le food cost affiche 26 %. Que regardes-tu avant de te réjouir ?",
       ["Le CA total", "La couverture — la part du CA dont on connaît le coût", "Le nombre de tickets", "La marge du mois dernier"], 1,
       "Sans la couverture, le taux est dilué par les produits sans coût connu. 26 % affichés valaient 39,8 % réels."],
      ["Un ticket contient un café du Fournil et une pizza. Comment est-il ventilé ?",
       ["Tout au Fournil", "Tout à la pizzeria", "Ligne par ligne, chacune à son activité", "Il est écarté"], 2,
       "Le rattachement se fait sur la LIGNE, jamais sur l'en-tête — c'est ce qui permet une caisse unique."],
      ["1 000 € de résultat mensuel récurrent, ça vaut combien en valeur de fonds ?",
       ["12 000 €", "Entre 30 000 et 48 000 €", "1 000 €", "Rien tant qu'on ne vend pas"], 1,
       "2,5 à 4 fois l'EBE annuel. Un euro récurrent vaut trente fois un euro sorti une fois."],
    ],
  },
  {
    titre: 'Manageuse 4 — Les gestes du quotidien',
    description: "Quatre écrans, quatre moments de la journée. Ce sont eux qui nourrissent tous les chiffres du guide précédent.",
    ordre: 104, niveau: 2, duree: 20, seuil: 80,
    etapes: [
      ['Le soir — les invendus',
       "`/invendus` : comptage par produit à la fermeture, gros boutons tactiles.\n\n"
       + "Le coût est FIGÉ à la saisie : la casse d'un jour reste valorisée au tarif de ce jour. Repasser sur un produit corrige, une quantité à zéro efface la ligne.\n\n"
       + "C'est l'outil de réglage des commandes : la synthèse 7 jours en haut de page dit ce qu'on jette le plus."],
      ['Le matin — les ruptures',
       "`/ruptures` : une liste, un appui, c'est marqué. Le produit sort immédiatement de la vente en ligne et du click & collect.\n\n"
       + "Pensé pour être fait au comptoir, tablette à la main, en pleine activité : **si le geste prend plus de deux secondes, il ne sera pas fait**, et on continuera de vendre en ligne ce qu'on n'a plus.\n\n"
       + "Une rupture est DATÉE : elle se périme toute seule le lendemain. Personne n'a à penser à la lever."],
      ['Une fois par semaine — l\'inventaire',
       "`/inventaire` : deux onglets, 🥖 Fournil et 🍷 Bar. Ils ne se comptent ni au même moment ni dans la même pièce.\n\n"
       + "On compte des **matières**, pas des produits vendus : le congélateur contient des pâtons, pas « Pizza Reine » + « Panuozzi ». La réserve contient une boîte de capsules, pas quatre cafés.\n\n"
       + "L'écran affiche l'**attendu** (dernier comptage + factures − ventes) à côté de ce que tu comptes. L'écart, c'est la démarque."],
      ['À la livraison — scanner les factures',
       "`/admin/fournisseurs` : photographier la facture, jusqu'à 8 pages en un seul envoi. Claude lit les lignes, en tire les prix d'achat, et alimente les marges.\n\n"
       + "⚠️ C'est aussi l'écran le plus dangereux de l'outil — le guide suivant explique pourquoi. Pendant la prise en main, il est en **lecture seule** : on scanne à deux la première fois."],
      ['Ce que ces quatre gestes produisent',
       "Rien de tout ça n'est de la paperasse :\n\n"
       + "· les invendus font la **casse** qui manquait au food cost ;\n"
       + "· les ruptures évitent d'expliquer au client, sur le pas de la porte, qu'on n'a plus ce qu'il a payé ;\n"
       + "· l'inventaire donne la **démarque**, seul moyen de voir ce qui part sans être vendu ;\n"
       + "· les factures donnent les prix d'achat, donc les marges, donc la valeur de l'affaire.\n\n"
       + "Une journée sans ces gestes, ce sont quatre chiffres qui deviennent faux en silence."],
    ],
    quiz: [
      ["Il ne reste plus de paninis à 11 h. Que fais-tu, et quand ?",
       ["Rien, ça se verra", "Je le marque en rupture tout de suite sur /ruptures", "Je préviens le soir à la fermeture", "Je le désactive dans /admin/recettes"], 1,
       "Tout de suite : sinon on continue de le vendre en ligne, et il faut l'expliquer au client au comptoir."],
      ["À l'inventaire, tu comptes des pâtons ou des pizzas ?",
       ["Des pizzas, une ligne par recette", "Des pâtons — on compte la matière achetée", "Les deux", "Ni l'un ni l'autre"], 1,
       "Le congélateur contient des pâtons. Quatre recettes de pizza sortent du même pâton."],
      ["L'écart entre le stock attendu et le stock compté, c'est quoi ?",
       ["Une erreur de saisie", "La démarque", "Le food cost", "La marge"], 1,
       "La démarque : ce qui est parti sans être vendu. C'est précisément ce qu'on cherche à voir."],
    ],
  },
  {
    titre: 'Manageuse 5 — Les trois écrans qui se trompent en silence',
    description: "Le seul guide dont le quiz exige 100 %. Sur ces écrans, l'erreur ne provoque aucun message : elle ressemble à une réussite.",
    ordre: 105, niveau: 2, duree: 15, seuil: 100,
    etapes: [
      ['Pourquoi ces trois-là et pas les autres',
       "Dans presque tout l'outil, une erreur se voit : un message rouge, un chiffre absurde, un écran vide.\n\n"
       + "Sur les trois écrans qui suivent, **l'erreur ressemble à une réussite**. Rien ne s'affiche. On la découvre des semaines plus tard, quand un chiffre ne colle plus — ou quand un client réagit mal à un produit.\n\n"
       + "C'est pour ça qu'ils sont en lecture seule le temps de la prise en main. Pas par méfiance : parce qu'aucune vigilance ne rattrape une erreur qui ne se signale pas."],
      ['Écran 1 — Allergènes : valider, c\'est signer',
       "Sur `/admin/allergenes`, enregistrer VAUT validation, et la validation est **nominative**.\n\n"
       + "⚠️ Valider affirme que la liste est **COMPLÈTE** — pas seulement que ce qui est coché est exact.\n\n"
       + "Le piège concret : les allergènes ont été pré-remplis par script avec ce qui est vrai *par définition* (le gluten d'une farine). Signer la famille « Viennoiserie » telle qu'elle est proposée déclarerait qu'un croissant **ne contient pas de lait**. C'est faux, et c'est lu par un allergique.\n\n"
       + "La bonne méthode : onglet « 📷 Scanner un emballage », photographier la liste d'ingrédients, relire, signer."],
      ['Écran 2 — Factures : le croissant à 40 €',
       "Le prix d'une ligne Gineys est souvent celui du COLIS : « CROISSANT … C=96 » = 28,84 € le carton, pas la pièce.\n\n"
       + "Écrit tel quel, ça donne un croissant à 40 € de coût. **C'est arrivé le 22 août** : quatre produits corrompus par un seul scan, et des marges fausses pendant des jours sans une seule erreur affichée.\n\n"
       + "L'outil divise maintenant par le conditionnement et refuse tout coût supérieur à 95 % du prix de vente. Mais il ne peut pas tout attraper : après un scan, **on relit les prix propagés**."],
      ['Écran 3 — Pousser vers la caisse : c\'est un upsert',
       "Envoyer un produit vers Zelty utilise `POST /catalog/dishes`, qui est un **upsert** exigeant nom, prix et TVA.\n\n"
       + "Un objet incomplet **écrase le prix du plat dans la caisse** — c'est-à-dire ce qui s'imprime sur les tickets et fait foi fiscalement.\n\n"
       + "La règle du code est absolue : on RELIT le catalogue juste avant, on recopie les champs obligatoires tels quels, et on REFUSE de construire s'il en manque un. Aucun prix n'est jamais inventé."],
      ['La règle générale',
       "**Dans le doute, on ne valide pas.**\n\n"
       + "Une donnée manquante se rattrape à tout moment. Une donnée fausse qui a l'air juste ne se rattrape que par hasard, et souvent trop tard.\n\n"
       + "C'est le principe qui gouverne tout l'outil, et on le retrouve partout : le registre légal n'invente aucune date, le bar n'a aucun prix d'achat inventé, la page patrimoine refuse de valoriser sous 30 jours de vente.\n\n"
       + "Mieux vaut pas de chiffre qu'un chiffre faux."],
    ],
    quiz: [
      ["Tu ouvres la famille « Viennoiserie » : le gluten est déjà coché. Tu valides ?",
       ["Oui, c'est pré-rempli donc vérifié", "Non — valider affirme que la liste est complète, or le lait n'a pas été vérifié", "Oui, mais je coche aussi le lait au cas où", "Oui si personne n'est allergique"], 1,
       "Valider affirme la COMPLÉTUDE. Signer tel quel déclarerait qu'un croissant ne contient pas de lait."],
      ["Une ligne de facture dit « CROISSANT … C=96 » à 28,84 €. Le coût d'un croissant ?",
       ["28,84 €", "28,84 ÷ 96 ≈ 0,30 €", "96 × 28,84 €", "On ne peut pas savoir"], 1,
       "C=96 est le conditionnement. Ne pas diviser a déjà produit un croissant à 40 € et des marges fausses pendant des jours."],
      ["Pourquoi pousser un produit vers Zelty demande de la prudence ?",
       ["C'est lent", "C'est un upsert : un objet incomplet écrase le prix imprimé sur les tickets", "Ça consomme du crédit", "Ça duplique le produit"], 1,
       "POST /catalog/dishes exige nom, prix et TVA. Incomplet, il écrase ce qui fait foi fiscalement."],
      ["Tu hésites sur une information. Que fais-tu ?",
       ["Je valide, on corrigera", "Je ne valide pas — mieux vaut pas de chiffre qu'un chiffre faux", "Je mets une valeur approchée", "Je valide et je note dans le journal"], 1,
       "Une donnée manquante se rattrape. Une donnée fausse qui a l'air juste ne se rattrape que par hasard."],
      ["Un allergène « peut contenir des traces de » : tu le déclares comme présent ?",
       ["Oui, c'est plus prudent", "Non — trace et ingrédient sont deux choses distinctes", "Seulement si c'est en gras", "Ça dépend du produit"], 1,
       "Se tromper est fautif dans les deux sens : déclarer une trace fait fuir un client sans motif, taire une trace expose un allergique."],
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
  const marque = dejaLa ? '=' : '+'
  console.log(`  ${marque} ${g.titre}`)
  console.log(`      ${g.etapes.length} étapes · ${g.quiz.length} questions · seuil ${g.seuil}% · ${g.duree} min`)
  if (dejaLa) { deja++; continue }
  crees++
  if (!ECRIRE) continue

  const [guide] = await sb('guides_formation', {
    method: 'POST',
    body: JSON.stringify({
      titre: g.titre, description: g.description, poste: 'manager',
      ordre: g.ordre, actif: true, seuil_reussite_pct: g.seuil,
      duree_minutes: g.duree, niveau: g.niveau,
    }),
  })
  await sb('etapes_formation', {
    method: 'POST',
    body: JSON.stringify(g.etapes.map(([titre, contenu], i) =>
      ({ guide_id: guide.id, ordre: i + 1, titre, contenu }))),
  })
  await sb('quiz_questions', {
    method: 'POST',
    body: JSON.stringify(g.quiz.map(([question, choix, idx, explication], i) =>
      ({ guide_id: guide.id, ordre: i + 1, question, choix, bonne_reponse_idx: idx, explication }))),
  })
}

const nbEtapes = PARCOURS.reduce((s, g) => s + g.etapes.length, 0)
const nbQuiz = PARCOURS.reduce((s, g) => s + g.quiz.length, 0)
console.log(`\n  ${PARCOURS.length} guides · ${nbEtapes} étapes · ${nbQuiz} questions`)
console.log(`  à créer : ${crees} · déjà présents : ${deja}`)
console.log(`\n  Le guide 5 exige 100 % : sur ces écrans, « à peu près compris » ne suffit pas.`)
if (!ECRIRE) console.log('\n  (rien écrit — relancer avec --ecrire)\n')
