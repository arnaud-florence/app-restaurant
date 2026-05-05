// Vérifie la connectivité Supabase + liste les tables vides existantes.
// Usage : node scripts/verify-supabase.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Charge .env.local
const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant')
  process.exit(1)
}

console.log(`→ ${url}`)
const supabase = createClient(url, key)

// Tables qu'on s'attend à trouver (issues de 0001_init.sql)
const TABLES = [
  'ingredients', 'recettes', 'recette_ingredients',
  'tables_restaurant', 'commandes', 'commande_articles',
  'employes', 'planning', 'pointage', 'conges',
  'fournisseurs', 'bons_commande', 'bon_commande_lignes', 'mouvements_stock',
  'chambres', 'reservations_chambres', 'evenements',
  'releves_temperatures', 'procedures_hygiene', 'checklists_hygiene',
  'equipements', 'interventions_maintenance', 'obligations_legales',
  'suivi_dechets', 'clients', 'parametres', 'ventes_journalieres',
]

let ok = 0, ko = 0
const errors = []

for (const t of TABLES) {
  const { error, count } = await supabase
    .from(t)
    .select('*', { count: 'exact', head: true })
  if (error) {
    ko++
    errors.push(`  ❌ ${t} → ${error.message}`)
  } else {
    ok++
    process.stdout.write('.')
  }
}

console.log('')
console.log(`\n✓ ${ok}/${TABLES.length} tables accessibles`)
if (ko > 0) {
  console.log(`✗ ${ko} échecs :`)
  for (const e of errors) console.log(e)
  process.exit(1)
}
console.log('🎉 Connexion Supabase OK — base prête')
