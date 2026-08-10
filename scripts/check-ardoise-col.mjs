import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data, error } = await sb.from('commandes').select('id, ardoise_nom').limit(1)
if (error) { console.log('❌ Colonne ardoise_nom ABSENTE :', error.message); process.exit(1) }
console.log('✅ Colonne ardoise_nom présente et requêtable')
