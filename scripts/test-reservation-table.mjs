#!/usr/bin/env node
// Réservation de table en ligne — le guichet public.
//
// ⛔ CE TEST N'ENVOIE QUE DES DEMANDES DESTINÉES À ÊTRE REFUSÉES.
//    Une réservation acceptée arrive dans /admin/reservations et notifie le
//    manager : l'équipe ne peut pas distinguer un essai d'un vrai client, et
//    rappellerait quelqu'un qui n'existe pas. Même règle que pour les
//    commandes ONLINE depuis le 22/08/2026.
//    Le chemin qui ACCEPTE est vérifié en pur, sans toucher au réseau.
//
// ⚠️ CE FICHIER RECOPIE la règle de src/lib/reservation-table.ts (la source
//    est en TypeScript). Modifier les deux ensemble.
//
// Usage : PORT=3000 node scripts/test-reservation-table.mjs

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PORT = process.env.PORT
const BASE = PORT ? `http://localhost:${PORT}` : null
const API_KEY = env.PUBLIC_API_KEY

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}

// ─── La règle, recopiée ────────────────────────────────────────────
const HORAIRES = { midi: { debut: '12:00', fin: '14:30' }, soir: { debut: '19:00', fin: '23:00' } }
const DERNIERE_COMMANDE = { soir: '22:30' }
const MARGE_FIN_MIN = 30
const PAS = 15
const COUVERTS_MAX = 12
const SERVICES_PAR_TAG = {
  CUISINE: [{ service: 'midi', jours: [0,1,2,3,4,5,6] }, { service: 'soir', jours: [5,6] }],
  PIZZA:   [{ service: 'soir', jours: [0,1,2,3,4,5,6] }],
}

const min = s => Number(s.split(':')[0]) * 60 + Number(s.split(':')[1] ?? 0)
const hhmm = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`
const derniereArrivee = s => DERNIERE_COMMANDE[s] ?? hhmm(min(HORAIRES[s].fin) - MARGE_FIN_MIN)
const jourDe = d => { const [a,m,j] = d.split('-').map(Number); return new Date(Date.UTC(a,m-1,j)).getUTCDay() }
const servicesDuJour = d => ['midi','soir'].filter(s =>
  Object.values(SERVICES_PAR_TAG).some(cr => cr.some(c => c.service === s && c.jours.includes(jourDe(d)))))
const creneauxDuJour = d => {
  const out = []
  for (const s of servicesDuJour(d))
    for (let x = min(HORAIRES[s].debut); x <= min(derniereArrivee(s)); x += PAS) out.push({ heure: hhmm(x), service: s })
  return out
}

console.log('\n🪑 Réservation de table — la règle\n')

t('la dernière arrivée du soir est l’heure de dernière commande (22h30)',
  derniereArrivee('soir') === '22:30', derniereArrivee('soir'))
t('la dernière arrivée du midi est la fin du service moins 30 min (14h00)',
  derniereArrivee('midi') === '14:00', derniereArrivee('midi'))

// 2026-10-03 est un SAMEDI : brasserie midi + brasserie et pizzeria le soir.
const samedi = '2026-10-03'
t('le 3 octobre 2026 est bien un samedi', jourDe(samedi) === 6, String(jourDe(samedi)))
t('samedi : deux services', servicesDuJour(samedi).join(',') === 'midi,soir', servicesDuJour(samedi).join(','))

// Un mardi : brasserie le midi, pizzeria le soir → deux services aussi.
const mardi = '2026-10-06'
t('mardi : deux services aussi (brasserie midi, pizzeria soir)',
  servicesDuJour(mardi).join(',') === 'midi,soir', servicesDuJour(mardi).join(','))

const cr = creneauxDuJour(samedi)
t('premier créneau à 12h00', cr[0]?.heure === '12:00', cr[0]?.heure)
t('dernier créneau à 22h30', cr[cr.length - 1]?.heure === '22:30', cr[cr.length - 1]?.heure)
t('aucun créneau entre les deux services (15h00 absent)',
  !cr.some(c => c.heure === '15:00'))
t('aucun créneau après la dernière commande (22h45 absent)',
  !cr.some(c => c.heure === '22:45'))
t('aucun créneau la nuit (04h00 absent)', !cr.some(c => c.heure === '04:00'))

// ─── La fenêtre d'ouverture ────────────────────────────────────────
const premiereDate = (ouverte, dateOuverture, aujourdhui) => {
  if (ouverte) return aujourdhui
  if (!dateOuverture) return null
  return dateOuverture > aujourdhui ? dateOuverture : aujourdhui
}
t('salle fermée mais annoncée → on réserve pour le jour d’ouverture',
  premiereDate(false, '2026-10-03', '2026-09-24') === '2026-10-03')
t('salle ouverte → on réserve dès aujourd’hui',
  premiereDate(true, '2026-10-03', '2026-10-10') === '2026-10-10')
t('⚠️ ni ouverte ni annoncée → AUCUNE réservation (le repli est le refus)',
  premiereDate(false, null, '2026-09-24') === null)
t('date d’ouverture passée → on réserve dès aujourd’hui',
  premiereDate(false, '2026-10-03', '2026-11-02') === '2026-11-02')

// ─── L'état réel des modules ───────────────────────────────────────
console.log('\n🔌 Ce que dit la base\n')
const sb = async (chemin) => {
  const r = await fetch(`${SUPA}/rest/v1/${chemin}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  return r.ok ? r.json() : null
}
const mods = await sb('activites_modules?select=cle,actif,date_ouverture_prevue')
const salle = mods?.find(m => m.cle === 'restaurant_salle')
const guichet = mods?.find(m => m.cle === 'reservation_table')
t('le module reservation_table existe', !!guichet)
t('la date d’ouverture est portée par restaurant_salle, pas par le guichet',
  !!salle?.date_ouverture_prevue, `salle=${salle?.date_ouverture_prevue ?? 'aucune'}`)

