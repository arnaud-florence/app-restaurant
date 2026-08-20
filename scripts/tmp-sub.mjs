import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = readFileSync('.env.local','utf8')
for (const l of env.split('\n')) { const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'') }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: subs } = await sb.from('push_subscriptions').select('employe_id,endpoint,user_agent,created_at')
const { data: emp } = await sb.from('employes').select('id,prenom').eq('actif',true)
console.log(`Abonnements push : ${subs?.length ?? 0}`)
for (const s of subs||[]) {
  const e = emp.find(x=>x.id===s.employe_id)
  console.log(`  ✓ ${e?.prenom ?? '?'} — ${s.created_at?.slice(11,16)} — ${(s.user_agent??'').slice(0,60)}`)
}
