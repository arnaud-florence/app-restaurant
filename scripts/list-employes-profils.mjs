// Lecture seule : liste les employés + profils + agent_findings actifs.
// Préparation Phase 2 (nettoyage + comptes employés).
//
//   node scripts/list-employes-profils.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

console.log('\n─── 1. Table employes (6 attendus) ───')
const { data: employes, error: errE } = await sb
  .from('employes')
  .select('id, prenom, nom, poste, email, actif, created_at')
  .order('created_at')
if (errE) console.error('  ❌', errE.message)
else {
  for (const e of employes) {
    const date = new Date(e.created_at).toISOString().slice(0, 10)
    const actif = e.actif === false ? ' [INACTIF]' : ''
    console.log(`  • [${e.id.slice(0, 8)}] ${e.prenom ?? '?'} ${e.nom ?? '?'} — ${e.poste ?? '?'} — ${e.email ?? '(sans email)'} — créé ${date}${actif}`)
  }
}

console.log('\n─── 2. Table profils (Auth Supabase liés) ───')
const { data: profils, error: errP } = await sb
  .from('profils')
  .select('id, email, role, poste, employe_id, totp_enabled, derniere_connexion, created_at')
  .order('created_at')
if (errP) console.error('  ❌', errP.message)
else {
  for (const p of profils) {
    const date = new Date(p.created_at).toISOString().slice(0, 10)
    const last = p.derniere_connexion ? new Date(p.derniere_connexion).toISOString().slice(0, 10) : 'jamais'
    const totp = p.totp_enabled ? ' 🔐2FA' : ''
    console.log(`  • [${p.id.slice(0, 8)}] ${p.email} — ${p.role} (${p.poste ?? '?'}) — employe_id=${p.employe_id?.slice(0, 8) ?? '∅'} — dernière co ${last}${totp}`)
  }
}

console.log('\n─── 3. Agent findings actifs (top 10 récents par sévérité) ───')
const { data: findings } = await sb
  .from('agent_findings')
  .select('id, agent_id, severite, titre, resolu, created_at')
  .neq('resolu', true)
  .order('severite', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(10)
for (const f of findings ?? []) {
  const date = new Date(f.created_at).toISOString().slice(0, 16).replace('T', ' ')
  const ic = f.severite === 'urgent' ? '🔴' : f.severite === 'surveiller' ? '🟡' : '🟢'
  console.log(`  ${ic} [${date}] ${f.agent_id}: ${f.titre}`)
}

console.log('\n─── 4. Volumes par sévérité ───')
for (const sev of ['urgent', 'surveiller', 'info']) {
  const { count } = await sb.from('agent_findings').select('id', { count: 'exact', head: true }).eq('severite', sev).neq('resolu', true)
  console.log(`  ${sev.padEnd(12)} : ${count ?? 0} non résolus`)
}

console.log()
