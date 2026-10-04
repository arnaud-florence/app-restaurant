// Boissons, desserts et vins de l'affiche pizzas du 12 octobre — 04/10/2026.
//
// Décisions du gérant, prises après mesure :
//   • desserts  → MÊMES produits que le Fournil, prix aligné à 3,80 €
//   • canettes  → MÊMES produits, prix aligné à 2,00 € à emporter
//   • vins      → 3 bouteilles PROPRES à la pizzeria, 10,00 €
//
// ⚠️⚠️ ALIGNER LE FOURNIL CHANGE LE PRIX DU COMPTOIR, PAS SEULEMENT CELUI DES
// PIZZAS. Le flan et la tropézienne passent de 2,90 à 3,80 € — +31 % — et le
// moelleux de 2,50 à 3,80 € — +52 %. C'est le choix assumé d'un prix unique,
// mais il s'applique dès maintenant à la vitrine, pas le 12 octobre.
//
// ⚠️ Le prix de l'affiche est TTC : c'est `prix_vente_ht` qui se recalcule.
//
//   node scripts/carte-pizzas-boissons-desserts.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const e = n => n.toFixed(2).replace('.', ',')
const ht = (ttc, tva) => Math.round(ttc / (1 + tva / 100) * 10000) / 10000
const tous = await sb('recettes?actif=is.true&select=id,nom,tag_destination,categorie,prix_vente_ht,prix_sur_place_ttc,tva,etablissement_id,vendable_online,image_url,nom_caisse')
const trouve = (nom, tag) => tous.find(p => p.nom === nom && p.tag_destination === tag)
const majPrix = [], creations = [], renommages = []

