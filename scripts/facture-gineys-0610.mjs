// La facture Gineys 03777865 du 06/10/2026 — première livraison d'ouverture.
//
// ⚠️⚠️ LA PROPAGATION DES PRIX FACTURE → PRODUITS EST TOUJOURS À LA PIÈCE.
// Le prix de ligne Gineys est celui du COLIS (« CROISSANT … C=56 » = 32,775 €
// le carton) : écrit tel quel dans `cout_achat_ht`, il a déjà produit un
// croissant à 40 € de coût (22/08, 4 produits corrompus). On divise par le
// C=N, puis on multiplie par `unites_par_achat` — une part de flan coûte le
// dixième du flan.
//
// ⚠️ Et on REFUSE tout coût atteignant 95 % du prix de vente HT : à ce
// niveau ce n'est plus une marge écrasée, c'est une erreur de saisie.
//
// Usage : node scripts/facture-gineys-0610.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')

const FACTURE = { numero: '03777865', date: '2026-10-06', ht: 943.07, ttc: 1012.96 }

// code, désignation, colis, PU HT net du colis
const L = [
  ['0071031', 'PAIN PRECUIT 58CM 450G ARTIPAT C=20', 1, 16.205],
  ['0073480', 'CROISSANT COURBE PREPOUSSE 90G VENDOME C=56', 3, 32.775],
  ['0077901', 'PATON A PIZZA CRU 350G C=30', 5, 18.500],
  ['0071170', 'BAGUETTE CAMPESTRE MULTICEREALE 51CM 295G ARTIPAT C=25', 1, 20.308],
  ['0073563', 'PAIN AU CHOCOLAT PREPOUSSE 85G SIGNATURE C=60', 3, 31.926],
  ['0077903', 'PATON A PIZZA 250G C=40', 1, 18.150],
  ['0071374', 'PAVE LE JEANNOT PRECUIT SUR SOLE 450G ARTIPAT C=16', 1, 26.870],
  ['0073326', 'MINI BEIGNET NATURE 19G ARTIPAT C=175', 1, 36.140],
  ['0073328', 'MINI BEIGNET CHOCOLAT NOISETTE 25G ARTIPAT C=175', 1, 52.010],
  ['0076430', 'CANELE DE BORDEAUX 60G ARTIPAT C=30', 1, 14.881],
  ['0071908', 'PLAQUE FOCACCIA AIL BASILIC CUITE 560G ARTIPAT C=5', 1, 39.924],
  ['0071803', 'FOCACCIA TOMATE CERISE CUITE 37.5X27.5CM 800G C=4', 1, 31.750],
  ['0071809', 'FOCACCIA PRE-GRILLEE PRE-TRANCHE PRECUIT 14.5X9.5CM 90G C=36', 1, 25.123],
  ['0071365', 'PAIN COMPLET PRECUIT SUR SOLE 27CM 350G ARTIPAT C=20', 1, 19.244],
  ['0072550', 'CHAUSSON AU POMME CRU 100G DELICES C=54', 1, 20.142],
  ['0073321', 'BIG DONUT SUCRE 65G C=48', 1, 26.827],
  ['0073367', 'DOT MIX BOX 52G C=60', 1, 42.732],
  ['0073506', 'PAIN AU RAISIN PAC 110G CARACTERE C=60', 1, 32.623],
  ['0073752', 'COOKIE FOURRE AU CHOCOLAT LAIT 80G COOKIE DE JULIE C=30', 1, 36.049],
  ['0071149', 'BAGUETTE LA JEANNETTE PRECUITE 40CM 270G ARTIPAT C=25', 3, 16.302],
  ['0071012', 'PAIN PARIS PRECUIT 50CM 280G ARTIPAT C=20', 1, 20.290],
  // Hygiène, TVA 20 % — aucun produit vendu derrière.
  ['0180818', 'DISTRIBUTEUR PUSH BLANC SAVON LIQUIDE', 2, 7.800],
  ['0180506', 'DISTRIBUTEUR BLANC BOBINE DEVIDAGE CENTRAL', 2, 14.640],
  ['0180816', 'LOTION MAIN LAVANTE DESINFECTANTE ANTIBACTERIENNE 1L C=6', 1, 69.875],
  ['0180503', 'BOBINE A DEVIDAGE CENTRAL ECOLABEL C=6', 1, 9.535],
]

