import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const fakeEmpId = 'a9ac02be-b2ec-4898-b444-fbb0d126dd2a'  // florence
const date = new Date().toISOString().slice(0, 10)

const { data, error } = await sb.from('pointage').insert({
  employe_id: fakeEmpId,
  date_pointage: '1970-01-01',  // date factice pour test
  heure_arrivee: '00:00:00',
}).select('id').single()
console.log('INSERT:', error ? `❌ ${error.message}` : `✅ ${data?.id}`)
if (data?.id) await sb.from('pointage').delete().eq('id', data.id)
process.exit(0)
