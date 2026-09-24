#!/usr/bin/env node
// Le Z de la caisse — troisième témoin du rapprochement.
//
// Sans compte ni clé. La forme vient de la référence officielle
// (docs.zelty.fr, section Closures, lue le 24/09/2026).
//
// ⚠️ CE FICHIER RECOPIE la règle de src/lib/integrations/zelty/clotures.ts
//    (la source est en TypeScript). Modifier les deux ensemble.
//
// Usage : node scripts/test-zelty-clotures.mjs

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}

const centimesEnEuros = n => Math.round(n ?? 0) / 100

function normaliser(c) {
  const date = (c.date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, motif: `clôture ${c.id ?? '?'} sans date exploitable` }
  return {
    ok: true,
    cloture: {
      id_externe: String(c.id ?? ''),
      date,
      ca_ttc: centimesEnEuros(c.turnover),
      taxes: centimesEnEuros(c.taxes),
      commentaire: (c.comment ?? '').trim() || null,
    },
  }
}

function agregerParJour(list) {
  const m = new Map()
  for (const c of list) {
    const e = m.get(c.date) ?? { ids: [], ca_ttc: 0, taxes: 0, commentaires: [] }
    e.ids.push(c.id_externe)
    e.ca_ttc = Math.round((e.ca_ttc + c.ca_ttc) * 100) / 100
    e.taxes = Math.round((e.taxes + c.taxes) * 100) / 100
    if (c.commentaire) e.commentaires.push(c.commentaire)
    m.set(c.date, e)
  }
  return m
}

console.log('\n🧾 Clôtures de caisse — le Z\n')

// ⚠️ Le piège central : les montants sont en CENTIMES.
const brut = { id: 991, id_restaurant: 10445, date: '2026-10-03',
               turnover: 128450, taxes: 11680, comment: null }
const n = normaliser(brut)
t('une clôture se lit', n.ok)
t('⚠️ 128450 centimes deviennent 1284,50 €', n.ok && n.cloture.ca_ttc === 1284.5,
  String(n.ok && n.cloture.ca_ttc))
t('⚠️ la TVA aussi : 11680 → 116,80 €', n.ok && n.cloture.taxes === 116.8,
  String(n.ok && n.cloture.taxes))
t('⚠️ sans conversion, l’écart serait faux d’un facteur cent',
  n.ok && n.cloture.ca_ttc !== brut.turnover)

t('une clôture SANS DATE est écartée, pas rattachée au hasard',
  normaliser({ id: 1, turnover: 100 }).ok === false)
t('une date ISO complète est ramenée au jour',
  normaliser({ id: 2, date: '2026-10-03T23:59:00+02:00', turnover: 0 }).cloture.date === '2026-10-03')
t('un commentaire vide ne devient pas une chaîne vide',
  normaliser({ id: 3, date: '2026-10-03', comment: '   ' }).cloture.commentaire === null)
t('un turnover absent vaut zéro euro, pas NaN',
  normaliser({ id: 4, date: '2026-10-03' }).cloture.ca_ttc === 0)

// ⚠️ Deux clôtures le même jour : une caisse fermée deux fois, ou deux caisses.
const deux = agregerParJour([
  { id_externe: '1', date: '2026-10-03', ca_ttc: 800.25, taxes: 72.75, commentaire: 'midi' },
  { id_externe: '2', date: '2026-10-03', ca_ttc: 484.25, taxes: 44.05, commentaire: 'soir' },
])
const jour = deux.get('2026-10-03')
t('deux clôtures du même jour s’additionnent', jour.ca_ttc === 1284.5, String(jour.ca_ttc))
t('la TVA s’additionne aussi', jour.taxes === 116.8, String(jour.taxes))
t('⚠️ les deux identifiants sont gardés', jour.ids.join(',') === '1,2')
t('⚠️ n’en garder qu’une inventerait un écart',
  jour.ca_ttc !== 800.25 && jour.ca_ttc !== 484.25)
t('les commentaires sont conservés', jour.commentaires.join('+') === 'midi+soir')

// L'addition ne doit pas dériver en virgule flottante.
const centimes = agregerParJour(
  Array.from({ length: 10 }, (_, i) => ({ id_externe: String(i), date: '2026-10-04', ca_ttc: 0.1, taxes: 0, commentaire: null })),
)
t('⚠️ dix fois 0,10 € font bien 1,00 € (pas 0,9999999)',
  centimes.get('2026-10-04').ca_ttc === 1, String(centimes.get('2026-10-04').ca_ttc))

// L'écart avec ce que nous avons reçu.
const ecart = (z, recu) => Math.round((z - recu) * 100) / 100
t('un Z égal aux tickets reçus ne fait aucun écart', ecart(1284.5, 1284.5) === 0)
t('⚠️ un Z supérieur signale des tickets JAMAIS reçus', ecart(1284.5, 1200) === 84.5)
t('le seuil de 5 centimes écarte les arrondis', Math.abs(ecart(1284.5, 1284.47)) < 0.05)

console.log(`\n${ko === 0 ? '✅' : '❌'} ${ok} réussite(s), ${ko} échec(s)\n`)
process.exit(ko === 0 ? 0 : 1)
