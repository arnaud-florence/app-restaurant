// Tarif du bar — grille « village » validée par le gérant le 21/09/2026.
// Ajustée le même jour : rien ne doit rapporter moins que le demi (1,42 € HT),
// et rien ne doit paraître cher À CÔTÉ du demi — c'est lui que le client
// compare, pas le centilitre.
//
// Logique : trois prix font la réputation d'un bar de village — le café,
// le demi, le pastis. Ils restent bas. La marge se fait sur ce qu'on ne
// compare pas : la bière en bouteille, le spritz, la bouteille de vin à table.
// Aucune consommation ne doit rapporter moins de ~1,40 € HT : en dessous, le
// bar paie pour servir (17,23 €/h chargés ÷ 15 consos/h = 1,15 € par verre).
//
// Coûts de référence : relevé France Boissons du 21/09/2026 (remisé + droits),
// voir scripts/couts-france-boissons.mjs.
//
// ⚠️ Les prix se saisissent en TTC — c'est le prix de l'ardoise, celui que le
// gérant décide. Le HT est recalculé au taux DU PRODUIT (20 % alcool, 10 %
// soft sur place) : un taux figé ferait payer autre chose que le panneau.
//
// ⚠️ La caisse est mise à jour dans le même geste. POST /catalog/dishes est un
// UPSERT : on relit la caisse, on recopie name et tax tels quels, on ne change
// que les deux prix, et on REFUSE si un champ obligatoire manque.
//
//   node scripts/tarif-bar-village.mjs [--ecrire]

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

// Prix TTC de l'ardoise.
const GRILLE = {
  'Demi pression': 2.80,          // « le demi à moins de 3 € » — prix phare
  'Panaché': 2.80,                // aligné sur le demi
  'Monaco': 3.00,
  // Pinte ≈ 1,86 × le demi : à 5,50 € elle ne valait que 0,10 € de moins que
  // deux demis, et perdait tout intérêt au comptoir.
  'Pinte pression': 5.20,
  'Demi ambrée': 3.30,            // +0,50 € sur la blonde, l'usage
  'Picon bière': 3.30,
  'Bière bouteille 33 cl': 4.00,
  'Desperados 33 cl': 4.50,
  // Payer une bière SANS alcool plus cher qu'un demi choque le client.
  'Bière sans alcool 25 cl': 3.20,
  'Perrier 33 cl': 2.80,
  'Limonade 25 cl': 2.50,
  'Diabolo': 2.80,
  'Spritz': 6.00,
  'Bouteille Coteaux Varois': 20.00,
}

const bar = await (await fetch(U + '/rest/v1/recettes?select=id,nom,tva,prix_vente_ht,prix_sur_place_ttc,cout_achat_ht&tag_destination=eq.BAR&actif=eq.true', { headers: H })).json()
const parNom = new Map(bar.map(r => [r.nom, r]))
const f2 = n => n.toFixed(2).replace('.', ',')

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — outil ──\n`)
const aEcrire = []
for (const [nom, ttc] of Object.entries(GRILLE)) {
  const r = parNom.get(nom)
  if (!r) { console.log('  ⚠️ introuvable : ' + nom); continue }
  const t = 1 + Number(r.tva) / 100
  const ht = Math.round(ttc / t * 10000) / 10000
  const avant = Number(r.prix_vente_ht) * t
  const c = Number(r.cout_achat_ht)
  if (Math.abs(avant - ttc) < 0.005) { console.log(`  = ${nom.padEnd(26)} ${f2(ttc)} € (inchangé)`); continue }
  console.log(`  ${nom.padEnd(28)} ${f2(avant).padStart(6)} → ${f2(ttc).padStart(6)} €   marge ${f2(ht - c)} € HT · food cost ${f2(c / ht * 100)} %`)
  aEcrire.push({ id: r.id, nom, ht, ttc })
}
if (ECRIRE) for (const x of aEcrire)
  await fetch(U + '/rest/v1/recettes?id=eq.' + x.id, { method: 'PATCH', headers: H, body: JSON.stringify({ prix_vente_ht: x.ht }) })

// ── Caisse Zelty ──────────────────────────────────────────────────────
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — caisse Zelty ──\n`)
const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0', { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
if (plats.length < 100) { console.log(`  ✗ la caisse rend ${plats.length} plats — lecture douteuse (limite de débit ?), on n'écrit RIEN.`); process.exit(1) }
const parRemote = new Map(plats.map(p => [String(p.remote_id ?? ''), p]))
const corps = [], refus = []
for (const [nom, ttc] of Object.entries(GRILLE)) {
  const r = parNom.get(nom); if (!r) continue
  const p = parRemote.get(String(r.id))
  if (!p) { refus.push(`${nom} : absent de la caisse`); continue }
  if (p.name == null || p.price == null || p.tax == null) { refus.push(`${nom} : champ obligatoire manquant — refus`); continue }
  const salle = Math.round((r.prix_sur_place_ttc != null ? Number(r.prix_sur_place_ttc) : ttc) * 100)
  const comptoir = Math.round(ttc * 100)
  if (p.price === salle && p.price_togo === comptoir) continue
  corps.push({ id: p.id, name: p.name, price: salle, price_togo: comptoir, tax: p.tax, tax_takeaway: p.tax_takeaway })
  console.log(`  ${nom.padEnd(28)} ${f2((p.price ?? 0) / 100).padStart(6)} → ${f2(salle / 100).padStart(6)} €`)
}
if (refus.length) { console.log('\n  refusés :'); refus.forEach(l => console.log('   ' + l)) }
console.log(`\n  outil : ${aEcrire.length} prix · caisse : ${corps.length} plats`)
if (!ECRIRE) { console.log('  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
if (corps.length) {
  // Un seul appel groupé : Zelty limite le débit et renvoie des 429 dès la
  // cinquième écriture à la file.
  const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes', { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  console.log(`  → caisse : HTTP ${r.status} · ${(j.dishes ?? []).length} plats mis à jour · errno ${j.errno}`)
}
console.log('')
