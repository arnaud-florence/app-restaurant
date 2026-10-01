// L'autre moitié du rapprochement : ce que le panier contient et que la carte
// ne vend pas. Le gérant paie 48 Sprite et 72 Fuze tea — les laisser hors
// carte, c'est de la marchandise qui dort en réserve.
//
// ⚠️ Prix : 2,80 € en salle, la grille établie le 21/09 pour tous les softs
// servis en verre consigné. Ce n'est pas une estimation, c'est le tarif du bar.
//
//   node scripts/ajouts-panier-bar.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')

// Un produit modèle du bar donne l'établissement : l'inventer ferait sortir
// ses ventes de la ventilation par activité, en silence.
const [modele] = await sb('recettes?tag_destination=eq.BAR&categorie=eq.Boisson%20fra%C3%AEche&actif=eq.true&select=etablissement_id,tva,categorie,image_url&limit=1')
if (!modele) { console.error('  ✗ aucun produit modèle au bar'); process.exit(1) }

const TTC = 2.80, TVA = 10
const HT = Math.round(TTC / (1 + TVA / 100) * 1e4) / 1e4

const A_CREER = [{
  nom: 'Sprite 25 cl', nom_caisse: 'Sprite 25 cl',
  cout: 17.36 / 24,                        // caisse de 24, prix remisé
  matiere: 'Sprite VC 25 cl (caisse de 24)', ref: '118580',
  pourquoi: '48 bouteilles au panier (promo 2+1), aucun produit à la carte',
}]

const A_CHIFFRER = [{
  nom: 'Ice Tea 33 cl', cout: 35.50 / 48,  // 2 caisses payées, 48 bouteilles
  matiere: 'Fuze tea pêche VC 25 cl (caisse de 24)', ref: '117890',
  pourquoi: 'vendu depuis août SANS AUCUN COÛT — le Fuze tea est sa matière',
}]

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — ce que le panier apporte ──\n`)

const nouveaux = []
for (const p of A_CREER) {
  const [deja] = await sb(`recettes?nom=eq.${encodeURIComponent(p.nom)}&select=id`)
  if (deja) { console.log(`  ${p.nom} existe déjà — ignoré`); continue }
  const cout = Math.round(p.cout * 1e4) / 1e4
  console.log(`  + ${p.nom.padEnd(20)} ${f2(TTC)} € TTC · coût ${f2(cout)} · food cost ${(cout / HT * 100).toFixed(0)} % · marge ${f2(HT - cout)} €`)
  console.log(`    ${p.pourquoi}`)
  if (!ECRIRE) continue
  const [n] = await sb('recettes', { method: 'POST', body: JSON.stringify({
    nom: p.nom, nom_caisse: p.nom_caisse, categorie: 'Boisson fraîche',
    tag_destination: 'BAR', etablissement_id: modele.etablissement_id,
    prix_vente_ht: HT, tva: TVA, cout_achat_ht: cout,
    nom_matiere: p.matiere, reference_fournisseur: p.ref, unites_par_achat: 1,
    contient_alcool: false,
    vendable_online: false,   // servi en verre consigné, jamais à emporter
    actif: true,
  }) })
  nouveaux.push(n)
}

for (const p of A_CHIFFRER) {
  const [r] = await sb(`recettes?nom=eq.${encodeURIComponent(p.nom)}&select=id,nom,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht`)
  if (!r) { console.log(`  ✗ ${p.nom} introuvable`); continue }
  const cout = Math.round(p.cout * 1e4) / 1e4
  const htEmporter = Number(r.prix_vente_ht)
  const htSalle = r.prix_sur_place_ttc != null ? Number(r.prix_sur_place_ttc) / (1 + Number(r.tva) / 100) : htEmporter
  console.log(`\n  ~ ${p.nom.padEnd(20)} coût ${r.cout_achat_ht == null ? 'INCONNU' : f2(Number(r.cout_achat_ht))} → ${f2(cout)}`)
  console.log(`    ${p.pourquoi}`)
  console.log(`    food cost ${(cout / htEmporter * 100).toFixed(0)} % à emporter · ${(cout / htSalle * 100).toFixed(0)} % en salle`)
  if (ECRIRE) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({
    cout_achat_ht: cout, nom_matiere: p.matiere, reference_fournisseur: p.ref }) })
}

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

// ── Caisse : créer le bouton du nouveau produit ───────────────────────
if (!Z || !nouveaux.length) { console.log('\n  ✓ écrit.\n'); process.exit(0) }
// ⚠️ Aucun `id` envoyé : un id inconnu ferait échouer l'appel, un id réutilisé
// écraserait un plat. `remote_id` porte NOTRE uuid — c'est ce qui rend la
// correspondance exacte dès le premier jour. La TVA SUR PLACE suit la loi.
const corps = nouveaux.map(n => ({
  name: n.nom_caisse, remote_id: n.id,
  price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
  tax: 1000, tax_takeaway: 1000,          // ⚠️ MILLIÈMES : 1000 = 10 %
}))
const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes',
  { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
const j = await r.json().catch(() => ({}))
console.log(`\n  → caisse : HTTP ${r.status} · ${(j.dishes ?? []).length} plat(s) créé(s) · errno ${j.errno}`)
for (const d of j.dishes ?? []) {
  await sb('correspondances_catalogue', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ systeme: 'zelty', identifiant_externe: String(d.id), recette_id: String(d.remote_id) }) })
}
console.log('  ✓ correspondances enregistrées.\n')
