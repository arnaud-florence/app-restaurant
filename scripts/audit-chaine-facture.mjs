// AUDIT n°3 — une facture scannée écrit-elle le BON prix, à la BONNE unité ?
// (02/10/2026)
//
// C'est le maillon qui a déjà coûté : un croissant à 40 € le 22/08, quatre
// produits corrompus par un seul scan. Le prix de ligne Gineys est celui du
// COLIS ; écrit tel quel il détruit une marge sans rien signaler.
//
// ⚠️ `cout_achat_ht` a PLUSIEURS écrivains : la propagation des factures, mais
// aussi `alimenter-couts-achat`, `cafe-grains`, `couts-france-boissons`, la
// fiche produit à la main. Un coût qui diffère de ce qu'écrirait la dernière
// facture n'est donc PAS une preuve d'erreur — c'est une question. On ne
// retient que les écarts d'un FACTEUR 3, les seuls qui ne s'expliquent pas par
// une hausse de tarif.
//
//   node scripts/audit-chaine-facture.mjs
//   ⚠️ Il RECOPIE la règle de propagation depuis `createFacture` (la source est
//   en TS) : modifier les deux ensemble.
import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
const sb = async p => JSON.parse(await (await fetch(`${U}/rest/v1/${p}`, { headers: H })).text())
const lire = async q => { const o = []; for (let i = 0; ; i += 1000) { const p = await sb(`${q}&order=id&offset=${i}&limit=1000`); o.push(...p); if (p.length < 1000) break } return o }
let ok = 0, ko = 0
const P = m => { ok++; console.log(`   ✓ ${m}`) }
const E = m => { ko++; console.log(`   ✗ ${m}`) }

// ── recopié de `src/lib/tarifs-fournisseurs.ts` / `commande-fournisseur.ts` ──
// Les deux formes lues : un marqueur « C=N » et le format Brake sans « C= ».
// ⚠️ Une CONTENANCE (« 90G », « 33 cl ») est REFUSÉE : la prendre pour un
// colisage diviserait un prix par un poids.
function extraireConditionnement(d) {
  if (!d) return null
  const s = d.toUpperCase()
  const c = s.match(/C\s*=\s*(\d{1,4})(?![\d.,]*\s*(?:KG|G|ML|CL|L)\b)/)
  if (c) return Number(c[1])
  const b = s.match(/(?:CARTON|COLIS|BOITE|BTE|SACHET|PAQUET|PQ)\s+(?:DE\s+)?(\d{1,4})(?![\d.,]*\s*(?:KG|G|ML|CL|L)\b)/)
  if (b) return Number(b[1])
  const n = s.match(/\b(\d{1,4})\s+(?:CAPSULES?|DOSETTES?|PIECES?|PCES?|UNITES?)\b/)
  if (n) return Number(n[1])
  return null
}
// ⚠️ L'UNITÉ DE LA LIGNE décide, et elle passe AVANT le C=N (règle de 0131).
const estPiece = u => /^(pce|pi[eè]ce|piece|p|u|unite|unité)s?$/.test(String(u ?? '').toLowerCase())

console.log('\n══ AUDIT n°3 — de la facture scannée au prix d’achat ══\n')

const docs = new Map((await lire('factures_fournisseurs?select=id,numero,type_document,date_emission')).map(f => [f.id, f]))
const lignes = await lire('facture_lignes?select=id,description,quantite,unite,prix_unitaire_ht,reference,recette_id,ingredient_id,ignoree,facture_id')
const prods = new Map((await lire('recettes?select=id,nom,cout_achat_ht,unites_par_achat,prix_vente_ht')).map(p => [p.id, p]))

// ── 1. ce qui est rattaché ───────────────────────────────────────────
console.log('── 1. Le rattachement des lignes')
const orph = lignes.filter(l => !l.recette_id && !l.ingredient_id && !l.ignoree)
console.log(`     ${lignes.length} lignes · ${lignes.filter(l => l.recette_id).length} → produit · `
  + `${lignes.filter(l => l.ingredient_id).length} → matière · ${lignes.filter(l => l.ignoree).length} écartées`)
