import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { count: totalRec } = await sb.from('recettes').select('*', { count: 'exact', head: true })
const { count: totalRI } = await sb.from('recette_ingredients').select('*', { count: 'exact', head: true })
const { count: totalIng } = await sb.from('ingredients').select('*', { count: 'exact', head: true })
console.log(`Recettes: ${totalRec} · recette_ingredients (nomenclatures): ${totalRI} · ingrédients: ${totalIng}`)
// Combien de recettes ont au moins 1 ingrédient ?
const { data: ri } = await sb.from('recette_ingredients').select('recette_id')
const recAvecBom = new Set((ri ?? []).map(r => r.recette_id))
console.log(`Recettes avec au moins 1 ingrédient : ${recAvecBom.size} / ${totalRec}`)
// Exemple : 2 recettes avec BOM
const { data: ex } = await sb.from('recettes').select('id, nom').in('id', [...recAvecBom].slice(0,3))
for (const r of ex ?? []) {
  const { data: ings } = await sb.from('recette_ingredients').select('quantite, ingredient:ingredients(nom, unite)').eq('recette_id', r.id)
  console.log(` • ${r.nom}: ${(ings??[]).map(i => `${i.quantite} ${i.ingredient?.unite??''} ${i.ingredient?.nom??''}`).join(', ')}`)
}
