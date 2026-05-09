// Module 27 — Seed des 8 guides de formation depuis docs/formation/*.md
//
// Usage : node scripts/seed-formation.mjs
//
// Pour chaque manuel :
//  - parse le Markdown : H1 = titre, H2 = étapes
//  - delete guide existant avec même titre (cascade etapes + quiz)
//  - insert guide_formation + etapes_formation + quiz_questions (5 par poste)
//
// Idempotent : peut être relancé sans dupliquer.
//
// Prérequis : avoir appliqué la migration 0053 (extension du check poste).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ─── Lecture .env.local ─────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('❌ Variables manquantes : NEXT_PUBLIC_SUPABASE_URL + (SUPABASE_SERVICE_ROLE_KEY ou ANON_KEY)')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, KEY)

// ─── Métadonnées des manuels ────────────────────────────────────────
const MANUELS = [
  { fichier: '01-gerant.md',         titre: 'Manuel Gérant',         poste: 'gerant',         duree: 30, ordre: 1 },
  { fichier: '02-serveur.md',        titre: 'Manuel Serveur',        poste: 'serveur',        duree: 20, ordre: 2 },
  { fichier: '03-cuisinier.md',      titre: 'Manuel Cuisinier',      poste: 'cuisinier',      duree: 25, ordre: 3 },
  { fichier: '04-pizzaiolo.md',      titre: 'Manuel Pizzaiolo',      poste: 'pizzaiolo',      duree: 20, ordre: 4 },
  { fichier: '05-barman.md',         titre: 'Manuel Barman',         poste: 'barman',         duree: 25, ordre: 5 },
  { fichier: '06-receptionniste.md', titre: 'Manuel Réceptionniste', poste: 'receptionniste', duree: 25, ordre: 6 },
  { fichier: '07-second.md',         titre: 'Manuel Second',         poste: 'second',         duree: 30, ordre: 7 },
  { fichier: '08-plonge.md',         titre: 'Manuel Plonge',         poste: 'plonge',         duree: 15, ordre: 8 },
]

