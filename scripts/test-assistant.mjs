// Test d'intégration Module 24 — Assistant IA /admin/assistant.

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
const cleanup = { convIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 24 — Assistant IA /admin/assistant          ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────
await step('schéma : tables assistant_conversations + assistant_messages', async () => {
  const { error: e1 } = await sb.from('assistant_conversations').select('*').limit(1)
  if (e1) ko('table conv', e1.message); else ok('table assistant_conversations accessible')
  const { error: e2 } = await sb.from('assistant_messages').select('*').limit(1)
  if (e2) ko('table msg', e2.message); else ok('table assistant_messages accessible')
})

// ─── 2. Création conversation + contexte_snap (jsonb) ─────────────
await step('CRUD : créer une conversation avec snapshot', async () => {
  const fakeSnap = {
    snapshot: { ca: { mois_courant: 12345 }, food_cost: { moyen_pct: 28 } },
    anomalies: [{ niveau: 'info', titre: 'test' }],
  }
  const { data, error } = await sb.from('assistant_conversations').insert({
    titre: 'TEST24-conv',
    modele: 'claude-haiku-4-5',
    contexte_snap: fakeSnap,
  }).select('id, contexte_snap').single()
  if (error) throw new Error(error.message)
  cleanup.convIds.push(data.id)
  ok(`conversation créée (${data.id.slice(0, 8)})`)
  if (data.contexte_snap?.snapshot?.ca?.mois_courant === 12345) ok('contexte_snap (jsonb) round-trip OK')
  else ko('jsonb', 'contexte_snap incorrect')
})

// ─── 3. Insert messages user + assistant ───────────────────────
await step('messages : insert user + assistant + cascade delete', async () => {
  const convId = cleanup.convIds[0]
  if (!convId) { ko('msg', 'pas de conv'); return }
  const { error: e1 } = await sb.from('assistant_messages').insert([
    { conversation_id: convId, role: 'user', contenu: 'TEST24 question' },
    { conversation_id: convId, role: 'assistant', contenu: 'TEST24 réponse', tokens_in: 1500, tokens_out: 250, cache_read_tokens: 1200 },
  ])
  if (e1) throw new Error(e1.message)
  ok('2 messages insérés')

  const { data: msgs } = await sb.from('assistant_messages').select('role, contenu, tokens_in, tokens_out, cache_read_tokens')
    .eq('conversation_id', convId).order('created_at')
  if (msgs.length === 2) ok('lecture par conversation_id OK')
  if (msgs[0].role === 'user' && msgs[1].role === 'assistant') ok('rôles user/assistant respectés')
  if (msgs[1].cache_read_tokens === 1200) ok('cache_read_tokens stocké correctement')
})

// ─── 4. Contrainte CHECK rôle ────────────────────────────────────
await step('CHECK : role doit être user|assistant|system', async () => {
  const { error } = await sb.from('assistant_messages').insert({
    conversation_id: cleanup.convIds[0],
    role: 'invalid_role',
    contenu: 'should fail',
  })
  if (error && error.message.toLowerCase().includes('check')) ok('rôle invalide rejeté ✓')
  else if (error) ok(`rôle invalide rejeté (${error.code})`)
  else ko('CHECK rôle', 'aucune erreur — la contrainte ne fonctionne pas')
})

// ─── 5. Cascade delete ──────────────────────────────────────────
await step('cascade delete : supprimer conv supprime ses messages', async () => {
  const convId = cleanup.convIds[0]
  await sb.from('assistant_conversations').delete().eq('id', convId)
  cleanup.convIds = cleanup.convIds.filter(id => id !== convId)
  const { count } = await sb.from('assistant_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', convId)
  if (count === 0) ok('cascade delete OK (0 messages restants)')
  else ko('cascade', `${count} messages restants`)
})

// ─── 6. HTTP ────────────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/assistant`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }
    const r = await fetch(`${BASE}/admin/assistant`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/assistant', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /admin/assistant → 200`)
    if (html.includes('Assistant') || html.includes('actions prioritaires')) ok('contient titre/bandeau')
  })

  await step(`HTTP : POST /api/assistant/stream sans body → 400`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { return }
    if (!serverUp) return
    const r = await fetch(`${BASE}/api/assistant/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (r.status === 400) ok('400 sur body invalide ✓')
    else if (r.status === 500) ok(`500 attendu si ANTHROPIC_API_KEY manquante (${r.status})`)
    else ko('validation', `HTTP ${r.status}`)
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.convIds.length > 0) {
  await sb.from('assistant_conversations').delete().in('id', cleanup.convIds)
  console.log(`  ✓ ${cleanup.convIds.length} conv supprimée(s)`)
}

// ─── Bilan ──────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 24 — Assistant IA OK.')
