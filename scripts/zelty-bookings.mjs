#!/usr/bin/env node
// Ce que la caisse appelle une « réservation » — lecture BRUTE.
//
// Pourquoi ce script existe : la documentation Zelty exige une connexion au
// back-office, et leur registre de réservations est vide tant que personne
// n'en a créé une. On ne connaît donc PAS la forme des données — ni les noms
// de champs, ni les unités, ni le codage des statuts.
//
// ⚠️ On ne construit pas une intégration sur une forme devinée. Cette API a
// déjà coûté cher à ce projet sur exactement ce point : `expand[]=items`
// oublié (le CA juste, le stock aveugle, aucune erreur), la TVA en MILLIÈMES,
// les montants en centimes, `null` refusé par zod. Chacun de ces pièges se
// serait vu sur une charge utile réelle, et aucun ne se devine.
//
// Le geste qui débloque : créer UNE réservation à la main dans le back-office
// Zelty (l'établissement est en mode école, rien n'entre dans le chiffre
// d'affaires), puis lancer ce script. Il imprime le JSON tel quel.
//
// Usage : node scripts/zelty-bookings.mjs [--du 2026-10-01] [--au 2026-10-31]

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)

const CLE = env.ZELTY_API_KEY
const BASE = env.ZELTY_API_BASE || 'https://api.zelty.fr/2.11'

if (!CLE) {
  console.error('ZELTY_API_KEY absente de .env.local')
  process.exit(1)
}

const arg = (nom, defaut) => {
  const i = process.argv.indexOf(`--${nom}`)
  return i > 0 ? process.argv[i + 1] : defaut
}

// Fenêtre large par défaut : une réservation d'essai peut être posée
// n'importe quand, et la chercher sur le seul jour courant reviendrait à
// conclure « vide » alors qu'elle existe.
const du = arg('du', '2026-01-01')
const au = arg('au', '2027-12-31')

const url = `${BASE}/bookings?from=${du}&to=${au}&limit=200`
console.log(`GET ${url}\n`)

const r = await fetch(url, { headers: { Authorization: `Bearer ${CLE}` } })
const texte = await r.text()

if (!r.ok) {
  console.error(`HTTP ${r.status}\n${texte.slice(0, 500)}`)
  process.exit(1)
}

let json
try { json = JSON.parse(texte) } catch { console.log(texte.slice(0, 2000)); process.exit(0) }

const liste = json.bookings ?? json.items ?? []
console.log(`${liste.length} réservation(s) dans la caisse du ${du} au ${au}\n`)

if (liste.length === 0) {
  console.log('Rien à observer. Créez UNE réservation dans le back-office Zelty')
  console.log('(l’établissement est en mode école), puis relancez ce script.')
  process.exit(0)
}

// Le JSON brut, sans interprétation : c'est lui qui fera foi pour écrire le
// mapper. Le résumé qui suit n'est qu'un confort de lecture.
console.log('─── charge utile brute ───────────────────────────────────')
console.log(JSON.stringify(liste[0], null, 2))

console.log('\n─── champs observés, tous exemplaires confondus ──────────')
const champs = new Map()
for (const b of liste) {
  for (const [k, v] of Object.entries(b)) {
    const type = v === null ? 'null' : Array.isArray(v) ? 'tableau' : typeof v
    const vus = champs.get(k) ?? new Set()
    vus.add(type)
    champs.set(k, vus)
  }
}
for (const [k, types] of [...champs].sort()) {
  // ⚠️ Un champ qui apparaît parfois à `null` est le piège zod déjà payé sur
  // le catalogue : `.optional()` accepte `undefined` mais REJETTE `null`, et
  // 84 plats sur 84 étaient tombés dans « illisible » sans une seule erreur.
  const nul = types.has('null') ? '  ⚠️ parfois null → .nullish() en zod' : ''
  console.log(`  ${k.padEnd(26)} ${[...types].join(' | ').padEnd(12)}${nul}`)
}
