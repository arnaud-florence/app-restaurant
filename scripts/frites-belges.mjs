// Les frites et la graisse de bœuf passent chez La Frite Belge.
// Décision du gérant, 30/09/2026.
//
// ⚠️ Ce rapprochement avait été ÉCARTÉ le 24/09, et à juste titre : « nos
// frites SURGELÉES à 1,80 € ne sont pas leurs 12×12 AVEC PEAU à 1,50 € — le
// prix au kilo diffère parce que le TRAVAIL diffère ». L'ambiguïté n'était
// pas dans les données, elle était dans la décision : le gérant tranche
// aujourd'hui qu'il VEUT la 12×12 avec peau. La règle de la 0151 est
// respectée — la suggestion se calcule, la décision s'enregistre.
//
// ⚠️ LE PRIX SUIT LE FOURNISSEUR (doctrine du 27/09) : garder 1,66 € sur des
// frites désormais achetées ailleurs affirme qu'on paie un tarif qui ne
// s'applique plus. Il arrive marqué ESTIMÉ (0165) — c'est un devis, pas une
// facture — et la première livraison le confirmera.
//
//   node scripts/frites-belges.mjs [--ecrire]
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
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f3 = n => n.toFixed(3).replace('.', ',')

const [lfb] = await sb('fournisseurs?nom=ilike.*frite%20belge*&select=id,nom')
const cat = await sb(`catalogue_fournisseur?fournisseur_id=eq.${lfb.id}&select=id,reference,designation,prix_ht,unite,contenance_valeur,contenance_unite,cle_comparaison,ingredient_id`)
const frites = cat.find(l => l.reference === 'INT-frites-12x12-avec-peau')
const graisse = cat.find(l => l.reference === 'INT-graisse-boeuf-fribel')
if (!frites || !graisse) { console.error('  ✗ lignes La Frite Belge introuvables'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — frites et graisse chez ${lfb.nom} ──\n`)

// ── 1. Les frites changent de fournisseur ─────────────────────────────
const [fr] = await sb('ingredients?nom=eq.Frites%20surgel%C3%A9es%20(kg)&select=id,nom,unite,prix_achat_ht,fournisseur_principal,reference_fournisseur')
const prixFrites = Number(frites.prix_ht)
console.log(`  Frites surgelées (kg)`)
console.log(`    ${fr.fournisseur_principal} ${f3(Number(fr.prix_achat_ht))} €/kg  →  ${lfb.nom} ${f3(prixFrites)} €/kg  (${((prixFrites / Number(fr.prix_achat_ht) - 1) * 100).toFixed(0)} %)`)
console.log(`    « ${frites.designation} », réf ${frites.reference}`)
// ⚠️ La référence de l'ANCIEN fournisseur ne survit pas : un code Félix Potin
// cité à La Frite Belge fait chiffrer autre chose (0142).
if (ECRIRE) {
  await sb(`ingredients?id=eq.${fr.id}`, { method: 'PATCH', body: JSON.stringify({
    fournisseur_principal: lfb.nom, prix_achat_ht: prixFrites, prix_estime: true,
    reference_fournisseur: frites.reference }) })
  await sb(`catalogue_fournisseur?id=eq.${frites.id}`, { method: 'PATCH',
    body: JSON.stringify({ cle_comparaison: 'Frites surgelées (kg)', ingredient_id: fr.id }) })
}

// ── 2. La graisse de bœuf n'existait pas ──────────────────────────────
const parKg = Number(graisse.prix_ht) / Number(graisse.contenance_valeur)
console.log(`\n  Graisse de bœuf (kg)  — matière NOUVELLE`)
console.log(`    ${graisse.designation} : ${f3(Number(graisse.prix_ht))} € le carton de ${graisse.contenance_valeur} kg  →  ${f3(parKg)} €/kg`)
const [deja] = await sb('ingredients?nom=eq.Graisse%20de%20b%C5%93uf%20(kg)&select=id')
if (deja) console.log('    (existe déjà)')
else if (ECRIRE) {
  const [n] = await sb('ingredients', { method: 'POST', body: JSON.stringify({
    nom: 'Graisse de bœuf (kg)', unite: 'kg',
    // ⚠️ L'unité est celle de la LIGNE DE FACTURE, pas une unité « logique » :
    // compter en cartons rendrait les entrées incumulables (0133).
    prix_achat_ht: Math.round(parKg * 1e4) / 1e4, prix_estime: true,
    stocke: true, actif: true,
    fournisseur_principal: lfb.nom, reference_fournisseur: graisse.reference,
    categorie: 'Restaurant' }) })
  await sb(`catalogue_fournisseur?id=eq.${graisse.id}`, { method: 'PATCH',
    body: JSON.stringify({ cle_comparaison: 'Graisse de bœuf (kg)', ingredient_id: n.id }) })
  console.log('    ✓ créée et rattachée')
}

// ── 3. Ce que ça change sur les plats ─────────────────────────────────
const compo = await sb(`recette_ingredients?ingredient_id=eq.${fr.id}&select=quantite,recette:recettes(nom,prix_vente_ht)`)
console.log(`\n  ${compo.length} plat(s) utilisent les frites :`)
let gain = 0
for (const c of compo) {
  const d = (Number(fr.prix_achat_ht) - prixFrites) * Number(c.quantite)
  gain += d
  console.log(`    ${(c.recette?.nom ?? '?').padEnd(24)} ${Number(c.quantite)} kg  →  ${d >= 0 ? '+' : ''}${f3(d)} € de marge`)
}
console.log(`\n  ${f3(gain / compo.length)} € de marge gagnée par plat en moyenne.`)
console.log(`  ⚠️ L'enjeu n'est pas là : 16 centimes au kilo ne changent rien. C'est la`)
console.log(`     12×12 avec peau à la graisse de bœuf qui est une signature.`)
console.log(ECRIRE ? '\n  ✓ écrit.\n' : '\n  (essai à blanc — relancer avec --ecrire)\n')
