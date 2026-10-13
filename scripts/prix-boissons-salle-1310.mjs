// « 2 € à emporter, 2,80 € sur place » — décision du gérant, 13/10/2026.
//
// Deux gestes, et un seul prix de salle dans toute la maison :
//   · les 9 softs du BAR passent de 3,00 € à 2,80 € — leur prix EST le prix
//     de salle depuis qu'ils ont leur propre famille ;
//   · les 6 sodas 33 cl du FOURNIL reçoivent `prix_sur_place_ttc = 2,80 €`,
//     comme les 12 qui l'avaient déjà.
//
// ⚠️ CE QUI N'EST PAS TOUCHÉ, et pourquoi — « 2,80 sur place » vise les
// SODAS, pas tout ce qui se boit :
//   · eaux 75 cl (3,50 €) : bouteille de TABLE, autre format, autre usage ;
//   · Diabolo 3,20 € et Sirop à l'eau 1,80 € : composites à leur prix ;
//   · bouteilles 1,5 L : format d'emporter, elles ne se servent pas au verre ;
//   · Eau plate 50 cl (salle 2,50 €) : l'eau est volontairement sous le soda ;
//   · Red Bull (salle 3,00 €) : une énergisante se tarife à part ;
//   · les jus 33 cl à 2,20 € : posés avant-hier sur la liste du gérant, les
//     ramener à 2,00 € serait une baisse de prix qu'il n'a pas demandée.
//
// ⚠️ LA CAISSE D'ABORD (leçon du 13/10 au matin) : un changement de prix est
// l'upsert dangereux de la 0141 — on RELIT, on recopie `name` et `tax` tels
// quels, on ne touche QUE les prix, et on REFUSE de construire s'il manque un
// champ obligatoire.
//
//   node scripts/prix-boissons-salle-1310.mjs [--ecrire]
import { readFileSync } from 'node:fs'

const SALLE = 2.80
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const H = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (c, o = {}) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o, headers: H })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} :: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const zl = async (p, o = {}) => {
  for (let n = 1; n <= 5; n++) {
    await new Promise(s => setTimeout(s, 1400))
    const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
      headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`, 'Content-Type': 'application/json', ...(o.headers || {}) } })
    const b = await r.json().catch(() => ({}))
    if (r.status === 200) return b
    console.log(`   (HTTP ${r.status}, essai ${n})`)
    if (r.status !== 429 && r.status < 500) throw new Error(JSON.stringify(b).slice(0, 250))
    await new Promise(s => setTimeout(s, 4000 * n))
  }
  throw new Error('abandon')
}
const ttc = r => Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100)
const c = e => Math.round(e * 100)

console.log(`\n🥤 Prix de salle à ${SALLE.toFixed(2)} €${ECRIRE ? ' — ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)

const salle = (await sb('recettes?categorie=eq.Boisson%20salle&select=id,nom,prix_vente_ht,tva,actif'))
  .filter(r => Math.abs(ttc(r) - 3.00) < 0.001)
const four = (await sb('recettes?categorie=eq.Boisson%20fra%C3%AEche&actif=eq.true&select=id,nom,prix_vente_ht,tva,prix_sur_place_ttc'))
  .filter(r => r.prix_sur_place_ttc == null && Math.abs(ttc(r) - 2.00) < 0.001)
console.log(`   bar à 3,00 € → ${SALLE.toFixed(2)} € : ${salle.length}`)
salle.forEach(r => console.log(`     ${r.nom}`))
console.log(`   Fournil sans prix de salle : ${four.length}`)
four.forEach(r => console.log(`     ${r.nom} (reste ${ttc(r).toFixed(2)} € à emporter)`))

// ⚠️ On VÉRIFIE la convention de la caisse sur un produit qui porte DÉJÀ un
// prix de salle, au lieu de la supposer : `price` = salle, `price_togo` =
// emporter. Se tromper de champ afficherait le prix de salle au comptoir.
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
if (plats.length < 100) throw new Error(`catalogue à ${plats.length} plats — lecture ratée`)
const temoinNom = 'Orangina 33 cl'
const [tem] = await sb(`recettes?nom=eq.${encodeURIComponent(temoinNom)}&select=id,prix_sur_place_ttc,prix_vente_ht,tva`)
const [lt] = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=eq.${tem.id}&select=identifiant_externe`)
const pt = plats.find(p => Number(p.id) === Number(lt.identifiant_externe))
console.log(`\n   témoin « ${temoinNom} » : caisse price=${pt.price} price_togo=${pt.price_togo} · base salle ${Number(tem.prix_sur_place_ttc).toFixed(2)} € / emporter ${ttc(tem).toFixed(2)} €`)
if (pt.price !== c(Number(tem.prix_sur_place_ttc)) || pt.price_togo !== c(ttc(tem)))
  throw new Error('convention de la caisse non confirmée — on n\'écrit pas de prix à l\'aveugle')
console.log('   ✓ convention confirmée : price = SALLE, price_togo = EMPORTER')

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

const tous = [...salle.map(r => ({ r, salle: SALLE, emporter: SALLE })),
              ...four.map(r => ({ r, salle: SALLE, emporter: ttc(r) }))]
const liens = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=in.(${tous.map(x => x.r.id).join(',')})&select=recette_id,identifiant_externe`)
const zid = new Map(liens.map(l => [l.recette_id, Number(l.identifiant_externe)]))
const parZ = new Map(plats.map(p => [Number(p.id), p]))

const corps = []
for (const { r, salle: s, emporter: e } of tous) {
  const p = parZ.get(zid.get(r.id))
  if (!p) { console.log(`   ⚠ ${r.nom} : aucun plat en caisse — sauté`); continue }
  if (p.name == null || p.tax == null) throw new Error(`${r.nom} : nom ou TVA absent — refus de construire`)
  const tg = (p.tags ?? []).map(x => Number(typeof x === 'object' ? x?.id : x)).filter(Number.isFinite)
  const op = (p.options ?? []).map(x => Number(typeof x === 'object' ? x?.id : x)).filter(Number.isFinite)
  corps.push({ id: Number(p.id), name: p.name, tax: p.tax, price: c(s), price_togo: c(e),
    ...(p.tax_takeaway != null ? { tax_takeaway: p.tax_takeaway } : {}),
    ...(tg.length ? { tags: tg } : {}), ...(op.length ? { options: op } : {}) })
}
await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
const ap = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
let ko = 0
for (const x of corps) {
  const v = ap.find(d => Number(d.id) === x.id)
  if (v?.price !== x.price || v?.price_togo !== x.price_togo) { console.log(`   ✗ ${v?.name} : ${v?.price}/${v?.price_togo} au lieu de ${x.price}/${x.price_togo}`); ko++ }
}
if (ko) throw new Error('la caisse n\'a pas appliqué — base NON touchée')
console.log(`   ✓ caisse : ${corps.length} prix posés`)

for (const r of salle) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH',
  body: JSON.stringify({ prix_vente_ht: Number((SALLE / (1 + Number(r.tva) / 100)).toFixed(4)) }) })
console.log(`   ✓ base : ${salle.length} softs du bar à ${SALLE.toFixed(2)} €`)
for (const r of four) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH',
  body: JSON.stringify({ prix_sur_place_ttc: SALLE }) })
console.log(`   ✓ base : ${four.length} sodas du Fournil avec un prix de salle`)
console.log('\n✅ Un seul prix de salle dans la maison : 2,80 €.\n')
