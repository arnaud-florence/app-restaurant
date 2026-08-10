// Fixture de test : marque toute la commande active d'une table comme 'servi' (→ table 'a_encaisser').
// Usage : node scripts/mark-table-servi.mjs B2
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim().replace(/\r$/, ''); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const table = process.argv[2] || 'B2'
const { data: tbl } = await sb.from('tables_restaurant').select('commande_active_id').eq('numero', table).maybeSingle()
if (!tbl?.commande_active_id) { console.log('Pas de commande active'); process.exit(0) }
await sb.from('commande_articles').update({ statut: 'servi' }).eq('commande_id', tbl.commande_active_id)
await sb.from('commandes').update({ statut: 'servi' }).eq('id', tbl.commande_active_id)
await sb.from('tables_restaurant').update({ statut: 'a_encaisser' }).eq('numero', table)
console.log(`Table ${table} : tous articles 'servi', table 'a_encaisser'`)
