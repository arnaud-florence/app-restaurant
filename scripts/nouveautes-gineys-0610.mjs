// Les trois nouveautés de la facture Gineys du 06/10/2026.
//
// Deux focaccias à la plaque et un donut fourré, qui n'existaient nulle
// part — ni à la carte, ni en caisse. Ils sont livrés, donc en stock, donc
// vendables : les laisser hors catalogue, c'est de la marchandise qui dort.
//
// ⚠️⚠️ LA DÉCOUPE DÉCIDE DU PRIX, et c'est une décision de cuisine, pas une
// déduction. Le gérant a tranché : **8 parts** par plaque. En 6 parts le
// coût de la part monterait d'un tiers et il faudrait passer à 3,50 €.
// `unites_par_achat = 8` porte ce lien : `cout_achat_ht × unites_par_achat`
// doit retomber sur le prix de la PLAQUE (0131).
//
// ⚠️ Prix calé sur 2,90 € — exactement celui des pizzas à la plaque. Même
// format, même geste au comptoir, et le client n'a rien à comprendre.
//
// ⚠️ TVA : 10 % pour le salé à la plaque (comme les pizzas à la plaque),
// 5,5 % pour la gourmandise (comme les donuts). Le taux suit le PRODUIT,
// pas une règle globale (0114).
//
// Usage : node scripts/nouveautes-gineys-0610.mjs [--ecrire]

import fs from 'node:fs'
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0) })
const ECRIRE = process.argv.includes('--ecrire')
const FOURNIL = '25189dd7-db04-454e-ac5b-fba87870d497'
const PARTS = 8

const NOUVEAUX = [
  { nom: 'Focaccia ail-basilic', categorie: 'Pizza', ttc: 2.90, tva: 10,
    ref: '0071908', libelle: 'PLAQUE FOCACCIA AIL BASILIC CUITE 560G ARTIPAT C=5',
    prixPlaque: 7.9848, parts: PARTS,
    description: 'Part de focaccia à l’ail et au basilic, cuite sur plaque.' },
  { nom: 'Focaccia tomate cerise', categorie: 'Pizza', ttc: 2.90, tva: 10,
    ref: '0071803', libelle: 'FOCACCIA TOMATE CERISE CUITE 37.5X27.5CM 800G C=4',
    prixPlaque: 7.9375, parts: PARTS,
    description: 'Part de focaccia aux tomates cerises, cuite sur plaque.' },
  // ⚠️ « DOT MIX BOX » est un assortiment : une seule fiche couvre toutes
  // les garnitures, qui se choisissent au comptoir — même raisonnement que
  // les six focaccias fondues en une seule le 28/08.
  { nom: 'Donut fourré', categorie: 'Gourmandise', ttc: 2.20, tva: 5.5,
    ref: '0073367', libelle: 'DOT MIX BOX 52G C=60',
    prixPlaque: 0.7122, parts: 1,
    description: 'Donut fourré, 52 g. Garniture selon arrivage.' },
]

for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...(o.headers ?? {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} → ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · ${PARTS} parts par plaque ──\n`)
const aCreer = []
for (const n of NOUVEAUX) {
  const [deja] = await sb(`recettes?select=id,nom&nom=eq.${encodeURIComponent(n.nom)}`)
  const coutVendu = Number((n.prixPlaque / n.parts).toFixed(4))
  const ht = Number((n.ttc / (1 + n.tva / 100)).toFixed(4))
  const fc = (coutVendu / ht) * 100
  // ⚠️ Même garde-fou que partout : un coût atteignant 95 % du prix de
  // vente est une erreur de saisie, pas une marge écrasée.
  if (coutVendu >= ht * 0.95) {
    console.error(`⛔ ${n.nom} : coût ${coutVendu} € pour ${ht} € HT de vente — refusé.`)
    process.exit(1)
  }
  console.log(`  ${deja ? '⚠️ EXISTE DÉJÀ' : '+ à créer    '} ${n.nom.padEnd(24)} ${n.ttc.toFixed(2)} € TTC (TVA ${n.tva} %)`)
  console.log(`      ${n.categorie.padEnd(12)} coût ${coutVendu.toFixed(4)} €/part × ${n.parts} = ${(coutVendu * n.parts).toFixed(4)} € la plaque  ·  food cost ${fc.toFixed(0)} %`)
  if (!deja) aCreer.push({ ...n, coutVendu, ht })
}

if (!aCreer.length) { console.log('\n   rien à créer.\n'); process.exit(0) }
if (!ECRIRE) { console.log(`\n   (essai à blanc — ${aCreer.length} à créer. Relancer avec --ecrire)\n`); process.exit(0) }

for (const n of aCreer) {
  // ⚠️ `image_url` doit être ABSOLUE : le site vitrine est un projet
  // distinct qui consomme /api/public/menu en CORS. Une URL relative y
  // pointerait sur son propre domaine.
  const img = `https://app-restaurant-livid.vercel.app/produits/${slug(n.nom)}.jpg`
  const [r] = await sb('recettes', { method: 'POST', body: JSON.stringify({
    nom: n.nom, categorie: n.categorie, description: n.description,
    prix_vente_ht: n.ht, tva: n.tva, cout_achat_ht: n.coutVendu,
    unites_par_achat: n.parts, libelle_achat: n.libelle, reference_fournisseur: n.ref,
    etablissement_id: FOURNIL, tag_destination: 'FOURNIL',
    actif: true, vendable_online: true, image_url: img,
  }) })
  console.log(`   ✅ ${r.nom}  →  ${img.split('/').pop()}`)
}
console.log(`\n   ⚠️ Les visuels restent à générer, et l'import caisse à relancer.\n`)
