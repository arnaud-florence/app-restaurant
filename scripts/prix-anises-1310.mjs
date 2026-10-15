// Les anisés à 2,00 € et 2,20 € avec sirop — décision du gérant, 13/10/2026.
//
//   Ricard 2 cl · Pastis 51 2 cl              2,50 → 2,00 €
//   Mauresque · Tomate · Perroquet · Gommé    2,80 → 2,20 €
//
// ⚠️⚠️ CE CHANGEMENT CASSE UN REPÈRE QUE LE PROJET S'ÉTAIT DONNÉ, et il faut
// que ce soit dit : la carte du bar a été bâtie sur « rien ne rapporte moins
// que le demi » (1,42 € de marge HT), avec un plancher de service de 1,15 €
// par verre (17,23 €/h chargés ÷ 15 consos/h). À 2,00 €, le Ricard laisse
// 1,27 € — au-dessus du plancher, mais SOUS le demi. L'anisé devient donc la
// consommation la moins rentable du bar.
//
// C'est un choix de RÉPUTATION, pas une erreur : le pastis est l'un des trois
// prix qu'un village compare (avec le café et le demi). Le gérant tranche, et
// le repère est mis à jour plutôt que contourné en silence.
//
// ⚠️ LA CAISSE D'ABORD : un changement de prix est l'upsert dangereux de la
// 0141 — on RELIT, on recopie `name` et `tax` tels quels, on ne touche QUE
// les prix, et on REFUSE de construire s'il manque un champ.
//
//   node scripts/prix-anises-1310.mjs [--ecrire]
import { readFileSync } from 'node:fs'

const PRIX = {
  'Ricard 2 cl': 2.00, 'Pastis 51 2 cl': 2.00,
  'Mauresque': 2.20, 'Tomate': 2.20, 'Perroquet': 2.20,
  // ⚠️ « Gommé » EST SORTI DE CETTE LISTE le 15/10/2026 : le gérant a précisé
  // que c'est une BIÈRE CITRON, pas un anisé. Il est à 3,00 € en famille
  // Bière (gomme-biere-citron-1510.mjs). Le laisser ici le ramènerait à
  // 2,20 € au premier rejeu — soit moins cher qu'un demi nature.
}
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

console.log(`\n🍸 Anisés${ECRIRE ? ' — ÉCRITURE' : ' — essai à blanc (--ecrire)'}\n`)
const noms = Object.keys(PRIX)
const prods = await sb(`recettes?nom=in.(${noms.map(n => `"${n}"`).join(',')})&select=id,nom,prix_vente_ht,tva,cout_achat_ht,prix_sur_place_ttc,actif`)
const manquants = noms.filter(n => !prods.some(r => r.nom === n))
if (manquants.length) throw new Error(`introuvable(s) : ${manquants.join(', ')}`)

// ⚠️ Un prix de salle distinct changerait la nature du geste : ces produits
// n'en ont pas (le sur place EST le prix au bar), et on le VÉRIFIE.
const avecSalle = prods.filter(r => r.prix_sur_place_ttc != null)
if (avecSalle.length) throw new Error(`prix de salle distinct sur ${avecSalle.map(r => r.nom).join(', ')} — à traiter à part`)

// Le repère du bar, repris de la carte de septembre.
const DEMI_MARGE = 1.42, PLANCHER_SERVICE = 1.15
console.log(`   repère : demi pression ${DEMI_MARGE.toFixed(2)} € de marge HT · plancher de service ${PLANCHER_SERVICE.toFixed(2)} €\n`)
for (const r of prods.sort((a, b) => a.nom.localeCompare(b.nom))) {
  const n = PRIX[r.nom], htN = n / (1 + Number(r.tva) / 100)
  const cout = Number(r.cout_achat_ht), marge = htN - cout, fc = cout / htN * 100
  const drapeau = marge < PLANCHER_SERVICE ? '⛔ SOUS le plancher de service'
                : marge < DEMI_MARGE ? '⚠ sous le demi' : '✓'
  console.log(`   ${r.nom.padEnd(16)} ${ttc(r).toFixed(2)} → ${n.toFixed(2)} €  ·  marge ${marge.toFixed(2)} €  ·  food cost ${fc.toFixed(0)} %  ${drapeau}`)
}
if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

const liens = await sb(`correspondances_catalogue?systeme=eq.zelty&recette_id=in.(${prods.map(r => r.id).join(',')})&select=recette_id,identifiant_externe`)
const zid = new Map(liens.map(l => [l.recette_id, Number(l.identifiant_externe)]))
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
if (plats.length < 100) throw new Error(`catalogue à ${plats.length} plats — lecture ratée`)
const parZ = new Map(plats.map(p => [Number(p.id), p]))

const corps = []
for (const r of prods) {
  const p = parZ.get(zid.get(r.id))
  if (!p) { console.log(`   ⚠ ${r.nom} : aucun plat en caisse — sauté`); continue }
  if (p.name == null || p.tax == null) throw new Error(`${r.nom} : nom ou TVA absent — refus de construire`)
  const c = Math.round(PRIX[r.nom] * 100)
  const tg = (p.tags ?? []).map(x => Number(typeof x === 'object' ? x?.id : x)).filter(Number.isFinite)
  const op = (p.options ?? []).map(x => Number(typeof x === 'object' ? x?.id : x)).filter(Number.isFinite)
  corps.push({ id: Number(p.id), name: p.name, tax: p.tax, price: c, price_togo: c,
    ...(p.tax_takeaway != null ? { tax_takeaway: p.tax_takeaway } : {}),
    ...(tg.length ? { tags: tg } : {}), ...(op.length ? { options: op } : {}) })
}
await zl('catalog/dishes', { method: 'POST', body: JSON.stringify(corps) })
const ap = (await zl('catalog/dishes?show_all=true&limit=0')).dishes ?? []
let ko = 0
for (const x of corps) {
  const v = ap.find(d => Number(d.id) === x.id)
  if (v?.price !== x.price) { console.log(`   ✗ ${v?.name} : ${v?.price} au lieu de ${x.price}`); ko++ }
}
if (ko) throw new Error('la caisse n\'a pas appliqué — base NON touchée')
console.log(`\n   ✓ caisse : ${corps.length} prix posés`)
for (const r of prods) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH',
  body: JSON.stringify({ prix_vente_ht: Number((PRIX[r.nom] / (1 + Number(r.tva) / 100)).toFixed(4)) }) })
console.log(`   ✓ base : ${prods.length} prix posés`)
console.log('\n✅ Anisés à 2,00 € · avec sirop 2,20 €.\n')
