// Import du devis Carigel dans la base.
//
//   node scripts/import-carigel.mjs            # dry-run (ne modifie rien)
//   node scripts/import-carigel.mjs --apply    # exécute réellement
//
// Source : data/devis-carigel.csv (rempli par le gérant après réception du devis).
//
// Action :
//   1. Upsert le fournisseur "Carigel" dans fournisseurs (avec coordonnées)
//   2. Pour chaque ligne du CSV avec prix_ht_eur > 0 :
//      - si un ingrédient existe avec le même nom → UPDATE (prix + fournisseur)
//      - sinon → INSERT (nouvel ingrédient)
//   3. Bilan : créés / mis à jour / skippés (prix vide) / échecs.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ─── Chargement .env.local ───────────────────────────────────────
const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('❌ Env vars Supabase manquantes dans .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

// ─── Helpers ─────────────────────────────────────────────────────
const FOURNISSEUR_NOM = 'Carigel'

const FOURNISSEUR_DATA = {
  nom: FOURNISSEUR_NOM,
  contact: null,                        // À remplir manuellement après contact
  telephone: null,
  email: 'commercial@carigel.com',
  adresse: "629 chemin de l'aérodrome, ZA du Saluant, 38203 Vienne Cedex",
  conditions_tarifaires: null,
  delai_livraison_jours: null,
  minimum_commande: null,
  jours_livraison: null,
  actif: true,
}

// Mapping catégorie Carigel → catégorie ingredients (harmonisée)
const CAT_MAP = {
  'Viande':              'Viande',
  'Mer':                 'Poisson',
  'Crèmerie':            'Crémerie',
  'Légumes':             'Légume',
  'Pain & Viennoiserie': 'Pain',
  'Dessert & Glace':     'Dessert',
  'Épicerie':            'Épicerie',
  'Boissons':            'Boisson',
  'Non Alimentaire':     'Non alimentaire',
}

// Parser CSV minimal (gère virgules dans guillemets)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  const headers = parseRow(lines[0])
  return lines.slice(1).map(line => {
    const cells = parseRow(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] ?? '' })
    return obj
  })
}
function parseRow(line) {
  const out = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"' && line[i+1] === '"') { cur += '"'; i++; continue }
    if (c === '"') { inQuote = !inQuote; continue }
    if (c === ',' && !inQuote) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out
}

// ─── Lecture CSV ─────────────────────────────────────────────────
let csvRaw
try {
  csvRaw = readFileSync('data/devis-carigel.csv', 'utf8')
} catch {
  console.error('❌ data/devis-carigel.csv introuvable')
  process.exit(1)
}
const rows = parseCSV(csvRaw)
console.log(`\n📄 Lu ${rows.length} lignes depuis data/devis-carigel.csv\n`)

// ─── Bilan préparatoire ──────────────────────────────────────────
const stats = {
  totalLignes:  rows.length,
  avecPrix:     0,
  sansPrix:     0,
  aCreer:       0,
  aMaj:         0,
  echecs:       0,
}

console.log(APPLY
  ? '🟢 Mode APPLY : les modifications seront écrites en base'
  : '🟡 Mode DRY-RUN : aucune modification (relancer avec --apply pour exécuter)\n')

// ─── Étape 1 : upsert Carigel dans fournisseurs ──────────────────
const { data: existingF } = await sb.from('fournisseurs')
  .select('id, nom')
  .eq('nom', FOURNISSEUR_NOM)
  .maybeSingle()

if (existingF) {
  console.log(`✓ Fournisseur "Carigel" existe déjà (id=${existingF.id})`)
} else {
  console.log(`→ Fournisseur "Carigel" à créer`)
  if (APPLY) {
    const { error } = await sb.from('fournisseurs').insert(FOURNISSEUR_DATA)
    if (error) {
      console.error(`❌ Création fournisseur : ${error.message}`)
      process.exit(1)
    }
    console.log(`✓ Fournisseur Carigel créé`)
  }
}

// ─── Étape 2 : pour chaque ligne, INSERT ou UPDATE ───────────────
console.log(`\n── Traitement des ${rows.length} produits ──\n`)

for (const row of rows) {
  const nom = (row.nom || '').trim()
  if (!nom) continue

  const prix = parseFloat((row.prix_ht_eur || '').replace(',', '.'))
  if (!prix || prix <= 0) {
    stats.sansPrix++
    continue
  }
  stats.avecPrix++

  // Cherche un ingrédient existant par nom (insensible à la casse)
  const { data: existing } = await sb.from('ingredients')
    .select('id, nom, prix_achat_ht, fournisseur_principal')
    .ilike('nom', nom)
    .maybeSingle()

  const allergenes = (row.allergenes || '').split('|').map(s => s.trim()).filter(Boolean)
  const dlcJours = parseInt(row.dlc_jours || '0', 10) || null
  const stockMin = parseInt(row.stock_min || '0', 10) || 0
  const categorie = CAT_MAP[row.categorie_carigel] || 'Autre'

  if (existing) {
    stats.aMaj++
    console.log(`  📝 ${nom.padEnd(40)} → MAJ (existant) ${existing.prix_achat_ht ?? '?'} € → ${prix} €/${row.unite}`)
    if (APPLY) {
      const { error } = await sb.from('ingredients').update({
        prix_achat_ht: prix,
        fournisseur_principal: FOURNISSEUR_NOM,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      if (error) { stats.echecs++; console.error(`    ❌ ${error.message}`) }
    }
  } else {
    stats.aCreer++
    console.log(`  ➕ ${nom.padEnd(40)} → CRÉER ${prix} €/${row.unite}  (${categorie})`)
    if (APPLY) {
      const { error } = await sb.from('ingredients').insert({
        nom,
        categorie,
        unite: row.unite || 'piece',
        prix_achat_ht: prix,
        fournisseur_principal: FOURNISSEUR_NOM,
        stock_actuel: 0,
        stock_minimum: stockMin,
        stock_maximum: stockMin * 3,
        dlc_moyenne_jours: dlcJours,
        allergenes,
        actif: true,
      })
      if (error) { stats.echecs++; console.error(`    ❌ ${error.message}`) }
    }
  }
}

// ─── Bilan final ─────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`)
console.log(`📊 Bilan ${APPLY ? '(EXÉCUTÉ)' : '(simulation)'}\n`)
console.log(`  Total lignes CSV         : ${stats.totalLignes}`)
console.log(`  Avec prix renseigné      : ${stats.avecPrix}`)
console.log(`  Sans prix (skip)         : ${stats.sansPrix}`)
console.log(`    → à créer (insert)     : ${stats.aCreer}`)
console.log(`    → à mettre à jour      : ${stats.aMaj}`)
console.log(`    → échecs               : ${stats.echecs}`)
console.log()

if (!APPLY) {
  console.log(`💡 Pour exécuter réellement : node scripts/import-carigel.mjs --apply`)
} else if (stats.echecs > 0) {
  console.log(`⚠ ${stats.echecs} échecs — vérifier les logs ci-dessus`)
  process.exit(1)
} else {
  console.log(`✓ Import terminé avec succès`)
}
