import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// 2 recettes différentes avec BOM
const { data: riRows } = await sb.from('recette_ingredients').select('recette_id, ingredient_id, quantite')
const byRec = new Map()
for (const r of riRows ?? []) if (!byRec.has(r.recette_id)) byRec.set(r.recette_id, r)
const recIds = [...byRec.keys()].slice(0, 2)
const [r1, r2] = recIds.map(id => byRec.get(id))
const ingIds = [r1.ingredient_id, r2.ingredient_id]
const { data: recMeta } = await sb.from('recettes').select('id, nom, tag_destination').in('id', recIds)
const { data: ingBefore } = await sb.from('ingredients').select('id, nom, stock_actuel').in('id', ingIds)
const beforeMap = Object.fromEntries(ingBefore.map(i => [i.id, i.stock_actuel]))
console.log('Avant :', ingBefore.map(i => `${i.nom}=${i.stock_actuel}`).join(' | '))

// commande avec 2 articles (recettes différentes), tous en_attente
const { data: cmd } = await sb.from('commandes').insert({ numero: 'BATCHTEST-'+Date.now(), source:'TABLE', numero_table:'BATCHTEST', statut:'en_preparation', montant_total_ht:2, montant_total_ttc:2.2 }).select('id').single()
for (const rid of recIds) {
  const tag = recMeta.find(m => m.id === rid)?.tag_destination ?? 'CUISINE'
  await sb.from('commande_articles').insert({ commande_id: cmd.id, recette_id: rid, quantite: 1, prix_unitaire_ht: 1, tag_destination: tag, statut: 'en_attente' })
}
// UPDATE GROUPÉ : tous les articles non-servis → servi (comme deduireStockCommande)
await sb.from('commande_articles').update({ statut: 'servi' }).eq('commande_id', cmd.id).neq('statut', 'servi')
await new Promise(r => setTimeout(r, 1500))

const { data: ingAfter } = await sb.from('ingredients').select('id, nom, stock_actuel').in('id', ingIds)
console.log('Après :', ingAfter.map(i => `${i.nom}=${i.stock_actuel}`).join(' | '))
let nbDeduits = 0
for (const i of ingAfter) {
  const expected = beforeMap[i.id] - byRec.get(recIds.find(rid => byRec.get(rid).ingredient_id === i.id)).quantite
  const ok = Math.abs(i.stock_actuel - expected) < 0.001
  if (ok && Math.abs(i.stock_actuel - beforeMap[i.id]) > 0.0001) nbDeduits++
}
console.log(`\nIngrédients déduits : ${nbDeduits} / 2`)
console.log(nbDeduits === 2 ? '✅ UPDATE GROUPÉ déduit TOUS les articles (trigger par ligne OK)' : `⚠️ Seulement ${nbDeduits}/2 déduits — le trigger rate les updates groupés !`)

// cleanup + restore
for (const i of ingBefore) await sb.from('ingredients').update({ stock_actuel: i.stock_actuel }).eq('id', i.id)
await sb.from('mouvements_stock').delete().in('ingredient_id', ingIds).gte('created_at', new Date(Date.now()-60000).toISOString())
await sb.from('commande_articles').delete().eq('commande_id', cmd.id)
await sb.from('commandes').delete().eq('id', cmd.id)
console.log('🧹 cleanup + stock restauré')
