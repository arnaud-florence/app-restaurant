import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: ings } = await sb.from('ingredients').select('id, prix_achat_ht')
const prix = Object.fromEntries((ings??[]).map(i => [i.id, Number(i.prix_achat_ht ?? 0)]))
const { data: recs } = await sb.from('recettes').select('id, nom, prix_vente_ht').eq('actif', true)
const { data: ri } = await sb.from('recette_ingredients').select('recette_id, ingredient_id, quantite')
const bom = new Map(); for (const r of ri ?? []) { if(!bom.has(r.recette_id)) bom.set(r.recette_id, []); bom.get(r.recette_id).push(r) }
const rows = (recs??[]).map(r => {
  const cost = (bom.get(r.id)??[]).reduce((s,x)=>s+Number(x.quantite)*(prix[x.ingredient_id]??0),0)
  const pv = Number(r.prix_vente_ht??0); const fc = pv>0?cost/pv*100:0
  return { nom: r.nom, pv, cost, fc }
}).filter(r => r.fc > 32).sort((a,b)=>b.fc-a.fc)
console.log('🔴 Recettes food cost > 32% (à retravailler) :')
for (const r of rows) console.log(`  ${r.fc.toFixed(0)}% — ${r.nom} (coût ${r.cost.toFixed(2)}€ / vente ${r.pv}€ HT)`)
