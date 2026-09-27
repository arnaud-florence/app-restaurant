// Le prix d'une matière doit être celui de SON fournisseur.
//
//   node scripts/prix-du-fournisseur.mjs [--ecrire]
//
// Constat du 28/09/2026, parti d'une question du gérant — « je ne vois pas
// l'entrecôte de chez Potin ». Elle y était : Félix Potin désigné, cible
// 2 kg. Mais son coût affiché était une ESTIMATION à 24 €/kg, alors que le
// devis Félix Potin dit **23,38 €**. Le tarif du fournisseur existait dans
// le catalogue et personne ne s'en servait.
//
// Ce n'est pas un cas isolé : **28 matières** portaient un prix qui ignorait
// le tarif de leur propre fournisseur, dont vingt-quatre par estimation.
// Elles nourrissent le food cost, les marges, la valeur du fonds et le total
// de la commande d'ouverture.
//
// ⚠️ LA RÈGLE EST CELLE DU 27/09 : « garder l'ancien prix après avoir changé
// de fournisseur est PLUS FAUX que reprendre le nouveau ». Ce qui protège,
// ce n'est pas le refus, c'est le DRAPEAU : un prix repris d'un devis, d'un
// portail ou d'un catalogue reste marqué `prix_estime` (0165). Seule une
// ligne de nature FACTURE — une preuve de paiement — le promeut en relevé.

import fs from 'node:fs'
import { execSync } from 'node:child_process'

const ECRIRE = process.argv.includes('--ecrire')

// ⚠️ On COMPILE la vraie `src/lib/tarifs-fournisseurs.ts` plutôt que de la
// recopier. Ramener un prix à l'unité est précisément là où ce projet s'est
// trompé le plus souvent (le pain à burger à 64 €/kg, le croissant à 40 €) :
// une deuxième implémentation finirait par écrire un coût que l'écran ne
// montre pas.
const TMP = new URL('../.next/cache/tarifs-lib/', import.meta.url).pathname
execSync(`npx tsc "${new URL('../src/lib/tarifs-fournisseurs.ts', import.meta.url).pathname}" --target es2022 --module es2022 --moduleResolution bundler --outDir "${TMP}"`, { stdio: 'inherit' })
// ⚠️ Le dépôt est en CommonJS : sans ce marqueur, node refuse le fichier
// compilé (« Unexpected token 'export' »).
fs.writeFileSync(`${TMP}package.json`, '{"type":"module"}')
const { prixReference, prixReferenceMatiere, memeBase } = await import(`${TMP}tarifs-fournisseurs.js`)

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }

// ⚠️ PostgREST plafonne à 1 000 lignes sans le dire ; sans tri sur une
// colonne UNIQUE la pagination saute et duplique (0162).
async function lireTout(chemin) {
  const out = []; const sep = chemin.includes('?') ? '&' : '?'
  for (let de = 0; de < 40000; de += 1000) {
    const r = await fetch(`${U}/rest/v1/${chemin}${sep}order=id&offset=${de}&limit=1000`, { headers: H })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    const lot = await r.json(); out.push(...lot); if (lot.length < 1000) break
  }
  return out
}

// ⚠️ AU-DELÀ DE CE RAPPORT, ON NE LIT PAS UN ÉCART DE PRIX, ON LIT DEUX
// CHOSES DIFFÉRENTES. Vécu le jour même : « CARPACCIO DE BŒUF ASSAISONNE VBF
// 70G BTE=20 » à 56,65 € la boîte ressort à **809 €/kg**, parce que le 70 g
// est le poids d'UNE tranche et le prix celui de la boîte de vingt. Écrit
// tel quel, c'est le croissant à 40 € du 22/08, en pire.
const RAPPORT_MAX = 3

const num = v => v === null || v === undefined ? null : Number(v)

const ing = await lireTout('ingredients?stocke=eq.true&actif=eq.true&select=id,nom,unite,fournisseur_principal,prix_achat_ht,prix_estime')
const cat = await lireTout('catalogue_fournisseur?actif=eq.true&ingredient_id=not.is.null&select=id,fournisseur_id,designation,prix_ht,unite,contenance_valeur,contenance_unite,colis_quantite,colis_libelle,ingredient_id,nature')
const fourns = await lireTout('fournisseurs?select=id,nom')
const nomF = new Map(fourns.map(f => [f.id, f.nom]))

const parIng = new Map()
for (const c of cat) { if (!parIng.has(c.ingredient_id)) parIng.set(c.ingredient_id, []); parIng.get(c.ingredient_id).push(c) }

// ⚠️ Une FACTURE bat un devis du même fournisseur : c'est une preuve de
// paiement contre une proposition. L'ordre de préférence est donc
// facture > portail > devis > catalogue, et il décide aussi du drapeau.
const RANG = { facture: 0, portail: 1, devis: 2, catalogue: 3 }

const maj = [], aberrants = [], uniteKo = [], sansTarif = [], drapeaux = []

