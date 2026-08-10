import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const nom = process.argv[2] || null
let q = sb.from('commandes')
  .select('id, numero, ardoise_nom, statut, montant_total_ttc, tva_total, commande_articles(recette_nom:recettes(nom), statut)')
  .eq('source','COMPTOIR').not('ardoise_nom','is',null).not('statut','in','(encaisse,annule)').order('created_at')
if (nom) q = q.eq('ardoise_nom', nom)
const { data, error } = await q
if (error) { console.error('ERREUR:', error.message); process.exit(1) }
console.log(`Ardoises ouvertes${nom?` (${nom})`:''} : ${(data??[]).length} commande(s)`)
for (const c of data ?? []) {
  const arts = c.commande_articles ?? []
  console.log(` 🧾 ${c.ardoise_nom} | ${c.numero} | ${c.statut} | ${c.montant_total_ttc}€ TTC (TVA ${c.tva_total}€) | ${arts.length} article(s)`)
  for (const a of arts) console.log(`     - ${a.recette_nom?.nom ?? '?'} [${a.statut}]`)
}
// Vérif unicité par nom
const parNom = {}
for (const c of data ?? []) (parNom[c.ardoise_nom] ??= []).push(c)
for (const [n, cs] of Object.entries(parNom)) {
  console.log(cs.length === 1 ? `✅ « ${n} » = 1 seule commande (addition unique)` : `⚠️ « ${n} » = ${cs.length} commandes (fragmenté !)`)
}