orph.length === 0 ? P('aucune orpheline') : E(`${orph.length} orpheline(s) — chacune est un prix d’achat perdu`)
for (const l of orph.slice(0, 6)) console.log(`        · ${l.description.slice(0, 60)}`)

// ── 2. la référence, qui passe AVANT le libellé ──────────────────────
console.log('\n── 2. La référence fournisseur')
const avecRef = lignes.filter(l => l.reference)
avecRef.length > 0
  ? P(`${avecRef.length} ligne(s) portent une référence`)
  : E(`AUCUNE ligne ne porte de référence — le rapprochement repasse donc par le LIBELLÉ à chaque scan, `
     + `« fragile par construction » (0142). L’extraction existe depuis la 0142 mais aucune facture n’a été scannée depuis.`)
const refP = (await lire('recettes?reference_fournisseur=not.is.null&select=id')).length
const refI = (await lire('ingredients?reference_fournisseur=not.is.null&select=id')).length
console.log(`     ${refP} produits et ${refI} matières en portent une (posées par les relevés portail / Eazle)`)

// ── 3. le garde-fou HAUT — le croissant à 40 € ───────────────────────
console.log('\n── 3. Le garde-fou haut (95 % du prix de vente)')
const trop = [...prods.values()].filter(p => p.cout_achat_ht != null && Number(p.prix_vente_ht) > 0
  && Number(p.cout_achat_ht) >= Number(p.prix_vente_ht) * 0.95)
trop.length === 0 ? P('aucun coût ≥ 95 % du prix de vente') : E(`${trop.length} coût(s) ≥ 95 % du prix de vente`)
for (const p of trop.slice(0, 6)) console.log(`        · ${p.nom} : ${Number(p.cout_achat_ht).toFixed(4)} / ${Number(p.prix_vente_ht).toFixed(4)}`)

// ── 4. le garde-fou BAS — la double division ─────────────────────────
console.log('\n── 4. Le garde-fou bas (double division du conditionnement)')
const suspects = []
for (const l of lignes) {
  if (!l.recette_id || l.prix_unitaire_ht == null) continue
  if (docs.get(l.facture_id)?.type_document !== 'facture') continue
  const p = prods.get(l.recette_id); if (!p || p.cout_achat_ht == null) continue
  const cond = extraireConditionnement(l.description)
  const prixAchat = estPiece(l.unite) ? Number(l.prix_unitaire_ht) : (cond != null ? Number(l.prix_unitaire_ht) / cond : null)
  if (prixAchat == null) continue
  const par = Number(p.unites_par_achat ?? 1) || 1
  const attendu = prixAchat / par
  const reel = Number(p.cout_achat_ht)
  if (reel / attendu > 3 || reel / attendu < 1 / 3) suspects.push({ p, l, attendu, reel, cond, par })
}
suspects.length === 0
  ? P('aucun écart d’un facteur 3 entre le coût posé et ce qu’écrirait la propagation')
  : E(`${suspects.length} ligne(s) où la propagation écrirait un chiffre d’un autre ordre de grandeur`)
for (const s of suspects) {
  console.log(`        · ${s.p.nom} : posé ${s.reel.toFixed(4)} €, la propagation écrirait ${s.attendu.toFixed(4)} €`)
  console.log(`          « ${s.l.description.slice(0, 54)} » — ÷ ${s.cond ?? 1} (C=N) puis ÷ ${s.par} (unités/achat)`)
  if (s.cond && s.par > 1) console.log(`          ⚠️ les deux nombres disent le MÊME rendement : division en double`)
}

// ── 5. un avoir ne propage JAMAIS de prix ────────────────────────────
console.log('\n── 5. Les avoirs')
const avoirs = [...docs.values()].filter(d => d.type_document === 'avoir')
P(`${avoirs.length} avoir(s) — ils ne propagent aucun prix d’achat (marchandise rendue, pas un tarif)`)

// ── 6. le BL ne propage pas non plus ─────────────────────────────────
console.log('\n── 6. Les bons de livraison')
const bls = [...docs.values()].filter(d => d.type_document === 'bon_livraison')
P(`${bls.length} bon(s) de livraison — ils comptent les ENTRÉES et n’écrivent aucun prix (0166)`)

console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
