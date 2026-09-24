#!/usr/bin/env node
// Ce que la caisse expose VRAIMENT — inventaire des endpoints.
//
// ⚠️⚠️ CE SCRIPT NE FAIT PAS AUTORITÉ, ET IL A DÉJÀ INDUIT EN ERREUR.
// Sa première version devinait des noms d'endpoints et concluait « n'existe
// pas » sur un 404. Deux conclusions fausses en sont sorties le 24/09/2026 :
// les clôtures de caisse ont été déclarées absentes (elles sont sous
// `/closures`, on cherchait `/closings`), et la modification d'une
// réservation impossible (c'est `POST /bookings/{id}`, on testait PATCH et
// PUT). Deviner un nom puis conclure de son absence, c'est prouver qu'on n'a
// pas trouvé, pas que la chose n'existe pas.
//
// LA SOURCE FAIT FOI : https://docs.zelty.fr, accessible une fois connecté au
// back-office, avec un export complet sur /llms.txt. La liste ci-dessous en
// vient. Ce script sert à vérifier ce que NOTRE CLÉ peut réellement atteindre
// — ce qui n'est pas la même question.
//
// ⚠️ UN 200 AVEC UNE LISTE VIDE NE VEUT PAS DIRE « VIDE ». C'est la leçon la
// plus chère de cette API : `GET /bookings` répondait `{"bookings": []}` alors
// que la réservation venait d'être créée — il manquait `?date=`. Chaque
// endpoint qui rend une collection vide est donc signalé comme « à confirmer
// avec un paramètre », jamais comme « rien dedans ».
//
// ⚠️ Zelty limite le débit et répond 429 sans le documenter. Pause entre
// chaque appel, et réessai unique.
//
// Usage : node scripts/zelty-cartographie.mjs [--json rapport.json]

import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)

const CLE = env.ZELTY_API_KEY
const BASE = env.ZELTY_API_BASE || 'https://api.zelty.fr/2.11'
if (!CLE) { console.error('ZELTY_API_KEY absente de .env.local'); process.exit(1) }

const PAUSE_MS = 1100
const dors = ms => new Promise(r => setTimeout(r, ms))

// Regroupés par sujet : ce sont les domaines que le gérant veut voir reliés.
const SUJETS = {
  'Carte & produits': [
    'catalog/dishes', 'catalog/tags', 'catalog/menus', 'catalog/options',
    'catalog/categories', 'catalog/combos', 'catalog/products',
  ],
  'Commandes': ['orders', 'orders/count', 'order-types', 'sources'],
  'Réservations': ['bookings'],
  'Clients & fidélité': [
    'customers', 'loyalty', 'loyalty/cards', 'coupons', 'discounts',
    'gift-cards', 'vouchers', 'marketing',
  ],
  // ⚠️ La référence officielle ne connaît QU'UN point d'entrée de stock :
  // `POST /inventory` (« Update dish stock », modes `set` et `adjust`). Il
  // porte le stock d'un PLAT — combien de parts il reste — et non la
  // mercuriale, les fiches techniques, les fournisseurs et l'inventaire
  // complets que le back-office propose par ailleurs. Ceux-là n'ont aucun
  // endpoint. Le GET ci-dessous ne prouve donc rien sur l'écriture.
  'Stocks': ['inventory'],
  'Encaissement & caisse': [
    'transaction-methods',
    // ⚠️ `closures`, pas `closings` : les clôtures de caisse existent bel et
    // bien, et une faute d'anglais les avait fait déclarer absentes.
    'closures',
  ],
  'Équipe': ['employees', 'users', 'staff', 'roles', 'timeclock'],
  'Établissement & salle': [
    'restaurants', 'areas', 'rooms', 'tables', 'floors', 'floorplan',
    'opening-hours', 'schedules', 'printers', 'devices',
  ],
  'Commande en ligne': [
    'click-and-collect', 'online', 'delivery', 'delivery-zones',
    'webshop', 'channels',
  ],
  'Comptabilité & analyse': [
    'stats', 'reports', 'analytics', 'revenues', 'taxes', 'accounting',
  ],
  // Documenté mais 404 sur notre clé au 24/09/2026 : à éclaircir avec Zelty
  // plutôt qu'à conclure. Notre clé est pourtant bien liée au restaurant
  // (`/info` rend restaurant_id 10445), donc ce n'est pas un défaut de portée.
  'Documentés, injoignables ici': ['rooms', 'inventory'],

  // `/info` dit la portée de la clé : brand seule, ou liée à un restaurant.
  'Technique': ['webhooks', 'info'],
}

