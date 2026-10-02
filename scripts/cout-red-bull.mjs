// Le Red Bull avait un prix de vente et AUCUN coût — 02/10/2026.
//
// Trouvé en posant les mixers : « Red Bull 25 cl » (2,30 € TTC) et « Red Bull
// Ice » (2,81 €) sont à la carte du bar depuis la 0144, tous deux sans
// `cout_achat_ht`. Ils s'affichaient donc en « coût inconnu » (0150) — gris,
// pas rouge — et ils ont traversé le rattrapage de marge du 30/09 sans être
// vus : on ne corrige pas un taux qu'on ne calcule pas.
//
// ⚠️ Ce script ne pose QUE le coût. Le prix de vente est une décision du
// gérant et ne se change pas en passant.
//
//   node scripts/cout-red-bull.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const PLANCHER = 1.40  // la marge HT du demi, plancher assumé de la carte bar

// produit · coût · fournisseur · réf · origine du prix
const COUTS = [
  ['Red Bull 25 cl', 1.19, 'Euro-Cash', '53000', 'devis Euro-Cash, base ancrée sur le 47,3 cl (4,757 €/L)'],
  ['Red Bull Ice',   1.23, 'Promocash', null,    'PRIX PAYÉ — ligne de facture Promocash'],
]
const [fournEC] = await sb('fournisseurs?nom=eq.Euro-Cash&select=id')
const [fournPC] = await sb('fournisseurs?nom=eq.Promocash&select=id')
const ids = { 'Euro-Cash': fournEC?.id, Promocash: fournPC?.id }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — le coût du Red Bull ──\n`)
for (const [nom, cout, fourn, ref, origine] of COUTS) {
  const [r] = await sb(`recettes?nom=eq.${encodeURIComponent(nom)}&select=id,nom,prix_vente_ht,tva,cout_achat_ht`)
  if (!r) { console.log(`  ⚠ ${nom} : introuvable`); continue }
  const ht = Number(r.prix_vente_ht), ttc = ht * (1 + r.tva / 100)
  const fc = cout / ht * 100, marge = ht - cout
  const htPlancher = cout + PLANCHER, ttcPlancher = Math.ceil(htPlancher * (1 + r.tva / 100) * 10) / 10
  console.log(`  ${nom}`)
  console.log(`    vendu     ${ttc.toFixed(2).replace('.', ',')} € TTC  (${ht.toFixed(4).replace('.', ',')} € HT, TVA ${r.tva} %)`)
  console.log(`    coûte     ${cout.toFixed(2).replace('.', ',')} €  ← ${origine}`)
  console.log(`    food cost ${fc.toFixed(1).replace('.', ',')} %   marge ${marge.toFixed(2).replace('.', ',')} € HT`)
  console.log(`    ${marge >= PLANCHER ? '✓ au-dessus' : '⚠ SOUS'} le plancher du demi (${PLANCHER.toFixed(2).replace('.', ',')} € HT)`
    + (marge < PLANCHER ? ` — il faudrait ${ttcPlancher.toFixed(2).replace('.', ',')} € TTC pour l'atteindre` : ''))
  console.log('')
  if (!ECRIRE) continue
  const maj = { cout_achat_ht: cout }
  if (ids[fourn]) maj.fournisseur_id = ids[fourn]
  if (ref) maj.reference_fournisseur = ref
  await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(maj) })
  console.log(`    ✓ coût posé, fournisseur ${fourn}\n`)
}
console.log(ECRIRE ? '' : '  (essai à blanc — relancer avec --ecrire)\n')
