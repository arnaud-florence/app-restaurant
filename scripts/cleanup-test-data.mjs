// Script de nettoyage : supprime les test data du Supabase prod.
//
//   node scripts/cleanup-test-data.mjs
//
// ⚠ DESTRUCTEUR. Action irréversible (pas de soft-delete).
// Périmètre validé par l'utilisateur (session 2026-05-14) :
//   - commandes + commande_articles + paiements
//   - mouvements_stock
//   - sessions_caisse
//   - bons_commande (+ lignes éventuelles)
//   - factures_fournisseurs (+ lignes éventuelles)
//   - clients
//   - assistant_conversations + assistant_messages
//   - agents_runs + agent_findings (historique des agents, sera regénéré au prochain cron)
//
// Conserve absolument :
//   - recettes, ingredients, boissons, chambres, tables_restaurant, fournisseurs,
//     employes, guides_formation, progressions_formation, parametres, profils

import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const BASE_URL = 'https://app-restaurant-livid.vercel.app'
const CRON_SECRET = process.env.CRON_SECRET
if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET manquant dans .env.local')
  process.exit(1)
}

async function execSql(sql) {
  const res = await fetch(`${BASE_URL}/api/admin/exec-sql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) {
    throw new Error(`SQL failed: ${res.status} — ${JSON.stringify(body)}`)
  }
  return body.results?.[0]?.rows_affected ?? 0
}

// Ordre respectant les FK (les enfants avant les parents).
// Postgres exige une clause WHERE explicite — on utilise `where true`.
const STEPS = [
  // Assistant — child first
  ['assistant_messages',      'delete from assistant_messages where true'],
  ['assistant_conversations', 'delete from assistant_conversations where true'],

  // Agents — child first
  ['agent_findings', 'delete from agent_findings where true'],
  ['agents_runs',    'delete from agents_runs where true'],

  // Commandes — child first
  ['commande_articles', 'delete from commande_articles where true'],
  ['mouvements_stock',  'delete from mouvements_stock where true'],
  ['paiements',         'delete from paiements where true'],
  ['commandes',         'delete from commandes where true'],

  // Sessions de caisse
  ['sessions_caisse', 'delete from sessions_caisse where true'],

  // Achats — child first si les lignes existent
  ['bon_commande_lignes',   'delete from bon_commande_lignes where true'],
  ['bons_commande',         'delete from bons_commande where true'],
  ['facture_lignes',        'delete from facture_lignes where true'],
  ['factures_fournisseurs', 'delete from factures_fournisseurs where true'],

  // Clients
  ['clients', 'delete from clients where true'],
]

console.log('\n╔═══════════════════════════════════════════════╗')
console.log('║  Nettoyage test data — Supabase prod          ║')
console.log('╚═══════════════════════════════════════════════╝\n')

let totalDeleted = 0
let totalSkipped = 0

for (const [name, sql] of STEPS) {
  try {
    const n = await execSql(sql)
    console.log(`  ✓ ${name.padEnd(30)} ${String(n).padStart(5)} lignes supprimées`)
    totalDeleted += n
  } catch (err) {
    // Table peut ne pas exister (ex: bon_commande_lignes)
    if (err.message.includes('does not exist') || err.message.includes('42P01')) {
      console.log(`  · ${name.padEnd(30)}      (table inexistante, skip)`)
      totalSkipped++
    } else {
      console.log(`  ❌ ${name.padEnd(30)} ERREUR : ${err.message.slice(0, 200)}`)
    }
  }
}

console.log('\n' + '═'.repeat(50))
console.log(`Total supprimé : ${totalDeleted} lignes`)
console.log(`Tables ignorées (inexistantes) : ${totalSkipped}`)
console.log('\n✓ Cleanup terminé. La base est prête pour la refonte des dashboards.')
console.log('  Les agents recommenceront à alimenter agents_runs/agent_findings au prochain cron.\n')
