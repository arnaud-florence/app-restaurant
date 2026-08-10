import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: recs } = await sb.from('recettes').select('id, nom, categorie, tag_destination, actif, prix_vente_ht')
const { data: ri } = await sb.from('recette_ingredients').select('recette_id')
const avecBom = new Set((ri ?? []).map(r => r.recette_id))
const sansBom = (recs ?? []).filter(r => !avecBom.has(r.id))
const sansBomActif = sansBom.filter(r => r.actif)
console.log(`Total recettes: ${(recs??[]).length} · sans nomenclature: ${sansBom.length} (dont actives: ${sansBomActif.length})`)
const parCat = {}
for (const r of sansBomActif) { const c = r.categorie || r.tag_destination || '?'; (parCat[c] ??= []).push(r.nom) }
console.log('\nRecettes ACTIVES sans nomenclature, par catégorie :')
for (const [c, noms] of Object.entries(parCat).sort((a,b)=>b[1].length-a[1].length)) {
  console.log(` ${c} (${noms.length}): ${noms.slice(0,8).join(', ')}${noms.length>8?'…':''}`)
}