// ── 1. desserts du Fournil → 3,80 € ─────────────────────────────────
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — affiche pizzas du 12 octobre ──\n`)
console.log('1. desserts à 3,80 € (produits du Fournil, prix du comptoir compris)')
const DESSERTS = [
  ['Part de flan pâtissier', null], ['Tiramisu individuel', null],
  ['Tartelette citron meringuée', null], ['Tropézienne individuelle', null],
  // ⚠️ L'affiche dit « FONDANT », la base « Moelleux ». Même gâteau — c'est le
  // Coulant Gourmand Carigel. On aligne le nom de VITRINE sur l'affiche : le
  // client lit l'affiche, pas la base. Aucune collision, le « Moelleux au
  // chocolat » de la brasserie est un autre produit, à un autre poste.
  ['Moelleux au chocolat', 'Fondant au chocolat'],
]
for (const [nom, nouveauNom] of DESSERTS) {
  const p = trouve(nom, 'FOURNIL')
  if (!p) { console.log(`   ⚠ ${nom} introuvable au Fournil`); continue }
  const actuel = Number(p.prix_vente_ht) * (1 + p.tva / 100)
  const d = 3.80 - actuel
  console.log(`   ${(nouveauNom ?? nom).padEnd(30)} ${e(actuel).padStart(5)} → 3,80 €  ${Math.abs(d) < 0.005 ? '=' : (d > 0 ? '+' : '') + e(d) + (actuel > 0 ? `  (${(d / actuel * 100).toFixed(0)} %)` : '')}`)
  if (Math.abs(d) >= 0.005) majPrix.push({ p, ttc: 3.80 })
  if (nouveauNom) renommages.push({ p, nom: nouveauNom })
}
// ⚠️ La tarte aux pommes est sur l'affiche et n'existe NULLE PART.
const modeleF = trouve('Part de flan pâtissier', 'FOURNIL')
if (!tous.some(p => p.nom === 'Tarte aux pommes')) {
  creations.push({ nom: 'Tarte aux pommes', categorie: 'Pâtisserie', tag: 'FOURNIL',
    etab: modeleF.etablissement_id, ttc: 3.80, tva: modeleF.tva, online: true })
  console.log(`   ${'Tarte aux pommes'.padEnd(30)}   —  → 3,80 €  NOUVELLE (absente de la base)`)
}

// ── 2. canettes → 2,00 € à emporter ─────────────────────────────────
console.log('\n2. canettes à 2,00 € à emporter (le prix SALLE du bar ne bouge pas)')
for (const nom of ['Coca-Cola 33 cl', 'Coca-Cola Zéro 33 cl', 'Coca-Cola Cherry 33 cl', 'Ice Tea 33 cl', 'Fanta 33 cl', 'Oasis 33 cl']) {
  const p = trouve(nom, 'FOURNIL'); if (!p) { console.log(`   ⚠ ${nom} introuvable`); continue }
  const actuel = Number(p.prix_vente_ht) * (1 + p.tva / 100)
  const d = 2.00 - actuel
  console.log(`   ${nom.padEnd(30)} ${e(actuel).padStart(5)} → 2,00 €  ${Math.abs(d) < 0.005 ? '=' : (d > 0 ? '+' : '') + e(d)}`)
  if (Math.abs(d) >= 0.005) majPrix.push({ p, ttc: 2.00 })
}
// ⚠️ Le Perrier n'existe qu'au BAR, en salle à 3,00 €. L'affiche le vend à
// emporter : c'est un produit du Fournil qui manque, pas un prix à changer.
if (!trouve('Perrier 33 cl', 'FOURNIL')) {
  const bar = trouve('Perrier 33 cl', 'BAR')
  creations.push({ nom: 'Perrier 33 cl', categorie: 'Boisson fraîche', tag: 'FOURNIL',
    etab: modeleF.etablissement_id, ttc: 2.00, tva: 10, online: true,
    cout: bar?.cout_achat_ht ?? null })
  console.log(`   ${'Perrier 33 cl'.padEnd(30)}   —  → 2,00 €  NOUVEAU à emporter (n'existait qu'au bar)`)
}

// ── 3. bouteilles 1,5 L → 3,50 € ────────────────────────────────────
console.log('\n3. bouteilles 1,5 L à 3,50 €')
for (const p of tous.filter(x => /1,5 L$/.test(x.nom))) {
  const actuel = Number(p.prix_vente_ht) * (1 + p.tva / 100)
  const surAffiche = /Coca-Cola 1,5 L|Orangina|Ice Tea pêche|Oasis tropical/.test(p.nom)
  console.log(`   ${p.nom.padEnd(30)} ${e(actuel).padStart(5)} → 3,50 €${surAffiche ? '' : '   ⚠️ PAS sur l’affiche'}`)
  if (Math.abs(3.50 - actuel) >= 0.005) majPrix.push({ p, ttc: 3.50 })
}

// ── 4. vins de la pizzeria ──────────────────────────────────────────
console.log('\n4. vins à 10,00 € la bouteille (propres à la pizzeria)')
const modeleP = tous.find(p => p.tag_destination === 'PIZZA')
for (const couleur of ['Rouge', 'Rosé', 'Blanc']) {
  const nom = `Bouteille de vin ${couleur.toLowerCase()} 75 cl`
  if (tous.some(p => p.nom === nom)) { console.log(`   = ${nom} existe déjà`); continue }
  // ⚠️ TVA 20 % : alcool, sur place comme à emporter (0113).
  // ⚠️ JAMAIS vendable en ligne : aucun contrôle d'âge sur le click & collect.
  creations.push({ nom, categorie: 'Vin', tag: 'PIZZA', etab: modeleP.etablissement_id,
    ttc: 10.00, tva: 20, online: false })
  console.log(`   ${nom.padEnd(30)}   —  → 10,00 €  NOUVEAU · TVA 20 % · hors ligne`)
}

// ── 5. pizzas desserts ──────────────────────────────────────────────
console.log('\n5. pizzas desserts')
for (const [nom, ttc] of [['Pizza Nutella', 8.00], ['Pizza Nutella banane', 9.00], ['Pizza Nutella banane coco', 10.00]]) {
  if (tous.some(p => p.nom === nom)) { console.log(`   = ${nom} existe déjà`); continue }
  creations.push({ nom, categorie: 'Pizzeria', tag: 'PIZZA', etab: modeleP.etablissement_id, ttc, tva: 10, online: true })
  console.log(`   ${nom.padEnd(30)}   —  → ${e(ttc)} €  NOUVELLE`)
}

console.log(`\n   ${majPrix.length} prix · ${renommages.length} renommage(s) · ${creations.length} création(s)`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
for (const { p, ttc } of majPrix)
  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ prix_vente_ht: ht(ttc, p.tva) }) })
for (const { p, nom } of renommages)
  await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ nom }) })
for (const c of creations)
  await sb('recettes', { method: 'POST', body: JSON.stringify({
    nom: c.nom, categorie: c.categorie, tag_destination: c.tag, etablissement_id: c.etab,
    prix_vente_ht: ht(c.ttc, c.tva), tva: c.tva, vendable_online: c.online, actif: true,
    ...(c.cout != null ? { cout_achat_ht: c.cout } : {}) }) })
console.log(`\n   ✓ écrit. ⚠️ Les créations n'ont PAS de photo : le menu public exige`)
console.log(`     famille ET image, elles resteront donc hors du site tant qu'on ne les`)
console.log(`     aura pas illustrées. Une photo d'emprunt montrerait autre chose.\n`)
