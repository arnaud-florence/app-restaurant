// Diagnostic Module 27 — état des guides + profils + employes.
// node scripts/check-formation.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

console.log('=== GUIDES ===')
const { data: guides } = await sb.from('guides_formation').select('id, titre, poste, ordre, actif').order('ordre')
for (const g of guides ?? []) {
  console.log(`  ${g.actif ? '✓' : '✗'} ${g.titre.padEnd(30)} poste=${g.poste}  ordre=${g.ordre}`)
}

console.log('\n=== EMPLOYES ===')
const { data: emps } = await sb.from('employes').select('id, prenom, nom, email, poste, actif').order('prenom')
for (const e of emps ?? []) {
  console.log(`  ${e.actif ? '✓' : '✗'} ${(e.prenom + ' ' + e.nom).padEnd(25)} email=${e.email ?? '(none)'} poste=${e.poste}`)
}

console.log('\n=== PROFILS ===')
const { data: profs } = await sb.from('profils').select('id, email, role, poste, employe_id')
for (const p of profs ?? []) {
  console.log(`  ${p.role.padEnd(8)} ${p.email.padEnd(40)} poste=${p.poste ?? '(null)'} employe_id=${p.employe_id ?? '(null)'}`)
}

console.log('\n=== ETAPES par guide ===')
const { data: etapes } = await sb.from('etapes_formation').select('guide_id')
const m = new Map()
for (const e of etapes ?? []) m.set(e.guide_id, (m.get(e.guide_id) ?? 0) + 1)
for (const g of guides ?? []) console.log(`  ${g.titre.padEnd(30)} ${m.get(g.id) ?? 0} étapes`)

console.log('\n=== QUIZ par guide ===')
const { data: qs } = await sb.from('quiz_questions').select('guide_id')
const mq = new Map()
for (const q of qs ?? []) mq.set(q.guide_id, (mq.get(q.guide_id) ?? 0) + 1)
for (const g of guides ?? []) console.log(`  ${g.titre.padEnd(30)} ${mq.get(g.id) ?? 0} questions`)

process.exit(0)
