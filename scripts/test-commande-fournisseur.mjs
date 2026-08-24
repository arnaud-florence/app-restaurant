// Test — logique pure de la commande conseillée (src/lib/commande-fournisseur.ts).
// Node charge le TS directement (comme test-achat-revente).

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

const { extraireConditionnement, suggererCommande, nomsCorrespondent } =
  await import('../src/lib/commande-fournisseur.ts')

// ─── Conditionnement ─────────────────────────────────────────────────
check('C=96 simple', extraireConditionnement('CROISSANT PREPOUSSE 70G AUDACIEUX C=96') === 96)
check('C=25 en fin de libellé', extraireConditionnement('BAGUETTE CAMPESTRE 51CM ARTIPAT C=25') === 25)
check('C=5X1KG rejeté (multiplicateur collé)', extraireConditionnement('POULET ROTI HALAL C=5X1KG') === null)
check('C=10X1KG rejeté', extraireConditionnement('FARINE DE BLE T55 C=10X1KG') === null)
check('C=6 X 500 rejeté (multiplicateur espacé)', extraireConditionnement('SERVIETTE SNACK C=6 X 500') === null)
check('sans C= → null', extraireConditionnement('BEURRE DOUX ROULEAU 1KG') === null)
check('C=1 rejeté (pas un colis)', extraireConditionnement('TRUC C=1') === null)

// Formats Brake, sans « C= » : nombre + mot dénombrable
check('« 100 capsules » → 100', extraireConditionnement('Kit complet café Lavazza blue (100 capsules gobelets)') === 100)
check('« Carton de 50 dosettes » → 50', extraireConditionnement('Carton de 50 dosettes chocolat Blue') === 50)
check('« 150 » seul, sans mot d\'unité → null', extraireConditionnement('Dosette Thé menthé 150') === null)
check('« 90G » n\'est pas un conditionnement', extraireConditionnement('COULANT GOURMAND AU CHOCOLAT 90G CARIGEL') === null)
check('« 33 cl » n\'est pas un conditionnement', extraireConditionnement('COCA COLA 33 cl') === null)

// ─── Suggestion ──────────────────────────────────────────────────────
// 14 croissants/j vendus, pas de casse, colis de 96, couvrir 7 j :
// 14×7×1,1 = 107,8 → 108 pièces → 2 colis (192 livrées)
const s1 = suggererCommande({ ventesPeriode: 196, cassePeriode: 0, joursObserves: 14, joursACouvrir: 7, conditionnement: 96 })
check('cas nominal : 108 pièces → 2 colis', s1.pieces === 108 && s1.colis === 2 && s1.piecesLivrees === 192 && !s1.surCommande)

// Casse élevée (3/j jetés pour 10/j vendus = 30 %) : sécurité coupée,
// arrondi au colis INFÉRIEUR — le terrain dit déjà « trop ».
const s2 = suggererCommande({ ventesPeriode: 140, cassePeriode: 42, joursObserves: 14, joursACouvrir: 3, conditionnement: 20 })
check('casse 30 % : signal surCommande', s2.surCommande)
check('casse 30 % : 30 pièces → 1 colis (floor, pas ceil)', s2.pieces === 30 && s2.colis === 1)

// Jamais 0 colis quand il se vend quelque chose (floor plancher à 1)
const s3 = suggererCommande({ ventesPeriode: 14, cassePeriode: 7, joursObserves: 14, joursACouvrir: 2, conditionnement: 90 })
check('petit volume + casse : plancher à 1 colis', s3.colis === 1)

// Conditionnement inconnu : pièces seules
const s4 = suggererCommande({ ventesPeriode: 28, cassePeriode: 0, joursObserves: 14, joursACouvrir: 3, conditionnement: null })
check('sans colisage : pièces calculées, colis null', s4.pieces === 7 && s4.colis === null)

// Produit qui ne se vend pas : zéro partout
const s5 = suggererCommande({ ventesPeriode: 0, cassePeriode: 0, joursObserves: 14, joursACouvrir: 7, conditionnement: 12 })
check('aucune vente : 0 pièce, 0 colis', s5.pieces === 0 && s5.colis === 0)

// ─── Rapprochement de noms ───────────────────────────────────────────
check('« CROISSANT PREPOUSSE… » ↔ « Croissant »',
  nomsCorrespondent('CROISSANT PREPOUSSE 70G AUDACIEUX C=96', 'Croissant'))
check('accents ignorés : « ECLAIR » ↔ « Éclair »',
  nomsCorrespondent('ECLAIR CHOCOLAT ARTISANAL C=12', 'éclair chocolat'))
check('nom trop court (< 4) rejeté', !nomsCorrespondent('THE VERT SAC=1KG', 'Thé'))

console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
