// La carte des boissons, avec ce qu'elle rapporte — 02/10/2026.
//
// Achat, vente, coefficient, marge, food cost, ligne par ligne et par famille.
//
// ⚠️ UN COÛT INCONNU N'EST PAS UN COÛT NUL. Les produits sans
// `cout_achat_ht` sont affichés « — » et EXCLUS des moyennes : les compter
// pour zéro donnerait une marge de 100 % et une moyenne flatteuse et fausse.
// C'est la règle de `statutFoodCost(0)` (0150), appliquée à un tableau.
//
// ⚠️ LES MOYENNES SONT NON PONDÉRÉES. Le bar n'a jamais vendu : il n'existe
// aucun historique pour pondérer. Une moyenne par produit dit ce que rapporte
// une LIGNE DE CARTE, pas ce que rapportera le comptoir — le demi pèsera plus
// que le Jack Daniel's. À repondérer après deux semaines de ventes.
//
// ⚠️ DEUX PRIX QUAND ILS DIFFÈRENT : `prix_sur_place_ttc` est le tarif salle
// (verre consigné), `prix_vente_ht` celui de l'emporter (0144). Ne montrer que
// l'un des deux ferait croire à un écart de marge qui n'existe pas.
//
// ⚠️ LA MARGE SE MESURE AU PRIX AUQUEL LE PRODUIT SE VEND VRAIMENT : le tarif
// SALLE pour une référence du BAR, celui de l'EMPORTER pour une référence du
// FOURNIL. Juger une canette de comptoir sur son prix de table dirait qu'elle
// va bien alors qu'elle n'est jamais vendue à ce prix-là.
//
// ⚠️ LA MOYENNE GÉNÉRALE EST DONNÉE DEUX FOIS, bouteilles comprises et hors
// bouteilles. Six bouteilles à 69 € au milieu de cafés à 1,40 € tirent la
// moyenne à plus de 5 € : un chiffre juste, et qui ne décrit aucune
// consommation réelle.
//
//   node scripts/carte-boissons-marges.mjs [--csv]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const CSV = process.argv.includes('--csv')

const FAMILLES = ['Bière', 'Apéritif', 'Alcool', 'Boisson fraîche', 'Boisson chaude']
const q = `recettes?actif=is.true&categorie=in.(${FAMILLES.map(encodeURIComponent).join(',')})` +
  `&select=nom,categorie,tag_destination,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht,contient_alcool&order=categorie,nom`
const prod = await (await fetch(`${U}/rest/v1/${q}`, { headers: H })).json()

const e = n => n == null ? '—' : n.toFixed(2).replace('.', ',')
const pad = (s, n) => String(s).padEnd(n)
const num = (s, n) => String(s).padStart(n)

// Le prix que paie le client assis : le tarif salle s'il existe, sinon le prix
// de vente. C'est lui qui fait la marge d'un verre servi.
const lignes = prod.map(p => {
  const htEmporter = Number(p.prix_vente_ht)
  const ttcEmporter = htEmporter * (1 + p.tva / 100)
  const ttcSalle = p.prix_sur_place_ttc == null ? ttcEmporter : Number(p.prix_sur_place_ttc)
  const htSalle = ttcSalle / (1 + p.tva / 100)
  const cout = p.cout_achat_ht == null ? null : Number(p.cout_achat_ht)
  // le prix de référence : salle au bar, emporter au Fournil
  const auBar = p.tag_destination === 'BAR'
  const ttcRef = auBar ? ttcSalle : ttcEmporter
  const htRef = auBar ? htSalle : htEmporter
  return {
    ...p, cout, ttcSalle, htSalle, ttcEmporter, auBar, ttcRef, htRef,
    deuxPrix: p.prix_sur_place_ttc != null && Math.abs(ttcSalle - ttcEmporter) > 0.005,
    // coefficient du métier : prix de vente TTC ÷ prix d'achat HT
    coef: cout ? ttcRef / cout : null,
    marge: cout == null ? null : htRef - cout,
    fc: cout == null ? null : cout / htRef * 100,
    bouteille: /^Bouteille /.test(p.nom),
  }
})

