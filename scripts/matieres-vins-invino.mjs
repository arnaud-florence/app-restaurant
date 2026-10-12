#!/usr/bin/env node
// Les six bouteilles In Vino n'avaient AUCUNE matière.
//
//   node scripts/matieres-vins-invino.mjs [--ecrire]
//
// ⚠️⚠️ CE QUE ÇA COÛTAIT, ET POURQUOI RIEN NE LE DISAIT. Au bar, un produit
// SANS `nom_matiere` est EXCLU de `(ops)/inventaire?poste=bar` — la règle
// existe pour que « Kir » ou « Spritz » n'apparaissent pas comme des lignes
// de stock. Mais une BOUTEILLE vendue entière EST sa propre matière : sans
// ce champ, les six vins n'étaient comptés nulle part et ne remontaient dans
// aucune commande. Un prix juste, un coût juste, et un stock invisible.
//
// Seul `test-matieres-bar.mjs` le voyait, et c'est tout son intérêt : il
// exige que chaque produit du bar soit RATTACHÉ ou JUSTIFIÉ. Il était rouge.
//
// ⚠️ LE RAPPROCHEMENT EST DOUBLEMENT CONFIRMÉ, pas déduit d'un nom : les six
// coûts concordent AU CENTIME avec les lignes du catalogue In Vino (18,90 /
// 7,50 / 7,35 / 6,00 / 9,90 / 9,00), et les libellés se correspondent. Un
// rapprochement par le seul nom est ce que ce projet refuse depuis la 0151.
//
// Trois champs, trois rôles (0131/0132) : `nom_matiere` est ce qu'on AFFICHE
// en comptant, `libelle_achat` le texte LITTÉRAL du fournisseur qui servira
// à reconnaître la ligne de la prochaine facture, `reference_fournisseur`
// l'identifiant qui passe AVANT le libellé au rapprochement (0142).

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const sb = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...init, headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(p + ' → ' + r.status + ' ' + t.slice(0, 200))
  try { return JSON.parse(t) } catch { return t }
}
const T = async p => { const o = []; for (let d = 0; d < 60_000; d += 1000) {
  const j = await sb(`${p}${p.includes('?') ? '&' : '?'}order=id&offset=${d}&limit=1000`); o.push(...j); if (j.length < 1000) break } return o }

// produit vendu → référence In Vino. Le COÛT sert de contrôle : s'il ne
// concorde pas au centime, on n'écrit rien.
const PAIRES = [
  ['Champagne Pol Cochet',                'INV-09'],
  ['Bordeaux supérieur Toulouse-Lautrec', 'INV-08'],
  ['Château La Lieue tradition rosé',     'INV-04'],
  ['Côte du Rhône Lucien Tramier',        'INV-07'],
  ['Château La Lieue Batilde Philomène',  'INV-06'],
  ['Château La Lieue tradition blanc',    'INV-05'],
]

const eur = n => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

const recs = await T('recettes?select=id,nom,cout_achat_ht,nom_matiere,libelle_achat,reference_fournisseur,unites_par_achat')
const f = Object.fromEntries((await T('fournisseurs?select=id,nom')).map(x => [x.id, x.nom]))
const iv = Object.entries(f).find(([, n]) => /in vino/i.test(n))[0]
const cat = await T('catalogue_fournisseur?select=designation,reference,prix_ht&fournisseur_id=eq.' + iv)

const majs = [], refus = []
for (const [nom, ref] of PAIRES) {
  const r = recs.find(x => x.nom === nom)
  const c = cat.find(x => x.reference === ref)
  if (!r) { refus.push(`${nom} : produit introuvable`); continue }
  if (!c) { refus.push(`${nom} : référence ${ref} absente du catalogue`); continue }
  // ⚠️ LE CONTRÔLE QUI COMPTE : le coût du produit DOIT être le prix de la
  // ligne. Sinon on rattache une bouteille à une autre, et le stock part faux.
  if (Math.abs(Number(r.cout_achat_ht) - Number(c.prix_ht)) > 0.005) {
    refus.push(`${nom} : coût ${eur(r.cout_achat_ht)} ≠ ligne ${ref} ${eur(c.prix_ht)} — refus`); continue
  }
  if (r.nom_matiere) { console.log(`  = ${nom} porte déjà « ${r.nom_matiere} »`); continue }
  majs.push({ r, ref, designation: c.designation, prix: c.prix_ht })
}

console.log('\n╔══ BOUTEILLES IN VINO À RATTACHER ' + '═'.repeat(37))
for (const m of majs) {
  console.log(`  + ${m.r.nom.padEnd(38)} coût ${eur(m.r.cout_achat_ht).padStart(8)} = ligne ${m.ref} ✓`)
  console.log(`      matière affichée : « ${m.r.nom} »   ·   libellé d'achat : « ${m.designation} »`)
}
if (refus.length) { console.log('\n  ⚠ refusés :'); for (const x of refus) console.log('    · ' + x) }
if (!majs.length) { console.log('\n  rien à faire.\n'); process.exit(0) }
if (!ECRIRE) { console.log('\n  ── essai à blanc. `--ecrire` pour appliquer.\n'); process.exit(0) }

for (const m of majs)
  await sb(`recettes?id=eq.${m.r.id}`, { method: 'PATCH', body: JSON.stringify({
    nom_matiere: m.r.nom,          // une bouteille vendue entière EST sa matière
    libelle_achat: m.designation,  // le texte LITTÉRAL d'In Vino
    reference_fournisseur: m.ref,
    unites_par_achat: 1,           // une vendue = une achetée
  }) })
console.log(`\n  ✓ ${majs.length} bouteille(s) rattachée(s) — elles entrent à l'inventaire du bar et au réassort\n`)
