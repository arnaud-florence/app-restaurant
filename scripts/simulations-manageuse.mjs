// Les simulations des guides de niveau 2 du parcours Manageuse.
//
//   node scripts/simulations-manageuse.mjs [--ecrire]
//
// Un guide de niveau 2 s'annonce « 🎯 Pratique — je m'entraîne » sur sa
// carte, et le module 27 attend qu'il porte une SIMULATION : des situations
// concrètes où l'on choisit, avec l'explication qui suit.
//
// ⚠️ Neuf guides de niveau 2 n'en avaient aucune — les cinq du parcours
// achats et caisse créés les 28/09, mais aussi « Manageuse 4 » et
// « Manageuse 5 », rouges depuis leur création. La carte promettait un
// entraînement qui n'existait pas.
//
// ⚠️ Les situations ne sont pas des redites du quiz : le quiz VÉRIFIE qu'on
// a lu, la simulation met devant un écran un jour de service. « Tu ouvres le
// réassort à 6 h et tu vois… » — c'est le moment où l'erreur se produit
// vraiment.

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

const S = (situation, choix, bonne_reponse, explication) => ({ situation, choix, bonne_reponse, explication })

const SIMULATIONS = {
  'Manageuse 4': { titre: 'Une matinée au comptoir', scenarios: [
    S("6 h 20, tu ouvres. Le KDS affiche une commande web de la veille, encore en préparation. Que fais-tu ?",
      ["Tu la supprimes, elle est périmée", "Tu la traites : une commande ONLINE est réelle depuis le 22 août", "Tu attends que le client appelle"], 1,
      "Toute commande du site est une vraie commande. Il n'y a plus de commandes de test sur le circuit réel."),
    S("Il ne reste plus de croissants à 11 h. Où le déclares-tu ?",
      ["Sur la caisse", "Dans (ops)/ruptures, un appui sur la tablette", "Tu préviens l'équipe de vive voix"], 1,
      "Deux secondes, sinon ce ne sera pas fait — et on continuera de vendre en ligne ce qu'on n'a plus. La rupture se périme d'elle-même le lendemain."),
    S("À la fermeture, il reste six parts de flan. Que fais-tu ?",
      ["Rien, elles seront vendues demain", "Tu les comptes dans (ops)/invendus", "Tu les notes sur un carnet"], 1,
      "C'est la casse qui manquait au food cost, et la synthèse 7 jours sert à régler les commandes."),
  ]},
  'Manageuse 5': { titre: 'Trois écrans où l’erreur ressemble à une réussite', scenarios: [
    S("Tu valides les allergènes d'une famille de viennoiseries sans avoir lu les emballages. Que viens-tu d'affirmer ?",
      ["Que tu as vérifié ce qui est coché", "Que la liste est COMPLÈTE — donc qu'un croissant ne contient pas de lait", "Rien, c'est un brouillon"], 1,
      "Valider affirme l'exhaustivité, nominativement. Sans l'emballage sous les yeux, la seule déclaration honnête est « on ne sait pas »."),
    S("Tu scannes une facture Gineys. Que peut-elle écrire toute seule ?",
      ["Rien, tu relis avant", "Les prix d'achat des produits qu'elle reconnaît", "Uniquement le total"], 1,
      "Un scan propage les prix. Le croissant à 40 € du 22 août venait de là : le prix du carton écrit sur la pièce."),
    S("Tu corriges un prix dans une fiche produit et tu le pousses vers la caisse. Quel est le risque ?",
      ["Aucun, c'est une simple mise à jour", "L'écriture est un upsert : un champ manquant écrase le prix du ticket", "Le produit peut disparaître du site"], 1,
      "C'est ce qui s'imprime sur les tickets et fait foi fiscalement. On relit, on recopie, on refuse s'il manque un champ."),
  ]},
  'Manageuse 6': { titre: 'Lire un prix au catalogue', scenarios: [
    S("Le jambon est à 6,89 € chez Félix Potin (devis) et 8,28 € chez Gineys (facture). Tu prépares la commande. Sur quoi t'appuies-tu ?",
      ["6,89 € : c'est le moins cher", "8,28 € est ce qu'on PAIE ; 6,89 € reste à confirmer à la première facture", "Sur la moyenne des deux"], 1,
      "Une facture est une preuve, un devis une proposition. L'écart est réel mais il ne devient vrai qu'à la livraison."),
    S("Tu saisis le prix d'un carton de 96 croissants facturé 28,84 €. Que tapes-tu dans « prix d'achat » ?",
      ["28,84 €", "0,30 € — le prix d'une pièce", "96 × 28,84 €"], 1,
      "Le prix saisi est celui de l'unité vendue. 28,84 écrit tel quel a donné un croissant à 40 € de coût."),
    S("2 889 références portent « Tarif public — remise à demander ». Que conclus-tu ?",
      ["La remise a été refusée", "Personne ne l'a encore demandée — c'est le gisement de l'écran", "Ce sont des produits qu'on n'achète pas"], 1,
      "Mesuré : le portail applique notre remise aux articles du contrat, et le prix public à tout le reste. Il suffit d'écrire."),
  ]},
  'Manageuse 7': { titre: 'Désigner le moins cher sans se tromper', scenarios: [
    S("Une ligne est grise, marquée « non comparable ». Que sais-tu de son prix ?",
      ["Il est plus élevé que les autres", "Rien : on ne sait pas le ramener à la même unité", "Il n'a pas été communiqué"], 1,
      "Gris ne veut pas dire cher. Le colorer en rouge laisserait croire le contraire."),
    S("Un jambon en pièce entière est à 9 €/kg, notre jambon tranché à 8,28 €. Bonne affaire ?",
      ["Oui, à peine plus cher", "Non : le travail de tranchage reste à faire, ce n'est pas le même produit", "Oui si on prend plus de 8 kg"], 1,
      "Le travail change le produit. C'est pour ça que rien n'est rapproché automatiquement."),
    S("La mayonnaise ressort à −58 %. Que vérifies-tu avant de basculer ?",
      ["Rien, 58 % ne se discute pas", "Le conditionnement et les quantités réelles", "L'ancienneté du devis seulement"], 1,
      "C'est un seau de 4,65 kg contre une bouteille de 920 g : l'économie suppose de reconditionner, et sur trois bouteilles par mois elle ne paie pas l'ouverture d'un compte."),
  ]},
  'Manageuse 8': { titre: 'Le comptage du matin', scenarios: [
    S("À l'inventaire, le congélateur contient des pâtons servant à quatre produits différents. Combien de lignes comptes-tu ?",
      ["Quatre, une par produit", "Une seule : on compte la MATIÈRE", "Aucune, les pâtons ne se stockent pas"], 1,
      "On compte ce qu'on achète, pas ce qu'on vend. Les ventes s'additionnent ensuite sur la matière."),
    S("Le jambon tranché n'affiche aucun stock théorique, seulement les entrées. Pourquoi ?",
      ["Il n'a jamais été compté", "La caisse ignore combien de tranches sont parties dans les sandwichs", "Son prix est estimé"], 1,
      "Les sorties ne sont connues que pour ce qui est revendu tel quel. Mieux vaut pas de chiffre qu'un chiffre faux."),
    S("Tu comptes 105 demis là où l'outil en attendait 120. Que fais-tu ?",
      ["Tu corriges le rendement du fût", "Tu saisis 105 : l'écart est la démarque, et c'est une information", "Tu recomptes jusqu'à tomber sur 120"], 1,
      "Les rendements sont arithmétiques exprès. La mousse et les purges se lisent dans l'écart, et se règlent au tirage."),
  ]},
  'Manageuse 9': { titre: 'Préparer la commande du matin', scenarios: [
    S("Une ligne affiche « seuil 2 kg · cible 8 kg » et un stock de 1 kg. Que va-t-on commander ?",
      ["2 kg, pour repasser le seuil", "7 kg, pour retrouver la cible", "8 kg, la cible entière"], 1,
      "Le seuil déclenche, la cible dimensionne. On complète jusqu'à la cible."),
    S("Le dernier comptage d'une référence date de cinq semaines. Qu'en fait l'écran ?",
      ["Il l'utilise, c'est le dernier connu", "Il le signale en rouge et le traite comme inconnu", "Il le supprime"], 1,
      "Au-delà de 30 jours un comptage ne décrit plus rien. On signale, on ne masque pas."),
    S("Une ligne bascule chez un nouveau fournisseur et part SANS prix. Faut-il le saisir à la main ?",
      ["Oui, sinon le bon est incomplet", "Non : notre conditionnement n'est pas le sien, un prix converti de tête serait faux", "Oui, en prenant le prix du devis"], 1,
      "Un faux prix ne se signale pas, il se découvre à la facture. Le bon affiche « tarif à confirmer »."),
  ]},
  'Manageuse 11': { titre: 'Où saisit-on quoi', scenarios: [
    S("Zelty propose un module de gestion des stocks. On l'utilise ?",
      ["Oui, tout au même endroit", "Non : rien n'en ressort par l'API, les données y seraient prisonnières", "Oui, pour les boissons seulement"], 1,
      "Ni lisible par l'outil, ni exportable au comptable, ni utilisable pour le food cost. Un aller sans retour."),
    S("Tu veux savoir combien le Fournil a fait hier, séparément du bar. Où regardes-tu ?",
      ["Dans les statistiques de la caisse", "Dans l'outil : la caisse ne ventile jamais par activité", "Sur le Z de clôture"], 1,
      "Zelty ventile par sur place / emporter / livraison. Le rattachement par activité se fait chez nous, sur la ligne de vente."),
  ]},
  'Manageuse 12': { titre: 'Qui décide de quoi', scenarios: [
    S("Tu désactives un produit dans l'outil. Vingt minutes plus tard il est réactivé. Que s'est-il passé ?",
      ["Quelqu'un l'a rallumé", "Le miroir a relu la caisse, où le plat était encore allumé", "La base a été restaurée"], 1,
      "La caisse est maîtresse de cet interrupteur. On l'éteint là-bas d'abord, chez nous ensuite."),
    S("Le même éclair se vend 3,20 € au comptoir et 5,50 € à table. Comment apparaît-il sur la caisse ?",
      ["Un bouton, deux prix", "Deux boutons portant des NOMS différents", "Un bouton et une remise"], 1,
      "Deux boutons du même nom et l'équipe tape au jugé. C'est `nom_caisse` qui porte le libellé du bouton."),
    S("Tu viens de pousser huit nouveaux produits vers la caisse. Que reste-t-il à faire ?",
      ["Rien, ils sont en vente", "Les ranger dans une famille — sinon ce sont des boutons introuvables", "Vérifier le stock"], 1,
      "L'import crée les plats à plat. C'est arrivé aux huit desserts le 28 septembre."),
  ]},
  'Manageuse 14': { titre: 'Un chiffre qui ne tombe pas', scenarios: [
    S("Le rapprochement d'hier dit « incomplet ». Que sais-tu ?",
      ["Le montant est faux", "Le montant est juste, mais on ignore ce qui a été vendu", "Des tickets manquent"], 1,
      "Stock, food cost et marges restent aveugles sur ces tickets. Vécu sur deux paiements à montant libre tapés à l'ouverture."),
    S("Un écart apparaît sur la journée EN COURS. Première réaction ?",
      ["Prévenir le comptable", "Attendre : le rapprochement part d'hier, la journée en cours donne toujours un faux écart", "Recompter la caisse"], 1,
      "C'est le faux positif le plus fréquent."),
    S("Le Z de la caisse est supérieur à la somme des tickets reçus. Que conclus-tu ?",
      ["La caisse s'est trompée", "Il manque des tickets chez nous", "Le Z inclut les pourboires"], 1,
      "Reçu et compris viennent du même flux : seul le Z, indépendant, peut révéler un ticket qui n'est jamais arrivé."),
  ]},
}

