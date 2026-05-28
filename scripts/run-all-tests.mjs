// Runner : lance tous les scripts test-*.mjs séquentiellement (data-layer),
// capture le bilan ✓/✗ de chacun et produit un rapport global.
//
// Usage :
//   node scripts/run-all-tests.mjs              # tous (sans HTTP — PORT non défini)
//   PORT=3000 node scripts/run-all-tests.mjs    # avec partie HTTP (dev server requis)
//
// Les tests assistant-e2e (coût Claude) et realtime-inject (injection live)
// sont exclus par défaut — passer --all pour les inclure.

import { readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ALL = process.argv.includes('--all')
const EXCLUDE = ALL ? [] : ['test-assistant-e2e.mjs', 'test-realtime-inject.mjs']

const scripts = readdirSync('scripts')
  .filter(f => /^test-.*\.mjs$/.test(f))
  .filter(f => !EXCLUDE.includes(f))
  .sort()

console.log(`\n${'═'.repeat(64)}`)
console.log(`  CAMPAGNE DE TESTS — ${scripts.length} scripts${process.env.PORT ? ` (HTTP via PORT=${process.env.PORT})` : ' (data-only)'}`)
console.log(`${'═'.repeat(64)}\n`)

const results = []

for (const s of scripts) {
  const t0 = Date.now()
  let output = ''
  let exitCode = 0
  try {
    output = execSync(`node scripts/${s}`, { encoding: 'utf8', stdio: 'pipe', timeout: 120000 })
  } catch (e) {
    exitCode = e.status ?? 1
    output = (e.stdout ?? '') + (e.stderr ?? '')
  }
  const ms = Date.now() - t0

  // Parse "✓ N/M réussites" et "✗ N/M échecs" si présents
  const okMatch = output.match(/✓\s*(\d+)\s*\/\s*(\d+)/)
  const koMatch = output.match(/✗\s*(\d+)\s*\/\s*(\d+)/)
  let summary = ''
  let status = '?'
  if (okMatch) {
    const ok = parseInt(okMatch[1]), total = parseInt(okMatch[2])
    const ko = koMatch ? parseInt(koMatch[1]) : (total - ok)
    summary = `${ok}/${total}`
    status = ko === 0 ? '✅' : (ok > 0 ? '🟡' : '❌')
  } else if (/🎉|✅ /.test(output) && exitCode === 0) {
    status = '✅'
    summary = 'OK'
  } else if (exitCode !== 0) {
    status = '❌'
    summary = `exit ${exitCode}`
  } else {
    status = '🟡'
    summary = 'sans bilan'
  }

  // Dernière ligne d'échec si présente
  const failLines = (output.match(/^\s*•\s+.+$/gm) ?? []).slice(0, 3).map(l => l.trim())

  results.push({ script: s, status, summary, ms, failLines, exitCode })
  console.log(`  ${status} ${s.padEnd(32)} ${summary.padEnd(10)} ${ms}ms`)
  if (failLines.length) failLines.forEach(f => console.log(`        ↳ ${f.slice(0, 80)}`))
}

// ─── Bilan global ────────────────────────────────────────────────
const green = results.filter(r => r.status === '✅').length
const yellow = results.filter(r => r.status === '🟡').length
const red = results.filter(r => r.status === '❌').length

console.log(`\n${'═'.repeat(64)}`)
console.log(`  BILAN : ✅ ${green}   🟡 ${yellow}   ❌ ${red}   (sur ${results.length})`)
console.log(`${'═'.repeat(64)}`)

if (red > 0) {
  console.log(`\n❌ Scripts en échec total :`)
  results.filter(r => r.status === '❌').forEach(r => console.log(`  • ${r.script} (${r.summary})`))
}
if (yellow > 0) {
  console.log(`\n🟡 Scripts partiels (échecs probables = données manquantes) :`)
  results.filter(r => r.status === '🟡').forEach(r => console.log(`  • ${r.script} (${r.summary})`))
}
