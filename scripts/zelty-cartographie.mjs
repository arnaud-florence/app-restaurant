#!/usr/bin/env node
// Ce que la caisse expose VRAIMENT — inventaire des endpoints.
//
// La documentation Zelty exige une connexion au back-office et ne se lit pas
// depuis un script. On sonde donc l'API elle-même, en LECTURE SEULE, et on
// note ce qui répond. C'est la méthode qui a permis d'établir le contrat des
// réservations le 24/09/2026, après que trois hypothèses sur les paramètres
// de filtrage se sont révélées fausses.
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
  'Stocks': [
    'stocks', 'stock', 'inventory', 'inventories', 'ingredients', 'supplies',
    'catalog/stocks', 'stock-movements', 'suppliers',
  ],
  'Encaissement & caisse': [
    'transaction-methods', 'transactions', 'tills', 'till', 'payments',
    'cash-movements', 'closings', 'z-reports',
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
  'Technique': ['webhooks', 'me', 'account'],
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
      note = 'n’existe pas'
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