// La colonne du canal doit exister, sinon chaque demande part en 500.
const canal = await fetch(`${SUPA}/rest/v1/reservations_tables?select=canal&limit=0`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
t('reservations_tables.canal existe (migration 0154)', canal.ok)

// ⚠️ Les colonnes que la route écrit DOIVENT exister : elles ne collaient pas
// au schéma avant le 24/09/2026, et chaque demande repartait en 500.
for (const c of ['client_nom', 'client_email', 'client_telephone', 'nb_personnes', 'date_resa', 'heure_arrivee', 'notes', 'statut']) {
  const r = await fetch(`${SUPA}/rest/v1/reservations_tables?select=${c}&limit=0`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  t(`colonne écrite par la route : ${c}`, r.ok)
}

// ─── Ce que l'API REFUSE ───────────────────────────────────────────
if (!BASE || !API_KEY) {
  console.log('\n(pas de PORT ou de PUBLIC_API_KEY : contrôles HTTP sautés)')
} else {
  console.log('\n🚫 Ce que l’API refuse — aucune demande valide n’est envoyée\n')
  const H = { 'Content-Type': 'application/json', 'x-api-key': API_KEY }

  const g = await fetch(`${BASE}/api/public/reservation-table`, { headers: H })
  const fenetre = g.ok ? await g.json() : null
  t('GET rend la fenêtre de réservation', !!fenetre, `HTTP ${g.status}`)
  if (fenetre?.ouvert) {
    t('GET ne propose aucun horaire hors service',
      fenetre.creneaux.every(c => c.heure >= '12:00' && c.heure <= '22:30'))
  }

  const refuse = async (nom, corps, attendu) => {
    const r = await fetch(`${BASE}/api/public/reservation-table`, {
      method: 'POST', headers: H, body: JSON.stringify(corps),
    })
    const j = await r.json().catch(() => ({}))
    t(nom, r.status === 400, `HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`)
    if (attendu && typeof j.error === 'string') {
      t(`  motif explicite (${attendu})`, j.error.toLowerCase().includes(attendu))
    }
  }

  const socle = { nom: 'NE PAS TRAITER', telephone: '0600000000', email: 'test@example.invalid', nombre_personnes: 2 }

  await refuse('une table pour HIER est refusée',
    { ...socle, date: '2020-01-01', heure: '20:00' }, 'réservation')
  await refuse('une table à 4 h du matin est refusée',
    { ...socle, date: samedi, heure: '04:00' }, 'horaire')
  await refuse('une table à 22h45 est refusée (après la dernière commande)',
    { ...socle, date: samedi, heure: '22:45' }, 'horaire')
  await refuse('une table entre les deux services (15h30) est refusée',
    { ...socle, date: samedi, heure: '15:30' }, 'horaire')
  await refuse(`un groupe de ${COUVERTS_MAX + 8} est refusé (il relève des groupes)`,
    { ...socle, date: samedi, heure: '20:00', nombre_personnes: COUVERTS_MAX + 8 }, 'personnes')
  await refuse('un téléphone absent est refusé',
    { ...socle, telephone: '', date: samedi, heure: '20:00' })

  // Aucune ligne ne doit avoir été créée.
  const lignes = await sb('reservations_tables?select=id,client_nom')
  const fantomes = (lignes ?? []).filter(l => (l.client_nom || '').includes('NE PAS TRAITER'))
  t('⛔ aucune demande de test n’a été enregistrée', fantomes.length === 0, `${fantomes.length} trouvée(s)`)
}

console.log(`\n${ko === 0 ? '✅' : '❌'} ${ok} réussite(s), ${ko} échec(s)\n`)
process.exit(ko === 0 ? 0 : 1)
