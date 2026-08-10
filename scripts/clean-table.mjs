// Nettoyage test : supprime les commandes NON encaissées d'une table + libère la table.
// Usage : node scripts/clean-table.mjs B1
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim().replace(/\r$/, ''); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const table = process.argv[2]
if (!table) { console.error('Usage: node scripts/clean-table.mjs <numero_table>'); process.exit(1) }
const { data: cmds } = await sb.from('commandes').select('id, numero').eq('numero_table', table).not('statut', 'in', '(encaisse,annule)')
for (const c of cmds ?? []) {
  await sb.from('paiements_caisse').delete().eq('commande_id', c.id)
  await sb.from('commande_articles').delete().eq('commande_id', c.id)
  await sb.from('commandes').delete().eq('id', c.id)
}
await sb.from('tables_restaurant').update({ statut: 'libre', commande_active_id: null }).eq('numero', table)
console.log(`Table ${table} : ${(cmds ?? []).length} commande(s) test supprimée(s), table libérée`)
