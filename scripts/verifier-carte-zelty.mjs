// Contrôle : ce que Zelty détient est-il conforme à notre carte ?
//
// La chaîne complète est affiches → notre base → Zelty. Le premier maillon est
// vérifié par test-carte-fournil.mjs ; celui-ci vérifie le second, sur le vrai
// compte. Lecture seule : rien n'est écrit, ni chez eux ni chez nous.
//
//   node scripts/verifier-carte-zelty.mjs
import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const eur = n => `${Number(n).toFixed(2).replace('.', ',')} €`

// ── Ce que Zelty détient ────────────────────────────────────────────
const rz = await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
  { headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}` } })
const plats = (await rz.json()).dishes ?? []

// ── Ce que notre base détient ───────────────────────────────────────
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async p => (await fetch(`${U}/rest/v1/${p}`,
  { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json()
const nous = await sb('recettes?select=id,nom,prix_vente_ht,tva,contient_alcool,image_url,actif,tag_destination&actif=eq.true')

// La TVA sur place suit la LOI, pas le panneau : un croissant mangé à table
// est à 10 %, pas à 5,5 %. L'alcool reste à 20 %, la presse à 2,1 %.
const tvaSurPlace = r => r.contient_alcool ? 20 : (Number(r.tva) === 2.1 ? 2.1 : 10)
const ttc = r => Math.round(Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100) * 100)

const parId = new Map(plats.map(p => [String(p.remote_id ?? ''), p]))
let ok = 0; const pbs = []
const dire = (r, quoi, attendu, recu) =>
  pbs.push(`${r.nom.padEnd(34).slice(0, 34)} ${quoi} — attendu ${attendu}, Zelty a ${recu}`)

for (const r of nous) {
  const p = parId.get(String(r.id))
  if (!p) { dire(r, 'ABSENT de la caisse', 'présent', 'rien'); continue }
  let bon = true
  const attTtc = ttc(r)
  if (p.price_togo !== attTtc) { dire(r, 'prix à emporter', eur(attTtc / 100), eur((p.price_togo ?? 0) / 100)); bon = false }
  if (p.tax_takeaway !== Number(r.tva) * 100) { dire(r, 'TVA à emporter', `${r.tva} %`, `${(p.tax_takeaway ?? 0) / 100} %`); bon = false }
  if (p.tax !== tvaSurPlace(r) * 100) { dire(r, 'TVA sur place', `${tvaSurPlace(r)} %`, `${(p.tax ?? 0) / 100} %`); bon = false }
  if (r.image_url && !p.image) { dire(r, 'photo', 'une image', 'aucune'); bon = false }
  if (p.name !== r.nom) { dire(r, 'nom', r.nom, p.name); bon = false }
  if (p.disable) { dire(r, 'état', 'actif', 'désactivé'); bon = false }
  if (bon) ok++
}

const orphelins = plats.filter(p => !nous.some(r => String(r.id) === String(p.remote_id ?? '')))

console.log(`\n── Carte Zelty vs notre base ──\n`)
console.log(`  produits actifs chez nous : ${nous.length}`)
console.log(`  plats dans la caisse      : ${plats.length}`)
console.log(`  conformes en tout point   : ${ok}`)
console.log(`  écarts                    : ${pbs.length}`)
console.log(`  plats sans contrepartie   : ${orphelins.length}`)
if (pbs.length) { console.log('\n  ── écarts ──'); pbs.slice(0, 30).forEach(l => console.log('   ' + l)) }
if (orphelins.length) { console.log('\n  ── orphelins ──'); orphelins.slice(0, 10).forEach(p => console.log('   ' + p.name)) }
console.log(`\n── ${pbs.length === 0 && orphelins.length === 0 ? '✓ carte conforme' : '✗ à corriger'} ──\n`)
process.exit(pbs.length || orphelins.length ? 1 : 0)