const guides = await sb('guides_formation?poste=eq.manager&select=id,titre,niveau,seuil_reussite_pct,simulation_config')
const plan = []
for (const g of guides) {
  const cle = Object.keys(SIMULATIONS).find(k => g.titre.startsWith(k + ' '))
  if (!cle) continue
  if (g.simulation_config) { continue }
  plan.push({ g, cfg: { type: 'scenario_qcm', titre: SIMULATIONS[cle].titre, scenarios: SIMULATIONS[cle].scenarios } })
}

console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'}\n`)
const n2 = guides.filter(g => g.niveau === 2)
console.log(`  ${n2.length} guides de niveau 2 · ${n2.filter(g => g.simulation_config).length} avec simulation avant\n`)
for (const p of plan) console.log(`  + ${p.g.titre.slice(0, 58).padEnd(60)} ${p.cfg.scenarios.length} scénarios`)
const orphelins = n2.filter(g => !g.simulation_config && !plan.some(p => p.g.id === g.id))
if (orphelins.length) console.log(`\n  ⚠️ toujours sans simulation : ${orphelins.map(g => g.titre).join(', ')}`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
for (const p of plan) await sb(`guides_formation?id=eq.${p.g.id}`, { method: 'PATCH', body: JSON.stringify({ simulation_config: p.cfg }) })
console.log(`\n✅ ${plan.length} simulation(s) posée(s).`)
