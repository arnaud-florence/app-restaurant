#!/usr/bin/env node
// Le webhook est une SONNETTE, pas une source.
//
// Ce test vérifie le comportement qui protège le plus : le REGROUPEMENT.
// Nos propres écritures déclenchent les webhooks Zelty — pousser la carte
// (84 plats en un POST) fait revenir 84 `dish.update`. Sans regroupement,
// c'est 84 relectures complètes du catalogue en quelques secondes, donc des
// 429 chez Zelty : on se met soi-même en panne en croyant gagner du temps réel.
//
// ⚠️ Il RECOPIE la table des relances depuis
// src/lib/integrations/zelty/relances.ts — modifier les deux ensemble.
//
// Usage : PORT=3000 node scripts/test-zelty-relances.mjs

import fs from 'node:fs'
import crypto from 'node:crypto'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const PORT = process.env.PORT ?? '3000'
const BASE = `http://localhost:${PORT}`
const URL_HOOK = `${BASE}/api/integrations/zelty/webhook`
const SECRET = env.ZELTY_WEBHOOK_SECRET
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let ok = 0, ko = 0
const t = (nom, vrai, detail = '') => {
  console.log(`  ${vrai ? '✓' : '✗'} ${nom}${detail ? '  — ' + detail : ''}`)
  vrai ? ok++ : ko++
}

// ⚠️ L'en-tête est `x-zelty-hmac-sha256`. Il n'est PAS documenté : il a été
// identifié sur le premier appel RÉEL de Zelty, qui avait été refusé en 401.
const signer = (brut) =>
  crypto.createHmac('sha256', SECRET).update(brut).digest('hex')

const envoyer = async (corps) => {
  const brut = JSON.stringify(corps)
  const r = await fetch(URL_HOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-zelty-hmac-sha256': signer(brut) },
    body: brut,
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

const sb = (chemin) => fetch(`${U}/rest/v1/${chemin}`, {
  headers: { apikey: K, Authorization: `Bearer ${K}` },
}).then(r => r.json()).catch(() => null)

console.log('\n── Relances sur webhook Zelty ──\n')

if (!SECRET) { console.log('  ⚠️  ZELTY_WEBHOOK_SECRET absent de .env.local'); process.exit(1) }

const debut = new Date().toISOString()

// ── 1. Un événement SANS relance est tracé, jamais relancé ────────────────
// `till.close` et `order.status.update` n'ont pas encore de route entrante :
// on garde leur brut pour les brancher un jour sur du réel.
{
  const r = await envoyer({ event_name: 'till.close', data: { test: true } })
  t('till.close accepté', r.status === 200, `HTTP ${r.status}`)
  t('till.close n\'est PAS relancé', r.body?.relance?.relance === false)
  t('…et la raison est « aucune »', r.body?.relance?.raison === 'aucune',
    JSON.stringify(r.body?.relance))
}

// ── 2. Une signature invalide est refusée, même sur un événement connu ────
// Cet endpoint écrit des VENTES : un corps non authentifié permettrait à
// n'importe qui de gonfler le chiffre d'affaires. Signer avec un AUTRE secret
// est le bon contrôle — changer un caractère ne prouve rien (une fois sur
// seize, le caractère tiré est le même).
{
  const corps = JSON.stringify({ event_name: 'dish.update', data: {} })
  const r = await fetch(URL_HOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zelty-hmac-sha256': crypto.createHmac('sha256', 'un-autre-secret').update(corps).digest('hex'),
    },
    body: corps,
  })
  t('signature d\'un AUTRE secret refusée', r.status === 401, `HTTP ${r.status}`)
}
{
  const r = await fetch(URL_HOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: 'dish.update' }),
  })
  t('absence de signature refusée', r.status === 401, `HTTP ${r.status}`)
}

// ── 3. LE CŒUR : deux événements identiques → UNE seule relance ───────────
{
  const un   = await envoyer({ event_name: 'dish.update', data: { id: 1 } })
  const deux = await envoyer({ event_name: 'dish.update', data: { id: 2 } })
  const trois = await envoyer({ event_name: 'tag.update', data: { id: 3 } })

  t('le 1er dish.update relance', un.body?.relance?.relance === true,
    JSON.stringify(un.body?.relance).slice(0, 120))
  t('le 2e est GROUPÉ, pas relancé', deux.body?.relance?.relance === false)
  t('…et la raison est « groupee »', deux.body?.relance?.raison === 'groupee',
    JSON.stringify(deux.body?.relance))
  // tag.update vise la MÊME route que dish.update : le regroupement porte sur
  // la route relue, pas sur le nom de l'événement — sinon six événements de
  // carte déclencheraient six relectures identiques.
  t('un AUTRE événement visant la même route est groupé aussi',
    trois.body?.relance?.relance === false && trois.body?.relance?.raison === 'groupee')
  t('tous répondent 200', un.status === 200 && deux.status === 200 && trois.status === 200)
}

// ── 4. Le journal garde une trace de tout ─────────────────────────────────
{
  const evs = await sb(`integration_evenements?select=type,reference,statut&systeme=eq.zelty&created_at=gte.${debut}&order=created_at.asc`)
  const hooks = (evs ?? []).filter(e => e.type === 'webhook')
  const relances = (evs ?? []).filter(e => e.type === 'relance')
  t('chaque webhook est tracé', hooks.length >= 4, `${hooks.length} trace(s)`)
  t('la relance est tracée', relances.length >= 1, `${relances.length} ligne(s)`)
  // La trace est écrite AVANT l'appel : c'est elle qui sert de verrou. Écrite
  // après, deux webhooks de la même seconde ne se verraient pas.
  t('la relance porte la route relue',
    relances.every(r => (r.reference ?? '').startsWith('/api/cron/')),
    relances.map(r => r.reference).join(' '))
}

// ── Nettoyage ─────────────────────────────────────────────────────────────
// ⚠️ On ne supprime QUE ce que ce test a créé, après son propre démarrage.
// Une version précédente d'un test voisin vidait TOUS les événements webhook
// et a effacé la trace d'un appel réel de Zelty. Un test ne doit jamais
// détruire des données de production.
{
  const r = await fetch(
    `${U}/rest/v1/integration_evenements?systeme=eq.zelty&created_at=gte.${debut}`,
    { method: 'DELETE', headers: { apikey: K, Authorization: `Bearer ${K}`, Prefer: 'return=minimal' } })
  console.log(`\n  nettoyage : ${r.ok ? 'ok' : 'ÉCHEC ' + r.status}`)
}

console.log(`\n${ko === 0 ? '✓' : '✗'} ${ok} réussite(s), ${ko} échec(s)\n`)
process.exit(ko === 0 ? 0 : 1)
