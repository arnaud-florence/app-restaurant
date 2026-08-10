// Concatène toutes les migrations numérotées (0001..NNNN) en UN seul fichier
// SQL, à coller dans le SQL Editor du projet Supabase "formation" (fresh DB).
//
// Les migrations sont idempotentes → l'ordre numérique reconstruit le schéma.
// On n'inclut PAS les seeds de données (gérés séparément par clone-metier).
//
// Usage : node scripts/build-formation-schema.mjs
// Sortie : supabase/formation-schema.sql

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const OUT = 'supabase/formation-schema.sql'

const files = readdirSync(DIR)
  .filter(f => /^\d{4}_.*\.sql$/.test(f))   // uniquement les migrations numérotées
  .sort()                                    // ordre lexicographique = ordre numérique (zero-padded)

let out = `-- ════════════════════════════════════════════════════════════════
-- CASATASIA — Schéma complet pour l'environnement de FORMATION (bac à sable)
-- Généré par scripts/build-formation-schema.mjs
-- Concaténation de ${files.length} migrations (DDL idempotent).
-- À coller dans : Supabase (projet formation) → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════

`

for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8')
  out += `\n-- ─────────────────────────────────────────────────────────────\n`
  out += `-- ${f}\n`
  out += `-- ─────────────────────────────────────────────────────────────\n`
  out += sql.trimEnd() + '\n'
}

writeFileSync(OUT, out)
const kb = (statSync(OUT).size / 1024).toFixed(0)
console.log(`✓ ${OUT} généré`)
console.log(`  ${files.length} migrations · ${kb} Ko`)
console.log(`  Première : ${files[0]}`)
console.log(`  Dernière : ${files[files.length - 1]}`)
