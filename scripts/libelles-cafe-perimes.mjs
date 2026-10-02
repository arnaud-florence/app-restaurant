// Les cafés pointaient encore sur les capsules — 02/10/2026.
//
// Trouvé par `audit-chaine-facture.mjs` : la propagation aurait écrit un café
// à 0,42 CENTIME au prochain scan Lavazza. Le garde-fou bas l'attrape
// désormais, mais il vaut mieux supprimer la cause que la rattraper.
//
// ⚠️ LA CAUSE EST UN LIBELLÉ PÉRIMÉ. `cafe-grains.mjs` a fait passer le café
// des DOSETTES aux GRAINS en septembre (8 g par tasse, `unites_par_achat` =
// 125 = 1 kg ÷ 8 g). Mais `libelle_achat` est resté « Kit complet café
// Lavazza » — la ligne de facture des CAPSULES, qui porte « (100 capsules …) ».
// Le rapprochement divisait donc par 100 (le C=N du carton) PUIS par 125 (le
// rendement du kilo) : les deux nombres disent le même rendement, lus à deux
// sourcings différents.
//
// ⚠️ ON EFFACE, ON NE REDIRIGE PAS vers « Lavazza Gold Selection ». Cette
// ligne-là est déjà portée par la MATIÈRE « Café en grains Gold 1 kg », créée
// aujourd'hui : la poser aussi sur les quatre cafés ferait concourir cinq
// cibles identiques pour une seule ligne de livraison, et le kilo entrerait
// cinq fois en stock. Ce qui se compte, c'est le kilo ; ce qui se vend, c'est
// la tasse.
//
// ⚠️ Conséquence assumée : le coût d'une tasse n'est plus mis à jour par une
// facture. Il est CALCULÉ par `cafe-grains.mjs` depuis le prix du kilo, ce qui
// est la seule façon juste — une facture au kilo ne peut pas écrire un prix à
// la tasse sans connaître la dose. Relancer ce script après une hausse.
//
//   node scripts/libelles-cafe-perimes.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
// libellé périmé → pourquoi il doit partir
const PERIMES = {
  'Kit complet café Lavazza': 'sourcing CAPSULES abandonné en septembre — le café est en grains depuis `cafe-grains.mjs`',
  'dosettes chocolat Blue': 'sourcing DOSETTES abandonné — la poudre est achetée en boîte',
}
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — libellés d'achat périmés ──\n`)
let n = 0
for (const [lib, pourquoi] of Object.entries(PERIMES)) {
  const prods = await sb(`recettes?libelle_achat=eq.${encodeURIComponent(lib)}&select=id,nom,cout_achat_ht,unites_par_achat,nom_matiere`)
  if (!prods.length) { console.log(`   = « ${lib} » : plus porté par aucun produit`); continue }
  console.log(`   ✗ « ${lib} » — ${prods.length} produit(s)`)
  console.log(`     ${pourquoi}`)
  for (const p of prods) {
    console.log(`       ${p.nom.padEnd(22)} coût ${Number(p.cout_achat_ht).toFixed(4)} conservé · se compte sur « ${p.nom_matiere ?? '—'} »`)
    n++
    if (ECRIRE) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ libelle_achat: null }) })
  }
}
console.log(`\n   ${n} libellé(s) ${ECRIRE ? 'effacé(s)' : 'à effacer'} — le coût par tasse n'est pas touché\n`)