const colisage = d => { const m = d.match(/C=(\d+)(?!\d)/); return m ? Number(m[1]) : null }

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(o.headers ?? {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

// ⚠️ Contrôle d'extraction : la somme des lignes doit retomber sur le total
// imprimé (aux 3,99 € de frais que la facture porte à part). Un décalage de
// colonne ne lève aucune erreur, il rend des nombres plausibles.
const somme = L.reduce((s, [, , q, pu]) => s + Math.round(q * pu * 100) / 100, 0)
console.log(`\n📄 Facture ${FACTURE.numero} du ${FACTURE.date}`)
console.log(`   ${L.length} lignes · somme ${somme.toFixed(2)} € + 3,99 € de frais = ${(somme + 3.99).toFixed(2)} €`)
console.log(`   total imprimé : ${FACTURE.ht.toFixed(2)} € HT`)
// ⚠️ Tolérance de 5 centimes, et pas zéro : la facture éclate certaines
// références en DEUX lignes (croissant 2 colis puis 1 colis, pain au
// chocolat idem), chacune arrondie au centime. En les fusionnant on perd
// l'arrondi intermédiaire. Au-delà de 5 centimes, c'est une colonne mal
// lue — et on refuse d'écrire.
if (Math.abs(somme + 3.99 - FACTURE.ht) > 0.05) {
  console.error(`⛔ Écart de ${(somme + 3.99 - FACTURE.ht).toFixed(2)} € — rien n'est écrit.`)
  process.exit(1)
}
console.log(`   ✓ concorde`)

const [f] = await sb('fournisseurs?select=id,nom&nom=eq.Gineys%20(Nicolas)')
const prod = await sb('recettes?select=id,nom,categorie,actif,libelle_achat,reference_fournisseur,cout_achat_ht,prix_vente_ht,unites_par_achat')
const ings = await sb('ingredients?select=id,nom,unite,prix_achat_ht,prix_estime,reference_fournisseur,libelle_achat')

/**
 * ⚠️⚠️ L'UNITÉ DE LA MATIÈRE DÉCIDE, PAS LE COLISAGE.
 *
 * `ingredients.unite` doit être celle de la LIGNE DE FACTURE (0133) : si
 * elle dit « colis 36 », le prix stocké est celui du COLIS et il ne faut
 * surtout pas le diviser par 36. Vécu en écrivant ce script : « Pain
 * focaccia », en colis de 36, passait de 25,124 à 0,6979 — un facteur
 * trente-six, affiché comme une baisse de 97 %. C'est le piège inverse du
 * croissant à 40 € : là on multipliait un prix déjà au colis, ici on
 * divisait un prix déjà au colis.
 */
const prixPourMatiere = (ing, puColis, c) => {
  const u = String(ing.unite ?? '').toLowerCase()
  if (/^(colis|carton|col)\b/.test(u)) return Number(puColis.toFixed(4))
  return Number((c ? puColis / c : puColis).toFixed(4))
}
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

const maj = [], refus = [], orphelines = []
for (const [ref, des, q, pu] of L) {
  const c = colisage(des)
  const unit = c ? pu / c : pu           // sans C=N, la ligne EST à l'unité
  // ⚠️ RÉFÉRENCE D'ABORD, LIBELLÉ ENSUITE (0142) : une référence ne change
  // pas quand le libellé change, et ne confond pas deux produits proches.
  let cibles = prod.filter(p => p.reference_fournisseur === ref)
  if (!cibles.length) cibles = prod.filter(p => p.libelle_achat && norm(p.libelle_achat) === norm(des))
  // ⚠️ Référence d'abord, libellé ensuite — même ordre que pour les produits.
  let mat = ings.filter(i => i.reference_fournisseur === ref)
  if (!mat.length) mat = ings.filter(i => i.libelle_achat && norm(i.libelle_achat) === norm(des))
  if (!cibles.length && !mat.length) { orphelines.push({ ref, des, unit }); continue }
  for (const p of cibles) {
    const cout = Number((unit * (Number(p.unites_par_achat) || 1)).toFixed(4))
    const vente = p.prix_vente_ht == null ? null : Number(p.prix_vente_ht)
    if (vente != null && vente > 0 && cout >= vente * 0.95) { refus.push({ p, cout, vente }); continue }
    if (Number(p.cout_achat_ht) === cout) continue
    maj.push({ t: 'produit', id: p.id, nom: p.nom, avant: p.cout_achat_ht, apres: cout, ref })
  }
  for (const i of mat) {
    const px = prixPourMatiere(i, pu, c)
    const dejaBon = Number(i.prix_achat_ht) === px && i.prix_estime === false && i.reference_fournisseur === ref
    if (dejaBon) continue
    maj.push({ t: 'matière', id: i.id, nom: i.nom, unite: i.unite,
      avant: i.prix_achat_ht, apres: px, ref, apprendre: !i.reference_fournisseur })
  }
}

console.log(`\n── ${maj.length} prix à mettre à jour ──`)
for (const m of maj) {
  const d = m.avant ? ((m.apres / Number(m.avant) - 1) * 100) : null
  console.log(`   ${m.t.padEnd(8)} ${m.nom.slice(0, 30).padEnd(30)} ${String(m.avant ?? '—').padStart(8)} → ${m.apres.toFixed(4).padStart(8)}  ${d != null ? (d >= 0 ? '+' : '') + d.toFixed(1) + '%' : ''}${m.unite ? '  [' + m.unite + ']' : ''}${m.apprendre ? '  + réf apprise' : ''}`)
}
if (refus.length) {
  console.log(`\n── ⚠️ ${refus.length} REFUS (coût ≥ 95 % du prix de vente) ──`)
  for (const r of refus) console.log(`   ${r.p.nom} : ${r.cout} € contre ${r.vente} € HT de vente`)
}
console.log(`\n── ${orphelines.length} ligne(s) sans produit ni matière ──`)
for (const o of orphelines) console.log(`   ${o.ref}  ${o.des.slice(0, 50).padEnd(50)} ${o.unit.toFixed(4)} €/unité`)

if (!ECRIRE) { console.log(`\n   (essai à blanc — relancer avec --ecrire)\n`); process.exit(0) }

for (const m of maj) {
  if (m.t === 'produit') await sb(`recettes?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ cout_achat_ht: m.apres }) })
  // ⚠️ Une facture est une PREUVE : le prix cesse d'être une estimation.
  else {
    // ⚠️ La correspondance S'APPREND au passage (0142) : une matière
    // rapprochée par le LIBELLÉ et dont la ligne porte une référence
    // l'enregistre, et le scan suivant est exact. Jamais d'écrasement.
    const patch = { prix_achat_ht: m.apres, prix_estime: false }
    if (m.apprendre) patch.reference_fournisseur = m.ref
    await sb(`ingredients?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
}
console.log(`\n   ✅ ${maj.length} prix mis à jour depuis la facture\n`)
