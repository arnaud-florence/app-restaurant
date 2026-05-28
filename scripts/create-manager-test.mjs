// Crée un compte MANAGER de test pour la campagne E2E (pilotage admin).
// Préfixe TEST pour traçabilité + suppression facile.
// Nécessite SUPABASE_SERVICE_ROLE_KEY.
//
//   node scripts/create-manager-test.mjs           # crée
//   node scripts/create-manager-test.mjs --delete  # supprime

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const EMAIL = 'qa-test-manager@casatasia.local'
const PASSWORD = 'QaTest2026!'
const DELETE = process.argv.includes('--delete')

// Trouve un éventuel user existant
const { data: list } = await sb.auth.admin.listUsers({ perPage: 200 })
const existing = list.users.find(u => u.email === EMAIL)

if (DELETE) {
  if (existing) {
    await sb.from('profils').delete().eq('id', existing.id)
    await sb.auth.admin.deleteUser(existing.id)
    console.log(`✓ Compte test ${EMAIL} supprimé`)
  } else {
    console.log(`· Aucun compte ${EMAIL} à supprimer`)
  }
  process.exit(0)
}

if (existing) {
  console.log(`· Compte ${EMAIL} existe déjà (id=${existing.id.slice(0,8)}) — réutilisable`)
  console.log(`\nIdentifiants E2E :\n  ${EMAIL}\n  ${PASSWORD}`)
  process.exit(0)
}

// 1. Crée le user Auth
const { data: created, error: e1 } = await sb.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
  user_metadata: { qa_test: true },
})
if (e1) { console.error('❌ Auth:', e1.message); process.exit(1) }
const uid = created.user.id

// 2. Crée le profil manager
const { data: prof } = await sb.from('profils').select('id').eq('id', uid).maybeSingle()
if (prof) {
  await sb.from('profils').update({ role: 'manager', poste: 'manager', email: EMAIL }).eq('id', uid)
} else {
  await sb.from('profils').insert({ id: uid, email: EMAIL, role: 'manager', poste: 'manager' })
}

console.log(`✅ Compte MANAGER de test créé`)
console.log(`\nIdentifiants E2E :\n  ${EMAIL}\n  ${PASSWORD}`)
console.log(`\n⚠️ Supprimer en fin de campagne : node scripts/create-manager-test.mjs --delete`)
