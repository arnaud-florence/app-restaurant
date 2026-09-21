// Tarif de la pizzeria et de la brasserie — validé par le gérant le 21/09/2026.
//
// Les prix des affiches donnaient une marge confortable (food cost estimé 18 à
// 26 %, 36 % pour la signature) mais une IMAGE chère : trois pizzas à 15,90 €
// et plus, dans un village où le demi est à 2,80 € et où la pizza se compare
// aux camions du Var (10-13 €). L'échelle devient 9,90 → 14,90, seule la
// signature au-dessus, sous 17 €. Burgers et grandes salades suivent la même
// logique ; entrecôte, tartare, friture et formule ne bougent pas.
//
// Planches : 19,90 € « à partager » plutôt qu'« individuel » — le prix d'une
// planche pour deux, pas celui d'une assiette pour un.
//
// ⚠️ Les affiches imprimées doivent être refaites : c'est le prix AFFICHÉ que
// le client est en droit de payer.
//
// Même règle que tarif-bar-village.mjs pour la caisse : relecture, recopie de
// name et tax, un seul POST groupé, arrêt net si la lecture paraît incomplète.
//
//   node scripts/tarif-restaurant.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

const GRILLE = {
  'La Provençale': 12.90, 'La St-Quinis': 12.90, 'La Naples': 13.50, "L'Issole": 13.90,
  'La Quatre Fromages': 13.90, 'La Ferrage': 14.50, "L'Anastasie": 14.90, 'La Camembert': 14.90,
  'La CasaTasia Signature': 16.90,
  'Burger CasaTasia': 14.90, 'Burger Chèvre-Miel': 15.50, 'Burger Montagnard': 15.90,
  'Salade Chèvre chaud': 14.90, 'Salade Burrata': 16.50,
}
const DESCRIPTIONS = {
  'Planche CasaTasia': 'Assortiment de charcuteries et de fromages, olives et focaccia — à partager',
  'Planche de charcuteries': 'Jambon cru, coppa, olives et focaccia — à partager',
  'Planche de fromages': 'Chèvre, gorgonzola, parmesan, olives et focaccia — à partager',
}

const nous = await (await fetch(U + '/rest/v1/recettes?select=id,nom,tva,prix_vente_ht,description&tag_destination=in.(PIZZA,CUISINE)&actif=eq.true', { headers: H })).json()
const parNom = new Map(nous.map(r => [r.nom, r]))
const f2 = n => n.toFixed(2).replace('.', ',')
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — outil ──\n`)
const maj = []
for (const [nom, ttc] of Object.entries(GRILLE)) {
  const r = parNom.get(nom); if (!r) { console.log('  ⚠️ introuvable : ' + nom); continue }
  const t = 1 + Number(r.tva) / 100, avant = Number(r.prix_vente_ht) * t
  if (Math.abs(avant - ttc) < 0.005) continue
  console.log(`  ${nom.padEnd(26)} ${f2(avant).padStart(6)} → ${f2(ttc).padStart(6)} €`)
  maj.push({ r, ttc, ht: Math.round(ttc / t * 10000) / 10000 })
}
for (const [nom, d] of Object.entries(DESCRIPTIONS)) {
  const r = parNom.get(nom); if (!r || r.description === d) continue
  console.log(`  ${nom.padEnd(26)} → « à partager »`)
  if (ECRIRE) await fetch(U + '/rest/v1/recettes?id=eq.' + r.id, { method: 'PATCH', headers: H, body: JSON.stringify({ description: d }) })
}
if (ECRIRE) for (const x of maj)
  await fetch(U + '/rest/v1/recettes?id=eq.' + x.r.id, { method: 'PATCH', headers: H, body: JSON.stringify({ prix_vente_ht: x.ht }) })

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — caisse Zelty ──\n`)
const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0', { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
if (plats.length < 150) { console.log(`  ✗ la caisse rend ${plats.length} plats — lecture douteuse, on n'écrit RIEN.`); process.exit(1) }
const parRemote = new Map(plats.map(p => [String(p.remote_id ?? ''), p]))
const corps = [], refus = []
for (const [nom, ttc] of Object.entries(GRILLE)) {
  const r = parNom.get(nom); if (!r) continue
  const p = parRemote.get(String(r.id))
  if (!p) { refus.push(`${nom} : absent de la caisse`); continue }
  if (p.name == null || p.price == null || p.tax == null) { refus.push(`${nom} : champ obligatoire manquant — refus`); continue }
  const c = Math.round(ttc * 100)
  if (p.price === c && p.price_togo === c) continue
  corps.push({ id: p.id, name: p.name, price: c, price_togo: c, tax: p.tax, tax_takeaway: p.tax_takeaway })
  console.log(`  ${nom.padEnd(26)} ${f2(p.price / 100).padStart(6)} → ${f2(ttc).padStart(6)} €`)
}
if (refus.length) { console.log('\n  refusés :'); refus.forEach(l => console.log('   ' + l)) }
console.log(`\n  outil : ${maj.length} prix · caisse : ${corps.length} plats`)
if (!ECRIRE) { console.log('  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
if (corps.length) {
  const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes', { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  console.log(`  → caisse : HTTP ${r.status} · ${(j.dishes ?? []).length} plats mis à jour · errno ${j.errno}`)
}
