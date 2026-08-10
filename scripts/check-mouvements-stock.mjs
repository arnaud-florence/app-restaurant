import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const since = new Date(Date.now() - 2*3600000).toISOString()
const { data, error } = await sb.from('mouvements_stock')
  .select('type, quantite, motif, created_at, ingredient:ingredients(nom, unite)')
  .gte('created_at', since).order('created_at', { ascending: false }).limit(30)
if (error) { console.error('ERREUR mouvements_stock:', error.message); process.exit(1) }
console.log(`Mouvements stock des 2 dernières heures : ${(data ?? []).length}`)
for (const m of data ?? []) console.log(` ${m.created_at?.slice(11,19)} | ${m.type} | ${m.quantite} ${m.ingredient?.unite ?? ''} | ${m.ingredient?.nom ?? '?'} | ${m.motif ?? ''}`)
