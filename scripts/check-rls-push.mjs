import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// Tente un insert bidon (puis cleanup)
const fakeEmpId = 'a9ac02be-b2ec-4898-b444-fbb0d126dd2a' // florence
const { data, error } = await sb.from('push_subscriptions').insert({
  employe_id: fakeEmpId,
  endpoint:   'https://test.example/null/' + Date.now(),
  p256dh:     'TEST_p256dh',
  auth:       'TEST_auth',
}).select('id').single()
console.log('INSERT:', error ? `❌ ${error.message}` : `✅ ${data?.id}`)

// Cleanup
if (data?.id) await sb.from('push_subscriptions').delete().eq('id', data.id)
process.exit(0)