const sorties = []
console.log('\n════ CARTE DES BOISSONS — ACHAT, VENTE, MARGE ════\n')
for (const fam of FAMILLES) {
  const l = lignes.filter(x => x.categorie === fam)
  if (!l.length) continue
  console.log(`── ${fam} — ${l.length} références`)
  console.log(`   ${pad('', 30)} ${num('achat', 7)} ${num('vente', 7)} ${num('coef', 6)} ${num('marge', 7)} ${num('f.cost', 7)}`)
  for (const x of l) {
    const sfx = x.deuxPrix ? `  (${x.auBar ? 'emporter ' + e(x.ttcEmporter) : 'salle ' + e(x.ttcSalle)} €)` : ''
    console.log(`   ${pad(x.nom.slice(0, 30), 30)} ${num(e(x.cout), 7)} ${num(e(x.ttcSalle), 7)} `
      + `${num(x.coef ? x.coef.toFixed(1).replace('.', ',') : '—', 6)} ${num(e(x.marge), 7)} `
      + `${num(x.fc == null ? '—' : x.fc.toFixed(0) + ' %', 7)}${sfx}`)
    sorties.push([fam, x.nom, x.tag_destination, e(x.cout), e(x.ttcSalle), e(x.ttcEmporter),
      x.coef ? x.coef.toFixed(2).replace('.', ',') : '', e(x.marge), x.fc == null ? '' : x.fc.toFixed(1).replace('.', ','), x.tva])
  }
  // ⚠️ moyennes sur les SEULES lignes chiffrées
  const c = l.filter(x => x.cout != null)
  const inconnus = l.length - c.length
  if (c.length) {
    const m = c.reduce((s, x) => s + x.marge, 0) / c.length
    const f = c.reduce((s, x) => s + x.fc, 0) / c.length
    const k = c.reduce((s, x) => s + x.coef, 0) / c.length
    console.log(`   ${pad('── moyenne de la famille', 30)} ${num('', 7)} ${num('', 7)} `
      + `${num(k.toFixed(1).replace('.', ','), 6)} ${num(e(m), 7)} ${num(f.toFixed(0) + ' %', 7)}`
      + (inconnus ? `   (${inconnus} coût inconnu, exclu${inconnus > 1 ? 's' : ''})` : ''))
  } else console.log(`   ${pad('── aucune ligne chiffrée', 30)}`)
  console.log('')
}

const c = lignes.filter(x => x.cout != null)
const inc = lignes.filter(x => x.cout == null)
const bilan = l => ({
  n: l.length,
  coef: l.reduce((s, x) => s + x.coef, 0) / l.length,
  marge: l.reduce((s, x) => s + x.marge, 0) / l.length,
  fc: l.reduce((s, x) => s + x.fc, 0) / l.length,
})
const tout = bilan(c), verre = bilan(c.filter(x => !x.bouteille))
console.log('════ TOUTE LA CARTE ════\n')
console.log(`   ${lignes.length} boissons actives, dont ${c.length} chiffrées\n`)
console.log(`                        coef    marge HT   food cost`)
console.log(`   au verre (${num(verre.n, 2)})        ${num(verre.coef.toFixed(2).replace('.', ','), 4)}    ${num(e(verre.marge) + ' €', 8)}    ${verre.fc.toFixed(1).replace('.', ',')} %`)
console.log(`   avec les bouteilles  ${num(tout.coef.toFixed(2).replace('.', ','), 4)}    ${num(e(tout.marge) + ' €', 8)}    ${tout.fc.toFixed(1).replace('.', ',')} %`)
console.log(`\n   ⚠️ C'est la première ligne qui décrit le bar. Six bouteilles à`)
console.log(`      69 € au milieu de cafés à 1,40 € tirent la moyenne à ${e(tout.marge)} € —`)
console.log(`      un chiffre juste, qui ne décrit aucune consommation réelle.`)
// ⚠️ LE PLANCHER DE 1,40 € EST CELUI DU BAR, ET DE LUI SEUL. Il vient du coût
// de service au comptoir — 17,23 €/h chargés ÷ 15 consommations = 1,15 € par
// verre (0144) : un verre servi prend le même temps qu'il soit vendu 2,50 € ou
// 4 €. Une canette tendue avec le pain au Fournil ne porte pas ce coût ; lui
// appliquer le même seuil produirait huit fausses alertes, et un rapport qui
// crie pour rien n'est plus lu.
const PLANCHER = 1.40
const sous = c.filter(x => x.auBar && x.marge < PLANCHER).sort((a, b) => a.marge - b.marge)
console.log(`\n   ⚠️ ${sous.length} au BAR sous le plancher de ${e(PLANCHER)} € HT (la marge du demi) :`)
for (const x of sous) console.log(`      ${pad(x.nom.slice(0, 28), 28)} ${num(e(x.marge), 7)} €   f.cost ${x.fc.toFixed(0)} %`)
// Au Fournil, pas de plancher de service — mais un food cost élevé reste un
// food cost élevé : c'est le seuil rouge du projet qui s'applique (32 %).
const chauds = c.filter(x => !x.auBar && x.fc > 32).sort((a, b) => b.fc - a.fc)
console.log(`\n   ⚠️ ${chauds.length} au FOURNIL au-dessus du seuil rouge de 32 % :`)
for (const x of chauds) console.log(`      ${pad(x.nom.slice(0, 28), 28)} ${num(e(x.marge), 7)} €   f.cost ${x.fc.toFixed(0)} %`)
if (inc.length) {
  console.log(`\n   ⚠️ ${inc.length} sans coût d'achat — ni marge ni food cost calculables :`)
  console.log('      ' + inc.map(x => x.nom).join(' · '))
}
console.log(`\n   ⚠️ Moyennes NON PONDÉRÉES : le bar n'a jamais vendu, il n'existe`)
console.log(`      aucun historique pour pondérer. Elles disent ce que rapporte une`)
console.log(`      LIGNE DE CARTE, pas ce que rapportera le comptoir.\n`)

if (CSV) {
  const t = [['Famille', 'Produit', 'Poste', 'Achat HT', 'Vente TTC salle', 'Vente TTC emporter', 'Coef', 'Marge HT', 'Food cost %', 'TVA'], ...sorties]
  fs.writeFileSync('data/carte-boissons-marges.csv',
    '﻿' + t.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'))
  console.log('   → data/carte-boissons-marges.csv\n')
}
