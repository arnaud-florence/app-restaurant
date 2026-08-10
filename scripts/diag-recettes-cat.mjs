import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: recs } = await sb.from('recettes').select('id, nom, categorie, tag_destination, actif, prix_vente_ht')
const actives = (recs??[]).filter(r => r.actif)
console.log(`Recettes : ${(recs??[]).length} total · ${actives.length} actives`)
// Par tag (actives) — comme le catalogue serveur
const parTag = {}
for (const r of actives) { const t=r.tag_destination||'∅'; (parTag[t]??=[]).push(r) }
console.log('\n=== Par TAG (actives) ===')
for (const [t, rs] of Object.entries(parTag)) {
  // sous-catégories
  const parCat = {}; let sansCat=0
  for (const r of rs) { const c=(r.categorie||'').trim(); if(!c){sansCat++} else (parCat[c]??=0,parCat[c]++) }
  const scommeCat = Object.values(parCat).reduce((a,b)=>a+b,0)
  const flag = sansCat>0 ? `  ⚠️ ${sansCat} sans catégorie (compté dans "Toutes"=${rs.length} mais absent des sous-cat dont somme=${sommeOrZero(parCat)})` : ''
  console.log(` ${t}: ${rs.length} recette(s) — sous-cat: ${Object.entries(parCat).map(([c,n])=>`${c}=${n}`).join(', ')||'(aucune)'}${flag}`)
}
function sommeOrZero(o){return Object.values(o).reduce((a,b)=>a+b,0)}
// Catégories en double casse/espaces (ex "Plat" vs "plat" vs "Plat ")
console.log('\n=== Catégories distinctes (casse/espaces) ===')
const cats = {}
for (const r of actives) { const raw=r.categorie??'(null)'; cats[raw]=(cats[raw]??0)+1 }
for (const [c,n] of Object.entries(cats).sort()) console.log(`  «${c}» : ${n}`)
