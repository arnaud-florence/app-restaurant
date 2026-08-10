// Vérif "addition unique" : liste les commandes non encaissées d'une table + nb d'articles.
// Usage : node scripts/check-table-commandes.mjs B2
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim().replace(/\r$/, ''); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const table = process.argv[2] || 'B2'

const { data: tbl } = await sb.from('tables_restaurant').select('numero, statut, commande_active_id').eq('numero', table).maybeSingle()
console.log(`Table ${table} : statut=${tbl?.statut} · commande_active_id=${tbl?.commande_active_id ?? '∅'}`)

const { data: cmds } = await sb.from('commandes')
  .select('id, numero, statut, montant_total_ttc, tva_total, created_at, commande_articles(id, recette_nom:recettes(nom), statut)')
  .eq('numero_table', table)
  .not('statut', 'in', '(encaisse,annule)')
  .order('created_at')
console.log(`\nCommandes NON encaissées de la table ${table} : ${(cmds ?? []).length}`)
for (const c of cmds ?? []) {
  const arts = c.commande_articles ?? []
  console.log(` • ${c.numero} | ${c.statut} | ${c.montant_total_ttc}€ TTC (TVA ${c.tva_total}€) | ${arts.length} article(s) | créée ${c.created_at?.slice(11,19)}`)
  for (const a of arts) console.log(`      - ${a.recette_nom?.nom ?? '?'} [${a.statut}]`)
}
const n = (cmds ?? []).length
console.log(`\n${n === 1 ? '✅ UNE seule commande (addition unique OK)' : n === 0 ? 'ℹ️ aucune commande active' : `⚠️ ${n} commandes — addition fragmentée`}`)
