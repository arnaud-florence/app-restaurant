// Crée le bucket Storage `conformite` (public en lecture) qui héberge les
// justificatifs de conformité (/admin/legal → onglet Documents).
// Idempotent : ne fait rien si le bucket existe déjà.
// Usage : node scripts/creer-bucket-conformite.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: buckets } = await sb.storage.listBuckets()
if (buckets?.some(b => b.name === 'conformite')) {
  console.log('✓ bucket `conformite` déjà présent')
} else {
  const { error } = await sb.storage.createBucket('conformite', {
    public: true,
    fileSizeLimit: 15 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  })
  if (error) { console.error('✗', error.message); process.exit(1) }
  console.log('✓ bucket `conformite` créé (public, 15 Mo, PDF + images)')
}
