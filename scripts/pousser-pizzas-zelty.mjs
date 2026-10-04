// Pousser la carte des pizzas du 12 octobre vers la caisse — 04/10/2026.
//
// ⚠️⚠️ `POST /catalog/dishes` EST UN UPSERT qui exige `name`, `price` et `tax` :
// un objet incomplet écrase le prix qui s'IMPRIME SUR LES TICKETS. On RELIT le
// catalogue juste avant, on recopie ces trois champs TELS QUELS, on ne touche
// que les prix, et on REFUSE de construire s'il en manque un.
//
// ⚠️ La charge est un TABLEAU NU, pas `{dishes: [...]}` — enveloppé, l'API
// répond 400 en réclamant des champs qu'elle a pourtant sous les yeux.
//
// ⚠️ UN SEUL APPEL GROUPÉ : Zelty plafonne son débit et renvoie des 429 dès la
// cinquième écriture à la file.
//
// ⚠️ UNE LECTURE QUI REND MOINS DE 100 PLATS EST UNE LECTURE RATÉE, pas un
// catalogue vide : on n'écrit RIEN.
//
// ⚠️ LA TVA SUR PLACE SUIT LA LOI, pas le panneau : une pizza mangée à table
// est à 10 %, à emporter à 5,5 %… non — une pizza est un PLAT, donc 10 % dans
// les deux cas (0113). `price` et `price_togo` portent le MÊME TTC ici, et
// c'est voulu : l'affiche annonce un prix unique sur place, à emporter et en
// livraison.
//
//   node scripts/pousser-pizzas-zelty.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
if (!Z) { console.log('\n  ZELTY_API_KEY absente de .env.local — rien à pousser.\n'); process.exit(1) }
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const f2 = n => n.toFixed(2).replace('.', ',')
const nos = await (await fetch(`${U}/rest/v1/recettes?tag_destination=eq.PIZZA&actif=is.true&select=id,nom,prix_vente_ht,tva,prix_sur_place_ttc`, { headers: H })).json()

const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
  { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
if (plats.length < 100) { console.log(`\n  ✗ la caisse rend ${plats.length} plats — lecture douteuse. RIEN n'est écrit.\n`); process.exit(1) }
const parRemote = new Map(plats.map(p => [String(p.remote_id ?? ''), p]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — ${nos.length} pizzas vers la caisse ──\n`)
const corps = [], refus = []
for (const r of nos.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
  const ttc = Number(r.prix_vente_ht) * (1 + r.tva / 100)
  const p = parRemote.get(String(r.id))
  if (!p) { refus.push(`${r.nom} : absente de la caisse — à créer par l'import, pas ici`); continue }
  if (p.name == null || p.price == null || p.tax == null) { refus.push(`${r.nom} : champ obligatoire manquant côté caisse — refus`); continue }
  const c = Math.round(ttc * 100)
  if (p.price === c && p.price_togo === c) continue
  corps.push({ id: p.id, name: p.name, price: c, price_togo: c, tax: p.tax, tax_takeaway: p.tax_takeaway })
  console.log(`  ${r.nom.padEnd(26)} ${f2((p.price ?? 0) / 100).padStart(6)} → ${f2(c / 100).padStart(6)} €`)
}
if (refus.length) { console.log('\n  refusés :'); refus.forEach(l => console.log('   ' + l)) }
console.log(`\n  ${corps.length} plat(s) à mettre à jour`)
if (!ECRIRE || !corps.length) { console.log(ECRIRE ? '' : '  (essai à blanc)\n'); process.exit(0) }
const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes',
  { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
const j = await r.json().catch(() => ({}))
console.log(`  → HTTP ${r.status} · ${(j.dishes ?? []).length} plats mis à jour · errno ${j.errno}\n`)
