// Softs en bouteille de 1,5 L — demande du gérant, 02/10/2026.
//
// Trois usages, un seul format : à emporter au Fournil, avec les pizzas à
// emporter, et en accompagnement des bouteilles d'alcool. Le 1,5 L est le
// format de la pizzeria et de la grande surface — celui que le client
// reconnaît et dont il connaît le prix ailleurs.
//
// ⚠️ PRIX : 3,90 €. C'est le même food cost que la canette de 33 cl déjà à la
// carte (2,00 € pour 0,60 € de coût, 37 %), donc cohérent avec la maison. Et
// le client reçoit 4,5 fois le volume pour le double du prix : l'argument se
// comprend sans calcul.
//
// ⚠️ TVA 10 %, comme toutes les boissons du Fournil (0113). Pas 5,5 % : le
// taux réduit vaut pour les pains et viennoiseries, pas pour les sodas.
//
// ⚠️⚠️ LE COÛT EST PROVISOIRE, ET DIT COMME TEL. Aucun fournisseur ne nous a
// chiffré le grand format : Euro-Cash a renvoyé son rayon PET vide, DVB doit
// le faire. 1,50 € la bouteille est un repère de gros plausible (le détail
// est autour de 1,80 €), pas un relevé. Mettre zéro aurait été pire : un
// coût nul s'affiche en vert et ferait passer ces bouteilles pour les
// meilleures de la carte — la faute de `statutFoodCost(0)` (0150).
// La première facture DVB tranche, et le prix de vente n'en dépend pas.
//
//   node scripts/softs-bouteilles-15l.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')
const TTC = 3.90, TVA = 10, COUT = 1.50
const HT = Math.round(TTC / (1 + TVA / 100) * 1e4) / 1e4

const PARFUMS = ['Coca-Cola', 'Coca-Cola Zéro', 'Orangina', 'Fanta orange', 'Ice Tea pêche', 'Oasis tropical']

// ⚠️ Rattachées au FOURNIL : c'est là qu'elles se vendent à emporter, et le
// point de vente décide de la ventilation du CA par activité. Les poser au
// bar sortirait ces ventes de l'étage qui les réalise.
const [modele] = await sb('recettes?tag_destination=eq.FOURNIL&categorie=eq.Boisson%20fra%C3%AEche&actif=eq.true&select=etablissement_id&limit=1')
if (!modele) { console.error('  ✗ aucun produit modèle au Fournil'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — softs 1,5 L ──\n`)
console.log(`  prix ${f2(TTC)} € TTC (HT ${f2(HT)}, TVA ${TVA} %) · coût PROVISOIRE ${f2(COUT)} € · food cost ${(COUT / HT * 100).toFixed(0)} % · marge ${f2(HT - COUT)} €`)
console.log(`  repère : la canette de 33 cl est à 2,00 € pour 0,60 € de coût, soit 37 %\n`)

const nouveaux = []
for (const p of PARFUMS) {
  const nom = `${p} 1,5 L`
  const [deja] = await sb(`recettes?nom=eq.${encodeURIComponent(nom)}&select=id`)
  console.log(`  ${deja ? '=' : '+'} ${nom}`)
  if (deja || !ECRIRE) continue
  const [r] = await sb('recettes', { method: 'POST', body: JSON.stringify({
    nom, nom_caisse: nom, categorie: 'Boisson fraîche', tag_destination: 'FOURNIL',
    etablissement_id: modele.etablissement_id,
    prix_vente_ht: HT, tva: TVA, cout_achat_ht: COUT,
    contient_alcool: false,
    // ⚠️ Vendable en ligne : oui. C'est un soft, et le click & collect du
    // Fournil comme la pizza à emporter en ont besoin.
    vendable_online: true,
    description: `Bouteille de ${p} 1,5 L — à emporter, avec une pizza, ou en accompagnement d'une bouteille.`,
    actif: true }) })
  nouveaux.push(r)
}

// ── Les bouteilles d'alcool s'alignent sur ce format ──────────────────
const COUT_ACCOMP = COUT * 2
const bt = await sb('recettes?nom=like.Bouteille*&tag_destination=eq.BAR&actif=eq.true&select=id,nom,prix_vente_ht,cout_achat_ht,description')
console.log(`\n  ── accompagnement des bouteilles : 2 × 1,5 L, coût ${f2(COUT_ACCOMP)} € au lieu du majorant ──\n`)
for (const r of bt.sort((a, z) => a.nom.localeCompare(z.nom))) {
  // Le coût actuel porte le majorant en équivalent 25 cl : on le retire.
  const ancienAccomp = /1 L au choix/.test(r.description ?? '') ? 9.0288 : 0
  const cout = Math.round((Number(r.cout_achat_ht) - ancienAccomp + COUT_ACCOMP) * 1e4) / 1e4
  const ht = Number(r.prix_vente_ht)
  console.log(`  ${r.nom.padEnd(30)} coût ${f2(Number(r.cout_achat_ht))} → ${f2(cout)} €  ·  food cost ${(Number(r.cout_achat_ht) / ht * 100).toFixed(0)} % → ${(cout / ht * 100).toFixed(0)} %  ·  marge ${f2(ht - cout)} €`)
  if (ECRIRE) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({
    cout_achat_ht: cout,
    description: (r.description ?? '').replace(/Servie avec.*$/, `Servie avec 2 bouteilles de soft 1,5 L au choix.`) }) })
}

if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }
console.log(`\n  ✓ ${nouveaux.length} softs créés, ${bt.length} bouteilles recalées`)
if (!Z || !nouveaux.length) { console.log(''); process.exit(0) }
// ⚠️ Tableau NU, un seul appel, TVA en MILLIÈMES. Sur place la loi impose
// 10 % comme à emporter pour un soft : les deux taux sont identiques ici.
const corps = nouveaux.map(r => ({ name: r.nom_caisse, remote_id: r.id,
  price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100), tax: 1000, tax_takeaway: 1000 }))
const rep = await fetch('https://api.zelty.fr/2.11/catalog/dishes', { method: 'POST',
  headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
const j = await rep.json().catch(() => ({}))
console.log(`  → caisse : HTTP ${rep.status} · ${(j.dishes ?? []).length} plat(s) · errno ${j.errno}`)
for (const d of j.dishes ?? [])
  await sb('correspondances_catalogue', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ systeme: 'zelty', identifiant_externe: String(d.id), recette_id: String(d.remote_id) }) })
console.log('  ✓ correspondances enregistrées.\n')
