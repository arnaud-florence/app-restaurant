// Krill face à nos prix — le comparatif, 02/10/2026.
//
// ⚠️ DEUX PARTIES, ET LA SECONDE COMPTE AUTANT. `comparer()` — la même
// fonction que `/admin/tarifs-fournisseurs`, `/admin/achats` et l'agent Stock
// — ne conclut que si les bases concordent. Quand elle s'abstient, on ne
// bricole pas un pourcentage : on donne les deux prix BRUTS et on dit pourquoi
// la machine n'a pas tranché. Un écart calculé sur deux bases différentes est
// pire qu'une absence d'écart, parce qu'on le croit.
//
//   node scripts/comparatif-krill.mjs
import fs from 'node:fs'
import { comparer } from '../.next/cache/tarifs-lib/tarifs-fournisseurs.js'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const lire = async q => { const o = []; for (let i = 0; ; i += 1000) { const p = JSON.parse(await (await fetch(`${U}/rest/v1/${q}&order=id&offset=${i}&limit=1000`, { headers: H })).text()); o.push(...p); if (p.length < 1000) break } return o }
const f = new Map((await lire('fournisseurs?select=id,nom')).map(x => [x.id, x.nom]))
const cat = (await lire('catalogue_fournisseur?select=id,fournisseur_id,reference,designation,unite,prix_ht,colis_quantite,colis_libelle,contenance_valeur,contenance_unite,cle_comparaison,date_tarif,source,nature&actif=is.true'))
  .map(x => ({ ...x, fournisseur_nom: f.get(x.fournisseur_id) ?? '?' }))
const e3 = n => n.toFixed(3).replace('.', ',')

const groupes = comparer(cat).filter(g => g.lignes.some(l => l.fournisseur_nom === 'Krill'))
const tranches = [], abstentions = []
for (const g of groupes) {
  const kr = g.lignes.find(l => l.fournisseur_nom === 'Krill')
  const nous = g.lignes.filter(l => l.fournisseur_nom !== 'Krill')
  const comparables = g.lignes.filter(l => l.ref)
  // une conclusion n'existe que si Krill ET au moins un autre partagent la base
  const base = kr?.ref?.unite
  const vis = nous.filter(l => l.ref && l.ref.unite === base && (l.ref.format ?? null) === (kr.ref.format ?? null))
  if (kr?.ref && vis.length) tranches.push({ g, kr, vis })
  else abstentions.push({ g, kr, nous })
}

console.log('\n════ KRILL FACE À NOS PRIX ════')
console.log(`   offre 056/260178 du 02/10/2026, valable au 31/10 — 35 références importées\n`)
console.log(`── ${tranches.length} comparaisons que la machine tranche\n`)
console.log('   produit                        Krill        nous      écart   chez qui')
for (const { g, kr, vis } of tranches) {
  const meilleur = vis.slice().sort((a, b) => a.ref.prix - b.ref.prix)[0]
  const d = (kr.ref.prix - meilleur.ref.prix) / meilleur.ref.prix * 100
  console.log(`   ${g.cle.slice(0, 28).padEnd(28)} ${e3(kr.ref.prix).padStart(8)}  ${e3(meilleur.ref.prix).padStart(9)}`
    + `  ${((d > 0 ? '+' : '') + d.toFixed(0) + ' %').padStart(7)}  ${meilleur.fournisseur_nom}`)
  console.log(`   ${' '.repeat(28)} €/${kr.ref.unite} — ${d < -10 ? '✅ KRILL MOINS CHER' : d > 10 ? 'plus cher' : 'écart sous 10 %, du bruit'}`)
}
console.log(`\n── ${abstentions.length} où elle REFUSE de conclure, et c'est juste\n`)
for (const { g, kr, nous } of abstentions) {
  console.log(`   ${g.cle}`)
  console.log(`      Krill : ${kr.prix_ht} €/${kr.unite}${kr.ref ? ` → ${e3(kr.ref.prix)} €/${kr.ref.unite}` : ''}  ${kr.designation.slice(0, 44)}`)
  for (const l of nous.slice(0, 3))
    console.log(`      ${l.fournisseur_nom.padEnd(10)}: ${l.prix_ht} €/${l.unite}${l.ref ? ` → ${e3(l.ref.prix)} €/${l.ref.unite}` : ''}  ${l.designation.slice(0, 40)}`)
  console.log(`      ↳ bases différentes : un prix au kilo d'un côté, à la pièce ou au colis de l'autre.`)
  console.log(`        Les rapprocher demanderait de réécrire nos lignes Arti'Pat, dont la`)
  console.log(`        « contenance » est un NOMBRE DE PIÈCES, pas un poids.\n`)
}
console.log('── calculé à la main, là où la machine s\'abstient ──')
console.log('   ⚠️ Chiffres posés par moi, pas par le comparateur : à vérifier avant d\'engager.\n')
for (const [quoi, krill, nous, note] of [
  ['Paris-Brest 80 g', '11,25 €/kg (0,90 €/pièce)', '20,47 €/kg (1,637 €/pièce)', '−45 % — même poids des deux côtés, c\'est la plus grosse économie de l\'offre'],
  ['Cookie chocolat', '9,32 €/kg (106 g à 0,988 €)', '15,02 €/kg (80 g à 1,202 €)', '−38 % — mais le cookie Krill est plus GROS, donc moins de pièces au kilo'],
  ['Sauce pizza 5/1', '9,199 € la boîte', '7,001 € la boîte (Gineys, payé)', '+31 % — Krill est plus cher sur ce format'],
  ['Éclair chocolat', '11,13 €/kg (80 g à 0,89 €)', '10,80 €/kg (120 g à 1,296 €)', '+3 % — marginal, et l\'éclair Krill est plus petit'],
  ['Tartelette citron', '20,00 €/kg (97 g à 1,94 €)', '12,38 €/kg (120 g à 1,486 €)', '+62 % — Krill est plus cher ET sa tartelette est plus petite'],
]) {
  console.log(`   ${quoi.padEnd(20)} Krill ${krill.padEnd(28)} nous ${nous}`)
  console.log(`   ${' '.repeat(20)} → ${note}\n`)
}
