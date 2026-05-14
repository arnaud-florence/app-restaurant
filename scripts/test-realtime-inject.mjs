// Script de test Realtime : injecte 2 findings tests pour valider la
// chaîne Supabase Realtime → useLiveFindings → UI en live.
//
//   node scripts/test-realtime-inject.mjs        # injecte 2 findings
//   node scripts/test-realtime-inject.mjs --clean # supprime les findings de test

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
  const body = await res.json()
  if (!res.ok || !body.ok) {
    throw new Error(`SQL failed: ${res.status} — ${JSON.stringify(body).slice(0, 200)}`)
  }
  return body
}

const cleanMode = process.argv.includes('--clean')

if (cleanMode) {
  console.log('🧹 Suppression des findings test...')
  await execSql("delete from agent_findings where type = 'test_realtime_demo'")
  console.log('✓ Findings test supprimés.')
  process.exit(0)
}

console.log('\n🧪 Injection de 2 findings test...\n')

const findings = [
  {
    agent_id: 'stock',
    urgence: 'rouge',
    type: 'test_realtime_demo',
    titre: '🧪 TEST — Rupture stock mozzarella',
    message: 'Finding fictif injecté pour valider Realtime. Ignore ou résous.',
    action_label: 'Voir le stock',
    action_url: '/admin/stock',
  },
  {
    agent_id: 'strategique',
    urgence: 'vert',
    type: 'test_realtime_demo',
    titre: '🧪 TEST — Promo plat du jour',
    message: 'Suggestion fictive pour valider Realtime. Ignore ou résous.',
    action_label: 'Plats du jour',
    action_url: '/admin/plats-du-jour',
  },
]

for (const f of findings) {
  const sql = `
    insert into agent_findings (agent_id, urgence, type, titre, message, action_label, action_url, resolu)
    values ('${f.agent_id}', '${f.urgence}', '${f.type}',
            '${f.titre.replace(/'/g, "''")}',
            '${f.message.replace(/'/g, "''")}',
            '${f.action_label}',
            '${f.action_url}',
            false)
  `
  await execSql(sql)
  console.log(`  ✓ ${f.urgence.toUpperCase().padEnd(6)} · ${f.agent_id.padEnd(12)} · ${f.titre}`)
  // Petite pause entre les 2 pour que tu voies bien le stagger sur mobile
  await new Promise(r => setTimeout(r, 1500))
}

console.log('\n✓ 2 findings injectés.')
console.log('  → Tu devrais voir 2 slide-in avec badge "Nouveau" sur /admin/pilotage')
console.log('  → Le rouge apparaît dans 🔔 Alertes + dans 📦 Stock')
console.log('  → Le vert apparaît dans 💡 Suggestions')
console.log('\nQuand tu as fini de tester : node scripts/test-realtime-inject.mjs --clean')
