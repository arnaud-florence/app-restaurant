// Aligner la caisse sur notre base — mises à jour ET créations.
//
// ⚠️⚠️ `POST /catalog/dishes` EST UN UPSERT qui exige `name`, `price` et `tax`.
// Pour une MISE À JOUR on RELIT le plat et on recopie ces champs tels quels ;
// pour une CRÉATION on n'envoie AUCUN `id` — un `id` inconnu fait échouer
// l'appel, un `id` réutilisé écrase un plat existant.
//
// ⚠️ TABLEAU NU, jamais `{dishes: […]}`. UN SEUL appel groupé : Zelty plafonne
// son débit et renvoie des 429 dès la cinquième écriture à la file.
//
// ⚠️ Une lecture qui rend moins de 100 plats est une lecture RATÉE : on
// n'écrit rien.
//
// ⚠️ `price` = SALLE, `price_togo` = EMPORTER. Les confondre a déjà écrasé le
// prix salle de six boissons. La TVA part en MILLIÈMES (1000 = 10 %).
//
// ⚠️ La correspondance d'un plat créé s'enregistre IMMÉDIATEMENT : sans elle,
// un second lancement recréerait tout en double sans rien signaler.
//
//   node scripts/pousser-carte-zelty.mjs [--ecrire] [--tag=FOURNIL,PIZZA]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
if (!Z) { console.log('\n  ZELTY_API_KEY absente.\n'); process.exit(1) }
const ECRIRE = process.argv.includes('--ecrire')
const tags = (process.argv.find(a => a.startsWith('--tag=')) ?? '--tag=FOURNIL,PIZZA,BAR,CUISINE').split('=')[1].split(',')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const f2 = n => n.toFixed(2).replace('.', ',')
const nos = await (await fetch(`${U}/rest/v1/recettes?actif=is.true&tag_destination=in.(${tags.join(',')})&select=id,nom,nom_caisse,prix_vente_ht,prix_sur_place_ttc,tva,contient_alcool,image_url`, { headers: H })).json()
const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0', { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
if (plats.length < 100) { console.log(`\n  ✗ la caisse rend ${plats.length} plats — lecture douteuse. RIEN n'est écrit.\n`); process.exit(1) }
const parRemote = new Map(plats.map(p => [String(p.remote_id ?? ''), p]))

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — ${nos.length} produits ${tags.join('/')} ──\n`)
const majs = [], creas = [], refus = []
for (const r of nos.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
  const emporter = Math.round(Number(r.prix_vente_ht) * (1 + r.tva / 100) * 100)
  const salle = r.prix_sur_place_ttc != null ? Math.round(Number(r.prix_sur_place_ttc) * 100) : emporter
  // ⚠️ La TVA SUR PLACE suit la LOI, pas le panneau : 20 % pour l'alcool,
  // 10 % pour tout le reste consommé à table (0113). Le taux à emporter est
  // celui du produit.
  const tvaSalle = r.contient_alcool ? 2000 : 1000
  const tvaEmporter = Math.round(Number(r.tva) * 100)
  const p = parRemote.get(String(r.id))
  if (!p) {
    creas.push({ remote_id: r.id, name: (r.nom_caisse?.trim() || r.nom.trim()),
      price: salle, price_togo: emporter, tax: tvaSalle, tax_takeaway: tvaEmporter,
      ...(r.image_url ? { image: r.image_url } : {}) })
    console.log(`  + ${r.nom.padEnd(30)} CRÉATION  ${f2(emporter / 100)} €`)
    continue
  }
  if (p.name == null || p.price == null || p.tax == null) { refus.push(`${r.nom} : champ obligatoire manquant côté caisse`); continue }
  if (p.price === salle && p.price_togo === emporter) continue
  majs.push({ id: p.id, name: p.name, price: salle, price_togo: emporter, tax: p.tax, tax_takeaway: p.tax_takeaway })
  console.log(`  ~ ${r.nom.padEnd(30)} ${f2((p.price_togo ?? 0) / 100).padStart(6)} → ${f2(emporter / 100).padStart(6)} € emporter`)
}
if (refus.length) { console.log('\n  refusés :'); refus.forEach(l => console.log('   ' + l)) }
console.log(`\n  ${majs.length} mise(s) à jour · ${creas.length} création(s)`)
if (!ECRIRE) { console.log('  (essai à blanc)\n'); process.exit(0) }
const envoyer = async (corps, quoi) => {
  if (!corps.length) return []
  const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes',
    { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  console.log(`  → ${quoi} : HTTP ${r.status} · ${(j.dishes ?? []).length} plat(s) · errno ${j.errno}`)
  return j.dishes ?? []
}
await envoyer(majs, 'mises à jour')
const crees = await envoyer(creas, 'créations')
for (const d of crees) if (d.id != null && d.remote_id)
  await fetch(`${U}/rest/v1/correspondances_catalogue`, { method: 'POST', headers: H, body: JSON.stringify({
    source_caisse: 'zelty', recette_id: d.remote_id, identifiant_externe: String(d.id), libelle_externe: d.name ?? null }) })
if (crees.length) console.log(`  ✓ ${crees.length} correspondance(s) enregistrée(s)`)
console.log('')
