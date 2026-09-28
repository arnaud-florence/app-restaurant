// Sortir le Pago de la carte : les jus passent sur l'autre marque.
//
//   node scripts/jus-sans-pago.mjs [--ecrire]
//
// Décision du gérant, 28/09/2026. Euro-Cash porte DEUX gammes de jus en
// 33 cl, et le catalogue ne dit la marque d'aucune — elle est imprimée sur
// la photo de la bouteille, pas dans le texte du PDF.
//
//   · réf. 520xx-521xx à 0,65-0,80 € — « Orange Brésil 100 % », « Pomme
//     France 100 % », « Ananas Costa Rica », « Lichi Vietnam », plus les
//     parfums cerise, litchi, melon, mojito, pastèque. Nommer le pays
//     d'origine de chaque fruit est la signature de PAGO ;
//   · réf. 54012 / 54078 / 54014 à 0,90 € — « Pomme », « Orange »,
//     « Multifruits », sans origine ni mention « 100 % ». C'est l'autre
//     marque, celle que le gérant retient.
//
// ⚠️ ELLE COÛTE PLUS CHER, ET IL FAUT LE DIRE : 2,73 €/L contre 1,97 à
// 2,12 €/L. Ce n'est pas une économie, c'est un choix de produit — et il
// se paie environ 0,22 € par bouteille.
//
// ⚠️⚠️ CE N'EST PAS UN CHANGEMENT DE FOURNISSEUR, C'EST UNE FUSION. Les
// deux jus « nature » de la carte sont DÉJÀ sur cette marque depuis ce
// matin (« Jus d'orange 33 cl » et « Jus de pomme 33 cl », réf. 54078 et
// 54012). Repointer les Pago dessus créerait quatre doublons : même
// référence, même bouteille, deux boutons. On retire donc les Pago.
//
// ⚠️ Les ventes SUIVENT. Un produit désactivé emporte son historique avec
// lui : le chiffre d'affaires disparaîtrait de « CA par produit » alors que
// la vente a bien eu lieu (règle de fusion du 28/08/2026).
//
// ⚠️ Et le `nom_caisse` est EFFACÉ sur les produits retirés : sans ça le
// miroir des tickets pourrait encore les choisir, et le rattachement
// redeviendrait ambigu.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const api = async (c, init) => {
  const r = await fetch(`${U}/rest/v1/${c}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t}`); return t ? JSON.parse(t) : null
}

// Ce qui part, et vers quoi ses ventes sont reversées.
const RETRAITS = [
  // ⚠️ L'apostrophe est DROITE en base (« Jus d'orange »), pas typographique :
  // avec « ’ » le repreneur est introuvable et le retrait échoue en silence.
  ['Pago orange 33 cl', "Jus d'orange 33 cl"],
  ['Pago orange 20 cl', "Jus d'orange 33 cl"],
  ['Pago pomme 33 cl',  'Jus de pomme 33 cl'],
  ['Pago pomme 20 cl',  'Jus de pomme 33 cl'],
]

const rec = await api('recettes?select=id,nom,actif,nom_caisse,prix_vente_ht,tva,cout_achat_ht,reference_fournisseur&limit=1000')
const arts = await api('commande_articles?select=id,recette_id,quantite&limit=20000')
const ventes = new Map()
for (const a of arts) ventes.set(a.recette_id, (ventes.get(a.recette_id) ?? 0) + Number(a.quantite || 0))

const plan = [], erreurs = []
for (const [sortant, repreneur] of RETRAITS) {
  const s = rec.find(r => r.nom === sortant && r.actif)
  const d = rec.find(r => r.nom === repreneur && r.actif)
  if (!s) { erreurs.push(`produit introuvable ou déjà retiré : ${sortant}`); continue }
  if (!d) { erreurs.push(`repreneur introuvable : ${repreneur}`); continue }
  // ⚠️ On ne retire rien vers un repreneur qui n'a pas de coût : on
  // remplacerait un produit chiffré par un produit aveugle.
  if (!d.cout_achat_ht) { erreurs.push(`${repreneur} n'a pas de coût d'achat`); continue }
  plan.push({ s, d, q: ventes.get(s.id) ?? 0, lignes: arts.filter(a => a.recette_id === s.id).length })
}

console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'}\n`)
console.log('── ce qui sort de la carte ──\n')
for (const p of plan) {
  const ttc = Number(p.s.prix_vente_ht) * (1 + Number(p.s.tva) / 100)
  console.log(`  − ${p.s.nom.padEnd(20)} ${ttc.toFixed(2)} € TTC  ·  ${p.q} vente(s) reversée(s) sur « ${p.d.nom} »`)
}
console.log('\n── ce qui reste, sur l’autre marque ──\n')
for (const d of [...new Set(plan.map(p => p.d))]) {
  const ttc = Number(d.prix_vente_ht) * (1 + Number(d.tva) / 100)
  const fc = Number(d.cout_achat_ht) / Number(d.prix_vente_ht) * 100
  console.log(`  ✓ ${d.nom.padEnd(20)} ${ttc.toFixed(2)} € TTC  ·  achat ${Number(d.cout_achat_ht).toFixed(2)} € (réf. ${d.reference_fournisseur})  ·  food cost ${fc.toFixed(0)} %`)
}
if (erreurs.length) { console.log(`\n⚠️ ${erreurs.length} problème(s) :`); erreurs.forEach(e => console.log('  ·', e)) }

console.log(`\n⚠️ LE 20 CL DISPARAÎT : Euro-Cash n'a chiffré aucun jus en 20 cl`)
console.log(`   (« Orange & Ananas » et « Tropico » y sont en 20 cl, tous deux sans prix).`)
console.log(`⚠️ LE 33 CL PASSE DE 2,00 € À 1,80 € : c'est le tarif des jus nature,`)
console.log(`   qui restent. Le Pago était le seul jus à 2,00 €.`)
console.log(`⚠️ Les quatre boutons restent sur la caisse Zelty jusqu'à leur retrait`)
console.log(`   dans le back-office — l'API ne sait pas désactiver un plat déjà lié.`)

if (!ECRIRE) { console.log('\nRien écrit. Relancer avec --ecrire.'); process.exit(erreurs.length ? 1 : 0) }
if (erreurs.length) { console.error('\n⛔ Rien écrit.'); process.exit(1) }

for (const p of plan) {
  if (p.lignes) await api(`commande_articles?recette_id=eq.${p.s.id}`, { method: 'PATCH', body: JSON.stringify({ recette_id: p.d.id }) })
  await api(`recettes?id=eq.${p.s.id}`, { method: 'PATCH', body: JSON.stringify({ actif: false, nom_caisse: null, vendable_online: false }) })
}
console.log(`\n✅ ${plan.length} produit(s) retiré(s), ventes reversées.`)
