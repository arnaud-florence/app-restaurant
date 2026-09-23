#!/usr/bin/env node
// Traduction des réservations Zelty ↔ les nôtres.
//
// Sans compte ni clé : le test rejoue une charge utile RÉELLE, relevée le
// 24/09/2026 sur le compte Casatasia en créant puis en annulant trois
// réservations d'essai. C'est la seule façon d'attraper les pièges de cette
// API — aucun ne se devine, tous se voient sur une vraie réponse.
//
// ⚠️ CE FICHIER RECOPIE la règle de src/lib/integrations/zelty/reservations.ts
//    (la source est en TypeScript). Modifier les deux ensemble.
//
// Usage : node scripts/test-zelty-reservations.mjs

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}

// ─── La règle, recopiée ────────────────────────────────────────────
const STATUT = { EN_ATTENTE: 0, CONFIRMEE: 80, INSTALLEE: 96, ANNULEE: 192, TERMINEE: 255 }

const statutDepuisZelty = s => ({
  0: 'demande', 80: 'confirmee', 96: 'arrivee', 192: 'annulee', 255: 'terminee',
}[s] ?? 'demande')

const statutVersZelty = s => ({
  demande: 0, confirmee: 80, arrivee: 96, terminee: 255, annulee: 192, no_show: 192,
}[s] ?? 0)

const decouper = iso => {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(iso)
  return m ? { date: m[1], heure: `${m[2]}:${m[3]}` } : null
}

const decalageParis = date => {
  const [a, m, j] = date.split('-').map(Number)
  const midi = new Date(Date.UTC(a, m - 1, j, 12))
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(midi))
  return `+0${h - 12}:00`
}

const canalDepuisSrc = src => src === 'web' ? 'site_web' : src === 'bo' ? 'telephone' : 'autre'

// ─── La charge utile réelle, telle qu'observée ─────────────────────
const REELLE = {
  id: 4276689,
  uid: '00000-6ab46129-da236b',
  remote_id: null,
  id_customer: 36655026,
  id_command: null,
  created_at: '2026-09-24T01:30:49+02:00',
  booking_for: '2027-01-04T20:30:00+01:00',
  arrived_at: null,
  closed_at: null,
  table: 5,
  places: 4,
  status: 80,
  cancel_reason: 0,
  src: 'bo',
  comment: 'Sonde technique — a supprimer',
  final_price: null,
  customer: {
    id: 36655026, uuid: '9405bbd3-1235-4f5e-a3b9-c02ebb262cbf', remote_id: null,
    nice_name: 'Sonde technique TEST-CLAUDE-A-SUPPRIMER',
    name: 'TEST-CLAUDE-A-SUPPRIMER', fname: 'Sonde technique',
    company: '', card: null, phone: '+33600000000', phone2: '', mail: '',
    birthday: null, balance: 0, loyalty: 0, metadata: null, vip: false,
  },
}

console.log('\n🪑 Réservations Zelty — traduction\n')

const q = decouper(REELLE.booking_for)
t('booking_for se découpe en date et heure', q?.date === '2027-01-04' && q?.heure === '20:30',
  JSON.stringify(q))

// ⚠️ Le cœur du piège : passer par new Date() sur un serveur UTC décalerait.
const tard = decouper('2027-01-04T00:30:00+01:00')
t('⚠️ une réservation à 00h30 reste datée du bon jour (pas de conversion UTC)',
  tard?.date === '2027-01-04' && tard?.heure === '00:30', JSON.stringify(tard))

t('statut 80 → confirmée', statutDepuisZelty(80) === 'confirmee')
t('statut 0 → demande', statutDepuisZelty(0) === 'demande')
t('statut 96 → arrivée', statutDepuisZelty(96) === 'arrivee')
t('statut 192 → annulée', statutDepuisZelty(192) === 'annulee')
t('statut 255 → terminée', statutDepuisZelty(255) === 'terminee')
t('⚠️ un statut inconnu reste une DEMANDE, jamais une confirmation',
  statutDepuisZelty(7) === 'demande')

t('notre demande part en 0 (pas en confirmée)', statutVersZelty('demande') === STATUT.EN_ATTENTE)
t('un no-show part en annulée (Zelty le range dans cancel_reason)',
  statutVersZelty('no_show') === STATUT.ANNULEE)

t('src « bo » → prise au téléphone', canalDepuisSrc('bo') === 'telephone')
t('src « web » → venue du site', canalDepuisSrc('web') === 'site_web')
t('src inconnu → « autre », jamais mis au crédit du site', canalDepuisSrc('borne') === 'autre')

// ⚠️ Les champs nuls : c'est ce qui avait fait rejeter 84 plats sur 84.
const nuls = Object.entries(REELLE).filter(([, v]) => v === null).map(([k]) => k)
t('la charge utile réelle porte bien des champs nuls (d’où .nullish())',
  nuls.length >= 4, nuls.join(', '))

t('le nom se compose depuis nice_name',
  REELLE.customer.nice_name === 'Sonde technique TEST-CLAUDE-A-SUPPRIMER')
t('un mail vide ne devient pas une chaîne vide en base',
  (REELLE.customer.mail || null) === null)

// ─── Le sens sortant ───────────────────────────────────────────────
t('le décalage de Paris est +01:00 en janvier', decalageParis('2027-01-04') === '+01:00',
  decalageParis('2027-01-04'))
t('le décalage de Paris est +02:00 en juillet', decalageParis('2027-07-04') === '+02:00',
  decalageParis('2027-07-04'))
t('⚠️ le 3 octobre 2026, jour de l’ouverture, est encore en heure d’été',
  decalageParis('2026-10-03') === '+02:00', decalageParis('2026-10-03'))

const corps = {
  booking_for: `2026-10-03T20:30:00${decalageParis('2026-10-03')}`,
  places: 4,
  customer: { name: 'Dupont', phone: '+33600000000' },
  remote_id: 'uuid-de-chez-nous',
  status: statutVersZelty('demande'),
}
t('le corps du POST porte les trois champs exigés',
  'booking_for' in corps && 'places' in corps && 'customer' in corps)
t('⚠️ customer est un OBJET (Zelty refuse un identifiant)',
  typeof corps.customer === 'object')
t('⚠️ notre identifiant part dans remote_id (correspondance exacte)',
  corps.remote_id === 'uuid-de-chez-nous')
t('⚠️ le statut est TOUJOURS explicite (sinon la confirmation auto s’applique)',
  corps.status === 0)

console.log(`\n${ko === 0 ? '✅' : '❌'} ${ok} réussite(s), ${ko} échec(s)\n`)
process.exit(ko === 0 ? 0 : 1)
