// Disponibilités : outil → caisse Zelty.
//
// ⚠️ C'est le sens le plus dangereux de l'intégration : `POST /catalog/dishes`
// est un UPSERT qui exige `name`, `price` et `tax`. Un objet incomplet peut
// écraser le prix d'un plat dans la caisse — ce qui s'imprime sur les tickets
// et fait foi fiscalement.
//
// Ce test vérifie surtout ce que le constructeur REFUSE de faire.
//
//   PORT=3000 node scripts/test-zelty-disponibilites.mjs

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const BASE = `http://localhost:${process.env.PORT ?? '3000'}`

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const dispo = async (courants, voulus) => {
  const r = await fetch(`${BASE}/api/integrations/zelty/verifier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ courants, voulus }),
  })
  return await r.json().catch(() => ({}))
}

console.log('\n── Disponibilités vers la caisse ──\n')
if (!env.CRON_SECRET) { console.log('  ✗ CRON_SECRET absent'); process.exit(1) }

const complet = { id: 1974, name: 'Panini', price: 550, tax: 1000, disable_takeaway: false, disable_delivery: false }

// ── 1. Une rupture coupe les canaux en ligne ────────────────────────
let r = await dispo([complet], { '1974': true })
t('une rupture produit une mise à jour', r.majs?.length === 1, JSON.stringify(r))
const m = r.majs?.[0] ?? {}
t('l\'emporter est coupé', m.disable_takeaway === true)
t('la livraison aussi', m.disable_delivery === true)
t('`disable` n\'est JAMAIS touché — sinon le miroir éteindrait la fiche chez nous',
  !('disable' in m), JSON.stringify(Object.keys(m)))
t('le nom est recopié tel quel', m.name === 'Panini', m.name)
t('le prix est recopié tel quel, jamais inventé', m.price === 550, `${m.price}`)
t('la TVA est recopiée telle quelle', m.tax === 1000, `${m.tax}`)

// ── 2. Rien à faire = rien n'est envoyé ─────────────────────────────
r = await dispo([complet], { '1974': false })
t('un plat déjà disponible ne repart pas', r.majs?.length === 0 && r.inchanges === 1,
  JSON.stringify({ majs: r.majs?.length, inchanges: r.inchanges }))

r = await dispo([{ ...complet, disable_takeaway: true, disable_delivery: true }], { '1974': true })
t('un plat déjà coupé ne repart pas non plus', r.majs?.length === 0 && r.inchanges === 1)

// ── 3. La levée de rupture ──────────────────────────────────────────
r = await dispo([{ ...complet, disable_takeaway: true, disable_delivery: true }], { '1974': false })
t('la levée de rupture rouvre les deux canaux',
  r.majs?.[0]?.disable_takeaway === false && r.majs?.[0]?.disable_delivery === false)

// ── 4. LES REFUS — le cœur de ce test ───────────────────────────────
// Sans prix, un upsert écraserait celui de la caisse.
const { price, ...sansPrix } = complet
r = await dispo([sansPrix], { '1974': true })
t('sans prix, on REFUSE de construire', r.majs?.length === 0 && r.refus?.length === 1)
t('et la raison parle d\'écrasement',
  /écraserait le prix/.test(r.refus?.[0]?.raison ?? ''), r.refus?.[0]?.raison)

const { tax, ...sansTva } = complet
r = await dispo([sansTva], { '1974': true })
t('sans TVA, on refuse aussi', r.refus?.length === 1, JSON.stringify(r.refus))

const { name, ...sansNom } = complet
r = await dispo([sansNom], { '1974': true })
t('sans nom, on refuse aussi', r.refus?.length === 1, JSON.stringify(r.refus))

r = await dispo([{ ...complet, id: 'abc' }], { 'abc': true })
t('un identifiant non numérique est refusé', r.refus?.length === 1, JSON.stringify(r.refus))

// ── 5. Un plat hors périmètre n'est pas touché ──────────────────────
r = await dispo([complet, { ...complet, id: 9999, name: 'Autre' }], { '1974': true })
t('seul le plat visé est mis à jour',
  r.majs?.length === 1 && r.majs[0].id === 1974, JSON.stringify(r.majs))

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
