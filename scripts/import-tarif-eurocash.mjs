// Le tarif Euro-Cash entre au catalogue — une fois l'unité tranchée.
//
//   node scripts/import-tarif-eurocash.mjs --prix=unite|colis [--ecrire]
//
// Euro-Cash a renvoyé le tableau du 23/09/2026 avec 199 lignes chiffrées sur
// 1 292. Le fichier vit dans `data/`, GITIGNORÉ : conditions négociées, dépôt
// public.
//
// ⚠️⚠️ `--prix` N'A PAS DE VALEUR PAR DÉFAUT, ET C'EST VOULU.
// Leur colonne « VOTRE PRIX HT » mélange manifestement les deux lectures :
// un Coca en `c-24x33cl` à 0,60 € est un prix À LA CANETTE (le colis vaudrait
// 14 €), mais un « Pot Nutella » en `c-2x3kg` à 49,78 € est un prix AU COLIS
// (un pot de 3 kg à 49,78 € ferait 16,60 €/kg, quand on le paie 8,82 €/kg).
//
// Se tromper ne lève aucune erreur : le Nutella affiche « +88 % plus cher »
// dans un sens et « −6 %, moins cher » dans l'autre. Un écran qui tranche au
// hasard fait changer de fournisseur sur un chiffre inventé. C'est le même
// garde-fou que `ZELTY_MONTANTS_EN_CENTIMES`, pour la même raison : une unité
// fausse produit des nombres parfaitement valides.
//
// ⚠️ Rien n'est écrit dans `ingredients.prix_achat_ht` : un tarif est une
// proposition, une facture est une preuve (0151).

import fs from 'node:fs'
import { unitesColis } from './_tarifs-communs.mjs'

const FICHIER = process.argv.find(a => a.endsWith('.csv'))
  ?? 'data/tarif-eurocash-2026-09-23.csv'
const ECRIRE = process.argv.includes('--ecrire')
const arg = process.argv.find(a => a.startsWith('--prix='))
const LECTURE = arg?.slice(7)

if (LECTURE !== 'unite' && LECTURE !== 'colis') {
  console.error(`
✗ Il manque --prix=unite ou --prix=colis.

  Euro-Cash n'a pas dit si « VOTRE PRIX HT » est le prix d'UNE unité ou celui
  du COLIS, et son tableau mélange visiblement les deux. Choisir au hasard
  ferait afficher un « moins cher » qui n'existe pas — sans la moindre erreur
  pour le signaler.

  → Poser la question au commercial avant de lancer cet import.
`)
  process.exit(1)
}

if (!fs.existsSync(FICHIER)) {
  console.error(`\n✗ ${FICHIER} absent (gitignoré : il vit sur le poste).\n`)
  process.exit(1)
}

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=minimal', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^﻿/, '')
const lignes = brut.split(/\r?\n/).filter(Boolean)
const entetes = lignes[0].split(';').map(h => h.trim())
const rows = lignes.slice(1).map(l => {
  const c = l.split(';'); const o = {}
  entetes.forEach((h, i) => { o[h] = (c[i] ?? '').trim() })
  return o
})

const nombre = s => {
  if (!s) return null
  const v = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}


const fournisseurs = await sb('fournisseurs?select=id,nom', { headers: { Prefer: 'return=representation' } })
const euro = fournisseurs.find(f => /euro[\s-]?cash/i.test(f.nom))
if (!euro) { console.error('✗ Fournisseur Euro-Cash introuvable.'); process.exit(1) }

const AUJOURDHUI = new Date().toISOString().slice(0, 10)
const out = [], sansUnites = []
for (const r of rows) {
  const prix = nombre(r['VOTRE PRIX HT'])
  const code = (r['Code'] || '').trim()
  // ⚠️ Le fichier porte aussi une section « avez-vous l'équivalent ? » sans
  // code article : ce sont des QUESTIONS, pas des références à leur catalogue.
  if (!prix || !/^\d{3,}$/.test(code)) continue

  const u = unitesColis(r['Colisage'])
  let prixUnite = prix
  if (LECTURE === 'colis') {
    if (!u) { sansUnites.push(r['Désignation']); continue }
    prixUnite = prix / u
  }

  out.push({
    fournisseur_id: euro.id,
    reference: code,
    designation: (r['Désignation'] || '').replace(/\s+/g, ' ').trim(),
    famille: r['Rayon'] || null,
    unite: 'piece',
    prix_ht: Number(prixUnite.toFixed(4)),
    colis_quantite: u,
    colis_libelle: r['Colisage'] || null,
    contenance_valeur: null,
    contenance_unite: null,
    cle_comparaison: null,
    ingredient_id: null,
    recette_id: null,
    date_tarif: AUJOURDHUI,
    source: `Tarif Euro-Cash du ${AUJOURDHUI.split('-').reverse().join('/')} (prix ${LECTURE})`,
    nature: 'devis',
    remise_pct: null,
    // Un tarif adressé nommément à CASATASIA EST notre prix connu.
    tarif_negocie: true,
    achete: false,
    actif: true,
  })
}

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · Euro-Cash · prix lus « ${LECTURE} » ──\n`)
console.log(`  ${rows.length} ligne(s) au fichier, ${out.length} chiffrée(s) et retenue(s)`)
if (sansUnites.length) console.log(`  ⚠️ ${sansUnites.length} écartée(s) : colisage illisible, impossible de ramener à l'unité`)
const parRayon = {}
out.forEach(o => { parRayon[o.famille] = (parRayon[o.famille] || 0) + 1 })
Object.entries(parRayon).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`   · ${String(v).padStart(4)}  ${k}`))

if (!ECRIRE) {
  console.log('\n  Exemples :')
  for (const o of out.slice(0, 6)) {
    console.log(`   · ${o.reference.padEnd(7)} ${o.designation.slice(0, 40).padEnd(40)} ${o.prix_ht.toFixed(3).padStart(9)} €/u  (${o.colis_libelle})`)
  }
  console.log('\n  (rien écrit — relancer avec --ecrire)\n')
  process.exit(0)
}

let n = 0
for (let i = 0; i < out.length; i += 200) {
  const lot = out.slice(i, i + 200)
  await sb('catalogue_fournisseur?on_conflict=fournisseur_id,reference,date_tarif', {
    method: 'POST', body: JSON.stringify(lot),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  n += lot.length
}
console.log(`\n✓ ${n} tarif(s) Euro-Cash au catalogue.\n`)