/** Résume une réponse sans en imprimer le contenu : on veut savoir CE QUI
 *  existe, pas déverser les données du restaurant dans un terminal. */
function resume(json) {
  if (json === null || typeof json !== 'object') return { forme: typeof json }
  const cles = Object.keys(json).filter(k => k !== 'errno' && k !== 'errmsg')
  const collection = cles.find(k => Array.isArray(json[k]))
  if (collection) {
    const n = json[collection].length
    const champs = n > 0 && typeof json[collection][0] === 'object'
      ? Object.keys(json[collection][0]) : []
    return { collection, n, champs }
  }
  return { cles }
}

const resultats = []
console.log(`\n🗺  Cartographie de l'API Zelty — ${BASE}\n`)

for (const [sujet, chemins] of Object.entries(SUJETS)) {
  console.log(`── ${sujet}`)
  for (const chemin of chemins) {
    let r, texte
    for (let essai = 0; essai < 2; essai++) {
      r = await fetch(`${BASE}/${chemin}`, { headers: { Authorization: `Bearer ${CLE}` } })
      texte = await r.text()
      if (r.status !== 429) break
      await dors(4000)   // le débit est limité, on laisse retomber
    }

    let json = null
    try { json = JSON.parse(texte) } catch { /* pas du JSON */ }

    const ligne = { sujet, chemin, status: r.status }
    let note = ''

    if (r.status === 200 && json) {
      const res = resume(json)
      Object.assign(ligne, res)
      if (res.collection !== undefined) {
        note = `${res.collection} : ${res.n} élément(s)`
        // ⚠️ Vide ne veut pas dire vide : il manque peut-être un paramètre.
        if (res.n === 0) note += '  ⚠️ vide — à confirmer avec un paramètre (cf. bookings ?date=)'
        else note += `\n        champs : ${res.champs.slice(0, 14).join(', ')}${res.champs.length > 14 ? '…' : ''}`
      } else {
        note = `clés : ${(res.cles ?? []).slice(0, 12).join(', ')}`
      }
    } else if (r.status === 404) {
      // ⚠️ « pas trouvé sous ce nom », JAMAIS « n'existe pas » : c'est
      // exactement le raccourci qui avait fait déclarer les clôtures absentes.
      note = 'pas trouvé sous ce nom (vérifier docs.zelty.fr)'
    } else {
      note = (json?.message ?? json?.errmsg ?? texte.slice(0, 60)).toString()
    }

    const marque = r.status === 200 ? '✓' : r.status === 404 ? '·' : '!'
    console.log(`  ${marque} ${String(r.status).padEnd(4)} /${chemin.padEnd(22)} ${note}`)
    resultats.push(ligne)
    await dors(PAUSE_MS)
  }
  console.log()
}

const vivants = resultats.filter(r => r.status === 200)
console.log(`${vivants.length} endpoint(s) disponibles sur ${resultats.length} sondés.\n`)

const i = process.argv.indexOf('--json')
if (i > 0 && process.argv[i + 1]) {
  writeFileSync(process.argv[i + 1], JSON.stringify(resultats, null, 2))
  console.log(`rapport écrit : ${process.argv[i + 1]}`)
}
