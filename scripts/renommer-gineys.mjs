// Gineys : deux commerciaux, deux fiches NOMMÉES.
//
// ⚠️⚠️ LE NOM NE DOIT PAS CONTENIR « — ». `lireFournisseur()` lit
// `brut.split(' — ')[0]` : le tiret cadratin sépare le fournisseur de la
// note dans `ingredients.fournisseur_principal`, qui est du TEXTE LIBRE
// (module 3). Un fournisseur nommé « Gineys — Nicolas » se lirait donc
// « Gineys », et ne correspondrait à aucune fiche — 48 matières se
// retrouveraient sans fournisseur, sans message. D'où les parenthèses.
//
// ⚠️ Le renommage DOIT être complet. `recettes.fournisseur_id` et
// `bons_commande.fournisseur_id` sont des clés étrangères et suivent
// toutes seules ; `ingredients.fournisseur_principal` est du TEXTE et ne
// suit pas. C'est lui le piège.
//
// Usage : node scripts/renommer-gineys.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const RENOMMAGES = [
  ['Gineys', 'Gineys (Nicolas)'],
  ['Gineys — Sabine', 'Gineys (Sabine)'],
]

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const K = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(o.headers ?? {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

// ⚠️ Un nom contenant « — » casserait la lecture : on refuse AVANT d'écrire.
for (const [, neuf] of RENOMMAGES) {
  if (neuf.includes(' — ')) {
    console.error(`⛔ « ${neuf} » contient un tiret cadratin : lireFournisseur() le tronquerait.`)
    process.exit(1)
  }
}

console.log('\n── Fiches fournisseur ──')
const fiches = []
for (const [vieux, neuf] of RENOMMAGES) {
  const [f] = await sb(`fournisseurs?select=id,nom&nom=eq.${encodeURIComponent(vieux)}`)
  if (!f) { console.log(`   « ${vieux} » : introuvable (déjà renommé ?)`); continue }
  fiches.push({ ...f, neuf })
  console.log(`   « ${vieux} » → « ${neuf} »`)
}

console.log('\n── Matières (TEXTE libre, ne suit PAS la clé étrangère) ──')
const mat = await sb('ingredients?select=id,nom,fournisseur_principal&fournisseur_principal=not.is.null')
const aChanger = []
for (const m of mat) {
  const brut = m.fournisseur_principal
  // On ne remplace que la PARTIE AVANT la note, et seulement si elle
  // correspond exactement à un ancien nom. Un remplacement sur la chaîne
  // entière abîmerait les notes qui citent le fournisseur.
  const [tete, ...reste] = brut.split(' — ')
  const r = RENOMMAGES.find(([vieux]) => tete.trim() === vieux)
  if (!r) continue
  aChanger.push({ id: m.id, nom: m.nom, avant: brut, apres: [r[1], ...reste].join(' — ') })
}
console.log(`   ${aChanger.length} matière(s) à mettre à jour`)
const ex = new Map()
for (const a of aChanger) ex.set(a.apres.length > 40 ? a.apres.slice(0, 40) + '…' : a.apres,
  (ex.get(a.apres.length > 40 ? a.apres.slice(0, 40) + '…' : a.apres) ?? 0) + 1)
for (const [k, v] of [...ex].sort((a, b) => b[1] - a[1])) console.log(`     ${String(v).padStart(3)} × « ${k} »`)

// Les clés étrangères suivent seules — on le DIT, pour qu'on ne les cherche pas.
for (const f of fiches) {
  const prod = await sb(`recettes?select=id&fournisseur_id=eq.${f.id}`)
  const bons = await sb(`bons_commande?select=id&fournisseur_id=eq.${f.id}`)
  const cat = await sb(`catalogue_fournisseur?select=id&fournisseur_id=eq.${f.id}&limit=1`)
  console.log(`\n   « ${f.neuf} » : ${prod.length} produit(s) et ${bons.length} bon(s) par clé étrangère — ils suivent seuls`)
}

if (!ECRIRE) { console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

for (const f of fiches) {
  await sb(`fournisseurs?id=eq.${f.id}`, { method: 'PATCH', body: JSON.stringify({ nom: f.neuf }) })
}
console.log(`\n   ✅ ${fiches.length} fiche(s) renommée(s)`)
let n = 0
for (const a of aChanger) {
  await sb(`ingredients?id=eq.${a.id}`, { method: 'PATCH',
    body: JSON.stringify({ fournisseur_principal: a.apres }) })
  n++
}
console.log(`   ✅ ${n} matière(s) mise(s) à jour\n`)
