// Sauvegarde l'état actuel du stock (ingredients.stock_actuel) dans un fichier
// JSON, pour pouvoir le RESTAURER après la phase de formation (où les passages
// à « Servi » auront déduit le stock).
//
// À lancer AVANT de démarrer la formation.
// Restauration : node scripts/reset-transactionnel.mjs --execute --restore-stock
//
// Usage : node scripts/stock-snapshot.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

const { data, error } = await sb.from('ingredients').select('id, nom, stock_actuel')
if (error) { console.error('❌', error.message); process.exit(1) }

mkdirSync('backups', { recursive: true })
const snap = {
  date: new Date().toISOString(),
  ingredients: (data ?? []).map(i => ({ id: i.id, nom: i.nom, stock_actuel: i.stock_actuel })),
}
writeFileSync('backups/stock-snapshot.json', JSON.stringify(snap, null, 2))
console.log(`✓ backups/stock-snapshot.json écrit — ${snap.ingredients.length} ingrédients sauvegardés.`)
console.log('  → Restauration avant l\'ouverture : node scripts/reset-transactionnel.mjs --execute --restore-stock')
