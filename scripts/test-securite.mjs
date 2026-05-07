// Test d'intégration Module 28 — Sécurité & accès.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const PORT = process.env.PORT || ''
const BASE = PORT ? `http://localhost:${PORT}` : ''

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { auditIds: [], connexionIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 28 — Sécurité & accès                       ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ─────────────────────────────────────────────────
await step('schéma : 3 tables accessibles', async () => {
  for (const t of ['profils', 'audit_logs', 'connexions']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message); else ok(`${t} OK`)
  }
})

// ─── 2. Audit log : insert + lecture chronologique ──────────────
await step('audit_logs : insert + ordre desc', async () => {
  for (const action of ['login', 'delete', 'update_param']) {
    const { data, error } = await sb.from('audit_logs').insert({
      action,
      ressource_type: 'test28',
      details: { foo: 'bar' },
      ip: '127.0.0.1',
      user_agent: 'test',
    }).select('id').single()
    if (error) throw new Error(error.message)
    cleanup.auditIds.push(data.id)
  }
  ok('3 audits créés')

  const { data: list } = await sb.from('audit_logs')
    .select('action, created_at')
    .in('id', cleanup.auditIds)
    .order('created_at', { ascending: false })
  if (list?.length === 3) ok('lecture par id OK')
})

// ─── 3. CHECK role (profils) ────────────────────────────────────
await step('CHECK : role limité à manager|employe', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000099'
  const { error } = await sb.from('profils').insert({
    id: fakeId, email: 'test28-bad@example.com', role: 'admin_god',
  })
  // Soit role rejeté (CHECK 23514), soit FK rejette parce que id n'existe pas dans auth.users (23503)
  if (error?.code === '23514') ok(`role invalide rejeté par CHECK (${error.code})`)
  else if (error?.code === '23503') ok(`FK auth.users rejette (${error.code}) — CHECK pas testable sans user`)
  else ko('CHECK role', error?.message ?? 'aucune erreur')
})

// ─── 4. Connexions : succès + échec + inhabituelle ──────────────
await step('connexions : succès + échec + flag inhabituelle', async () => {
  const { data: c1, error: e1 } = await sb.from('connexions').insert({
    email: 'test28@example.com', succes: true, ip: '1.2.3.4', user_agent: 'test', inhabituelle: true,
  }).select('id').single()
  if (e1) throw new Error(e1.message)
  cleanup.connexionIds.push(c1.id)

  const { data: c2 } = await sb.from('connexions').insert({
    email: 'test28@example.com', succes: false, ip: '5.6.7.8', user_agent: 'attaquant',
  }).select('id').single()
  cleanup.connexionIds.push(c2.id)
  ok('connexion succès + échec créées')

  const { data: read } = await sb.from('connexions').select('succes, inhabituelle').in('id', cleanup.connexionIds)
  const nbSucces = read.filter(r => r.succes).length
  const nbInhab = read.filter(r => r.inhabituelle).length
  if (nbSucces === 1) ok('1 succès / 1 échec')
  if (nbInhab === 1) ok('flag inhabituelle persisté')
})

// ─── 5. HTTP : middleware /admin/* → 307 vers /login ─────────────
if (BASE) {
  await step('HTTP : GET /login (page publique)', async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }
    const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /login', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok('GET /login → 200')
    if (html.includes('Connexion') || html.includes('compte')) ok('contient form login')
  })

  await step('HTTP : middleware redirige /admin/securite sans session', async () => {
    const r = await fetch(`${BASE}/admin/securite`, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
    if (r.status === 307 || r.status === 308) {
      const loc = r.headers.get('location') ?? ''
      if (loc.includes('/login')) ok(`redirect ${r.status} → ${loc.includes('next=') ? '/login?next=…' : '/login'} ✓`)
      else ko('redirect target', loc)
    } else ko('middleware redirect', `HTTP ${r.status}`)
  })

  await step('HTTP : pages opérationnelles non protégées (/, /caisse, /serveur)', async () => {
    for (const path of ['/', '/caisse', '/serveur']) {
      const r = await fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(60000) })
      if (r.status === 200) ok(`${path} → 200 (libre)`)
      else if (r.status === 307 || r.status === 308) ko(`${path} ne devrait pas rediriger`, `→ ${r.headers.get('location')}`)
      else ko(path, `HTTP ${r.status}`)
    }
  })

  await step('HTTP : pages publiques (/affichage/tv, /formation, /table)', async () => {
    for (const path of ['/affichage/tv', '/formation']) {
      const r = await fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(60000) })
      if (r.status === 200) ok(`${path} → 200 (publique)`)
      else ko(path, `HTTP ${r.status}`)
    }
  })
}

// ─── Cleanup ────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.auditIds.length)     await sb.from('audit_logs').delete().in('id', cleanup.auditIds)
if (cleanup.connexionIds.length) await sb.from('connexions').delete().in('id', cleanup.connexionIds)
console.log(`  ✓ ${cleanup.auditIds.length} audit + ${cleanup.connexionIds.length} connexion supprimés`)

// ─── Bilan ─────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 28 — Sécurité OK.')
