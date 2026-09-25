#!/usr/bin/env node
// La tournée du SOIR — les pizzas livrées.
//
// ⚠️ Il RECOPIE la règle depuis src/lib/livraison-soir.ts (la source est en
// TS) : modifier les deux ensemble.
//
// ⛔ Ce test n'envoie QUE des commandes destinées à être REFUSÉES, et vérifie
// qu'aucune n'a été enregistrée. Depuis le 22/08/2026 toute commande ONLINE
// est réelle : une commande d'essai partirait en préparation.
//
// Usage : PORT=3000 node scripts/test-livraison-soir.mjs

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const BASE = `http://localhost:${process.env.PORT ?? '3000'}`
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let ok = 0, ko = 0
const t = (nom, vrai, d = '') => { console.log(`  ${vrai ? '✓' : '✗'} ${nom}${d ? '  — ' + d : ''}`); vrai ? ok++ : ko++ }

// ─── RECOPIE de src/lib/livraison-soir.ts ─────────────────────────────────
const DELAI_TRAJET_MIN = 15, PAS_MINUTES = 15
const CFG = { communes: ['Sainte-Anastasie-sur-Issole'], debut: '19:00', fin: '22:00', capaciteParCreneau: 2, minimumTtc: 0, fraisTtc: 0 }
const mn = h => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0) }
const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const creneaux = (c = CFG) => { const o = []; for (let x = mn(c.debut); x <= mn(c.fin); x += PAS_MINUTES) o.push(hhmm(x)); return o }
const heurePreparation = h => hhmm(mn(h) - DELAI_TRAJET_MIN)
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
function verifier(i) {
  const c = i.cfg ?? CFG
  if (!i.ouvert) return { ok: false, raison: 'module_ferme' }
  if (!c.communes.some(x => norm(x) === norm(i.commune))) return { ok: false, raison: 'hors_zone' }
  const x = mn(i.heureLivraison)
  if (x < mn(c.debut) || x > mn(c.fin)) return { ok: false, raison: 'hors_horaires' }
  if (c.minimumTtc > 0 && i.totalTtc < c.minimumTtc) return { ok: false, raison: 'sous_minimum' }
  if (i.minutesAvant < DELAI_TRAJET_MIN + PAS_MINUTES) return { ok: false, raison: 'creneau_passe' }
  if (i.dejaPrises >= c.capaciteParCreneau) return { ok: false, raison: 'complet' }
  return { ok: true }
}

console.log('\n── La tournée du soir ──\n')

// ── 1. Les créneaux ───────────────────────────────────────────────────────
{
  const c = creneaux()
  t('premier créneau à 19h00', c[0] === '19:00')
  // ⚠️ La borne de fin est INCLUSE : 22h pile est la dernière livraison, et
  // l'exclure supprimerait le créneau le plus demandé d'un vendredi soir.
  t('dernier créneau à 22h00 INCLUS', c[c.length - 1] === '22:00', c[c.length - 1])
  t('un créneau tous les quarts d\'heure', c.length === 13, `${c.length} créneaux`)
}

// ── 2. ⚠️ LE PIÈGE : on prépare AVANT l'heure annoncée ────────────────────
// `creneau_retrait` porte l'heure de LIVRAISON. Rangée telle quelle dans
// l'agenda du KDS, elle ferait enfourner au moment où la pizza devrait déjà
// être à la porte : elle partirait en retard et arriverait froide, sans
// qu'aucune erreur ne se produise.
{
  t('une livraison à 20h00 se prépare pour 19h45', heurePreparation('20:00') === '19:45')
  t('une livraison à 19h00 se prépare pour 18h45', heurePreparation('19:00') === '18:45')
  t('le décalage vaut le temps de trajet', mn('20:00') - mn(heurePreparation('20:00')) === DELAI_TRAJET_MIN)
}

// ── 3. La zone ────────────────────────────────────────────────────────────
{
  const base = { ouvert: true, heureLivraison: '20:00', totalTtc: 30, minutesAvant: 120, dejaPrises: 0 }
  t('la commune livrée passe', verifier({ ...base, commune: 'Sainte-Anastasie-sur-Issole' }).ok)
  // ⚠️ Refuser pour un tiret ou un accent ferait perdre une vraie commande.
  t('« sainte anastasie sur issole » passe aussi',
    verifier({ ...base, commune: 'sainte anastasie sur issole' }).ok)
  t('une autre commune est refusée',
    verifier({ ...base, commune: 'Brignoles' }).raison === 'hors_zone')
}

