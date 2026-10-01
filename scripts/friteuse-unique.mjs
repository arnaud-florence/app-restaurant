// Une seule friteuse : TOUT le frit passe à la graisse de bœuf.
// Précision du gérant, 30/09/2026.
//
// ⚠️ L'huile de friture n'était pas qu'une ligne de stock : elle figure dans
// HUIT fiches techniques, à 0,03 L par portion de frites et 0,05 L pour la
// friture de la mer. C'est le taux d'absorption, déjà mesuré — je m'étais
// abstenu de l'inventer hier, il était écrit depuis le début. On le CONVERTIT,
// on ne le réinvente pas : la graisse de bœuf pèse ≈ 0,90 kg/L à froid.
//
// ⚠️ L'huile sort du stock mais reste en base : la désactiver efface son
// historique de prix et ne se défait pas. `stocke = false` la retire de
// l'inventaire et des commandes, c'est tout ce qu'il faut.
//
//   node scripts/friteuse-unique.mjs [--ecrire]
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
const DENSITE = 0.90   // kg par litre, suif de bœuf à 20 °C
const f3 = n => n.toFixed(3).replace('.', ',')

const [huile] = await sb('ingredients?nom=eq.Huile%20de%20friture%20(litre)&select=id,nom,prix_achat_ht,stock_cible')
const [graisse] = await sb('ingredients?nom=eq.Graisse%20de%20b%C5%93uf%20(kg)&select=id,nom,prix_achat_ht')
if (!huile || !graisse) { console.error('  ✗ matières introuvables'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — friteuse unique ──\n`)

const lignes = await sb(`recette_ingredients?ingredient_id=eq.${huile.id}&select=id,quantite,recette:recettes(id,nom,description)`)
console.log(`  ${lignes.length} fiche(s) technique(s) portent l'huile de friture :\n`)
let dOld = 0, dNew = 0
for (const l of lignes) {
  const litres = Number(l.quantite)
  const kg = Math.round(litres * DENSITE * 1e4) / 1e4
  const av = litres * Number(huile.prix_achat_ht), ap = kg * Number(graisse.prix_achat_ht)
  dOld += av; dNew += ap
  console.log(`    ${(l.recette?.nom ?? '?').padEnd(24)} ${f3(litres)} L d'huile (${f3(av)} €)  →  ${f3(kg)} kg de graisse (${f3(ap)} €)`)
  if (ECRIRE) await sb(`recette_ingredients?id=eq.${l.id}`,
    { method: 'PATCH', body: JSON.stringify({ ingredient_id: graisse.id, quantite: kg }) })
}
console.log(`\n    coût matière grasse : ${f3(dOld)} € → ${f3(dNew)} € sur ${lignes.length} plats  (${dNew > dOld ? '+' : ''}${f3(dNew - dOld)} €)`)

// La friture de la mer est frite elle aussi : sa description doit le dire.
const [fm] = await sb('recettes?nom=eq.Friture%20de%20la%20mer&select=id,nom,description')
if (fm && !/graisse de b/i.test(fm.description ?? '')) {
  const d = fm.description.replace(/croustillants/i, 'croustillants frits à la graisse de bœuf')
  console.log(`\n  ▸ ${fm.nom}\n    ${d}`)
  if (ECRIRE) await sb(`recettes?id=eq.${fm.id}`, { method: 'PATCH', body: JSON.stringify({ description: d }) })
}

// L'huile sort du stock : plus aucun consommateur, plus rien à commander.
console.log(`\n  ▸ Huile de friture (litre) — sort du stock (cible ${huile.stock_cible} L effacée)`)
console.log(`    ⚠️ La fiche RESTE en base : la désactiver effacerait son historique de prix,`)
console.log(`       et ce n'est pas réversible. Le jour où un second bac arrive, on la rallume.`)
if (ECRIRE) await sb(`ingredients?id=eq.${huile.id}`,
  { method: 'PATCH', body: JSON.stringify({ stocke: false, stock_cible: null, stock_minimum: null }) })

console.log(ECRIRE ? '\n  ✓ écrit.\n' : '\n  (essai à blanc — relancer avec --ecrire)\n')