for (const i of ing) {
  if (!i.fournisseur_principal) { sansTarif.push([i, 'aucun fournisseur désigné']); continue }
  const lignes = (parIng.get(i.id) || [])
    .filter(c => nomF.get(c.fournisseur_id) === i.fournisseur_principal && c.prix_ht !== null)
    .map(c => ({ ...c, prix_ht: num(c.prix_ht), colis_quantite: num(c.colis_quantite), contenance_valeur: num(c.contenance_valeur) }))
    .sort((a, b) => (RANG[a.nature] ?? 9) - (RANG[b.nature] ?? 9))
  if (!lignes.length) { sansTarif.push([i, 'pas de tarif relevé chez lui']); continue }

  const l = lignes[0]
  const tarif = prixReference(l)
  if (!tarif) { uniteKo.push([i, l, 'le tarif ne se ramène à aucune unité']); continue }

  // ⚠️ NOTRE unité porte souvent sa contenance (« barquette 500 g ») : sans
  // la lire, on comparerait un prix au kilo à un prix à la barquette.
  const notre = prixReferenceMatiere(String(i.unite ?? ''), Number(i.prix_achat_ht ?? 0))
  if (!notre || !memeBase(tarif, notre)) { uniteKo.push([i, l, `unités qui ne concordent pas (${i.unite} ↔ ${tarif.unite})`]); continue }

  const actuel = Number(i.prix_achat_ht ?? 0)
  // Le prix à écrire est exprimé dans NOTRE unité, pas dans l'unité de
  // référence : notre coût est celui de la barquette, pas du kilo.
  const facteur = actuel > 0 ? notre.prix / actuel : 1
  const aEcrire = tarif.prix / facteur
  const estRelevé = l.nature === 'facture'

  if (actuel > 0) {
    const rapport = Math.max(tarif.prix / notre.prix, notre.prix / tarif.prix)
    if (rapport > RAPPORT_MAX) { aberrants.push([i, l, tarif, notre, rapport]); continue }
  }

  const memePrix = actuel > 0 && Math.abs(aEcrire - actuel) / actuel < 0.005
  const memeDrapeau = i.prix_estime === !estRelevé
  if (memePrix && memeDrapeau) continue

  // ⚠️ Le cas le plus pernicieux : le prix est déjà le bon, mais il se
  // présente comme RELEVÉ alors qu'il vient d'un devis. Un chiffre faux
  // se corrige ; un chiffre juste présenté comme mesuré ne se corrige
  // jamais, parce que personne ne le rouvre.
  if (memePrix && !memeDrapeau) drapeaux.push([i, l, estRelevé])
  else maj.push({ i, l, tarif, aEcrire, estRelevé, actuel })
}

const fmt = n => n.toFixed(3).padStart(9)
console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — ${ing.length} matières stockées\n`)

console.log(`── ${maj.length} prix repris du tarif de leur fournisseur ──\n`)
for (const m of maj.sort((a, b) => Math.abs(b.aEcrire - b.actuel) / (b.actuel || 1) - Math.abs(a.aEcrire - a.actuel) / (a.actuel || 1))) {
  const d = m.actuel > 0 ? ((m.aEcrire - m.actuel) / m.actuel * 100) : null
  console.log(`  • ${m.i.nom.padEnd(32)} ${fmt(m.actuel)} → ${fmt(m.aEcrire)} /${(m.i.unite ?? '').padEnd(12)} ${d === null ? '' : (d > 0 ? '+' : '') + d.toFixed(0) + '%'}`)
  console.log(`      ${m.i.fournisseur_principal} · ${m.l.nature} · ${m.l.designation}  → ${m.estRelevé ? 'RELEVÉ (facture)' : 'reste ESTIMÉ'}`)
}

if (drapeaux.length) {
  console.log(`\n── ${drapeaux.length} drapeau(x) à corriger : un devis présenté comme un prix payé ──\n`)
  for (const [i, l, r] of drapeaux) console.log(`  • ${i.nom.padEnd(32)} ${String(i.prix_achat_ht).padStart(9)} — ${l.nature} chez ${i.fournisseur_principal} → ${r ? 'relevé' : 'ESTIMÉ'}`)
}

if (aberrants.length) {
  console.log(`\n── ${aberrants.length} tarif(s) ABERRANT(S), écartés ──`)
  console.log(`  ⚠️ au-delà de ×${RAPPORT_MAX} on ne lit pas un écart de prix, on lit deux choses différentes.\n`)
  for (const [i, l, t, n, r] of aberrants) console.log(`  ✗ ${i.nom.padEnd(32)} nous ${fmt(n.prix)}/${t.unite} · tarif ${fmt(t.prix)}/${t.unite} (×${r.toFixed(0)})\n      ${l.designation}`)
}

if (uniteKo.length) {
  console.log(`\n── ${uniteKo.length} matière(s) dont l'unité ne concorde pas — rien conclu ──\n`)
  for (const [i, l, pq] of uniteKo) console.log(`  · ${i.nom.padEnd(32)} ${pq}\n      ${l.designation}`)
}
console.log(`\n── ${sansTarif.length} matière(s) sans tarif chez leur fournisseur ──`)
for (const [i, pq] of sansTarif) console.log(`  · ${i.nom.padEnd(32)} ${pq}`)

if (!ECRIRE) { console.log('\nRien écrit. Relancer avec --ecrire.'); process.exit(0) }

let n = 0
for (const m of maj) {
  const r = await fetch(`${U}/rest/v1/ingredients?id=eq.${m.i.id}`, { method: 'PATCH', headers: H,
    body: JSON.stringify({ prix_achat_ht: Number(m.aEcrire.toFixed(4)), prix_estime: !m.estRelevé }) })
  if (!r.ok) { console.error('✗', m.i.nom, await r.text()); continue }
  n++
}
let d = 0
for (const [i, , estRelevé] of drapeaux) {
  const r = await fetch(`${U}/rest/v1/ingredients?id=eq.${i.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ prix_estime: !estRelevé }) })
  if (r.ok) d++
}
console.log(`\n✅ ${n} prix repris, ${d} drapeau(x) corrigé(s).`)
