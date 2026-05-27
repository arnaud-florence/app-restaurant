// Supprime les comptes Auth Supabase orphelins (sans profil lié).
// Cible : Anais (leiliogianni@gmail.com), florence (contact.winedesign@gmail.com)
//
//   node scripts/cleanup-auth-orphans.mjs --dry-run
//   node scripts/cleanup-auth-orphans.mjs --execute

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const DRY = !process.argv.includes('--execute')
const PRESERVE_EMAILS = ['infos.agentsalliance@gmail.com'] // Arnaud

console.log(`${DRY ? '🔍 DRY-RUN' : '⚠️  EXECUTE'}  Cleanup Auth orphans\n`)

// Liste tous les Auth users
const { data: list, error } = await sb.auth.admin.listUsers({ perPage: 100 })
if (error) { console.error('❌', error.message); process.exit(1) }

console.log(`→ ${list.users.length} Auth users trouvés`)

// Récupère les profil_ids existants
const { data: profils } = await sb.from('profils').select('id')
const profilsIds = new Set(profils.map(p => p.id))

const orphans = list.users.filter(u => {
  if (PRESERVE_EMAILS.includes(u.email)) return false
  return !profilsIds.has(u.id)
})

console.log(`→ ${orphans.length} orphans détectés (Auth user sans profil)\n`)

for (const u of orphans) {
  console.log(`  ${DRY ? '🔍' : '🗑'} ${u.email} (${u.id}) — créé ${u.created_at?.slice(0, 10)} — dernière co ${u.last_sign_in_at?.slice(0, 10) ?? 'jamais'}`)
  if (!DRY) {
    const { error: eDel } = await sb.auth.admin.deleteUser(u.id)
    if (eDel) console.log(`    ❌ ${eDel.message}`)
    else console.log(`    ✓ supprimé`)
  }
}

console.log(`\n${DRY ? 'Dry-run : aucun changement.' : '✅ Cleanup terminé.'}`)
if (DRY) console.log('💡 Pour exécuter : node scripts/cleanup-auth-orphans.mjs --execute')
