// Applique la migration 0121 (alignement catalogue) via la fonction PG
// exec_sql() — même chemin que les autres migrations automatisées du projet.
// Sauvegarde l'état des recettes FOURNIL avant toute écriture.
//
// Usage : node scripts/apply-0114.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const l of env.split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY manquante dans .env.local'); process.exit(1) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, KEY)

const BAK = 'backups/recettes-avant-0121.json'

// ─── 1. Sauvegarde avant écriture ───────────────────────────────────
const { data: avant, error: eSel } = await sb.from('recettes').select('*')
if (eSel) { console.error('✗ lecture KO :', eSel.message); process.exit(1) }
writeFileSync(BAK, JSON.stringify(avant, null, 2))
console.log(`✓ sauvegarde de ${avant.length} recette(s) FOURNIL → ${BAK}`)

// ─── 2. Application ─────────────────────────────────────────────────
const sql = readFileSync('supabase/migrations/0121_alignement_catalogue_sumup.sql', 'utf8')
const { data, error } = await sb.rpc('exec_sql', { query: sql })
if (error) { console.error('✗ RPC KO :', error.message); process.exit(1) }
if (data && data.ok === false) { console.error('✗ SQL KO :', data.error, `(${data.sqlstate})`); process.exit(1) }
console.log('✓ migration 0121 appliquée —', JSON.stringify(data))
