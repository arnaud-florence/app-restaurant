// Un stock NÉGATIF n'existe pas — 04/10/2026.
//
// ⚠️⚠️ Huit matières portaient un `stock_actuel` sous zéro : champignons
// émincés −0,10, mozzarella râpée −0,72, sauce tomate pizza −0,48, jambon
// blanc −0,12, olives noires −0,09, huile d'olive −0,02, sel fin −0,059,
// poivre noir −0,018.
//
// L'ORIGINE : les sorties automatiques de MAI-JUIN 2026, quand le trigger du
// module 7 déduisait les ingrédients à chaque article passé à « servi ». Ces
// commandes étaient celles du jeu de DÉMONSTRATION, purgé en août 2026 — les
// produits ont disparu, leurs `mouvements_stock` sont restés, et le compteur
// est descendu sous zéro sur des stocks qui n'avaient jamais rien contenu.
//
// ⚠️ CE QUE ÇA PRODUISAIT À L'ÉCRAN : `/admin/stock` affichait une VALEUR DE
// STOCK NÉGATIVE — « Poivre noir moulu : −0,34 € », « Sel fin : −0,03 € ».
// Un stock négatif ne se lit pas comme une erreur, il se lit comme une dette,
// et il entre dans toutes les sommes qui le croisent : le briefing de poste,
// le snapshot de l'assistant, les chantiers du co-gérant.
//
// ⚠️ On écrit un MOUVEMENT D'AJUSTEMENT, on ne corrige pas en silence. Le
// compteur n'est plus la source du stock depuis la 0135, mais il reste écrit
// par les mouvements manuels : une remise à zéro sans trace serait
// indistinguable d'une saisie.
//
//   node scripts/corriger-stocks-negatifs.mjs [--ecrire]
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
const neg = await sb('ingredients?stock_actuel=lt.0&select=id,nom,unite,stock_actuel,prix_achat_ht&order=nom')
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — stocks négatifs ──\n`)
if (!neg.length) { console.log('   ✓ aucun stock négatif\n'); process.exit(0) }
let perdue = 0
for (const i of neg) {
  const v = Number(i.stock_actuel) * Number(i.prix_achat_ht ?? 0)
  perdue += v
  console.log(`   ${String(i.stock_actuel).padStart(8)} ${String(i.unite).padEnd(14)} ${i.nom.padEnd(30)} valeur affichée ${v.toFixed(2)} €`)
}
console.log(`\n   total de valeur NÉGATIVE affichée : ${perdue.toFixed(2)} €`)
if (!ECRIRE) { console.log('\n  (essai à blanc — relancer avec --ecrire)\n'); process.exit(0) }

for (const i of neg) {
  // La trace d'abord : si l'écriture du compteur échoue, on veut savoir que
  // la correction a été tentée. L'inverse laisserait un zéro inexpliqué.
  await sb('mouvements_stock', { method: 'POST', body: JSON.stringify({
    // ⚠️ `type` n'admet que entree / sortie / perte / inventaire (0001).
    // Une remise à niveau est un INVENTAIRE : ce n'est ni de la marchandise
    // arrivée, ni de la casse, c'est un comptage qui corrige le compteur.
    ingredient_id: i.id, type: 'inventaire',
    quantite: Math.abs(Number(i.stock_actuel)),
    motif: `Remise à zéro d'un stock négatif (${i.stock_actuel}) — résidu des sorties automatiques du jeu de démonstration purgé en août 2026. Un stock négatif n'existe pas.`,
  }) })
  await sb(`ingredients?id=eq.${i.id}`, { method: 'PATCH', body: JSON.stringify({ stock_actuel: 0 }) })
  console.log(`   ✓ ${i.nom} → 0`)
}
const reste = await sb('ingredients?stock_actuel=lt.0&select=id')
console.log(`\n   ${neg.length} corrigé(s) · ${reste.length} négatif(s) restant(s)\n`)
