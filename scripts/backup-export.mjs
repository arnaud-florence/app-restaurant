// Script de sauvegarde manuelle : dump toutes les tables critiques en JSON daté.
// Usage : node scripts/backup-export.mjs
//
// Crée un fichier backups/backup-YYYY-MM-DDTHHMMSS.json avec :
//   { meta: { date, env }, tables: { commandes: [...], ... } }
//
// À combiner avec un cron Linux/macOS pour une sauvegarde quotidienne :
//   0 3 * * * cd /chemin/projet && node scripts/backup-export.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('❌ Variables manquantes (NEXT_PUBLIC_SUPABASE_URL + ANON ou SERVICE_ROLE_KEY)')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, KEY)

// Tables à sauvegarder (toutes celles qui contiennent des données métier)
const TABLES = [
  // Auth & RH
  'profils', 'employes', 'pointage', 'planning', 'conges',
  'documents_employes', 'formations_employes',
  // Catalogue
  'recettes', 'recette_ingredients', 'ingredients',
  'boissons', 'accords_mets_boissons',
  'fournisseurs', 'factures',
  // Service & caisse
  'commandes', 'commande_articles',
  'sessions_caisse', 'paiements_caisse',
  'tables_restaurant',
  // Stock & lots
  'lots_produits',
  // Hygiène
  'plans_haccp', 'releves_temperatures', 'non_conformites',
  'interventions_antiparasitaire', 'plan_nettoyage',
  // Allergènes
  'procedures_urgence',
  // Clients & réservations
  'clients', 'reservations_tables', 'reservations_chambres',
  'evenements', 'groupes',
  // Communication
  'messages', 'affichage_infos', 'comptes_rendus', 'materiels',
  // Pilotage
  'objectifs', 'actions_strategiques',
  // Finances
  'charges_fixes', 'notes_de_frais',
  // Énergie / Maintenance / Légal
  'releves_energie', 'equipements', 'interventions_maintenance',
  // Déchets
  'collectes_dechets', 'suivi_dechets',
  // Module 22 prévisionnel
  'releves_meteo',
  // Module 24 assistant
  'assistant_conversations', 'assistant_messages',
  // Module 27 formation
  'guides_formation', 'etapes_formation', 'quiz_questions', 'progressions_formation',
  // Module 28 sécurité
  'audit_logs', 'connexions',
  // Tâches du jour
  'taches_completees',
  // Centre économique & challenges
  'config_economique', 'point_mort_mensuel',
  'charges_fixes_recurrentes', 'charges_variables',
  'challenges', 'challenges_resultats',
  // Push
  'push_subscriptions',
  // Paramètres
  'parametres',
]

console.log(`🔁 Backup Supabase — ${TABLES.length} tables à dumper`)
const now = new Date()
const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backup = { meta: { date: now.toISOString(), env: 'production', tables_count: TABLES.length }, tables: {} }

for (const t of TABLES) {
  try {
    const { data, error } = await sb.from(t).select('*')
    if (error) {
      console.warn(`  ⚠ ${t} : ${error.message}`)
      backup.tables[t] = { error: error.message }
      continue
    }
    backup.tables[t] = data ?? []
    console.log(`  ✓ ${t.padEnd(40)} ${(data ?? []).length} lignes`)
  } catch (e) {
    console.warn(`  ❌ ${t} : ${e.message}`)
    backup.tables[t] = { error: e.message }
  }
}

const dir = join(process.cwd(), 'backups')
if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
const file = join(dir, `backup-${stamp}.json`)
writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8')

const size = Math.round((Buffer.byteLength(JSON.stringify(backup)) / 1024 / 1024) * 100) / 100
console.log(`\n✅ Backup terminé : ${file} (${size} MB)`)
console.log(`💡 Conseil : copie ce fichier hors du serveur (Drive, Dropbox, S3) pour sécurité maximale.`)
process.exit(0)