// ─── Quiz : 5 questions QCM par poste ───────────────────────────────
const QUIZ = {
  gerant: [
    { q: "Quand dois-tu remplir le journal de bord du jour ?",
      choix: ["À l'ouverture", "À la clôture du service", "Une fois par semaine", "Quand un incident grave arrive"],
      bonne: 1, ex: "Le journal se remplit en clôture pour figer la perception du service le jour même." },
    { q: "À partir de quel ratio food cost faut-il agir immédiatement ?",
      choix: ["≥ 25 %", "≥ 28 %", "≥ 32 %", "≥ 40 %"],
      bonne: 2, ex: "Au-delà de 32 %, le food cost devient critique : revoir portions, fournisseurs ou prix." },
    { q: "Quel est le seuil rouge pour la masse salariale ?",
      choix: ["20 %", "30 %", "35 %", "50 %"],
      bonne: 2, ex: "Au-delà de 35 % du CA, la masse salariale rogne dangereusement la rentabilité." },
    { q: "Que faire d'une non-conformité critique non traitée depuis plus de 7 jours ?",
      choix: ["Attendre que ça se résorbe seul", "Escalader et fixer une deadline ferme", "La supprimer", "La basculer en mineure"],
      bonne: 1, ex: "Une NC critique laissée sans suivi expose le restaurant en cas de contrôle DDPP." },
    { q: "Combien de fois minimum dois-tu sauvegarder la base au format JSON ?",
      choix: ["Jamais (Supabase suffit)", "1 fois par mois", "1 fois par semaine", "1 fois par jour"],
      bonne: 1, ex: "Une sauvegarde mensuelle (en plus de Supabase) protège contre la corruption ou erreur humaine." },
    { q: "Quel module utiliser pour piloter le point mort mensuel ?",
      choix: ["/admin/recettes", "/admin/finances/economie", "/admin/stock", "/admin/equipe"],
      bonne: 1, ex: "Le module économie centralise charges fixes + masse salariale et auto-suggère ton point mort." },
    { q: "Une réservation en `no_show` répétée pour un même client : que faire ?",
      choix: ["Rien", "Marquer fiche client à risque + demander acompte au prochain", "L'interdire", "L'appeler tous les jours"],
      bonne: 1, ex: "On documente le risque, on demande un acompte ou un CB en garantie pour les futures résas." },
    { q: "À quelle fréquence faire le bilan PDF mensuel comptable ?",
      choix: ["Tous les jours", "Chaque mois (avant le 10 du mois suivant)", "Chaque trimestre", "Une fois par an"],
      bonne: 1, ex: "Le bilan mensuel est attendu par ton expert-comptable avant le 10 pour la TVA et le pilotage." },
    { q: "Quel taux de TVA appliquer sur un alcool consommé sur place ?",
      choix: ["5,5 %", "10 %", "20 %", "0 %"],
      bonne: 2, ex: "L'alcool est toujours à 20 % de TVA, peu importe sur place ou à emporter." },
  ],
  serveur: [
    { q: "Avant de saisir une commande pour un client allergique, que dois-tu faire ?",
      choix: ["Lui dire d'éviter ce qui contient l'allergène", "Cocher l'allergène dans la commande pour alerter la cuisine", "Demander un médecin", "Ne rien dire"],
      bonne: 1, ex: "Tu dois TOUJOURS cocher l'allergène : la cuisine voit le bandeau rouge et adapte le plat." },
    { q: "Quand marquer un plat « servi » dans l'app ?",
      choix: ["Quand la cuisine l'a posé en pass", "Quand tu prends l'assiette", "Dès que tu poses l'assiette en table", "À l'encaissement"],
      bonne: 2, ex: "Le statut « servi » se déclenche au moment où l'assiette atterrit en table — pas avant, pas après." },
    { q: "Où saisir un pourboire à l'encaissement ?",
      choix: ["Dans le total", "Dans le champ pourboire dédié", "Dans une nouvelle commande", "Dans le commentaire"],
      bonne: 1, ex: "Le pourboire a son champ dédié pour ne pas fausser le CA et permettre la répartition équipe." },
    { q: "Combien de fois par jour cocher la checklist hygiène salle ?",
      choix: ["1 fois (à l'ouverture)", "2 fois (ouverture + fermeture)", "3 fois", "Selon l'envie"],
      bonne: 1, ex: "L'ouverture et la fermeture sont les deux points obligatoires HACCP en salle." },
    { q: "Le QR appel client sonne pendant que tu prends une commande. Que fais-tu ?",
      choix: ["Termine la commande puis va voir et clique « Pris »", "Lâche tout immédiatement", "Demande à quelqu'un d'autre", "Ignore et continue"],
      bonne: 0, ex: "Tu termines proprement, tu vas voir le client, et tu cliques « Pris » pour faire taire l'alerte." },
    { q: "Un client demande sa note pour partage à 4. Que fais-tu ?",
      choix: ["Refuse, c'est trop long", "Utilise le mode partage de l'encaissement (split par couvert ou article)", "Demande à un autre serveur", "Encaisse en bloc et fait le change"],
      bonne: 1, ex: "L'encaissement gère le split natif par couvert ou article, pas besoin de calcul mental." },
    { q: "Tu changes de table en plein service (changement de couvert). Que faire dans l'app ?",
      choix: ["Rien, tu sers", "Tu utilises la fonction transfert de table", "Tu crées une nouvelle commande", "Tu annules tout"],
      bonne: 1, ex: "Le transfert de table déplace les articles sans casser la commande ni perdre l'historique." },
    { q: "TVA emporter sur un plat (hors alcool) ?",
      choix: ["10 %", "5,5 %", "20 %", "0 %"],
      bonne: 1, ex: "À emporter (sans alcool), le taux est 5,5 %. Sur place reste à 10 %." },
    { q: "Un client te dit avoir une intolérance au lactose à l'oral. Où l'enregistres-tu ?",
      choix: ["De tête", "Tu coches l'allergène lait dans la commande, même pour intolérance", "Sur un papier", "Tu ne l'enregistres pas"],
      bonne: 1, ex: "Intolérance ou allergie : tu coches dans tous les cas pour que la cuisine adapte." },
  ],
  cuisinier: [
    { q: "Combien de relevés température par jour minimum ?",
      choix: ["1", "2 (matin + soir)", "3", "1 par semaine"],
      bonne: 1, ex: "Le matin pour valider la nuit + le soir pour la journée. C'est l'obligation HACCP." },
    { q: "Le frigo affiche 8 °C alors que la norme est ≤ 4 °C. Que faire ?",
      choix: ["Saisir le relevé et continuer", "Saisir + transférer denrées + créer une NC", "Ne rien faire, ça va redescendre", "Augmenter la température"],
      bonne: 1, ex: "Tu enregistres le hors-norme, tu sauves les denrées, et tu crées une NC pour suivi." },
    { q: "Quand saisir un nouveau lot produit dans /admin/stock ?",
      choix: ["Le matin uniquement", "À chaque livraison fournisseur", "Une fois par semaine", "Quand t'as le temps"],
      bonne: 1, ex: "Chaque livraison = nouveau lot avec sa DLC, son fournisseur, son prix d'achat." },
    { q: "Une commande arrive avec un allergène signalé que tu ne peux pas garantir. Que fais-tu ?",
      choix: ["Tu fais quand même", "Tu refuses le plat et le serveur prévient le client", "Tu enlèves juste l'ingrédient", "Tu remplaces sans dire"],
      bonne: 1, ex: "En cas de doute sur un allergène, tu refuses. Pas de prise de risque sanitaire." },
    { q: "Quand peser les déchets de cuisine ?",
      choix: ["Au début du service", "À la fin du service du soir", "Une fois par mois", "Jamais"],
      bonne: 1, ex: "La pesée déchets fin de service alimente le KPI gérant et la déclaration AGEC." },
    { q: "Une viande hachée est livrée à 6 °C (norme ≤ 2 °C). Tu fais quoi ?",
      choix: ["Tu acceptes et stockes", "Tu refuses la livraison + bon de retour fournisseur", "Tu cuit immédiatement", "Tu congèles"],
      bonne: 1, ex: "Hachée hors-norme à réception = refus immédiat. Loi : tu n'as pas à assumer la rupture froide." },
    { q: "Tu finis un service avec 2 plats invendus prêts. Que faire ?",
      choix: ["Jeter direct", "Refroidir < 10 °C en 2h, étiqueter date+heure, conserver max 24h", "Donner aux clients", "Stocker tel quel"],
      bonne: 1, ex: "HACCP : refroidissement rapide + étiquetage. Pas de conservation > 24h en chambre froide." },
    { q: "Un bon imprimé en cuisine est marqué `URGENT` (table en attente). Tu fais quoi ?",
      choix: ["Tu prends ton temps", "Tu le passe en priorité avant les autres entrants", "Tu jettes le bon", "Tu appelles le serveur"],
      bonne: 1, ex: "Le tag URGENT signale une table déjà attente longue ; passage en priorité dans l'ordre du pass." },
    { q: "L'écran cuisine est planté. Que faire ?",
      choix: ["Tu attends le manager", "Tu bascules sur impression bons + checklist papier + escalade IT", "Tu fermes la cuisine", "Tu cuisines de mémoire"],
      bonne: 1, ex: "Plan B : impression papier + checklist papier ; escalade en parallèle pour ne pas bloquer le service." },
    { q: "Une recette modifiée par le second n'est pas la même que celle dans l'app. Tu suis quoi ?",
      choix: ["Ta tête", "L'app (source de vérité)", "Le second oralement", "Tu improvises"],
      bonne: 1, ex: "L'app est la source de vérité. Si désaccord, on met à jour la recette dans /admin/recettes." },
  ],
  pizzaiolo: [
    { q: "Quelle URL bookmarker pour avoir uniquement les bons pizza ?",
      choix: ["/cuisine", "/cuisine?role=pizzaiolo", "/admin/recettes", "/serveur"],
      bonne: 1, ex: "/cuisine?role=pizzaiolo filtre la vue pour ne montrer que les articles tagués PIZZA." },
    { q: "Température cible du dôme du four à pizza ?",
      choix: ["180-200 °C", "250-300 °C", "430-480 °C", "600-700 °C"],
      bonne: 2, ex: "Le four à pizza napolitaine vise 430-480 °C au dôme pour une cuisson en 60-90 sec." },
    { q: "DLC typique d'une pâte à pizza fraîche maison ?",
      choix: ["6 heures", "24-48 heures", "1 semaine", "1 mois"],
      bonne: 1, ex: "Une pâte fraîche se conserve 24-48h en chambre froide selon le poids de levure utilisé." },
    { q: "Un client allergique gluten commande une pizza sans gluten. Quelles précautions ?",
      choix: ["Juste utiliser la pâte SG", "Pâte SG + outils dédiés + lavage mains préalable", "Aucune", "Refuser le plat"],
      bonne: 1, ex: "La contamination croisée tue. Outils dédiés ET lavage mains avant de toucher la pâte SG." },
    { q: "Le four ne monte pas en température en début de service. Que fais-tu ?",
      choix: ["Tu attends", "Tu saisis un relevé + crée une NC + préviens le manager", "Tu cuis à plus basse température", "Tu fermes la pizzeria"],
      bonne: 1, ex: "Relevé hors-norme + NC + escalade : procédure HACCP face à une dérive équipement." },
    { q: "Hydratation typique d'une pâte napolitaine ?",
      choix: ["40-50 %", "55-65 %", "70-80 %", "90 %"],
      bonne: 1, ex: "Hydratation napolitaine : 55-65 % pour un cornicione bien aéré et une mâche tendre." },
    { q: "Tu finis un sac de farine mais pas le suivant. Que faire dans l'app ?",
      choix: ["Rien", "Saisir la sortie de stock du sac fini + nouveau lot pour celui ouvert", "Attendre la fin du mois", "Demander au manager"],
      bonne: 1, ex: "Stock à jour en temps réel = food cost juste et alertes seuils correctes." },
    { q: "Une pizza part avec mauvais ingrédient (mozzarella au lieu de bufala). Que faire ?",
      choix: ["Tu rappelles le serveur", "Tu refais sans dire", "Tu marques en déchet ET tu refais selon la commande", "Tu sers comme ça"],
      bonne: 2, ex: "Erreur = déchet à saisir + correction. Pas de tricherie sur le KPI gâchis ni sur la commande client." },
    { q: "Combien de pizzas/heure max recommandé en service intense ?",
      choix: ["10", "30-40", "60", "100"],
      bonne: 1, ex: "Capacité standard : 30-40 pizzas/h pour un four pro avec un pizzaiolo solo (qualité maintenue)." },
    { q: "Une pâte n'a pas levé correctement (sous-fermentée). Que faire ?",
      choix: ["Servir quand même", "Jeter + saisir déchet + adapter la levée du lot suivant", "Allonger la cuisson", "Mettre plus de garniture"],
      bonne: 1, ex: "Pâte ratée = déchet et apprentissage : ajuster temps/température de fermentation pour le lot suivant." },
  ],
  barman: [
    { q: "Combien de jours un vin rouge tannique tient-il ouvert (cave fraîche) ?",
      choix: ["24 h", "3-5 jours", "2 semaines", "1 mois"],
      bonne: 1, ex: "Un vin rouge tannique se tient 3-5 jours en cave à 12-14 °C, idéalement avec pompe à vin." },
    { q: "Quel allergène est obligatoire à mentionner sur un vin contenant > 10 mg/L ?",
      choix: ["L'arsenic", "Les sulfites", "Les tanins", "Le glucose"],
      bonne: 1, ex: "Réglementation européenne : mention « contient des sulfites » au-delà de 10 mg/L." },
    { q: "Marge brute minimum recommandée sur boissons ?",
      choix: ["30 %", "50 %", "70 %", "90 %"],
      bonne: 2, ex: "Une marge boissons < 70 % indique soit du gâchis, soit un prix de vente trop bas." },
    { q: "L'inventaire affiche un écart > 5 % sur une référence. Que faire ?",
      choix: ["C'est normal", "Enquête : vol, sur-service, casse non saisie ?", "Recompter et passer", "Refaire dans 1 mois"],
      bonne: 1, ex: "Au-delà de 5 % d'écart, il faut tracer la cause sinon le pilotage des achats devient faux." },
    { q: "Tu rates un cocktail. Où dois-tu le saisir ?",
      choix: ["Nulle part", "Dans /admin/dechets ET /admin/stock (alcool consommé)", "Dans la note client", "Dans /admin/recettes"],
      bonne: 1, ex: "Cocktail raté = déchet ET sortie de stock. Saisir les deux maintient le pilotage juste." },
    { q: "Refus de servir : à quel taux d'alcoolémie présumée tu refuses ?",
      choix: ["Jamais", "Dès signes d'ébriété visibles (loi : tu peux refuser)", "Quand le client agresse", "Sur ordre du manager seulement"],
      bonne: 1, ex: "Loi française : refus de vente d'alcool autorisé dès signes d'ébriété (responsabilité pénale du tenancier)." },
    { q: "Quelle est la dose service standard pour un alcool fort en bar (CHR France) ?",
      choix: ["2 cl", "4 cl", "6 cl", "10 cl"],
      bonne: 1, ex: "Dose standard CHR : 4 cl (mesure obligatoire affichée). Permet le calcul food cost juste." },
    { q: "Une bouteille fond de cave a tourné (oxydée). Que faire ?",
      choix: ["Servir au verre", "Jeter + saisir déchet + revoir tournante stock", "Vinaigre maison", "Ne rien dire"],
      bonne: 1, ex: "Vin tourné = déchet + revue de la rotation FIFO pour éviter de reproduire la perte." },
    { q: "Quel mois de l'année surveille-t-on le pic ventes apéritifs ?",
      choix: ["Janvier", "Été (juin-août)", "Novembre", "Toute l'année pareil"],
      bonne: 1, ex: "Pic apéritifs en été (terrasse). Pilotage stocks à anticiper dès mai dans les paramètres saisonniers." },
    { q: "Un mineur tente de commander un cocktail. Que fais-tu ?",
      choix: ["Refus + demande pièce d'identité au moindre doute", "Sers en demandant l'avis des parents", "Sers, ce n'est pas grave", "Tu remplaces par un mocktail sans rien dire"],
      bonne: 0, ex: "Vente d'alcool aux mineurs = sanctions pénales lourdes. Refus systématique + ID si doute." },
  ],
  receptionniste: [
    { q: "Quelle est ta première action obligatoire chaque matin ?",
      choix: ["Ouvrir la caisse", "Animer le briefing équipe matin", "Faire le ménage", "Vérifier les emails"],
      bonne: 1, ex: "Le briefing matin avec l'équipe : météo, résas du jour, allergies importantes, anniversaires." },
    { q: "Quand passer une réservation au statut `confirmee` ?",
      choix: ["Dès la prise de contact", "Dès réception de l'acompte (si demandé)", "Le jour J", "Jamais"],
      bonne: 1, ex: "Pour les groupes/événements avec acompte, on passe en `confirmee` UNIQUEMENT à réception du paiement." },
    { q: "Différence entre `no_show` et `annulee` ?",
      choix: ["Aucune", "no_show = absent sans prévenir / annulee = annulation explicite", "no_show concerne les groupes", "annulee est plus grave"],
      bonne: 1, ex: "no_show pénalise les statistiques fiabilité client ; annulee est neutre pour le pilotage." },
    { q: "Délai max pour répondre à une réclamation client écrite ?",
      choix: ["24 h", "48 h", "1 semaine", "Quand on peut"],
      bonne: 1, ex: "48 h max — au-delà, le client se sent ignoré et l'affaire gonfle (Tripadvisor, Google)." },
    { q: "Comment saisir une allergie d'un client habitué ?",
      choix: ["Dans le commentaire libre de la commande", "Dans le champ structuré « allergies » de sa fiche client", "Sur un Post-it", "On retient de tête"],
      bonne: 1, ex: "Le champ structuré sur la fiche client se reporte automatiquement sur ses futures commandes." },
    { q: "Quelle pénalité no_show appliquer pour un groupe de 8+ avec acompte ?",
      choix: ["Aucune", "Conservation de l'acompte (mention CGV)", "Demander le prix complet", "Black-list à vie"],
      bonne: 1, ex: "L'acompte est non-remboursable selon CGV signées. Pas de double pénalité." },
    { q: "Tu reçois une demande de réservation par email à 22h. Délai max de réponse ?",
      choix: ["Immédiat", "Le lendemain matin (avant 11h)", "48h", "Quand on peut"],
      bonne: 1, ex: "Réponse le lendemain matin avant ouverture = client confirmé pour ses prochaines démarches." },
    { q: "Réservation pour 14 personnes sans acompte : tu fais quoi ?",
      choix: ["Tu acceptes", "Tu envoies un lien de paiement acompte 30 % avant validation", "Tu refuses", "Tu encaisses sur place"],
      bonne: 1, ex: "Politique groupes 8+ : acompte 30 % obligatoire pour bloquer la table et limiter les no_show." },
    { q: "Un client laisse une review 1⭐ sur Google. Que fais-tu en premier ?",
      choix: ["Tu signales pour suppression", "Tu réponds publiquement de manière professionnelle dans les 48h", "Tu ignores", "Tu menaces le client"],
      bonne: 1, ex: "Réponse publique calme et factuelle = signal positif pour les autres lecteurs (98 % des clients lisent)." },
    { q: "Comment marquer un client VIP / habitué dans l'app ?",
      choix: ["Dans le commentaire", "Tag VIP sur sa fiche + mémoire de ses préférences (table, allergies, vin)", "On retient", "Sur un cahier"],
      bonne: 1, ex: "Tag VIP + préférences structurées = expérience personnalisée à chaque visite, fidélisation +30 %." },
  ],
  second: [
    { q: "Quand faire l'inventaire physique complet ?",
      choix: ["Tous les jours", "1ère semaine du mois", "1 fois par an", "Quand il manque quelque chose"],
      bonne: 1, ex: "Inventaire mensuel = base du calcul food cost réel et détection des écarts." },
    { q: "Un fournisseur augmente ses prix de plus de 10 %. Que fais-tu ?",
      choix: ["Tu acceptes", "Tu compares avec un concurrent et reprices ou changes", "Tu arrêtes de commander", "Tu négocies par email"],
      bonne: 1, ex: "Une hausse > 10 % impacte la marge. Soit tu trouves moins cher, soit tu reprices ta carte." },
    { q: "Comment se calcule le food cost d'une recette ?",
      choix: ["Au pif", "(Σ quantité × prix achat) / prix vente HT", "(prix vente − prix achat) / prix vente", "prix achat × 3"],
      bonne: 1, ex: "Le food cost = somme des coûts ingrédients ÷ prix vente HT." },
    { q: "Engineering recettes : que faire d'un plat « DOG » (faible vente, faible marge) ?",
      choix: ["Le mettre en plat du jour", "Le désactiver ou le retravailler", "Augmenter son prix", "Ne rien faire"],
      bonne: 1, ex: "Un DOG ne rentabilise ni les ingrédients ni la place sur la carte. Désactiver ou retravailler." },
    { q: "Un cuisinier ne fait plus ses relevés température. Que fais-tu ?",
      choix: ["Rien", "Rappel verbal → chat équipe → escalade au gérant", "Tu fais à sa place", "Tu le vires"],
      bonne: 1, ex: "Escalade progressive : verbal d'abord, écrit ensuite, gérant en dernier ressort." },
    { q: "Quel KPI surveille-tu chaque jour pour anticiper les sur-stocks ?",
      choix: ["Le CA seul", "DLC < 3 jours par ingrédient + couverture stock vs ventes prévues", "Le nombre de couverts", "Les pourboires"],
      bonne: 1, ex: "DLC + couverture = anticipation déchets et menu suggestions (plat du jour avant péremption)." },
    { q: "Quand passer un appel d'offres fournisseur ?",
      choix: ["Jamais", "Tous les 6-12 mois sur les top 5 par volume", "Toutes les semaines", "Une fois par décennie"],
      bonne: 1, ex: "Mise en concurrence semestrielle des top fournisseurs = -3 à -8 % sur les achats sur 12 mois." },
    { q: "Tu vois une recette à food cost > 35 %. Action prioritaire ?",
      choix: ["Tu attends", "Reformuler portions OU rebalancer prix vente OU changer fournisseur", "Tu désactives le plat", "Rien"],
      bonne: 1, ex: "3 leviers possibles avant désactivation. Désactiver est le dernier recours (perte de carte)." },
    { q: "Engineering recettes : que faire d'un plat « STAR » (forte vente, forte marge) ?",
      choix: ["Augmenter le prix de 20 %", "Le mettre en avant carte/menu, ne JAMAIS le casser", "Le retirer", "Rien"],
      bonne: 1, ex: "Un STAR est intouchable : mise en avant visuelle, jamais en rupture, base de la rentabilité." },
    { q: "Inventaire mensuel : écart théorique-physique de 8 %. Que faire ?",
      choix: ["Tu acceptes", "Audit : vol, casse non saisie, sur-portion, fuite recette", "Tu rectifie sans audit", "Tu ignores"],
      bonne: 1, ex: "Au-delà de 5 % d'écart, audit obligatoire pour identifier la fuite avant qu'elle ne s'aggrave." },
  ],
  plonge: [
    { q: "Quand cocher la checklist nettoyage ?",
      choix: ["Tout en bloc en fin de journée", "Au fur et à mesure, dès qu'une zone est faite", "Une fois par semaine", "Jamais"],
      bonne: 1, ex: "Au fur et à mesure : ça documente le travail réel et limite la triche en cas de contrôle." },
    { q: "Pourquoi la pesée déchets quotidienne est-elle obligatoire ?",
      choix: ["Pour la déco", "Loi AGEC + KPI gérant pour suivre le gâchis alimentaire", "C'est facultatif", "Pour le compost"],
      bonne: 1, ex: "Loi AGEC oblige les restaurants à mesurer. Le gérant suit le KPI pour réduire le coût." },
    { q: "Le lave-vaisselle tombe en panne en plein service. Que fais-tu ?",
      choix: ["Tu attends qu'on appelle", "Préviens immédiatement + plonge manuelle conforme (eau > 60 °C, désinfectant)", "Tu rentres chez toi", "Tu laves à l'eau froide"],
      bonne: 1, ex: "La plonge manuelle reste possible mais doit respecter eau chaude + désinfectant pour la sécurité." },
    { q: "Tu trouves un produit avec DLC dépassée. Que fais-tu ?",
      choix: ["Tu le sers quand même", "Tu demandes au cuisinier puis jettes si besoin", "Tu jettes sans rien dire", "Tu le manges"],
      bonne: 1, ex: "DLC dépassée = ne pas servir. Le cuisinier décide de la suite (jeter, staff, déclarer perte)." },
    { q: "Pourquoi cocher au fur et à mesure plutôt qu'en bloc le soir ?",
      choix: ["C'est plus rapide", "Documentation fiable + détection précoce d'oubli + traçabilité contrôle DDPP", "Aucune raison", "Pour la prime"],
      bonne: 1, ex: "Au fur et à mesure = vérité documentée. En bloc = présomption de fraude en cas de contrôle." },
    { q: "Température minimum de l'eau de plonge manuelle (HACCP) ?",
      choix: ["30 °C", "45 °C", "60 °C", "90 °C"],
      bonne: 2, ex: "Eau ≥ 60 °C + détergent + désinfectant = inactivation des germes pathogènes pour la vaisselle." },
    { q: "Tu trouves un nuisible (souris, cafard) en plonge. Que fais-tu ?",
      choix: ["Tu écrases", "Tu signales NC critique + alerte manager + dératiseur sous 24h", "Tu nettoies la zone", "Tu ignores"],
      bonne: 1, ex: "Nuisible = NC critique. La présence d'un seul = obligation de traitement professionnel sous 24h." },
    { q: "Quel matériel doit être conservé dans le local poubelle (et nulle part ailleurs) ?",
      choix: ["Vaisselle", "Aucun matériel alimentaire ; uniquement contenants et matériel de nettoyage dédié", "Les chaussures de service", "Les outils du chef"],
      bonne: 1, ex: "Le local poubelle est zone sale. Aucun contact avec matériel alimentaire = règle HACCP." },
    { q: "Le savon désinfectant est presque vide. Que faire ?",
      choix: ["Tu attends que ce soit fini", "Tu signales en stock pour racommander avant rupture", "Tu utilises du savon perso", "Tu laves sans"],
      bonne: 1, ex: "Anticipation = pas de rupture en pleine plonge. Saisir alerte stock pour réappro avant épuisement." },
    { q: "Les chiffons humides : que faire en fin de service ?",
      choix: ["Les laisser dans l'évier", "Les laver machine à 60 °C ou les jeter selon catégorie", "Les sécher pour réutiliser", "Aucune obligation"],
      bonne: 1, ex: "Chiffon humide = nid à bactéries. Lavage 60 °C ou jetable selon HACCP du restaurant." },
  ],
}

