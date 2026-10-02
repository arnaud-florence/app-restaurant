// Le grand format coûte moitié moins au litre — et Euro-Cash ne l'a pas chiffré.
//
// Demande du gérant, 02/10/2026 : acheter les softs d'accompagnement en 1 L /
// 1,5 L plutôt qu'en 25 cl. L'arithmétique lui donne raison, et largement.
// Mais le rayon qui porte ces formats est revenu VIDE de leur devis : sur 21
// rayons envoyés, trois seulement ont été chiffrés.
//
// ⚠️ C'est la relance la plus rentable de la liste : ces bouteilles sont
// l'ACCOMPAGNEMENT d'un produit à 69 €, servi deux par bouteille vendue.
//
//   node scripts/relance-eurocash-grands-formats.mjs
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}` }
// ⚠️ tri sur `id` (colonne UNIQUE) : sans lui la pagination saute et duplique
const lire = async q => {
  const out = []
  for (let o = 0; ; o += 1000) {
    const r = await fetch(`${U}/rest/v1/${q}&order=id&offset=${o}&limit=1000`, { headers: H })
    const p = await r.json(); out.push(...p); if (p.length < 1000) break
  }
  return out
}
const [ec] = await (await fetch(`${U}/rest/v1/fournisseurs?nom=eq.Euro-Cash&select=id,nom,email`, { headers: H })).json()
const cat = await lire(`catalogue_fournisseur?fournisseur_id=eq.${ec.id}&select=reference,designation,prix_ht,unite,contenance_valeur,contenance_unite,famille`)

const f3 = n => n.toFixed(2).replace('.', ',')
console.log('\n══ CE QUE COÛTE LE LITRE, SELON LE FORMAT ══\n')
// ⚠️ On ne compare QUE des lignes dont la contenance est établie : un prix
// « base à confirmer » n'a pas de prix au litre, il a trois lectures.
const chiffres = cat.filter(c => c.prix_ht != null && c.contenance_unite === 'L' && c.contenance_valeur)
  .map(c => ({ ...c, pl: Number(c.prix_ht) / Number(c.contenance_valeur) }))
  .filter(c => /COCA|PEPSI|ORANGIN|TONIC|LIPTON|ANANAS|ORANGE|RED BULL|SEVEN|SPRITE/i.test(c.designation))
  .sort((a, b) => a.pl - b.pl)
console.log('  €/L    prix    format    désignation')
for (const c of chiffres)
  console.log(`  ${f3(c.pl).padStart(5)}  ${f3(Number(c.prix_ht)).padStart(5)} €  ${(Number(c.contenance_valeur) * 100).toFixed(0).padStart(3)} cl   ${c.designation}`)

// Le prix posé sur nos 1,5 L à la création : une HYPOTHÈSE, pas un relevé.
const HYPO_15 = 1.50
console.log(`\n  pour mémoire — nos 1,5 L portent ${f3(HYPO_15)} € d'hypothèse,`)
console.log(`  soit ${f3(HYPO_15 / 1.5)} €/L : environ LA MOITIÉ de la canette.\n`)

console.log('══ CE QU\'EURO-CASH N\'A PAS CHIFFRÉ, ET QU\'IL NOUS FAUT ══\n')
const manque = cat.filter(c => c.prix_ht == null
  && /grands formats|PET|BIB/i.test(c.famille || ''))
const rayons = {}
for (const c of manque) (rayons[c.famille] ??= []).push(c)
for (const [fam, l] of Object.entries(rayons)) {
  console.log(`  ── ${fam} — ${l.length} références sans prix`)
  for (const c of l.slice(0, 14)) console.log(`     ${String(c.reference).padEnd(8)} ${c.designation}`)
  if (l.length > 14) console.log(`     … et ${l.length - 14} autres`)
  console.log('')
}
const lignes = [['Code', 'Désignation', 'Rayon', 'Format souhaité', 'Prix HT', 'Colisage']]
for (const c of manque) lignes.push([c.reference, c.designation, c.famille, '1 L ou 1,5 L', '', ''])
const csv = lignes.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
fs.writeFileSync('data/relance-eurocash-grands-formats.csv', '﻿' + csv)
console.log(`  → data/relance-eurocash-grands-formats.csv (${manque.length} lignes, gitignoré)`)
console.log(`  → adresse Euro-Cash : ${ec.email ?? '⚠ AUCUNE — à renseigner avant tout envoi'}`)
console.log('\n  ⚠️ DEMANDER LE FORMAT AVEC LE CODE. Leur rayon PET ne dit aucune')
console.log('     contenance — « Coca Cola » tout court, quand un PET existe en')
console.log('     50 cl, 1 L, 1,25 L, 1,5 L et 2 L. Un prix sans son format ne')
console.log('     se compare à rien.')
console.log('\n  ⚠️ PAS DE TONIC EN GRAND FORMAT chez eux : les 11 références du')
console.log('     rayon sont des colas, limonades et thés glacés. Le gin tonic')
console.log('     restera en 33 cl tant qu\'on ne l\'aura pas demandé ailleurs.\n')
