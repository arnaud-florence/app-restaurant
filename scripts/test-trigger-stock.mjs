import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// 1. Recette avec BOM
const { data: ri } = await sb.from('recette_ingredients').select('recette_id, ingredient_id, quantite').limit(1).order('recette_id')
const { data: someRi } = await sb.from('recette_ingredients').select('recette_id').limit(50)
const recId = (someRi ?? [])[0]?.recette_id
const { data: rec } = await sb.from('recettes').select('id, nom, prix_vente_ht, tag_destination').eq('id', recId).single()
const { data: bom } = await sb.from('recette_ingredients').select('ingredient_id, quantite, ingredient:ingredients(nom, stock_actuel, unite)').eq('recette_id', recId)
console.log(`Recette test : ${rec.nom} (${bom.length} ingrédient(s))`)
const ing0 = bom[0]
console.log(`Ingrédient suivi : ${ing0.ingredient.nom} — stock avant = ${ing0.ingredient.stock_actuel} ${ing0.ingredient.unite}, conso/portion = ${ing0.quantite}`)

// 2. Crée commande + article servi (déclenche le trigger)
const { data: cmd } = await sb.from('commandes').insert({ numero: 'TRIGTEST-'+Date.now(), source: 'TABLE', numero_table: 'TRIGTEST', statut: 'servi', montant_total_ht: 1, montant_total_ttc: 1.1 }).select('id').single()
const { data: art } = await sb.from('commande_articles').insert({ commande_id: cmd.id, recette_id: recId, quantite: 1, prix_unitaire_ht: 1, tag_destination: rec.tag_destination ?? 'CUISINE', statut: 'en_attente' }).select('id').single()
// passe à servi → trigger
await sb.from('commande_articles').update({ statut: 'servi' }).eq('id', art.id)
await new Promise(r => setTimeout(r, 1500))

// 3. Vérifie le mouvement + le nouveau stock
const { data: mvts } = await sb.from('mouvements_stock').select('type, quantite, ingredient_id, created_at').eq('ingredient_id', ing0.ingredient_id).gte('created_at', new Date(Date.now()-60000).toISOString())
const { data: ingAfter } = await sb.from('ingredients').select('stock_actuel').eq('id', ing0.ingredient_id).single()
console.log(`\nMouvements créés (60s) pour cet ingrédient : ${(mvts??[]).length}`)
for (const m of mvts ?? []) console.log(`  → ${m.type} ${m.quantite}`)
console.log(`Stock après = ${ingAfter.stock_actuel} (attendu ${Math.round((ing0.ingredient.stock_actuel - ing0.quantite)*1000)/1000})`)
const ok = (mvts??[]).length > 0 && Math.abs(ingAfter.stock_actuel - (ing0.ingredient.stock_actuel - ing0.quantite)) < 0.001
console.log(ok ? '\n✅ TRIGGER STOCK OK — déduction automatique fonctionne' : '\n⚠️ TRIGGER STOCK NE DÉDUIT PAS')

// 4. Cleanup (et restaure le stock si trigger a déduit)
await sb.from('mouvements_stock').delete().eq('ingredient_id', ing0.ingredient_id).gte('created_at', new Date(Date.now()-60000).toISOString())
await sb.from('ingredients').update({ stock_actuel: ing0.ingredient.stock_actuel }).eq('id', ing0.ingredient_id)
await sb.from('commande_articles').delete().eq('commande_id', cmd.id)
await sb.from('commandes').delete().eq('id', cmd.id)
console.log('🧹 cleanup fait (stock restauré)')