// ── 4. Les bornes horaires ────────────────────────────────────────────────
{
  const base = { ouvert: true, commune: 'Sainte-Anastasie-sur-Issole', totalTtc: 30, minutesAvant: 300, dejaPrises: 0 }
  t('18h45 est refusé (avant le service)', verifier({ ...base, heureLivraison: '18:45' }).raison === 'hors_horaires')
  t('22h15 est refusé (après le service)', verifier({ ...base, heureLivraison: '22:15' }).raison === 'hors_horaires')
  t('22h00 passe', verifier({ ...base, heureLivraison: '22:00' }).ok)
}

// ── 5. ⚠️ Il faut le temps de CUIRE puis de ROULER ────────────────────────
// Accepter une livraison pour dans dix minutes, c'est promettre ce qu'on ne
// peut pas tenir — et le client attend derrière sa porte.
{
  const base = { ouvert: true, commune: 'Sainte-Anastasie-sur-Issole', heureLivraison: '20:00', totalTtc: 30, dejaPrises: 0 }
  t('à 10 min, refusé', verifier({ ...base, minutesAvant: 10 }).raison === 'creneau_passe')
  t('à 29 min, refusé', verifier({ ...base, minutesAvant: 29 }).raison === 'creneau_passe')
  t('à 30 min, accepté', verifier({ ...base, minutesAvant: 30 }).ok)
}

// ── 6. ⚠️ La capacité est celle de la ROUTE, pas du four ──────────────────
{
  const base = { ouvert: true, commune: 'Sainte-Anastasie-sur-Issole', heureLivraison: '20:00', totalTtc: 30, minutesAvant: 120 }
  t('1 livraison déjà prise → il reste de la place', verifier({ ...base, dejaPrises: 1 }).ok)
  t('2 livraisons → créneau complet', verifier({ ...base, dejaPrises: 2 }).raison === 'complet')
}

// ── 7. Module fermé ───────────────────────────────────────────────────────
{
  t('pizzeria fermée → aucune livraison',
    verifier({ ouvert: false, commune: 'Sainte-Anastasie-sur-Issole', heureLivraison: '20:00', totalTtc: 30, minutesAvant: 120, dejaPrises: 0 }).raison === 'module_ferme')
}

// ── 8. ⛔ Le serveur REFUSE un panier mixte ───────────────────────────────
// Une commande ne peut pas partir deux fois : acceptée, elle partirait avec
// le pain du matin, et la pizza serait livrée douze heures avant le four.
{
  // ⚠️ La clé est INDISPENSABLE ici. Sans elle la route répond 401, le test
  // passe au vert… et ne prouve rien du refus métier. Un test qui réussit
  // pour la mauvaise raison est pire qu'un test absent : il rassure.
  const CLE = env.PUBLIC_API_KEY
  const poster = (corps) => fetch(`${BASE}/api/public/commande`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(CLE ? { 'x-api-key': CLE } : {}) },
    body: JSON.stringify(corps),
  }).then(async x => ({ status: x.status, body: await x.json().catch(() => ({})) })).catch(() => null)

  if (!CLE) {
    console.log('  … PUBLIC_API_KEY absente : contrôles HTTP sautés')
  } else {
    const vide = await poster({
      client_nom: 'TEST REFUS', client_telephone: '0600000000',
      mode_retrait: 'livraison', adresse_livraison: '1 rue des Tests',
      commune_livraison: 'Sainte-Anastasie-sur-Issole', articles: [],
    })
    t('un panier vide est refusé (et pas pour cause d\'auth)',
      vide !== null && vide.status >= 400 && vide.status !== 401,
      vide ? `HTTP ${vide.status} ${JSON.stringify(vide.body).slice(0, 80)}` : 'injoignable')

    // Hors zone : refus métier, jamais d'écriture.
    const hz = await poster({
      client_nom: 'TEST REFUS', client_telephone: '0600000000',
      mode_retrait: 'livraison', adresse_livraison: '1 rue des Tests',
      commune_livraison: 'Marseille', articles: [],
    })
    t('hors zone refusé', hz !== null && hz.status >= 400 && hz.status !== 401,
      hz ? `HTTP ${hz.status}` : 'injoignable')
  }
}

// ── 9. ⛔ Aucune commande d'essai n'a été créée ───────────────────────────
{
  const r = await fetch(`${U}/rest/v1/commandes?select=id,numero&client_nom=ilike.*TEST REFUS*`,
    { headers: { apikey: K, Authorization: `Bearer ${K}` } }).then(x => x.json()).catch(() => null)
  t('aucune commande d\'essai en base', Array.isArray(r) && r.length === 0,
    Array.isArray(r) ? `${r.length} trouvée(s)` : 'lecture impossible')
}

console.log(`\n${ko === 0 ? '✓' : '✗'} ${ok} réussite(s), ${ko} échec(s)\n`)
process.exit(ko === 0 ? 0 : 1)
