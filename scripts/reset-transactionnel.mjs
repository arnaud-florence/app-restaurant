// Reset transactionnel — efface UNIQUEMENT les données de service test.
//
// PRÉSERVE : recettes, ingredients, boissons, fournisseurs, employes,
//            profils, guides_formation, configuration, plan de salle, etc.
//
// EFFACE :
//   - commandes + commande_articles + paiements
//   - sessions_caisse + mouvements_stock (transactionnels, pas le seed initial)
//   - reservations (chambres/tables/événements)
//   - bons_commande + bon_commande_lignes (test)
//   - factures_fournisseurs
//   - releves_temperature, checklists_validees, pesees_dechets
//   - agents_runs ancien (> 7j), agent_findings résolus
//   - audit_logs anciens (> 30j)
//
// Usage :
//   node scripts/reset-transactionnel.mjs --dry-run   # affiche ce qui serait supprimé
//   node scripts/reset-transactionnel.mjs --execute   # supprime vraiment
//
// IMPORTANT : prendre un backup avant via `node scripts/backup-export.mjs`.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const DRY = !process.argv.includes('--execute')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

console.log(`\n${DRY ? '🔍 DRY-RUN' : '⚠️  EXECUTE'}  Reset transactionnel`)
console.log('─'.repeat(60))

// Tables à vider entièrement (transactionnel pur, dans l'ordre des FK)
const TABLES_FULL_WIPE = [
  // Service (FK feuilles → racines)
  'paiements',
  'commande_articles',
  'commandes',
  'sessions_caisse',
  // Stock (mouvements seulement, pas le stock_actuel des ingredients)
  'mouvements_stock',
  // Réservations
  'reservations_tables',
  'reservations_chambres',
  'reservations',
  'evenements_groupe',
  // Bons commande + factures
  'bon_commande_lignes',
  'bons_commande',
  'factures_fournisseurs',
  'factures',
  // Hygiène opérationnelle (configuration garde sa propre table)
  'releves_temperature',
  'releves_temperatures',
  'checklists_validees',
  'lots_produits',
  // Déchets
  'pesees_dechets',
  'collectes_dechets',
  // Pointage (déjà vidé pour les 5 supp, on s'assure)
  'pointage',
  'pointages_pause',
  // Notes opérationnelles
  'note_frais', 'notes_de_frais',
  // Marketing test
  'avis_clients',
  'reclamations_clients',
  // Affichage / TV
  'menu_du_jour',
  'affichage_promos',
  'appels_table',
]

// Tables où on filtre (vieux uniquement, on garde le récent comme historique léger)
const TABLES_AGE_BASED = [
  // { table, dateCol, daysOld }  -- exemple : agents_runs > 7 jours
  { table: 'agents_runs',     dateCol: 'created_at', daysOld: 7 },
  { table: 'agent_findings',  dateCol: 'created_at', daysOld: 7, extraFilter: { resolu: true } },
  { table: 'audit_logs',      dateCol: 'created_at', daysOld: 30 },
  { table: 'connexions',      dateCol: 'created_at', daysOld: 30 },
]

let totalDeleted = 0

console.log('\n▼ Tables wipe complet :\n')
for (const t of TABLES_FULL_WIPE) {
  const { count, error } = await sb.from(t).select('id', { count: 'exact', head: true })
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('Could not find')) continue
    console.log(`  ⚠ ${t.padEnd(30)} : ${error.message.slice(0, 50)}`)
    continue
  }
  if (count === 0) {
    console.log(`  · ${t.padEnd(30)} : 0 (déjà vide)`)
    continue
  }
  if (DRY) {
    console.log(`  🗑 ${t.padEnd(30)} : ${count} lignes seraient supprimées`)
    totalDeleted += count
  } else {
    const { count: nDel, error: eDel } = await sb.from(t).delete({ count: 'exact' }).gte('id', '00000000-0000-0000-0000-000000000000')
    if (eDel) {
      console.log(`  ❌ ${t.padEnd(30)} : ${eDel.message.slice(0, 60)}`)
    } else {
      console.log(`  ✓ ${t.padEnd(30)} : ${nDel} supprimées`)
      totalDeleted += nDel ?? 0
    }
  }
}

console.log('\n▼ Tables avec filtre âge :\n')
for (const { table, dateCol, daysOld, extraFilter } of TABLES_AGE_BASED) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 3600 * 1000).toISOString()
  let q = sb.from(table).select('id', { count: 'exact', head: true }).lt(dateCol, cutoff)
  if (extraFilter) for (const [k, v] of Object.entries(extraFilter)) q = q.eq(k, v)
  const { count, error } = await q
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('Could not find')) continue
    console.log(`  ⚠ ${table.padEnd(30)} : ${error.message.slice(0, 50)}`)
    continue
  }
  if (count === 0) {
    console.log(`  · ${table.padEnd(30)} : 0 (rien à purger)`)
    continue
  }
  if (DRY) {
    console.log(`  🗑 ${table.padEnd(30)} : ${count} lignes > ${daysOld}j seraient supprimées`)
    totalDeleted += count
  } else {
    let qDel = sb.from(table).delete({ count: 'exact' }).lt(dateCol, cutoff)
    if (extraFilter) for (const [k, v] of Object.entries(extraFilter)) qDel = qDel.eq(k, v)
    const { count: nDel, error: eDel } = await qDel
    if (eDel) {
      console.log(`  ❌ ${table.padEnd(30)} : ${eDel.message.slice(0, 60)}`)
    } else {
      console.log(`  ✓ ${table.padEnd(30)} : ${nDel} purgées`)
      totalDeleted += nDel ?? 0
    }
  }
}

// Reset des tables.statut à 'libre'
console.log('\n▼ Reset tables_restaurant.statut → libre :\n')
const { count: nTablesOccupees } = await sb.from('tables_restaurant').select('id', { count: 'exact', head: true }).neq('statut', 'libre')
if (DRY) {
  console.log(`  🔄 tables_restaurant : ${nTablesOccupees ?? 0} table(s) à remettre en 'libre'`)
} else {
  if (nTablesOccupees && nTablesOccupees > 0) {
    const { error: eUp } = await sb.from('tables_restaurant').update({ statut: 'libre' }).neq('statut', 'libre')
    if (eUp) console.log(`  ❌ ${eUp.message}`)
    else console.log(`  ✓ ${nTablesOccupees} table(s) → libre`)
  } else {
    console.log('  · toutes les tables sont déjà libres')
  }
}

console.log('\n' + '═'.repeat(60))
console.log(`${DRY ? '🔍 Total qui serait supprimé' : '✅ Total supprimé'} : ${totalDeleted} lignes`)
if (DRY) console.log(`\n💡 Pour exécuter pour de vrai : node scripts/reset-transactionnel.mjs --execute`)
