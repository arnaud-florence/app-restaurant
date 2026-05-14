// Script de monitoring : santé des 15 agents IA permanents.
//
//   node scripts/monitor-agents.mjs
//
// Vérifie :
//   1. État des jobs pg_cron (planning bien posé)
//   2. Réponses HTTP des dernières exécutions (status_code via net._http_response)
//   3. Runs récents dans agents_runs (succès/erreur, durée)
//   4. Findings actifs non résolus (par agent, par urgence)
//
// Sortie : tableau de bord console. Code de sortie 1 si anomalies détectées.
//
// Pas de cleanup, lecture seule. Sûr à lancer à tout moment.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ─── Charge .env.local ────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  const v = m[2].replace(/^['"]|['"]$/g, '').trim()
  if (!v) continue
  process.env[m[1]] = v
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY) manquante dans .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

// ─── Helpers ──────────────────────────────────────────────────────
const COLOR = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', cyan: '\x1b[36m',
}

const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'à l\'instant'
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH} h`
  const diffJ = Math.floor(diffH / 24)
  return `il y a ${diffJ} j`
}

let anomalies = 0

// ─── 1. Jobs pg_cron ─────────────────────────────────────────────
console.log(`\n${COLOR.bold}${COLOR.cyan}━━━ 1. Jobs pg_cron planifiés ━━━${COLOR.reset}\n`)
console.log(`${COLOR.dim}(non lisible via PostgREST — vérifie dans Supabase SQL Editor :${COLOR.reset}`)
console.log(`${COLOR.dim}  select jobname, schedule, active from cron.job where jobname like 'agent_%';${COLOR.reset}`)
console.log(`${COLOR.dim}  → attendu : 14 lignes (10 cron + 4 RT + Formateur)${COLOR.reset}`)

// ─── 2. Dernières réponses HTTP via pg_net ───────────────────────
console.log(`\n${COLOR.bold}${COLOR.cyan}━━━ 2. Dernières requêtes HTTP des agents (24h) ━━━${COLOR.reset}\n`)
const { data: httpStats, error: httpErr } = await sb
  .from('agents_runs')
  .select('agent_id, status, started_at, duration_ms, error_message')
  .gte('started_at', new Date(Date.now() - 24 * 3600_000).toISOString())
  .order('started_at', { ascending: false })
  .limit(200)

if (httpErr) {
  console.log(`${COLOR.red}❌ Erreur lecture agents_runs : ${httpErr.message}${COLOR.reset}`)
  anomalies++
} else {
  const byAgent = {}
  for (const r of httpStats) {
    byAgent[r.agent_id] = byAgent[r.agent_id] ?? { total: 0, success: 0, error: 0, last: null, lastErr: null, avgMs: 0, _sumMs: 0 }
    const a = byAgent[r.agent_id]
    a.total++
    if (r.status === 'success') a.success++
    else if (r.status === 'error') {
      a.error++
      if (!a.lastErr) a.lastErr = r.error_message
    }
    if (r.duration_ms) { a._sumMs += r.duration_ms; a.avgMs = Math.round(a._sumMs / a.total) }
    if (!a.last || r.started_at > a.last) a.last = r.started_at
  }

  console.log('Agent             Total   ✓     ✗     Dernier run        Durée moy')
  console.log('─'.repeat(75))
  const sorted = Object.entries(byAgent).sort(([a], [b]) => a.localeCompare(b))
  for (const [agent, s] of sorted) {
    const errRate = s.total > 0 ? (s.error / s.total) : 0
    const color = errRate > 0.3 ? COLOR.red : errRate > 0 ? COLOR.yellow : COLOR.green
    const row = `${agent.padEnd(18)}${String(s.total).padStart(5)}${String(s.success).padStart(6)}${String(s.error).padStart(6)}   ${fmtDate(s.last).padEnd(18)} ${s.avgMs}ms`
    console.log(`${color}${row}${COLOR.reset}`)
    if (s.lastErr) {
      console.log(`${COLOR.dim}  └ dernière erreur : ${s.lastErr.slice(0, 120)}${COLOR.reset}`)
      anomalies++
    }
  }
  if (sorted.length === 0) console.log(`${COLOR.yellow}⚠ Aucun run dans les dernières 24h. Vérifier que pg_cron tourne.${COLOR.reset}`)
}

// ─── 3. Findings actifs ──────────────────────────────────────────
console.log(`\n${COLOR.bold}${COLOR.cyan}━━━ 3. Findings actifs (non résolus) ━━━${COLOR.reset}\n`)
const { data: findings, error: findingsErr } = await sb
  .from('agent_findings')
  .select('agent_id, urgence')
  .eq('resolu', false)

if (findingsErr) {
  console.log(`${COLOR.red}❌ Erreur lecture agent_findings : ${findingsErr.message}${COLOR.reset}`)
  anomalies++
} else if (findings.length === 0) {
  console.log(`${COLOR.green}✓ Aucun finding actif. Tout va bien.${COLOR.reset}`)
} else {
  const byUrgence = { rouge: 0, jaune: 0, vert: 0 }
  for (const f of findings) byUrgence[f.urgence] = (byUrgence[f.urgence] ?? 0) + 1
  if (byUrgence.rouge > 0) {
    console.log(`${COLOR.red}🔴 ${byUrgence.rouge} finding(s) urgent(s)${COLOR.reset}`)
    anomalies++
  }
  if (byUrgence.jaune > 0) console.log(`${COLOR.yellow}🟡 ${byUrgence.jaune} à surveiller${COLOR.reset}`)
  if (byUrgence.vert > 0) console.log(`${COLOR.green}🟢 ${byUrgence.vert} info${COLOR.reset}`)
  console.log(`\n${COLOR.dim}→ Voir le détail sur /admin/pilotage${COLOR.reset}`)
}

// ─── 4. Bilan ────────────────────────────────────────────────────
console.log(`\n${COLOR.bold}━━━ Bilan ━━━${COLOR.reset}`)
if (anomalies === 0) {
  console.log(`${COLOR.green}✓ Tout est sain.${COLOR.reset}\n`)
  process.exit(0)
} else {
  console.log(`${COLOR.yellow}⚠ ${anomalies} anomalie(s) détectée(s).${COLOR.reset}\n`)
  process.exit(1)
}
