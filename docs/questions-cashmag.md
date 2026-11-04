# Commande et paiement en ligne — ce que nous devons savoir de Cash Mag

CASATASIA · Parking des Ferrages, 83136 Sainte-Anastasie-sur-Issole
Document de travail, à envoyer à l'intégrateur. Mis à jour le 04/11/2026.

## Le besoin, en une phrase

Nos clients commandent et **paient leurs pizzas sur casatasia.fr**. La commande
doit arriver **dans la caisse, déjà réglée**, et sortir au poste Pizza comme
n'importe quel ticket du comptoir.

⚠️ Ce qui est non négociable, et pourquoi : **la caisse est la source légale
(NF525)**. Un paiement encaissé par le site sans être repris dans la caisse
produit un chiffre d'affaires parallèle sans valeur fiscale, qu'il faut ensuite
rapprocher à la main chaque jour. Nous ne brancherons donc pas le paiement en
ligne avant que le premier point ci-dessous ait une réponse.

## 1. Recevoir une commande déjà payée — LA question bloquante

- Existe-t-il une **API pour créer une commande** dans la caisse depuis notre
  site ? Si oui : URL de base, version, authentification, documentation.
- Peut-on y joindre **le règlement** (« commande déjà encaissée en ligne »), et
  sous quel **libellé exact de mode de paiement** ? Ce libellé doit être créé
  dans la caisse au préalable.
- Que se passe-t-il si le **total que nous envoyons diffère** de celui que la
  caisse recalcule : rejet, ou acceptation silencieuse avec remise ?
  *(Nous avons besoin d'un rejet. Une acceptation silencieuse fait fuir la
  marge sur chaque commande, invisiblement.)*
- Y a-t-il une **idempotence** : si nous renvoyons la même commande après un
  délai d'attente, est-elle créée deux fois ? Peut-on fournir notre propre
  identifiant pour l'éviter ?
- La commande peut-elle porter une **heure de retrait** et partir
  automatiquement **en production** au poste Pizza ?

## 2. Identifier les produits

- Pouvons-nous stocker **notre propre code produit** dans une fiche de la
  caisse (un champ libre type « référence externe ») ?
  *(C'est ce qui rend le lien exact et définitif. Sans lui, tout rapprochement
  passe par le libellé — et un libellé qui change coupe la série de ventes en
  deux, sans aucune erreur visible.)*
- Comment lire le **catalogue** (produits, prix, TVA, disponibilité) ? Les prix
  sont-ils en centimes ou en euros ? Les taux de TVA en pourcentage, en
  millièmes, ou par identifiant de taux ?
- Un produit porte-t-il **deux prix** (sur place / à emporter) et **deux taux**
  de TVA ? Nous en avons 21 dans ce cas.

## 3. Les ventes qui redescendent

- Comment récupérons-nous les **tickets encaissés**, avec le **détail des
  lignes** (produit, quantité, prix, TVA) et le **mode de règlement** ?
- Y a-t-il des **webhooks** ? Lesquels, et sont-ils signés ?
- Peut-on lire les **clôtures de caisse (le Z)** par jour ?
- Un ticket peut-il porter un **client** (compte en compte / ardoise) ?

## 4. Les ruptures

- Peut-on marquer un produit **en rupture** depuis l'extérieur, pour qu'il
  cesse d'être vendable en ligne sans disparaître du comptoir ?
- Et lire les ruptures saisies **sur la caisse**, pour que le site arrête de
  les vendre ?

## 5. Le paiement lui-même

- Quel **prestataire de paiement** est prévu ou compatible (le TPE du magasin
  est un **Ingenico du CIC**) ?
- Le règlement en ligne arrive-t-il dans la caisse comme un mode de paiement
  distinct, pour que le **comptage du tiroir** et le Z restent justes ?

## Ce que nous apportons

- **209 produits actifs** prêts à importer, prix et TVA contrôlés, plus 81
  fiches éteintes à conserver sans les mettre en vente ;
- 28 familles, 80 options en 7 groupes, les 14 allergènes réglementaires ;
- un site en production, et un outil de gestion qui garde les stocks, les
  achats et les marges — la caisse n'a pas à les porter.
