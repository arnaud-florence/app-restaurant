import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: ings } = await sb.from('ingredients').select("id, nom, prix_achat_ht")
const prix = Object.fromEntries((ings??[]).map(i => [i.id, Number(i.prix_achat_ht ?? 0)]))
const sansPrix = (ings??[]).filter(i => !(Number(i.prix_unitaire) > 0))
const { data: recs } = await sb.from('recettes').select('id, nom, prix_vente_ht, actif').eq('actif', true)
const { data: ri } = await sb.from('recette_ingredients').select('recette_id, ingredient_id, quantite')
const bomByRec = new Map()
for (const r of ri ?? []) { (bomByRec.get(r.recette_id) ?? bomByRec.set(r.recette_id, []).get(r.recette_id)).push(r) }
let zeroCost = 0, absurd = 0, sains = 0, ok = 0, eleve = 0
const problemes = []
for (const r of recs ?? []) {
  const bom = bomByRec.get(r.id) ?? []
  const cost = bom.reduce((s, x) => s + Number(x.quantite) * (prix[x.ingredient_id] ?? 0), 0)
  const pv = Number(r.prix_vente_ht ?? 0)
  const fc = pv > 0 ? (cost / pv) * 100 : 0
  const ingSansPrix = bom.filter(x => !(prix[x.ingredient_id] > 0))
  if (bom.length > 0 && cost === 0) { zeroCost++; problemes.push(`${r.nom}: coût 0 (${ingSansPrix.length} ingrédient(s) sans prix)`) }
  else if (fc > 60) { absurd++; problemes.push(`${r.nom}: food cost ${fc.toFixed(0)}% (coût ${cost.toFixed(2)}€ / PV ${pv}€)`) }
  else if (fc < 28) sains++
  else if (fc <= 32) ok++
  else eleve++
}
console.log(`Ingrédients sans prix unitaire : ${sansPrix.length} / ${(ings??[]).length}`)
if (sansPrix.length) console.log('  →', sansPrix.slice(0,12).map(i=>i.nom).join(', ') + (sansPrix.length>12?'…':''))
console.log(`\nRecettes actives : ${(recs??[]).length}`)
console.log(`  🟢 food cost <28% : ${sains}   🟡 28-32% : ${ok}   🔴 >32% : ${eleve}`)
console.log(`  ⚠️ coût 0 (prix manquants) : ${zeroCost}   ⚠️ food cost >60% (anormal) : ${absurd}`)
if (problemes.length) { console.log('\nProblèmes :'); problemes.slice(0,20).forEach(p => console.log('  • '+p)) }
