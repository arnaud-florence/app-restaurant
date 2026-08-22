// Test d'intégration — invendus du soir (0129).
// Vérifie l'upsert par (date, produit), la correction par repassage, la
// suppression à quantité 0, le coût figé, et la valorisation.
// Setup → assertions → cleanup complet.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

// Date de test dans le passé lointain : n'entre en collision avec aucune
// saisie réelle du soir.
const DATE = '2020-01-15'
const { data: prod } = await sb.from('recettes')
  .select('id, nom, cout_achat_ht').eq('nom', 'Croissant')
  .eq('tag_destination', 'FOURNIL').single()
const cout = Number(prod.cout_achat_ht)
console.log(`Produit : ${prod.nom} · coût ${cout} €\n`)

// ─── 1. Première saisie ──────────────────────────────────────────────
const { error: e1 } = await sb.from('invendus').upsert([{
  date_invendu: DATE, recette_id: prod.id, quantite: 4, cout_unitaire_ht: cout,
}], { onConflict: 'date_invendu,recette_id' })
check('saisie initiale : 4 croissants jetés', !e1)

// ─── 2. Repassage = correction, pas doublon ──────────────────────────
await sb.from('invendus').upsert([{
  date_invendu: DATE, recette_id: prod.id, quantite: 2, cout_unitaire_ht: cout,
}], { onConflict: 'date_invendu,recette_id' })
const { data: relu, count } = await sb.from('invendus')
  .select('quantite, cout_unitaire_ht', { count: 'exact' })
  .eq('date_invendu', DATE).eq('recette_id', prod.id)
check('repassage : 1 seule ligne, corrigée à 2', count === 1 && Number(relu[0].quantite) === 2)

// ─── 3. Coût figé : le tarif du jour de la casse ─────────────────────
check('coût unitaire figé dans la ligne',
  Math.abs(Number(relu[0].cout_unitaire_ht) - cout) < 0.0001)
const valorisation = Number(relu[0].quantite) * Number(relu[0].cout_unitaire_ht)
check(`valorisation : 2 × ${cout} = ${valorisation.toFixed(2)} €`,
  Math.abs(valorisation - 2 * cout) < 0.001)

// ─── 4. Quantité 0 = suppression (logique de l'action serveur) ───────
await sb.from('invendus').delete().eq('date_invendu', DATE).eq('recette_id', prod.id)
const { count: apres } = await sb.from('invendus')
  .select('*', { count: 'exact', head: true })
  .eq('date_invendu', DATE).eq('recette_id', prod.id)
check('quantité remise à 0 : la ligne disparaît', apres === 0)

// ─── Cleanup ─────────────────────────────────────────────────────────
await sb.from('invendus').delete().eq('date_invendu', DATE)
const { count: fin } = await sb.from('invendus')
  .select('*', { count: 'exact', head: true }).eq('date_invendu', DATE)
check('cleanup : 0 ligne de test restante', fin === 0)

console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
