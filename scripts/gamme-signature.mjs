// Passage de la viennoiserie en gamme SIGNATURE — décision du gérant, 28/09/2026.
//
// Croissant courbé 90 g et pain au chocolat 85 g, TOUS DEUX À 1,40 €. C'est un
// choix ASSUMÉ du matin, au même titre que le demi à 2,80 € : 44 % et 40 % de
// food cost, −1 055 €/an à volume constant, en pari sur la fréquentation. Il
// faut +2,2 croissants et +1,6 pains au chocolat par jour pour être neutre.
// À mesurer sur 30 jours après l'ouverture — si le volume n'est pas là, on
// monte à 1,50 €.
//
// Les trois formules qui contiennent une viennoiserie suivent : leur coût
// d'entrée passe de 0,30 € à 0,585 €, et leur rabais avait été taillé sur un
// croissant à 1,20 €.
//
// ⚠️ On ne monte PAS les formules au niveau qui rendrait toute la marge
// (Express 2,70 €) : à ce prix elle ferait économiser 10 centimes sur l'achat
// séparé (café 1,40 + croissant 1,40 = 2,80) et ne serait plus une offre. Une
// formule que personne ne prend ne récupère rien — et elle vaut 0,60 € de
// marge de plus qu'un café seul. On garde un rabais VISIBLE de 0,20-0,30 €.
//
// ⚠️ Ces coûts viennent d'un DEVIS, pas d'une facture. `prix_estime` (0165)
// n'existe que sur `ingredients` — un produit vendu n'a pas ce drapeau — donc
// la nuance ne vit que dans `catalogue_fournisseur` (nature 'devis') et ici.
// La première facture Gineys écrasera ces coûts par les prix réellement payés.
//
// ⚠️ La caisse est mise à jour dans le même geste. POST /catalog/dishes est un
// UPSERT : on relit, on recopie name/tax tels quels, on ne change que le prix,
// et on REFUSE si un champ obligatoire manque.
//
//   node scripts/gamme-signature.mjs [--ecrire]
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
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')
const f4 = n => n.toFixed(4).replace('.', ',')

// Le prix se saisit en TTC — c'est le prix du panneau. Le HT se recalcule au
// taux DU PRODUIT ; un taux figé ferait payer autre chose que l'affiche.
const PRIX_TTC = {
  'Croissant': 1.40,
  'Pain au chocolat': 1.40,
  'Formule Express': 2.60,                       // café 1,40 + viennoiserie 1,40 = 2,80 → 0,20 de rabais
  'Formule Douceur chaude': 3.80,                // cappuccino 2,50 + 1,40 = 3,90 → 0,10
  'Formule Petit-déjeuner complet': 4.30,        // 1,40 + 1,40 + 1,80 = 4,60 → 0,30
  'Formule — croissant ou pain au chocolat': 1.30,  // ventilation TVA d'Express : 1,30 + 1,30 = 2,60
  'Formule — expresso ou allongé': 1.30,
}

