// Comment un mode de règlement se lit — et surtout ce qu'il NE doit pas dire.
// ⚠️ Il RECOPIE la règle de src/lib/paiements.ts ; modifier les deux ensemble.
let ok = 0, ko = 0
const t = (nom, cond) => { if (cond) { ok++; console.log('  ✓', nom) } else { ko++; console.log('  ✗', nom) } }

const lire = (mode) => {
  const v = String(mode ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim()
  if (!v) return { cle: 'inconnu', libelle: 'Non ventilé', encaisse: null }
  if (/compte|ardoise/.test(v)) return { cle: 'en_compte', libelle: 'En compte', encaisse: false }
  if (/cash|espece|liquide/.test(v)) return { cle: 'especes', libelle: 'Espèces', encaisse: true }
  if (/pos|carte|\bcb\b|card|tpe|bank/.test(v)) return { cle: 'carte', libelle: 'Carte', encaisse: true }
  if (/ticket|resto|swile|edenred|\btrd?\b/.test(v)) return { cle: 'ticket_resto', libelle: 'Ticket restaurant', encaisse: true }
  if (/cheque|chèque/.test(v)) return { cle: 'cheque', libelle: 'Chèque', encaisse: true }
  if (/virement|transfer/.test(v)) return { cle: 'virement', libelle: 'Virement', encaisse: true }
  if (/online|en.?ligne|web|stripe|paypal/.test(v)) return { cle: 'en_ligne', libelle: 'En ligne', encaisse: true }
  if (v === 'caisse_agreee') return { cle: 'inconnu', libelle: 'Non ventilé', encaisse: null }
  return { cle: v, libelle: v, encaisse: null }
}

console.log('\n— ce qui est encaissé —')
t('espèces', lire('cash').cle === 'especes' && lire('cash').encaisse === true)
// ⚠️ Le libellé EXACT du mode dans la caisse, accent compris. C'est cette
// assertion qui a trouvé que `/espece/` ne matche pas « espèces ».
t('« Espèces » accentué, le libellé réel de la caisse', lire('Espèces').cle === 'especes')
t('« Chèque » accentué aussi', lire('Chèque').cle === 'cheque')
t('carte', lire('pos').cle === 'carte' && lire('pos').encaisse === true)
t('Carte bancaire', lire('Carte bancaire').cle === 'carte')
t('ticket restaurant', lire('Ticket Restaurant').cle === 'ticket_resto')

console.log('\n— ⚠️ ce qui N\'EST PAS encaissé : une vente à crédit —')
t('« Compte client » → en compte', lire('Compte client').cle === 'en_compte')
t('« En compte » → en compte', lire('En compte').cle === 'en_compte')
t('« Ardoise » → en compte', lire('Ardoise').cle === 'en_compte')
t('et l\'argent N\'est PAS rentré', lire('Compte client').encaisse === false)

console.log('\n— ⚠️⚠️ L\'ORDRE DES TESTS : « À crédit » ne doit JAMAIS être de la carte —')
// `credit` est reconnu par la branche carte. Si la branche compte passait
// après, « À crédit » serait ingéré comme payé par carte — exactement
// l'inverse de la vérité, sans aucune erreur pour le dire.
t('« Compte crédit client » → en compte, pas carte', lire('Compte crédit client').cle === 'en_compte')
// Et on ne reconnaît PAS `credit` seul : « Credit Card » EST une carte.
t('« Credit Card » reste une carte', lire('Credit Card').cle === 'carte')

console.log('\n— ⚠️⚠️ UNE ABSENCE N\'EST PAS DE LA CARTE (le défaut du 14/10/2026) —')
// business-live faisait `else carte += montant` : 2 253,80 € sur 4 610 €
// s'affichaient en carte alors que leur mode est `caisse_agreee`.
t('caisse_agreee → non ventilé', lire('caisse_agreee').cle === 'inconnu')
t('caisse_agreee n\'est PAS de la carte', lire('caisse_agreee').cle !== 'carte')
t('et on ne prétend pas savoir', lire('caisse_agreee').encaisse === null)
t('mode nul → non ventilé', lire(null).cle === 'inconnu' && lire(null).encaisse === null)
t('mode vide → non ventilé', lire('   ').cle === 'inconnu')
t('un mode inconnu ne devient jamais encaissé', lire('xyz-inconnu').encaisse === null)

console.log('\n— la source TS et cette recopie disent la même chose —')
const src = (await import('node:fs')).readFileSync('src/lib/paiements.ts', 'utf8')
t('compte|ardoise passe AVANT la carte dans la lib',
  src.indexOf('compte|ardoise') < src.indexOf('pos|carte'))
t('la lib ne classe pas `credit` en vente à crédit',
  !/compte\|ardoise\|credit/.test(src))
t('la lib retire les accents avant de tester',
  /normalize\('NFD'\)/.test(src))
t('caisse_agreee rendu `null`, jamais `true`',
  /caisse_agreee[\s\S]{0,120}encaisse: null/.test(src))

console.log(`\n${ok} ✓  ${ko} ✗`)
process.exit(ko ? 1 : 0)
