// Les vins de table comptent pour la RESTAURATION, pas pour le bar.
//
// Décision du gérant, 06/10/2026, en deux temps : les six bouteilles
// nommées, puis les six pichets. Leur chiffre d'affaires doit remonter à
// l'étage qui les sert.
//
// ⚠️ Les pichets n'ont QU'UN SEUL PRIX pour les deux services (4,50 € et
// 8,00 €) : tout leur CA tombe donc dans l'établissement où on les range,
// y compris un quart bu au comptoir. C'est assumé — le pichet est un
// format de table, et c'est là qu'il partira.
//
// ⚠️ Le VERRE, lui, ne bouge pas : il a deux fiches, l'une au Bar (2,80 €)
// et l'autre en Restauration (4,00 €). Chacune est déjà au bon étage, et
// les déplacer ferait compter le comptoir dans la salle.
//
// ⚠️ LA VENTILATION DU CA SUIT `recettes.etablissement_id`, et elle le suit
// sur la LIGNE de vente, jamais sur l'en-tête du ticket — un même ticket
// mélange un café du Fournil et une bouteille à table. C'est donc le seul
// champ à bouger.
//
// ⚠️ ON NE TOUCHE PAS À `tag_destination`, ET C'EST DÉLIBÉRÉ. Il ne décide
// pas du CA mais de la PRODUCTION : depuis le 25/09 la Cuisine a un lieu de
// fabrication avec une imprimante. Passer les vins en CUISINE ferait sortir
// un bon de préparation à chaque verre servi — du papier, du bruit en
// service, et une brigade qui apprend à ignorer ses tickets. BAR n'a aucun
// poste de production : le vin se sert au comptoir, ce qui est la réalité.
//
// ⚠️ Rien ne part en caisse : Zelty ne connaît ni nos établissements ni notre
// ventilation. Aucun prix, aucun libellé n'est touché.
//
//   node scripts/vins-vers-restauration.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const VINS = [
  'Côte du Rhône Lucien Tramier', 'Château La Lieue tradition rosé',
  'Bordeaux supérieur Toulouse-Lautrec', 'Château La Lieue tradition blanc',
  'Château La Lieue Batilde Philomène', 'Champagne Pol Cochet',
  'Pichet de rouge 25 cl', 'Pichet de rosé 25 cl', 'Pichet de blanc 25 cl',
  'Pichet de rouge 50 cl', 'Pichet de rosé 50 cl', 'Pichet de blanc 50 cl',
]

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers ?? {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

// ⚠️ L'établissement est RELU par son slug, jamais codé en dur : un uuid
// recopié de travers rattacherait six vins à un point de vente qui n'est pas
// celui qu'on croit, et ça ne se verrait que dans le CA du mois.
const [resto] = await sb('etablissements?select=id,nom,slug&slug=eq.le-relais-des-saveurs')
if (!resto) { console.error('⛔ établissement « le-relais-des-saveurs » introuvable'); process.exit(1) }

const prod = await sb(`recettes?select=id,nom,etablissement_id,tag_destination&nom=in.(${VINS.map(n => `"${n}"`).join(',')})`)
const absents = VINS.filter(n => !prod.some(p => p.nom === n))
if (absents.length) { console.error(`⛔ introuvable(s) : ${absents.join(', ')} — rien n'est écrit.`); process.exit(1) }
const etabs = Object.fromEntries((await sb('etablissements?select=id,nom')).map(e => [e.id, e.nom]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const maj = prod.filter(p => p.etablissement_id !== resto.id)
for (const p of prod)
  console.log(`   ${p.nom.padEnd(36)} ${String(etabs[p.etablissement_id]).padEnd(13)} → ${resto.nom}   tag ${p.tag_destination} (inchangé)${p.etablissement_id === resto.id ? '   (déjà)' : ''}`)
console.log(`\n   ${maj.length} vin(s) à déplacer`)
if (!maj.length) { console.log('\n   rien à faire.\n'); process.exit(0) }
if (!ECRIRE) { console.log('\n   (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

for (const p of maj) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ etablissement_id: resto.id }) })
console.log(`\n   ✓ ${maj.length} vin(s) rattaché(s) à ${resto.nom}\n`)