// Ce qu'on achète désormais, et où. Références du portail Gineys.
const ACHAT = {
  'Croissant': {
    cout: 32.77 / 56, libelle: 'CROISSANT COURBE PREPOUSSE 90G VENDOME C=56', ref: '0073480',
  },
  'Pain au chocolat': {
    cout: 31.92 / 60, libelle: 'PAIN AU CHOCOLAT PREPOUSSE 85G SIGNATURE C=60', ref: '0073563',
  },
  // Le composant de formule consomme une viennoiserie : sans coût il
  // s'affichait à 0 % de food cost, c'est-à-dire en vert (0150). On y met le
  // pire des deux — le courbé. Aucun `libelle_achat` : il ne s'achète pas,
  // et lui en donner le ferait entrer dans la commande conseillée en double.
  'Formule — croissant ou pain au chocolat': { cout: 32.77 / 56 },
  'Formule — expresso ou allongé': { cout: 0.2415 },
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — gamme Signature ──\n`)

const noms = Object.keys(PRIX_TTC)
const produits = await sb(`recettes?nom=in.(${noms.map(n => `"${n}"`).join(',')})&select=id,nom,prix_vente_ht,tva,cout_achat_ht,prix_sur_place_ttc`)
const manquants = noms.filter(n => !produits.some(p => p.nom === n))
if (manquants.length) { console.error(`  ✗ introuvables : ${manquants.join(', ')}`); process.exit(1) }

const patchs = []
for (const p of produits) {
  const ttc = PRIX_TTC[p.nom]
  const ht = Math.round(ttc / (1 + Number(p.tva) / 100) * 1e4) / 1e4
  const a = ACHAT[p.nom]
  const cout = a ? Math.round(a.cout * 1e4) / 1e4 : (p.cout_achat_ht == null ? null : Number(p.cout_achat_ht))
  const ancienTtc = Number(p.prix_vente_ht) * (1 + Number(p.tva) / 100)
  const fc = cout == null ? null : cout / ht * 100

  const body = { prix_vente_ht: ht }
  if (a) {
    body.cout_achat_ht = cout
    if (a.libelle) { body.libelle_achat = a.libelle; body.reference_fournisseur = a.ref }
  }
  patchs.push({ id: p.id, nom: p.nom, body })

  console.log(`  ${p.nom.slice(0, 40).padEnd(41)} ${f2(ancienTtc).padStart(5)} → ${f2(ttc).padStart(5)} € TTC` +
    `  (HT ${f4(ht)}, TVA ${p.tva} %)` +
    (cout == null ? '' : `  coût ${f4(cout)}  food cost ${fc.toFixed(1).replace('.', ',')} %  marge ${f2(ht - cout)} €`))
  if (a?.libelle) console.log(`  ${' '.repeat(41)} achat : ${a.libelle}  (réf ${a.ref})`)
}

if (ECRIRE) {
  for (const p of patchs) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(p.body) })
  console.log(`\n  ✓ ${patchs.length} produits mis à jour dans l'outil (le trigger 0146 trace chaque prix).`)
}

// ── Caisse Zelty ───────────────────────────────────────────────────────
if (!Z) { console.log('\n  (caisse ignorée — ZELTY_API_KEY absente)\n'); process.exit(0) }
console.log(`\n── caisse Zelty ──\n`)
const plats = (await (await fetch('https://api.zelty.fr/2.11/catalog/dishes?show_all=true&lang=fr&limit=0',
  { headers: { Authorization: `Bearer ${Z}` } })).json()).dishes ?? []
// Une lecture qui rend peu est une lecture RATÉE, pas un catalogue vide.
if (plats.length < 100) { console.error(`  ✗ la caisse ne rend que ${plats.length} plats — lecture ratée, on n'écrit rien.`); process.exit(1) }
const parRemote = new Map(plats.filter(p => p.remote_id).map(p => [String(p.remote_id), p]))

const corps = [], refus = []
for (const p of patchs) {
  const d = parRemote.get(String(p.id))
  if (!d) { refus.push(`${p.nom} : sans correspondance en caisse`); continue }
  if (d.name == null || d.price == null || d.tax == null) { refus.push(`${p.nom} : champ obligatoire manquant — refus`); continue }
  const c = Math.round(PRIX_TTC[p.nom] * 100)
  if (d.price === c && d.price_togo === c) continue
  // Le prix du panneau est le même en salle et à emporter ; seul le TAUX
  // diffère, et on le recopie tel quel — on ne le recalcule jamais ici.
  corps.push({ id: d.id, name: d.name, price: c, price_togo: c, tax: d.tax, tax_takeaway: d.tax_takeaway })
  console.log(`  ${p.nom.slice(0, 40).padEnd(41)} ${f2((d.price ?? 0) / 100).padStart(5)} → ${f2(c / 100).padStart(5)} €`)
}
if (refus.length) { console.log('\n  refusés :'); refus.forEach(l => console.log('   ' + l)) }
console.log(`\n  caisse : ${corps.length} plat(s) à mettre à jour`)
if (!ECRIRE) { console.log('  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
if (corps.length) {
  // ⚠️ TABLEAU NU, et un seul appel : Zelty répond 429 dès la cinquième
  // écriture à la file, et refuse un `{dishes: [...]}` enveloppé.
  const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes',
    { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
  const j = await r.json().catch(() => ({}))
  console.log(`  → HTTP ${r.status} · ${(j.dishes ?? []).length} plats mis à jour · errno ${j.errno}`)
}
console.log('')