// ─── Parsing markdown : H1 + sections H2 ────────────────────────────
function parseManuel(md) {
  const lines = md.split('\n')

  let h1 = ''
  for (const l of lines) {
    if (l.startsWith('# ')) { h1 = l.slice(2).trim(); break }
  }

  const sections = []
  let current = null
  for (const l of lines) {
    if (l.startsWith('## ')) {
      if (current) sections.push(current)
      const titre = l.slice(3).trim().replace(/^\d+\.\s*/, '')
      current = { titre, lignes: [] }
    } else if (current) {
      current.lignes.push(l)
    }
  }
  if (current) sections.push(current)

  return {
    titre_h1: h1,
    sections: sections.map(s => ({
      titre: s.titre,
      contenu: s.lignes.join('\n').replace(/^---\s*$/gm, '').trim(),
    })),
  }
}

// ─── Seed un guide ──────────────────────────────────────────────────
async function seedGuide(meta) {
  const filePath = path.join(process.cwd(), 'docs', 'formation', meta.fichier)
  const md = readFileSync(filePath, 'utf8')
  const parsed = parseManuel(md)

  console.log(`\n→ ${meta.titre} (${meta.poste}) — ${parsed.sections.length} sections`)

  // 1. Delete guides existants avec ce titre (cascade etapes/quiz)
  const { error: errDel } = await sb.from('guides_formation').delete().eq('titre', meta.titre)
  if (errDel) { console.error(`  ❌ delete:`, errDel.message); return }

  // 2. Insert guide
  const description = parsed.sections[0]?.contenu
    .split('\n').find(l => l.trim() && !l.startsWith('>'))?.slice(0, 200) ?? null
  const { data: guide, error: errG } = await sb.from('guides_formation').insert({
    titre: meta.titre,
    description,
    poste: meta.poste,
    ordre: meta.ordre,
    actif: true,
    seuil_reussite_pct: 80,
    duree_minutes: meta.duree,
  }).select('id').single()
  if (errG) { console.error(`  ❌ insert guide:`, errG.message); return }
  console.log(`  ✓ guide ${guide.id}`)

  // 3. Insert étapes
  const etapes = parsed.sections.map((s, i) => ({
    guide_id: guide.id,
    ordre: i + 1,
    titre: s.titre,
    contenu: s.contenu,
  }))
  const { error: errE } = await sb.from('etapes_formation').insert(etapes)
  if (errE) { console.error(`  ❌ insert etapes:`, errE.message); return }
  console.log(`  ✓ ${etapes.length} étapes`)

  // 4. Insert quiz
  const questions = QUIZ[meta.poste] ?? []
  const quizRows = questions.map((q, i) => ({
    guide_id: guide.id,
    ordre: i + 1,
    question: q.q,
    choix: q.choix,
    bonne_reponse_idx: q.bonne,
    explication: q.ex,
  }))
  if (quizRows.length > 0) {
    const { error: errQ } = await sb.from('quiz_questions').insert(quizRows)
    if (errQ) { console.error(`  ❌ insert quiz:`, errQ.message); return }
    console.log(`  ✓ ${quizRows.length} questions`)
  }
}

// ─── Run ─────────────────────────────────────────────────────────────
console.log('🌱 Seed Module 27 — Formations\n')
console.log(`URL : ${SUPABASE_URL}`)

for (const m of MANUELS) {
  try { await seedGuide(m) }
  catch (e) { console.error(`  ❌ ${m.titre}:`, e.message) }
}

const { count: nbG } = await sb.from('guides_formation').select('id', { count: 'exact', head: true })
const { count: nbE } = await sb.from('etapes_formation').select('id', { count: 'exact', head: true })
const { count: nbQ } = await sb.from('quiz_questions').select('id', { count: 'exact', head: true })
console.log(`\n✅ Done. ${nbG} guides · ${nbE} étapes · ${nbQ} questions`)
process.exit(0)
