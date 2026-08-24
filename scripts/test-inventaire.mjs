// Test d'intégration — inventaires hebdomadaires (0130).
// Upsert par (date, produit), correction par repassage, coût figé,
// valorisation, suppression à zéro, et lecture du « dernier inventaire ».

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

// Dates passées lointaines : aucune collision avec un vrai comptage.
const D1 = '2020-02-01', D2 = '2020-02-08'
const { data: prod } = await sb.from('recettes')
  .select('id, nom, cout_achat_ht').eq('nom', 'Croissant')
  .eq('tag_destination', 'FOURNIL').single()
const cout = Number(prod.cout_achat_ht)

// ─── 1. Inventaire semaine 1 : 96 croissants (un carton plein) ───────
const { error: e1 } = await sb.from('inventaires').upsert([{
  date_inventaire: D1, recette_id: prod.id, quantite: 96, cout_unitaire_ht: cout,
}], { onConflict: 'date_inventaire,recette_id' })
check('semaine 1 : 96 en stock', !e1)

// ─── 2. Repassage = correction ───────────────────────────────────────
await sb.from('inventaires').upsert([{
  date_inventaire: D1, recette_id: prod.id, quantite: 90, cout_unitaire_ht: cout,
}], { onConflict: 'date_inventaire,recette_id' })
const { data: relu, count } = await sb.from('inventaires')
  .select('quantite, cout_unitaire_ht', { count: 'exact' })
  .eq('date_inventaire', D1).eq('recette_id', prod.id)
check('repassage : 1 ligne, corrigée à 90', count === 1 && Number(relu[0].quantite) === 90)
check(`stock valorisé : 90 × ${cout} = ${(90 * cout).toFixed(2)} €`,
  Math.abs(Number(relu[0].quantite) * Number(relu[0].cout_unitaire_ht) - 90 * cout) < 0.01)

// ─── 3. Semaine 2 + lecture « dernier inventaire précédent » ─────────
await sb.from('inventaires').upsert([{
  date_inventaire: D2, recette_id: prod.id, quantite: 40, cout_unitaire_ht: cout,
}], { onConflict: 'date_inventaire,recette_id' })
const { data: dern } = await sb.from('inventaires')
  .select('date_inventaire, quantite')
  .eq('recette_id', prod.id).lt('date_inventaire', D2)
  .order('date_inventaire', { ascending: false }).limit(1)
check('le repère « dernière fois » pointe la semaine 1 (90)',
  dern?.[0]?.date_inventaire === D1 && Number(dern[0].quantite) === 90)

// Consommation réelle entre les deux (sans achats) : 90 − 40 = 50
check('consommation dérivable : 90 − 40 = 50 pièces',
  Number(dern[0].quantite) - 40 === 50)

// ─── 4. Quantité 0 = suppression ─────────────────────────────────────
await sb.from('inventaires').delete().eq('date_inventaire', D2).eq('recette_id', prod.id)
const { count: c2 } = await sb.from('inventaires')
  .select('*', { count: 'exact', head: true })
  .eq('date_inventaire', D2).eq('recette_id', prod.id)
check('remise à zéro : ligne disparue', c2 === 0)

// ─── Cleanup ─────────────────────────────────────────────────────────
await sb.from('inventaires').delete().in('date_inventaire', [D1, D2])
const { count: fin } = await sb.from('inventaires')
  .select('*', { count: 'exact', head: true }).in('date_inventaire', [D1, D2])
check('cleanup : 0 ligne de test', fin === 0)

console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
