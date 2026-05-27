// Applique une migration SQL via le RPC exec_sql (créé par migration 0086).
// Nécessite SUPABASE_SERVICE_ROLE_KEY.
//
// Usage :
//   node scripts/apply-migration.mjs supabase/migrations/0095_ajout_postes_snack_livreur.sql

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const file = process.argv[2]
if (!file) {
  console.error('❌ Usage : node scripts/apply-migration.mjs <fichier.sql>')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')
console.log(`→ Lecture ${file} (${sql.length} caractères)\n`)

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

console.log('→ Appel RPC exec_sql…')
const { data, error } = await sb.rpc('exec_sql', { query: sql })

if (error) {
  console.error('❌ Erreur :', error.message)
  console.error('   détails :', error.details ?? 'aucun')
  console.error('   hint    :', error.hint ?? 'aucun')
  process.exit(1)
}

console.log('✓ Migration appliquée avec succès.')
if (data) console.log('  données retournées :', JSON.stringify(data).slice(0, 200))
